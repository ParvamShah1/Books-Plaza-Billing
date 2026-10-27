"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { categorySchema, itemSchema, locationSchema } from "@/lib/pos/validations";
import { itemIdsForBarcode } from "@/lib/pos/search";
import type { Category, CategoryDiscount, Item, ItemKind, Location } from "@/lib/pos/types";

// ---------- Locations ----------

export async function getLocations(options?: { activeOnly?: boolean }): Promise<Location[]> {
  const supabase = await createClient();
  let query = supabase.from("locations").select("*").order("is_active", { ascending: false }).order("name");
  if (options?.activeOnly) query = query.eq("is_active", true);

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data as Location[];
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

  revalidatePath("/settings");
  return { success: true };
}

// ---------- Categories + discounts ----------

export async function getCategories(): Promise<Category[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("categories").select("*").order("name");
  if (error) throw new Error(error.message);
  return data as Category[];
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
