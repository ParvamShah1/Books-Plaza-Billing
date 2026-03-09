"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { paymentSchema } from "@/lib/validations";
import type { Payment } from "@/lib/types";

async function getUserId() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");
  return { supabase, userId: user.id };
}

export async function getCustomerPayments(customerId: string): Promise<Payment[]> {
  const { supabase } = await getUserId();

  const { data, error } = await supabase
    .from("payments")
    .select("*")
    .eq("customer_id", customerId)
    .order("created_at", { ascending: false });

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

export async function getCustomerBalance(customerId: string) {
  const { supabase } = await getUserId();

  // Total invoiced (only tax invoices)
  const { data: invoiceData } = await supabase
    .from("invoices")
    .select("grand_total")
    .eq("customer_id", customerId)
    .eq("type", "TAX_INVOICE");

  const totalInvoiced = invoiceData?.reduce(
    (sum, inv) => sum + Number(inv.grand_total), 0
  ) || 0;

  // Total paid
  const { data: paymentData } = await supabase
    .from("payments")
    .select("amount")
    .eq("customer_id", customerId);

  const totalPaid = paymentData?.reduce(
    (sum, p) => sum + Number(p.amount), 0
  ) || 0;

  return {
    totalInvoiced: Math.round(totalInvoiced),
    totalPaid: Math.round(totalPaid),
    pendingAmount: Math.round(totalInvoiced - totalPaid),
  };
}
