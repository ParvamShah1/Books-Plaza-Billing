"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { expenseSchema } from "@/lib/pos/validations";
import type { Expense } from "@/lib/pos/types";

export async function getExpenses(filters: { from: string; to: string; location_id?: string }) {
  const supabase = await createClient();
  let query = supabase
    .from("expenses")
    .select("*, location:locations!left(id, name)")
    .gte("spent_on", filters.from)
    .lte("spent_on", filters.to)
    .order("spent_on", { ascending: false })
    .order("created_at", { ascending: false });
  if (filters.location_id) query = query.eq("location_id", filters.location_id);

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data as Expense[]).map((e) => ({ ...e, amount: Number(e.amount) }));
}

export async function addExpense(input: unknown) {
  const parsed = expenseSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const { error } = await supabase.from("expenses").insert(parsed.data);
  if (error) {
    // The database only lets staff enter today's or yesterday's expenses at their own location
    if (error.code === "42501") return { error: "You can only add today's or yesterday's expenses for your exhibition" };
    return { error: error.message };
  }

  revalidatePath("/expenses");
  return { success: true };
}

export async function deleteExpense(id: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.from("expenses").delete().eq("id", id).select("id");
  if (error) return { error: error.message };
  if (!data?.length) return { error: "Only the person who added it can remove it, within a day" };

  revalidatePath("/expenses");
  return { success: true };
}
