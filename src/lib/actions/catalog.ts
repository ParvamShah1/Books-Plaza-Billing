"use server";

import { revalidatePath, unstable_cache, updateTag } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient, createTokenClient, getAccessToken } from "@/lib/supabase/server";
import { categorySchema, itemSchema, locationSchema } from "@/lib/pos/validations";
import { itemIdsForBarcode } from "@/lib/pos/search";
import { toIsbn13 } from "@/lib/pos/isbn";
import { OTHER_BOOKS_SUFFIX } from "@/lib/pos/billing";
import type { Category, CategoryDiscount, Item, ItemKind, Location, PosItem } from "@/lib/pos/types";

// Exhibitions and categories rarely change, so they're cached for everyone (all staff can see
// all of them) for an hour, or until they're edited in Settings
async function cachedForStaff<T>(
  tag: string,
  query: (supabase: SupabaseClient) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>
): Promise<T[]> {
  const supabase = await createClient();
  const run = async (client: SupabaseClient) => {
    const { data, error } = await query(client);
    if (error) throw new Error(error.message);
    return data ?? [];
  };
  const token = await getAccessToken(supabase);
  if (!token) return run(supabase);

  try {
    return await unstable_cache(
      async () => {
        const rows = await run(createTokenClient(token));
        // Never cache an empty list (e.g. read by someone who can't see the rows)
        if (rows.length === 0) throw new Error("empty");
        return rows;
      },
      [tag],
      { tags: [tag], revalidate: 3600 }
    )();
  } catch {
    return run(supabase);
  }
}

// ---------- Locations ----------

export async function getLocations(options?: { activeOnly?: boolean }): Promise<Location[]> {
  const locations = await cachedForStaff<Location>("locations", (supabase) =>
    supabase.from("locations").select("*").order("is_active", { ascending: false }).order("name")
  );
  return options?.activeOnly ? locations.filter((l) => l.is_active) : locations;
}

export async function saveLocation(id: string | null, input: unknown) {
  const parsed = locationSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const { error } = id
    ? await supabase.from("locations").update(parsed.data).eq("id", id)
    : await supabase.from("locations").insert(parsed.data);

  if (error) {
    if (error.code === "23505") return { error: "This code is already used by another location" };
    return { error: error.message };
  }

  updateTag("locations");
  revalidatePath("/settings");
  return { success: true };
}

// ---------- Categories + discounts ----------

export async function getCategories(): Promise<Category[]> {
  return cachedForStaff<Category>("categories", (supabase) => supabase.from("categories").select("*").order("name"));
}

export async function saveCategory(id: string | null, input: unknown) {
  const parsed = categorySchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const { error } = id
    ? await supabase.from("categories").update(parsed.data).eq("id", id)
    : await supabase.from("categories").insert(parsed.data);

  if (error) {
    if (error.code === "23505") return { error: "A category with this name already exists" };
    return { error: error.message };
  }

  updateTag("categories");
  revalidatePath("/settings");
  revalidatePath("/items");
  return { success: true };
}

export async function deleteCategory(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("categories").delete().eq("id", id);
  if (error) {
    if (error.code === "23503") return { error: "This category has books. Move them to another category first." };
    return { error: error.message };
  }

  updateTag("categories");
  revalidatePath("/settings");
  return { success: true };
}

export async function getDiscounts(): Promise<CategoryDiscount[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("category_discounts").select("*");
  if (error) throw new Error(error.message);
  return data as CategoryDiscount[];
}

export async function saveDiscounts(locationId: string, discounts: { category_id: string; discount: number }[]) {
  for (const d of discounts) {
    if (!(d.discount >= 0 && d.discount <= 100)) return { error: "Discount must be between 0 and 100" };
  }

  const supabase = await createClient();
  const rows = discounts.map((d) => ({ location_id: locationId, category_id: d.category_id, discount: d.discount }));
  const { error } = await supabase.from("category_discounts").upsert(rows);
  if (error) return { error: error.message };

  revalidatePath("/settings");
  return { success: true };
}

// ---------- Items ----------

