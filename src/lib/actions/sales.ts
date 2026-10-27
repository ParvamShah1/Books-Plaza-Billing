"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isValidMobile } from "@/lib/pos/billing";
import type { Sale } from "@/lib/pos/types";

// Day range in India time, returned as UTC ISO strings
function istDayRange(from: string, to: string) {
  return {
    start: new Date(`${from}T00:00:00+05:30`).toISOString(),
    end: new Date(new Date(`${to}T00:00:00+05:30`).getTime() + 86400000).toISOString(),
  };
}

export async function getSales(filters: {
  from: string;
  to: string;
  location_id?: string;
  status?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}) {
  const supabase = await createClient();
  const page = filters.page || 1;
  const pageSize = filters.pageSize || 50;
  const offset = (page - 1) * pageSize;
  const { start, end } = istDayRange(filters.from, filters.to);
  const status = filters.status || "PAID";

  let query = supabase
    .from("sales")
    .select("*, location:locations!left(id, name, code)", { count: "exact" })
    .eq("status", status)
    .order("created_at", { ascending: false })
    .range(offset, offset + pageSize - 1);

  query = status === "HELD"
    ? query.gte("created_at", start).lt("created_at", end)
    : query.gte("paid_at", start).lt("paid_at", end);

  if (filters.location_id) query = query.eq("location_id", filters.location_id);
  if (filters.search) {
    const s = filters.search.trim().replace(/[%,()]/g, "");
    query = query.or(`invoice_no.ilike.%${s}%,phone.ilike.%${s}%`);
  }

  // GET rpc sends args in the URL, where null becomes the text "null"; leave p_location out instead
  const summaryArgs = filters.location_id
    ? { p_from: start, p_to: end, p_location: filters.location_id }
    : { p_from: start, p_to: end };

  const [{ data, error, count }, summary] = await Promise.all([
    query,
    supabase.rpc("sales_summary", summaryArgs, { get: true }).single(),
  ]);
  if (error) throw new Error(error.message);
  if (summary.error) console.error("sales_summary error:", summary.error.message);

  return {
    sales: data as Sale[],
    total: count || 0,
    summary: (summary.data as {
      bills: number;
      total: number;
      cash: number;
      upi: number;
      card: number;
      qty: number;
    } | null) ?? { bills: 0, total: 0, cash: 0, upi: 0, card: 0, qty: 0 },
  };
}

export async function getSale(id: string): Promise<Sale | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("sales")
    .select("*, location:locations!left(id, name, code, address), items:sale_items(*)")
    .eq("id", id)
    .single();

  if (error) {
    console.error("getSale error:", error.message);
    return null;
  }
  const sale = data as Sale;
  sale.items?.sort((a, b) => a.sort_order - b.sort_order);
  return sale;
}

export async function cancelSale(id: string, reason: string) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_sale", { p_sale_id: id, p_reason: reason });
  if (error) return { error: error.message };

  revalidatePath("/sales");
  revalidatePath("/stock");
  return { success: true };
}

export async function searchCustomerPhones(prefix: string): Promise<string[]> {
  if (!/^\d{4,9}$/.test(prefix)) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("pos_customers")
    .select("phone")
    .like("phone", `${prefix}%`)
    .order("phone")
    .limit(6);
  return (data || []).map((c) => c.phone as string);
}

// Sends the "thank you + bill link" SMS through MSG91. Called after billing, never blocks the cashier.
export async function sendBillSms(saleId: string) {
  const authKey = process.env.MSG91_AUTH_KEY;
  const templateId = process.env.MSG91_TEMPLATE_ID;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!authKey || !templateId || !appUrl) return { skipped: "SMS not configured" };

  const supabase = await createClient();
  const { data: sale } = await supabase
    .from("sales")
    .select("phone, status, public_token, location:locations!left(name)")
    .eq("id", saleId)
    .single();

  const phone = sale?.phone as string | null;
  if (!sale || sale.status !== "PAID" || !phone || !isValidMobile(phone)) {
    return { skipped: "No valid mobile number" };
  }

  const location = sale.location as unknown as { name: string } | null;
  try {
    const res = await fetch("https://control.msg91.com/api/v5/flow/", {
      method: "POST",
      headers: { accept: "application/json", "content-type": "application/json", authkey: authKey },
      body: JSON.stringify({
        template_id: templateId,
        short_url: "1",
        recipients: [
          {
            mobiles: `91${phone}`,
            var: location?.name || "Books Plaza",
            var1: `${appUrl.replace(/\/$/, "")}/b/${sale.public_token}`,
          },
        ],
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return { error: `SMS failed (${res.status})` };
    return { success: true };
  } catch {
    return { error: "SMS failed" };
  }
}
