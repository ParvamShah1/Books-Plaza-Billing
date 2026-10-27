import { redirect } from "next/navigation";
import { getCurrentStaff } from "@/lib/pos/session";
import type { Role } from "@/lib/pos/types";

// Server-side page guard: sends users without access back to billing (or invoices for unapproved users)
export async function requireRole(roles: Role[]) {
  const staff = await getCurrentStaff();
  const role = staff?.role ?? "PENDING";
  if (!staff || !roles.includes(role)) {
    redirect(role === "PENDING" ? "/invoices" : "/pos");
  }
  return staff;
}
