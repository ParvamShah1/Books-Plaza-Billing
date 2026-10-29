import type { SupabaseClient } from "@supabase/supabase-js";

// Items whose linked barcodes match the search, e.g. a lot book's ISBN -> "Lot ₹100"
export async function itemIdsForBarcode(supabase: SupabaseClient, search: string): Promise<string[]> {
  const digits = search.replace(/[^0-9Xx]/g, "").toUpperCase();
  if (digits.length < 10) return [];

  const { data } = await supabase
    .from("barcodes")
    .select("item_id")
    .in("code", [digits, search.trim().toUpperCase()]);
  return [...new Set((data || []).map((b) => b.item_id as string))];
}
