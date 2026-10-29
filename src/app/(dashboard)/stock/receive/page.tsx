import { requireRole } from "@/lib/pos/guard";
import { getCategories, getItems, getLocations } from "@/lib/actions/catalog";
import { PageHeader } from "@/components/ui/page-header";
import { StockReceive } from "@/components/pos/stock-receive";

export const metadata = { title: "Receive stock - Books Plaza" };

export default async function ReceiveStockPage() {
  const staff = await requireRole(["ADMIN", "STAFF"]);
  const [locations, categories, lots] = await Promise.all([
    getLocations({ activeOnly: true }),
    getCategories(),
    getItems({ kind: "LOT", pageSize: 200 }),
  ]);

  return (
    <div>
      <PageHeader title="Receive stock" description="Scan books into a warehouse or exhibition" />
      <StockReceive
        locations={locations}
        categories={categories}
        lots={lots.items.filter((l) => l.is_active)}
        staff={staff}
      />
    </div>
  );
}
