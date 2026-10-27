"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { itemIdsForBarcode } from "@/lib/pos/search";
import type { StockRow } from "@/lib/pos/types";

export async function getStock(filters: {
  location_id: string;
  search?: string;
  category_id?: string;
  page?: number;
  pageSize?: number;
}): Promise<{ rows: StockRow[]; total: number; totalQty: number }> {
  const supabase = await createClient();
  const page = filters.page || 1;
  const pageSize = filters.pageSize || 50;
  const from = (page - 1) * pageSize;

  let query = supabase
    .from("stock")
    .select(
      "item_id, location_id, qty, item:items!inner(id, kind, code, name, isbn, publisher, price, category_id, category:categories!left(id, name, sell_by))",
      { count: "exact" }
    )
    .eq("location_id", filters.location_id)
    .neq("qty", 0)
    .order("qty", { ascending: false })
    .range(from, from + pageSize - 1);

  if (filters.category_id) query = query.eq("item.category_id", filters.category_id);
  if (filters.search) {
    const s = filters.search.trim().replace(/[%,()]/g, " ");
    const parts = [`name.ilike.%${s}%`, `code.eq.${s.toUpperCase()}`, `isbn.eq.${s.replace(/[^0-9Xx]/g, "") || "-"}`];
    const linkedIds = await itemIdsForBarcode(supabase, s);
    if (linkedIds.length) parts.push(`id.in.(${linkedIds.join(",")})`);
    query = query.or(parts.join(","), { referencedTable: "item" });
  }

  const [{ data, error, count }, totals] = await Promise.all([
    query,
    supabase.rpc("stock_summary", { p_location: filters.location_id }, { get: true }).single(),
  ]);
  if (error) throw new Error(error.message);

  const totalQty = Number((totals.data as { total_qty: number } | null)?.total_qty ?? 0);
  return { rows: data as unknown as StockRow[], total: count || 0, totalQty };
}

export async function createStockReceipt(input: {
  location_id: string;
  supplier: string;
  notes: string;
  items: { item_id: string; qty: number; cost_price?: number | null; codes: string[] }[];
}) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_stock_receipt", { p: input });
  if (error) return { error: error.message };

  revalidatePath("/stock");
  revalidatePath("/items");
  return { success: true, receipt: data as { id: string; receipt_no: string; total_qty: number } };
}

export async function getRecentReceipts(limit = 10) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("stock_receipts")
    .select("id, receipt_no, supplier, total_qty, created_at, location:locations!left(name)")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return data as unknown as {
    id: string;
    receipt_no: string;
    supplier: string | null;
    total_qty: number;
    created_at: string;
    location: { name: string } | null;
  }[];
}