export async function getItems(filters?: {
  search?: string;
  category_id?: string;
  kind?: ItemKind;
  page?: number;
  pageSize?: number;
}): Promise<{ items: (Item & { total_stock: number })[]; total: number }> {
  const supabase = await createClient();
  const page = filters?.page || 1;
  const pageSize = filters?.pageSize || 50;
  const from = (page - 1) * pageSize;

  let query = supabase
    .from("items")
    .select("*, category:categories!left(id, name, sell_by), stock(qty)", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, from + pageSize - 1);

  if (filters?.category_id) query = query.eq("category_id", filters.category_id);
  if (filters?.kind) query = query.eq("kind", filters.kind);
  if (filters?.search) {
    const s = filters.search.trim().replace(/[%,()]/g, " ");
    const digits = s.replace(/[^0-9Xx]/g, "");
    const parts = [`name.ilike.%${s}%`, `code.eq.${s.toUpperCase()}`, `publisher.ilike.%${s}%`];
    if (digits.length >= 10) parts.push(`isbn.eq.${digits.toUpperCase()}`);
    const linkedIds = await itemIdsForBarcode(supabase, s);
    if (linkedIds.length) parts.push(`id.in.(${linkedIds.join(",")})`);
    query = query.or(parts.join(","));
  }

  const { data, error, count } = await query;
  if (error) throw new Error(error.message);

  const items = (data as (Item & { stock: { qty: number }[] })[]).map(({ stock, ...item }) => ({
    ...item,
    total_stock: stock.reduce((sum, s) => sum + Number(s.qty), 0),
  }));
  return { items, total: count || 0 };
}

export async function saveItem(id: string | null, input: unknown) {
  const parsed = itemSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const query = id
    ? supabase.from("items").update(parsed.data).eq("id", id)
    : supabase.from("items").insert(parsed.data);

  const { data, error } = await query.select("*, category:categories!left(id, name, sell_by)").single();
  if (error) return { error: error.message };

  revalidatePath("/items");
  return { success: true, item: data as Item };
}

type GoogleVolume = {
  title?: string;
  subtitle?: string;
  authors?: string[];
  publisher?: string;
  industryIdentifiers?: { identifier: string }[];
};

// Only trust a volume that really carries this ISBN (search can be fuzzy)
function hasIsbn(v: GoogleVolume | undefined, isbn: string) {
  return !!v?.industryIdentifiers?.some((id) => id.identifier.toUpperCase() === isbn.toUpperCase());
}

