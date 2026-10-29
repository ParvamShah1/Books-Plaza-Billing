import { cache } from "react";
import { unstable_cache } from "next/cache";
import { createClient, createTokenClient, getAccessToken, getSessionUserId } from "@/lib/supabase/server";
import type { CurrentStaff } from "@/lib/pos/types";

// Cleared by setStaff when an admin changes someone's role or exhibition
export function staffTag(userId: string) {
  return `staff-${userId}`;
}

// Cached per request so the layout and the page share one lookup, and across requests
// (5 min, or until setStaff clears it) so pages don't wait on the database for it
export const getCurrentStaff = cache(async (): Promise<CurrentStaff | null> => {
  const supabase = await createClient();
  const userId = await getSessionUserId(supabase);
  if (!userId) return null;
  const token = await getAccessToken(supabase);
  if (!token) return null;

  return unstable_cache(
    async () => {
      const { data, error } = await createTokenClient(token)
        .from("profiles")
        .select("id, full_name, role, location_id")
        .eq("id", userId)
        .single();
      if (error) throw new Error(`${error.message} ${error.details ?? ""}`);
      return data as CurrentStaff;
    },
    ["staff-profile", userId],
    { tags: [staffTag(userId)], revalidate: 300 }
  )().catch((error) => {
    console.error("getCurrentStaff error:", error.message);
    return null;
  });
});
