"use server";

import { createClient } from "@/lib/supabase/server";
import type { Entity } from "@/lib/types";

export async function getEntities(): Promise<Entity[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("entities")
    .select("*")
    .order("name", { ascending: true });

  if (error) throw new Error(error.message);
  return data as Entity[];
}