async function googleBooksByIsbn(isbn: string): Promise<GoogleVolume | null> {
  // Without a key Google shares a small daily quota with everyone and often refuses
  const key = process.env.GOOGLE_BOOKS_API_KEY ? `key=${process.env.GOOGLE_BOOKS_API_KEY}` : "";
  const api = "https://www.googleapis.com/books/v1/volumes";

  try {
    const res = await fetch(`${api}?q=isbn:${isbn}&${key}`, { signal: AbortSignal.timeout(4000) });
    if (res.ok) {
      const json = await res.json();
      const info = (json.items || [])
        .map((i: { volumeInfo?: GoogleVolume }) => i.volumeInfo)
        .find((v: GoogleVolume | undefined) => hasIsbn(v, isbn));
      if (info) return info;
    }
  } catch {
    // try the ISBN -> volume id route
  }

  // Since Sep 2026 Google's isbn: search returns nothing. The older Books "viewapi"
  // still maps an ISBN to a volume id, and fetching that volume by id still works.
  try {
    const res = await fetch(`https://books.google.com/books?bibkeys=ISBN:${isbn}&jscmd=viewapi&callback=cb`, {
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return null;
    const volumeId = (await res.text()).match(/[?&]id=([\w-]+)/)?.[1];
    if (!volumeId) return null;

    const vol = await fetch(`${api}/${volumeId}?${key}`, { signal: AbortSignal.timeout(4000) });
    if (!vol.ok) return null;
    const info = (await vol.json()).volumeInfo as GoogleVolume | undefined;
    return info && hasIsbn(info, isbn) ? info : null;
  } catch {
    return null;
  }
}

// Title / author / publisher for a new ISBN (Google Books, then Open Library)
export async function lookupIsbn(isbn: string): Promise<{
  title: string;
  author: string;
  publisher: string;
  source: "Google Books" | "Open Library";
} | null> {
  const clean = isbn.replace(/[^0-9Xx]/g, "");
  if (clean.length !== 10 && clean.length !== 13) return null;

  const info = await googleBooksByIsbn(clean);
  if (info?.title) {
    return {
      title: [info.title, info.subtitle].filter(Boolean).join(": "),
      author: (info.authors || []).join(", "),
      publisher: info.publisher || "",
      source: "Google Books",
    };
  }

  try {
    const res = await fetch(
      `https://openlibrary.org/api/books?bibkeys=ISBN:${clean}&format=json&jscmd=data`,
      { signal: AbortSignal.timeout(4000) }
    );
    if (res.ok) {
      const json = await res.json();
      const info = json[`ISBN:${clean}`];
      if (info?.title) {
        return {
          title: info.title,
          author: (info.authors || []).map((a: { name: string }) => a.name).join(", "),
          publisher: info.publishers?.[0]?.name || "",
          source: "Open Library",
        };
      }
    }
  } catch {
    // not found anywhere
  }

  return null;
}

// Fast receiving: create a publisher book straight from a scanned ISBN, title from Google / Open Library
export async function quickAddBook(isbn: string, categoryId: string, price: string) {
  const info = await lookupIsbn(isbn);
  const result = await saveItem(null, {
    kind: "PUBLISHER",
    name: info?.title || `ISBN ${isbn}`,
    isbn,
    author: info?.author ?? "",
    publisher: info?.publisher ?? "",
    category_id: categoryId,
    price: price || 0,
  });
  if (result.error || !result.item) return { error: result.error ?? "Could not add the book" };
  return { item: result.item, found: !!info };
}

export type SheetRow = {
  isbn: string; // valid ISBN-13, or the publisher's own product code
  name: string;
  author: string;
  publisher: string;
  price: number | null;
  cost_price: number | null;
};

// Receiving from a supplier's Excel: finds each ISBN's book, creates the missing ones with the
// sheet's title and price (Google / Open Library only when the sheet has no title)
export async function importSheetBooks(rows: SheetRow[], categoryId: string) {
  const supabase = await createClient();
  const select = "*, category:categories!left(id, name, sell_by)";

  const existing = new Map<string, Item>();
  const isbns = rows.map((r) => r.isbn);
  for (let i = 0; i < isbns.length; i += 200) {
    const { data, error } = await supabase
      .from("items")
      .select(select)
      .eq("kind", "PUBLISHER")
      .in("isbn", isbns.slice(i, i + 200));
    if (error) return { error: error.message };
    for (const item of data as Item[]) if (item.isbn && !existing.has(item.isbn)) existing.set(item.isbn, item);
  }

  const missing = rows.filter((r) => !existing.has(r.isbn));
  if (missing.length && !categoryId) return { error: "Choose a category for the new books first" };

  // Online lookups are slow, so only for a sheet's worth of rows without a title
  const untitled = missing.filter((r) => !r.name);
  const lookedUp = new Map<string, Awaited<ReturnType<typeof lookupIsbn>>>();
  if (untitled.length <= 150) {
    for (let i = 0; i < untitled.length; i += 6) {
      const batch = untitled.slice(i, i + 6);
      const infos = await Promise.all(batch.map((r) => lookupIsbn(r.isbn)));
      batch.forEach((r, j) => lookedUp.set(r.isbn, infos[j]));
    }
  }

  const notFound = new Set<string>();
  const inserts = [];
  for (const r of missing) {
    const info = lookedUp.get(r.isbn);
    if (!r.name && !info) notFound.add(r.isbn);
    const parsed = itemSchema.safeParse({
      kind: "PUBLISHER",
      name: r.name || info?.title || `ISBN ${r.isbn}`,
      isbn: r.isbn,
      author: r.author || info?.author || "",
      publisher: r.publisher || info?.publisher || "",
      category_id: categoryId,
      price: r.price ?? 0,
      cost_price: r.cost_price ?? "",
    });
    if (!parsed.success) return { error: `${r.isbn}: ${parsed.error.issues[0].message}` };
    inserts.push(parsed.data);
  }

  const created: Item[] = [];
  for (let i = 0; i < inserts.length; i += 200) {
    const { data, error } = await supabase.from("items").insert(inserts.slice(i, i + 200)).select(select);
    if (error) return { error: error.message };
    created.push(...(data as Item[]));
  }

  // Books added earlier without a price (fast receiving) get the sheet's price
  let priced = 0;
  for (const r of rows) {
    const item = existing.get(r.isbn);
    if (!item || Number(item.price) > 0 || !r.price) continue;
    const { data } = await supabase.from("items").update({ price: r.price }).eq("id", item.id).select(select);
    if (data?.length) {
      existing.set(r.isbn, data[0] as Item);
      priced++;
    }
  }

  if (created.length) revalidatePath("/items");
  const createdIds = new Set(created.map((i) => i.id));
  return {
    items: [...existing.values(), ...created].map((item) => ({
      item,
      isNew: createdIds.has(item.id),
      noTitle: notFound.has(item.isbn ?? ""),
    })),
    created: created.length,
    priced,
  };
}

// A barcode that isn't in the book list, billed under its publisher's category. A good ISBN becomes
// a new book (title looked up online, price typed on the bill); a misread barcode goes on the
// category's "(other books)" line.
export async function billUnknownCode(code: string, categoryId: string, locationId: string) {
  const supabase = await createClient();
  const isbn = toIsbn13(code);
  let itemCode: string;

  if (isbn) {
    const info = await lookupIsbn(isbn);
    const { data, error } = await supabase
      .from("items")
      .insert({
        kind: "PUBLISHER",
        name: info?.title || `ISBN ${isbn}`,
        isbn,
        author: info?.author || null,
        publisher: info?.publisher || null,
        category_id: categoryId,
        price: 0,
      })
      .select("code")
      .single();
    if (error) return { error: error.message };
    itemCode = data.code;
  } else {
    const general = await categoryOtherBooks(categoryId);
    if ("error" in general) return { error: general.error };
    itemCode = general.code;
  }

  const { data, error } = await supabase.rpc("lookup_code", { p_code: itemCode, p_location: locationId });
  if (error || !data?.length) return { error: error?.message ?? "Could not add the book" };
  revalidatePath("/items");
  return { item: data[0] as PosItem, isNewBook: !!isbn };
}

// Every piece category's general item at this exhibition, made where missing, so the billing
// screen can load them once and add them on a tap without waiting
export async function getCategoryOtherBooks(locationId: string): Promise<PosItem[]> {
  const supabase = await createClient();
  const { data: categories } = await supabase.from("categories").select("id").eq("sell_by", "PIECE");
  const ids = (categories || []).map((c) => c.id as string);

  const load = async () => {
    const { data } = await supabase.rpc("pos_items", { p_location: locationId, p_limit: 200, p_kind: "LOT" });
    return ((data as PosItem[]) || []).filter((i) => i.name.endsWith(OTHER_BOOKS_SUFFIX));
  };
  let items = await load();
  const missing = ids.filter((id) => !items.some((i) => i.category_id === id));
  if (missing.length) {
    await Promise.all(missing.map((id) => categoryOtherBooks(id)));
    items = await load();
  }
  return items;
}

// "Other book" box for the category chosen on the billing screen
export async function addCategoryOtherBook(categoryId: string, locationId: string) {
  const general = await categoryOtherBooks(categoryId);
  if ("error" in general) return { error: general.error };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("lookup_code", { p_code: general.code, p_location: locationId });
  if (error || !data?.length) return { error: error?.message ?? "Could not add the book" };
  return { item: data[0] as PosItem };
}

// One "<Category> (other books)" item per category, for books with no data, priced on the bill
async function categoryOtherBooks(categoryId: string): Promise<{ code: string } | { error: string }> {
  const supabase = await createClient();
  const { data: category } = await supabase.from("categories").select("name").eq("id", categoryId).single();
  if (!category) return { error: "Category not found" };
  const name = category.name + OTHER_BOOKS_SUFFIX;

  const { data: existing } = await supabase
    .from("items")
    .select("code")
    .eq("category_id", categoryId)
    .eq("kind", "LOT")
    .eq("name", name)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();
  if (existing) return existing;

  const { data, error } = await supabase
    .from("items")
    .insert({ kind: "LOT", name, category_id: categoryId, price: 0 })
    .select("code")
    .single();
  return error ? { error: error.message } : data;
}

// Books added while billing start at ₹0: keep the price the cashier typed for next time
export async function setNewBookPrices(rows: { item_id: string; price: number }[]) {
  const supabase = await createClient();
  await Promise.all(
    rows
      .filter((r) => r.price > 0)
      .map((r) => supabase.from("items").update({ price: r.price }).eq("id", r.item_id).eq("price", 0))
  );
}
