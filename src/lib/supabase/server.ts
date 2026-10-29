import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchWithRetry } from "@/lib/supabase/fetch-retry";

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: { fetch: fetchWithRetry },
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // The `setAll` method is called from a Server Component
            // which cannot set cookies. This can be ignored if you have
            // middleware refreshing sessions.
          }
        },
      },
    }
  );
}

// Signed-in user id. getClaims verifies the JWT locally (ES256 keys), unlike
// getUser which makes a round trip to Supabase Auth on every call.
export async function getSessionUserId(supabase: SupabaseClient): Promise<string | null> {
  const { data } = await supabase.auth.getClaims();
  return data?.claims?.sub ?? null;
}
