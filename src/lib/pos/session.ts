import { cache } from "react";
import { createClient, getSessionUserId } from "@/lib/supabase/server";
import type { CurrentStaff } from "@/lib/pos/types";

// Cached per request so the layout and the page share one lookup
export const getCurrentStaff = cache(async (): Promise<CurrentStaff | null> => {
  const supabase = await createClient();
  const userId = await getSessionUserId(supabase);
  if (!userId) return null;

  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, role, location_id")
    .eq("id", userId)
    .single();

  if (error) {
    console.error("getCurrentStaff error:", error.message, error.details ?? "");
    return null;
  }
  return data as CurrentStaff;
});
