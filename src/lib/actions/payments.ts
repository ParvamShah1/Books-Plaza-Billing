"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { paymentSchema } from "@/lib/validations";
import type { Payment } from "@/lib/types";

export type DateFilter = {
  filter?: string;
  year?: string;
  startDate?: string;
  endDate?: string;
};

async function getUserId() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");
  return { supabase, userId: user.id };
}

function getDateRange(filters?: DateFilter): { from?: string; to?: string } {
  if (!filters?.filter || filters.filter === "all") return {};

  const now = new Date();

  if (filters.filter === "last7days") {
    const from = new Date(now);
    from.setDate(from.getDate() - 7);
    return { from: from.toISOString(), to: now.toISOString() };
  }

  if (filters.filter === "thisMonth") {
    const from = new Date(now.getFullYear(), now.getMonth(), 1);
    return { from: from.toISOString(), to: now.toISOString() };
  }

  if (filters.filter === "lastMonth") {
    const from = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const to = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
    return { from: from.toISOString(), to: to.toISOString() };
  }

  if (filters.filter === "year" && filters.year) {
    const yr = parseInt(filters.year);
    const from = new Date(yr, 0, 1);
    const to = new Date(yr, 11, 31, 23, 59, 59);
    return { from: from.toISOString(), to: to.toISOString() };
  }

  if (filters.filter === "custom") {
    const from = filters.startDate
      ? new Date(filters.startDate).toISOString()
      : undefined;
    const to = filters.endDate
      ? new Date(filters.endDate + "T23:59:59").toISOString()
      : undefined;
    return { from, to };
  }

  return {};
}

export async function getCustomerPayments(
  customerId: string,
  filters?: DateFilter
): Promise<Payment[]> {
  const { supabase } = await getUserId();
  const { from, to } = getDateRange(filters);

  let query = supabase
    .from("payments")
    .select("*")
    .eq("customer_id", customerId)
    .order("created_at", { ascending: false });

  if (from) query = query.gte("created_at", from);
  if (to) query = query.lte("created_at", to);

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data as Payment[];
}

export async function recordPayment(input: unknown) {
  const parsed = paymentSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const { supabase, userId } = await getUserId();

  const { error } = await supabase
    .from("payments")
    .insert({
      user_id: userId,
      customer_id: parsed.data.customer_id,
      amount: parsed.data.amount,
      mode: parsed.data.mode,
      notes: parsed.data.notes || null,
    });

  if (error) return { error: error.message };

  revalidatePath("/customers");
  revalidatePath(`/customers/${parsed.data.customer_id}`);
  return { success: true };
}

export async function getCustomerBalance(
  customerId: string,
  filters?: DateFilter
) {
  const { supabase } = await getUserId();
  const { from, to } = getDateRange(filters);

  // Total invoiced (only tax invoices)
  let invoiceQuery = supabase
    .from("invoices")
    .select("grand_total")
    .eq("customer_id", customerId)
    .eq("type", "TAX_INVOICE");

  if (from) invoiceQuery = invoiceQuery.gte("created_at", from);
  if (to) invoiceQuery = invoiceQuery.lte("created_at", to);

  const { data: invoiceData } = await invoiceQuery;

  const totalInvoiced = invoiceData?.reduce(
    (sum, inv) => sum + Number(inv.grand_total), 0
  ) || 0;

  // Total paid
  let paymentQuery = supabase
    .from("payments")
    .select("amount")
    .eq("customer_id", customerId);

  if (from) paymentQuery = paymentQuery.gte("created_at", from);
  if (to) paymentQuery = paymentQuery.lte("created_at", to);

  const { data: paymentData } = await paymentQuery;

  const totalPaid = paymentData?.reduce(
    (sum, p) => sum + Number(p.amount), 0
  ) || 0;

  return {
    totalInvoiced: Math.round(totalInvoiced),
    totalPaid: Math.round(totalPaid),
    pendingAmount: Math.round(totalInvoiced - totalPaid),
  };
}
