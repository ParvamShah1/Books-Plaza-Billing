"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { customerSchema } from "@/lib/validations";
import type { Customer, CustomerWithBalance } from "@/lib/types";

async function getUserId() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");
  return { supabase, userId: user.id };
}

export async function getCustomers(search?: string): Promise<Customer[]> {
  const { supabase } = await getUserId();

  let query = supabase
    .from("customers")
    .select("*")
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (search) {
    query = query.or(
      `full_name.ilike.%${search}%,phone.ilike.%${search}%,email.ilike.%${search}%`
    );
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data as Customer[];
}

export async function getCustomersWithBalance(search?: string): Promise<CustomerWithBalance[]> {
  const { supabase } = await getUserId();

  let query = supabase
    .from("customers")
    .select("*")
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (search) {
    query = query.or(
      `full_name.ilike.%${search}%,phone.ilike.%${search}%,email.ilike.%${search}%`
    );
  }

  const { data: customers, error } = await query;
  if (error) throw new Error(error.message);

  // Fetch all invoice totals and payments in parallel for all customers
  const customerIds = (customers || []).map((c) => c.id);

  if (customerIds.length === 0) return [];

  const [{ data: invoices }, { data: payments }] = await Promise.all([
    supabase
      .from("invoices")
      .select("customer_id, grand_total")
      .in("customer_id", customerIds)
      .eq("type", "TAX_INVOICE"),
    supabase
      .from("payments")
      .select("customer_id, amount")
      .in("customer_id", customerIds),
  ]);

  // Build lookup maps
  const invoiceTotals: Record<string, number> = {};
  for (const inv of invoices || []) {
    invoiceTotals[inv.customer_id] = (invoiceTotals[inv.customer_id] || 0) + Number(inv.grand_total);
  }

  const paymentTotals: Record<string, number> = {};
  for (const p of payments || []) {
    paymentTotals[p.customer_id] = (paymentTotals[p.customer_id] || 0) + Number(p.amount);
  }

  return (customers || []).map((c) => {
    const totalInvoiced = Math.round(invoiceTotals[c.id] || 0);
    const totalPaid = Math.round(paymentTotals[c.id] || 0);
    return {
      ...c,
      total_invoiced: totalInvoiced,
      total_paid: totalPaid,
      pending_amount: totalInvoiced - totalPaid,
    };
  }) as CustomerWithBalance[];
}

export async function getCustomer(id: string): Promise<Customer | null> {
  const { supabase } = await getUserId();

  const { data, error } = await supabase
    .from("customers")
    .select("*")
    .eq("id", id)
    .is("deleted_at", null)
    .single();

  if (error) return null;
  return data as Customer;
}

export async function createCustomer(formData: FormData) {
  const raw = {
    full_name: formData.get("full_name") as string,
    phone: formData.get("phone") as string,
    email: formData.get("email") as string,
    address: formData.get("address") as string,
    gst_number: formData.get("gst_number") as string,
  };

  const parsed = customerSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const { supabase, userId } = await getUserId();

  const { error } = await supabase.from("customers").insert({
    ...parsed.data,
    user_id: userId,
  });

  if (error) return { error: error.message };

  revalidatePath("/customers");
  return { success: true };
}

export async function updateCustomer(id: string, formData: FormData) {
  const raw = {
    full_name: formData.get("full_name") as string,
    phone: formData.get("phone") as string,
    email: formData.get("email") as string,
    address: formData.get("address") as string,
    gst_number: formData.get("gst_number") as string,
  };

  const parsed = customerSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const { supabase } = await getUserId();

  const { error } = await supabase
    .from("customers")
    .update(parsed.data)
    .eq("id", id);

  if (error) return { error: error.message };

  revalidatePath("/customers");
  return { success: true };
}

export async function deleteCustomer(id: string) {
  const { supabase } = await getUserId();

  const { error } = await supabase
    .from("customers")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);

  if (error) return { error: error.message };

  revalidatePath("/customers");
  return { success: true };
}
