import Link from "next/link";
import { format } from "date-fns";
import { requireRole } from "@/lib/pos/guard";
import { getCategories, getLocations } from "@/lib/actions/catalog";
import { getRecentReceipts, getStock } from "@/lib/actions/stock";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { UrlFilters } from "@/components/pos/url-filters";
import { InvoicePagination } from "@/components/invoice-pagination";
import { formatQty, formatRupees } from "@/lib/pos/billing";
import { primaryButtonClass } from "@/components/pos/form-styles";
import { Badge } from "@/components/ui/badge";
import { Boxes, ScanBarcode } from "lucide-react";

export const metadata = { title: "Stock - Books Plaza" };

const PAGE_SIZE = 50;

export default async function StockPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | undefined }>;
}) {
  const staff = await requireRole(["ADMIN", "STAFF"]);
  const params = await searchParams;
  const [locations, categories, receipts] = await Promise.all([
    getLocations(),
    getCategories(),
    getRecentReceipts(8),
  ]);

  const locationId = params.location || staff.location_id || locations.find((l) => l.kind === "WAREHOUSE")?.id || locations[0]?.id;
  const location = locations.find((l) => l.id === locationId);

  const stock = locationId
    ? await getStock({
        location_id: locationId,
        search: params.search,
        category_id: params.category,
        page: Number(params.page || "1"),
        pageSize: PAGE_SIZE,
      })
    : null;

  const th = "px-4 py-3 text-xs font-medium text-neutral-500 uppercase tracking-wider";

  return (
    <div>
      <PageHeader
        title="Stock"
        description={
          location && stock
            ? `${location.name} · ${formatQty(stock.totalQty)} books in stock`
            : "Books at each warehouse and exhibition"
        }
      >
        <Link href="/stock/receive" className={primaryButtonClass}>
          <ScanBarcode className="w-4 h-4" />
          Receive stock
        </Link>
      </PageHeader>

      <UrlFilters
        searchPlaceholder="Search title, code or ISBN"
        selects={[
          {
            name: "location",
            defaultValue: locationId,
            options: locations.map((l) => ({ value: l.id, label: l.name })),
          },
          {
            name: "category",
            placeholder: "All categories",
            options: categories.map((c) => ({ value: c.id, label: c.name })),
          },
        ]}
      />

      {!stock || stock.rows.length === 0 ? (
        <div className="glass-card rounded-xl">
          <EmptyState
            icon={Boxes}
            title="No stock here yet"
            description="Scan books in with Receive stock and they'll show up here."
          />
        </div>
      ) : (
        <>
          <div className="glass-card rounded-xl overflow-x-auto">
            <table className="w-full min-w-[640px]">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className={`${th} text-left`}>Book</th>
                  <th className={`${th} text-left`}>Code</th>
                  <th className={`${th} text-left`}>Category</th>
                  <th className={`${th} text-right`}>Price</th>
                  <th className={`${th} text-right`}>In stock</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {stock.rows.map((row) => (
                  <tr key={row.item_id} className="hover:bg-white/60">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-neutral-900">{row.item.name}</span>
                        {row.item.kind === "LOT" && <Badge variant="warning">Lot</Badge>}
                      </div>
                      {row.item.publisher && <div className="text-xs text-neutral-400">{row.item.publisher}</div>}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-neutral-500">{row.item.isbn || row.item.code}</td>
                    <td className="px-4 py-3 text-sm text-neutral-600">{row.item.category?.name ?? "—"}</td>
                    <td className="px-4 py-3 text-sm text-neutral-700 text-right">{formatRupees(Number(row.item.price))}</td>
                    <td
                      className={`px-4 py-3 text-sm font-semibold text-right ${
                        Number(row.qty) < 0 ? "text-red-500" : "text-neutral-900"
                      }`}
                    >
                      {formatQty(Number(row.qty))}
                      {row.item.category?.sell_by === "KG" && <span className="text-xs text-neutral-400 font-normal"> kg</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <InvoicePagination total={stock.total} pageSize={PAGE_SIZE} />
        </>
      )}

      {receipts.length > 0 && (
        <div className="mt-8">
          <h2 className="text-sm font-semibold text-neutral-900 mb-3">Recently received</h2>
          <div className="glass-card rounded-xl divide-y divide-gray-100">
            {receipts.map((r) => (
              <div key={r.id} className="flex items-center gap-4 px-4 py-3 text-sm">
                <span className="font-mono text-xs text-neutral-500 w-20">{r.receipt_no}</span>
                <span className="flex-1 text-neutral-700 truncate">
                  {r.location?.name}
                  {r.supplier && <span className="text-neutral-400"> · from {r.supplier}</span>}
                </span>
                <span className="text-neutral-400">{format(new Date(r.created_at), "dd MMM, hh:mm a")}</span>
                <span className="font-semibold text-neutral-900 w-20 text-right">{formatQty(Number(r.total_qty))} books</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
