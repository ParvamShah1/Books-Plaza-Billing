import { redirect } from "next/navigation";
import { createClient, getSessionUserId } from "@/lib/supabase/server";

export default async function Home() {
  const supabase = await createClient();
  const userId = await getSessionUserId(supabase);

  if (userId) {
    redirect("/pos");
  } else {
    redirect("/auth/login");
  }
}
