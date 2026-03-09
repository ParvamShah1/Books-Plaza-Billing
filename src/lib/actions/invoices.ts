"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { invoiceSchema } from "@/lib/validations";
import { calculateInvoiceTotals } from "@/lib/calculations";
import type { Invoice } from "@/lib/types";

async function getUserId() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");
  return { supabase, userId: user.id };
}

export async function getInvoices(filters?: {
  type?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}): Promise<{ invoices: Invoice[]; total: number }> {
  const { supabase } = await getUserId();
  const page = filters?.page || 1;
  const pageSize = filters?.pageSize || 20;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from("invoices")
    .select("*, entity:entities!left(id, name), customer:customers!left(id, full_name, phone, email, gst_number)", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, to);

  if (filters?.type) {
    query = query.eq("type", filters.type);
  }
  if (filters?.search) {
    query = query.or(
      `invoice_number.ilike.%${filters.search}%`
    );
  }

  const { data, error, count } = await query;
  if (error) throw new Error(error.message);
  return { invoices: data as Invoice[], total: count || 0 };
}

export async function getInvoice(id: string): Promise<Invoice | null> {
  const { supabase } = await getUserId();

  const { data, error } = await supabase
    .from("invoices")
    .select(
      "*, entity:entities!left(*), customer:customers!left(*), items:invoice_items(*)"
    )
    .eq("id", id)
    .single();

  if (error) {
    console.error("getInvoice error:", error.message);
    return null;
  }
  return data as Invoice;
}

export async function createInvoice(input: unknown) {
  const parsed = invoiceSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const { supabase, userId } = await getUserId();

  // Generate invoice number
  const { data: numData, error: numError } = await supabase.rpc(
    "generate_invoice_number",
    { p_user_id: userId }
  );

  if (numError) return { error: numError.message };

  const invoiceNumber = numData as string;

  // Calculate totals
  const totals = calculateInvoiceTotals(parsed.data.items);
  const freight = parsed.data.freight_charges || 0;
  const grandTotal = totals.subtotal + freight;

  const { data: invoice, error: invoiceError } = await supabase
    .from("invoices")
    .insert({
      user_id: userId,
      entity_id: parsed.data.entity_id,
      invoice_number: invoiceNumber,
      type: parsed.data.type,
      customer_id: parsed.data.customer_id,
      subtotal: totals.subtotal,
      freight_charges: freight,
      grand_total: grandTotal,
      show_total: parsed.data.show_total,
      notes: parsed.data.notes || null,
    })
    .select()
    .single();

  if (invoiceError) return { error: invoiceError.message };

  // Insert items
  const items = parsed.data.items.map((item) => {
    const amount = Math.round(item.quantity * item.price * (1 - item.discount / 100) * 100) / 100;
    return {
      invoice_id: invoice.id,
      title: item.title,
      publisher: item.publisher || null,
      quantity: item.quantity,
      price: item.price,
      discount: item.discount,
      amount,
    };
  });

  const { error: itemsError } = await supabase
    .from("invoice_items")
    .insert(items);

  if (itemsError) return { error: itemsError.message };

  revalidatePath("/invoices");
  return { success: true, id: invoice.id, invoice_number: invoiceNumber };
}

export async function convertToTaxInvoice(id: string) {
  const { supabase } = await getUserId();

  const { data: invoice, error: fetchError } = await supabase
    .from("invoices")
    .select("*, items:invoice_items(*)")
    .eq("id", id)
    .single();

  if (fetchError || !invoice) return { error: "Invoice not found" };
  if (invoice.type !== "DELIVERY_CHALLAN") {
    return { error: "Only delivery challans can be converted" };
  }

  const { error: updateError } = await supabase
    .from("invoices")
    .update({ type: "TAX_INVOICE" })
    .eq("id", id);

  if (updateError) return { error: updateError.message };

  revalidatePath("/invoices");
  revalidatePath(`/invoices/${id}`);
  return { success: true };
}

export async function getCustomerInvoices(customerId: string): Promise<Invoice[]> {
  const { supabase } = await getUserId();

  const { data, error } = await supabase
    .from("invoices")
    .select("*, entity:entities!left(id, name)")
    .eq("customer_id", customerId)
    .eq("type", "TAX_INVOICE")
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);
  return data as Invoice[];
}
