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

// Cash taken in billing over the days, for the cash left after expenses
export async function getCashSales(filters: { from: string; to: string; location_id?: string }) {
  const supabase = await createClient();
  const { start, end } = istDayRange(filters.from, filters.to);
  const args = filters.location_id
    ? { p_from: start, p_to: end, p_location: filters.location_id }
    : { p_from: start, p_to: end };
  const { data, error } = await supabase.rpc("sales_summary", args, { get: true }).single();
  if (error) console.error("sales_summary error:", error.message);
  return Number((data as { cash: number } | null)?.cash ?? 0);
}

export type CategorySales ={ category: string; bills: number; qty: number; mrp: number; discount: number; amount: number };

export async function getCategorySales(filters: { from: string; to: string; location_id?: string }) {
  const supabase = await createClient();
  const { start, end } = istDayRange(filters.from, filters.to);
  const args = filters.location_id
    ? { p_from: start, p_to: end, p_location: filters.location_id }
    : { p_from: start, p_to: end };

  const { data, error } = await supabase.rpc("category_sales", args);
  if (error) throw new Error(error.message);
  return (data as CategorySales[]).map((r) => ({
    ...r,
    bills: Number(r.bills),
    qty: Number(r.qty),
    mrp: Number(r.mrp),
    discount: Number(r.discount),
    amount: Number(r.amount),
  }));
}

export async function getSale(id: string): Promise<Sale | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("sales")
    .select(
      "*, location:locations!left(id, name, code, address), items:sale_items(*), next_coupon:coupons!coupons_issued_sale_id_fkey(code, discount_pct, status)"
    )
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

// Sends the bill + next-visit coupon on WhatsApp. Called after billing, never blocks the cashier.
// Goes through Chatbox's API (paid from the Chatbox wallet, shows in its API Message Report),
// with a template approved in Chatbox: body {{1}} exhibition, {{2}} bill amount, {{3}} coupon code;
// first button "View your bill" opens <app>/b/{{1}} with the bill's public token, second is the website.
export async function sendBillWhatsApp(saleId: string) {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const apiKey = process.env.CHATBOX_API_KEY;
  const template = process.env.WHATSAPP_TEMPLATE_NAME;
  if (!phoneNumberId || !apiKey || !template) return { skipped: "WhatsApp not configured" };

  const supabase = await createClient();
  const { data: sale } = await supabase
    .from("sales")
    .select("phone, status, payable, public_token, location:locations!left(name), next_coupon:coupons!coupons_issued_sale_id_fkey(code)")
    .eq("id", saleId)
    .single();

  const phone = sale?.phone as string | null;
  if (!sale || sale.status !== "PAID" || !phone || !isValidMobile(phone)) {
    return { skipped: "No valid mobile number" };
  }

  const location = sale.location as unknown as { name: string } | null;
  const coupon = (sale.next_coupon as unknown as { code: string }[] | { code: string } | null);
  const couponCode = Array.isArray(coupon) ? coupon[0]?.code : coupon?.code;
  const text = (value: string) => ({ type: "text", text: value });

  try {
    const res = await fetch(`https://api.chatbox.biz/v3/${phoneNumberId}/messages`, {
      method: "POST",
      headers: { apikey: apiKey, "content-type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: `91${phone}`,
        type: "template",
        template: {
          name: template,
          language: { code: process.env.WHATSAPP_TEMPLATE_LANG || "en" },
          components: [
            {
              type: "body",
              parameters: [
                text(location?.name || "Books Plaza"),
                text(String(Number(sale.payable))),
                text(couponCode || "-"),
              ],
            },
            { type: "button", sub_type: "url", index: "0", parameters: [text(sale.public_token)] },
          ],
        },
      }),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      console.error("WhatsApp send failed:", res.status, body?.error?.message);
      return { error: `WhatsApp failed (${res.status})` };
    }
    return { success: true };
  } catch (e) {
    console.error("WhatsApp send failed:", e);
    return { error: "WhatsApp failed" };
  }
}

// Coupons only work for the mobile number they were sent to
export async function checkCoupon(code: string, phone: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("check_coupon", { p_code: code, p_phone: phone || null });
  if (error) return { ok: false as const, message: error.message };
  return data as { ok: true; code: string; discount_pct: number } | { ok: false; message: string };
}
