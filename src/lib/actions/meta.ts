"use server";

import { createHash } from "crypto";
import { createClient } from "@/lib/supabase/server";
import { isValidMobile } from "@/lib/pos/billing";

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

// Sends a paid bill to Meta (Conversions API) as an in-store Purchase, so Meta can
// match ad viewers to real buyers by their mobile number. Never blocks the cashier.
// Bills without a valid mobile number are skipped: Meta has nothing to match them on.
export async function sendPurchaseToMeta(saleId: string) {
  const datasetId = process.env.META_DATASET_ID;
  const token = process.env.META_CAPI_TOKEN;
  if (!datasetId || !token) return { skipped: "Meta not configured" };

  const supabase = await createClient();
  const { data: sale } = await supabase
    .from("sales")
    .select(
      "id, invoice_no, phone, status, payable, paid_at, total_qty, location:locations!left(name, code), items:sale_items(qty, price, item:items(code, isbn))"
    )
    .eq("id", saleId)
    .single();

  const phone = sale?.phone as string | null;
  if (!sale || sale.status !== "PAID" || !sale.paid_at || !phone || !isValidMobile(phone)) {
    return { skipped: "No valid mobile number" };
  }

  const location = sale.location as unknown as { name: string; code: string } | null;
  const items = (sale.items || []) as unknown as {
    qty: number;
    price: number;
    item: { code: string; isbn: string | null } | null;
  }[];

  const event = {
    event_name: "Purchase",
    event_time: Math.floor(new Date(sale.paid_at).getTime() / 1000),
    // Same id on a resend, so Meta counts the bill once
    event_id: sale.invoice_no || sale.id,
    action_source: "physical_store",
    user_data: {
      ph: [sha256(`91${phone}`)],
      country: [sha256("in")],
      external_id: [sha256(phone)],
    },
    custom_data: {
      currency: "INR",
      value: Number(sale.payable),
      order_id: sale.invoice_no,
      num_items: Number(sale.total_qty),
      content_type: "product",
      contents: items.map((i) => ({
        id: i.item?.isbn || i.item?.code || "unknown",
        quantity: Number(i.qty),
        item_price: Number(i.price),
      })),
      exhibition: location?.name,
    },
  };

  try {
    const version = process.env.META_API_VERSION || "v24.0";
    const res = await fetch(`https://graph.facebook.com/${version}/${datasetId}/events`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({
        data: [event],
        // Set while testing to see events live under Events Manager > Test events
        ...(process.env.META_TEST_EVENT_CODE ? { test_event_code: process.env.META_TEST_EVENT_CODE } : {}),
      }),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      console.error("Meta purchase send failed:", res.status, body?.error?.message);
      return { error: `Meta failed (${res.status})` };
    }
    return { success: true };
  } catch (e) {
    console.error("Meta purchase send failed:", e);
    return { error: "Meta failed" };
  }
}
