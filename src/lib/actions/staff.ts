"use server";

import { revalidatePath, updateTag } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { staffTag } from "@/lib/pos/session";
import type { Role, StaffMember } from "@/lib/pos/types";

export async function listStaff(): Promise<StaffMember[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_staff", {}, { get: true });
  if (error) throw new Error(error.message);
  return data as StaffMember[];
}

export async function setStaff(userId: string, role: Role, locationId: string | null) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_staff", {
    p_user: userId,
    p_role: role,
    p_location: role === "STAFF" ? locationId : null,
  });
  if (error) return { error: error.message };

  updateTag(staffTag(userId));
  revalidatePath("/settings");
  return { success: true };
}
