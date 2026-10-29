import Link from "next/link";
import { format } from "date-fns";
import { requireRole } from "@/lib/pos/guard";
import { getLocations } from "@/lib/actions/catalog";
import { getCategorySales, getSales } from "@/lib/actions/sales";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { UrlFilters } from "@/components/pos/url-filters";
import { SaleRowActions } from "@/components/pos/sale-row-actions";
import { CategorySalesTable } from "@/components/pos/category-sales-table";
import { InvoicePagination } from "@/components/invoice-pagination";
import { primaryButtonClass } from "@/components/pos/form-styles";
import { NO_PHONE, formatQty, formatRupees } from "@/lib/pos/billing";
import { IndianRupee, Receipt, Banknote, Smartphone, ScanBarcode } from "lucide-react";

export const metadata = { title: "Sales - Books Plaza" };

const PAGE_SIZE = 50;

function todayInIndia() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
}

const statusTabs = [
  { value: "PAID", label: "Paid" },
  { value: "HELD", label: "On hold" },
  { value: "CANCELLED", label: "Cancelled" },
  { value: "CATEGORY", label: "By category" },
];

export default async function SalesPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | undefined }>;
}) {
  const staff = await requireRole(["ADMIN", "STAFF"]);
  const params = await searchParams;
  const isAdmin = staff.role === "ADMIN";
  const today = todayInIndia();
  const from = params.from || today;
  const to = params.to || from;
  const status = params.status || "PAID";
  const byCategory = status === "CATEGORY";
  const locationId = isAdmin ? params.location : staff.location_id ?? undefined;

  const [locations, { sales, total, summary }, categorySales] = await Promise.all([
    getLocations(),
    getSales({
      from,
      to,
      status: byCategory ? "PAID" : status,
      location_id: locationId,
      search: params.search,
      page: Number(params.page || "1"),
      pageSize: PAGE_SIZE,
    }),
    byCategory ? getCategorySales({ from, to, location_id: locationId }) : null,
  ]);

  const th = "px-4 py-3 text-xs font-medium text-neutral-500 uppercase tracking-wider";
  const tabParams = (value: string) => {
    const p = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => v && k !== "page" && p.set(k, v));
    p.set("status", value);
    return `/sales?${p.toString()}`;
  };

  return (
    <div>
      <PageHeader title="Sales" description={from === to ? format(new Date(from), "EEEE, dd MMM yyyy") : `${from} to ${to}`}>
        <Link href="/pos" className={primaryButtonClass}>
          <ScanBarcode className="w-4 h-4" />
          New bill
        </Link>
      </PageHeader>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
        <StatCard title="Total sales" value={formatRupees(Number(summary.total))} icon={IndianRupee} subtitle={`${formatQty(Number(summary.qty))} books`} />
        <StatCard title="Bills" value={String(summary.bills)} icon={Receipt} />
        <StatCard title="Cash" value={formatRupees(Number(summary.cash))} icon={Banknote} />
        <StatCard title="UPI" value={formatRupees(Number(summary.upi))} icon={Smartphone} />
      </div>

      <div className="flex gap-1 p-1 glass-card rounded-xl w-fit mb-4">
        {statusTabs.map((t) => (
          <Link
            key={t.value}
            href={tabParams(t.value)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              status === t.value ? "bg-white shadow-sm text-neutral-900" : "text-neutral-500 hover:text-neutral-900"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </div>

      <UrlFilters
        searchPlaceholder={byCategory ? undefined : "Bill number or mobile"}
        dates={[
          { name: "from", label: "From", defaultValue: from },
          { name: "to", label: "To", defaultValue: to },
        ]}
        selects={
          isAdmin
            ? [
                {
                  name: "location",
                  placeholder: "All locations",
                  options: locations.map((l) => ({ value: l.id, label: l.name })),
                },
              ]
            : []
        }
      />

      {categorySales ? (
        categorySales.length === 0 ? (
          <div className="glass-card rounded-xl">
            <EmptyState icon={Receipt} title="No sales" description="Category totals for the selected days will show here." />
          </div>
        ) : (
          <CategorySalesTable
            rows={categorySales}
            fileName={`Category sales ${from === to ? from : `${from} to ${to}`}${
              locationId ? ` ${locations.find((l) => l.id === locationId)?.name ?? ""}` : ""
            }`}
          />
        )
      ) : sales.length === 0 ? (
        <div className="glass-card rounded-xl">
          <EmptyState icon={Receipt} title="No bills" description="Bills for the selected days will show here." />
        </div>
      ) : (
        <>
          <div className="glass-card rounded-xl overflow-x-auto">
            <table className="w-full min-w-[720px]">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className={`${th} text-left`}>Bill</th>
                  <th className={`${th} text-left`}>Time</th>
                  <th className={`${th} text-left`}>Location</th>
                  <th className={`${th} text-left`}>Mobile</th>
                  <th className={`${th} text-right`}>Qty</th>
                  <th className={`${th} text-right`}>Amount</th>
                  <th className={`${th} text-left`}>Paid by</th>
                  <th className="w-32" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {sales.map((sale) => (
                  <tr key={sale.id} className="hover:bg-white/60">
                    <td className="px-4 py-3 text-sm font-medium text-neutral-900">
                      {sale.invoice_no ?? sale.hold_ref ?? "Held"}
                      {sale.cancel_reason && <div className="text-xs text-red-500 font-normal">{sale.cancel_reason}</div>}
                      {sale.edited_at && <div className="text-xs text-blue-600 font-normal">Edited</div>}
                    </td>
                    <td className="px-4 py-3 text-sm text-neutral-500">
                      {format(new Date(sale.paid_at ?? sale.created_at), from === to ? "hh:mm a" : "dd MMM, hh:mm a")}
                    </td>
                    <td className="px-4 py-3 text-sm text-neutral-600">{sale.location?.name}</td>
                    <td className="px-4 py-3 text-sm text-neutral-600 tracking-wide">{sale.phone === NO_PHONE ? "Not given" : sale.phone ?? "—"}</td>
                    <td className="px-4 py-3 text-sm text-neutral-600 text-right">{formatQty(Number(sale.total_qty))}</td>
                    <td className="px-4 py-3 text-sm font-semibold text-neutral-900 text-right">{formatRupees(Number(sale.payable))}</td>
                    <td className="px-4 py-3">
                      {sale.status === "CANCELLED" ? (
                        <Badge variant="error">Cancelled</Badge>
                      ) : sale.payment_mode ? (
                        <Badge variant={sale.payment_mode === "CASH" ? "success" : "info"}>{sale.payment_mode}</Badge>
                      ) : (
                        <Badge variant="warning">On hold</Badge>
                      )}
                    </td>
                    <td className="px-2 py-3">
                      <SaleRowActions sale={sale} canCancel={isAdmin} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <InvoicePagination total={total} pageSize={PAGE_SIZE} />
        </>
      )}
    </div>
  );
}
