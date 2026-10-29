import Link from "next/link";
import { requireRole } from "@/lib/pos/guard";
import { getCategories, getLocations } from "@/lib/actions/catalog";
import { PosScreen, type EditSale } from "@/components/pos/pos-screen";
import { getSale } from "@/lib/actions/sales";
import { createClient } from "@/lib/supabase/server";
import { EmptyState } from "@/components/ui/empty-state";
import { Store } from "lucide-react";

export const metadata = { title: "Billing - Books Plaza" };

async function couponPct(code: string) {
  const supabase = await createClient();
  const { data } = await supabase.from("coupons").select("discount_pct").eq("code", code).single();
  return Number(data?.discount_pct ?? 0);
}

export default async function PosPage({ searchParams }: { searchParams: Promise<{ edit?: string }> }) {
  const staff = await requireRole(["ADMIN", "STAFF"]);
  const { edit } = await searchParams;
  const [locations, categories, sale] = await Promise.all([
    getLocations({ activeOnly: true }),
    getCategories(),
    // ?edit=<bill id>: an admin fixing a paid bill from the Sales page
    edit && staff.role === "ADMIN" && /^[0-9a-f-]{36}$/i.test(edit) ? getSale(edit) : null,
  ]);
  const editSale: EditSale | undefined =
    sale?.status === "PAID" && sale.invoice_no
      ? {
          id: sale.id,
          invoice_no: sale.invoice_no,
          location_id: sale.location_id,
          phone: sale.phone,
          coupon_code: sale.coupon_code,
          coupon_pct: sale.coupon_code ? await couponPct(sale.coupon_code) : 0,
        }
      : undefined;

  if (locations.length === 0) {
    return (
      <div className="glass-card rounded-2xl max-w-xl mx-auto mt-10">
        <EmptyState
          icon={Store}
          title="No exhibitions yet"
          description={
            staff.role === "ADMIN"
              ? "Add your warehouse and exhibitions in Settings to start billing."
              : "Ask an admin to add your exhibition."
          }
        >
          {staff.role === "ADMIN" && (
            <Link
              href="/settings"
              className="px-4 py-2 rounded-lg bg-orange-500 text-white text-sm font-medium hover:bg-orange-600"
            >
              Open settings
            </Link>
          )}
        </EmptyState>
      </div>
    );
  }

  return <PosScreen key={editSale?.id ?? "new"} locations={locations} categories={categories} staff={staff} editSale={editSale} />;
}
