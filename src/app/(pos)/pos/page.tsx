import Link from "next/link";
import { requireRole } from "@/lib/pos/guard";
import { getCategories, getLocations } from "@/lib/actions/catalog";
import { PosScreen } from "@/components/pos/pos-screen";
import { EmptyState } from "@/components/ui/empty-state";
import { Store } from "lucide-react";

export const metadata = { title: "Billing - Books Plaza" };

export default async function PosPage() {
  const staff = await requireRole(["ADMIN", "STAFF"]);
  const [locations, categories] = await Promise.all([getLocations({ activeOnly: true }), getCategories()]);

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

  return <PosScreen locations={locations} categories={categories} staff={staff} />;
}
