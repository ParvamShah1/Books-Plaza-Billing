import { format } from "date-fns";
import { requireRole } from "@/lib/pos/guard";
import { getLocations } from "@/lib/actions/catalog";
import { getExpenses } from "@/lib/actions/expenses";
import { getCashSales } from "@/lib/actions/sales";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { UrlFilters } from "@/components/pos/url-filters";
import { DeleteExpenseButton, ExpenseForm, ExpensesExcelButton } from "@/components/pos/expenses";
import { expenseLabel } from "@/lib/pos/validations";
import { formatRupees } from "@/lib/pos/billing";
import { Banknote, IndianRupee, Wallet, Receipt } from "lucide-react";

export const metadata = { title: "Expenses - Books Plaza" };

function todayInIndia() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
}

// Staff can remove their own entry for a day after adding it (same rule as the database)
function addedInLastDay(createdAt: string) {
  return new Date(createdAt).getTime() > Date.now() - 86400000;
}

export default async function ExpensesPage({
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
  const locationId = isAdmin ? params.location : staff.location_id ?? undefined;

  const [locations, expenses, cashSales] = await Promise.all([
    getLocations(),
    getExpenses({ from, to, location_id: locationId }),
    getCashSales({ from, to, location_id: locationId }),
  ]);

  const total = expenses.reduce((t, e) => t + e.amount, 0);
  const cashSpent = expenses.filter((e) => e.paid_by === "CASH").reduce((t, e) => t + e.amount, 0);
  const byCategory = [...expenses.reduce((m, e) => m.set(e.category, (m.get(e.category) ?? 0) + e.amount), new Map<string, number>())]
    .sort((a, b) => b[1] - a[1]);
  const location = locations.find((l) => l.id === locationId);
  const formLocationId =
    locationId || locations.find((l) => l.kind === "EXHIBITION" && l.is_active)?.id || "";
  const canRemove = (e: (typeof expenses)[number]) =>
    isAdmin || (e.created_by === staff.id && addedInLastDay(e.created_at));

  const th = "px-4 py-3 text-xs font-medium text-neutral-500 uppercase tracking-wider";
  const range = from === to ? format(new Date(from), "EEEE, dd MMM yyyy") : `${from} to ${to}`;

  return (
    <div>
      <PageHeader title="Expenses" description={location ? `${location.name} · ${range}` : range} />

      {isAdmin || staff.location_id ? (
        <ExpenseForm
          locations={locations.filter((l) => l.is_active).map((l) => ({ id: l.id, name: l.name }))}
          defaultLocationId={formLocationId}
          today={today}
          isAdmin={isAdmin}
        />
      ) : (
        <div className="glass-card rounded-xl p-4 mb-6 text-sm text-neutral-600">
          You are not assigned to an exhibition yet. Ask an admin to set your location.
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
        <StatCard title="Total spent" value={formatRupees(total)} icon={IndianRupee} subtitle={`${expenses.length} entries`} />
        <StatCard title="Paid in cash" value={formatRupees(cashSpent)} icon={Wallet} />
        <StatCard title="Cash sales" value={formatRupees(cashSales)} icon={Banknote} />
        <StatCard title="Cash left" value={formatRupees(cashSales - cashSpent)} icon={Receipt} subtitle="Cash sales minus cash spent" />
      </div>

      <UrlFilters
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

      {expenses.length === 0 ? (
        <div className="glass-card rounded-xl">
          <EmptyState icon={Wallet} title="No expenses" description="Expenses added for the selected days will show here." />
        </div>
      ) : (
        <div className="glass-card rounded-xl overflow-x-auto">
          <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-gray-100">
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-neutral-500">
              {byCategory.map(([category, amount]) => (
                <span key={category}>
                  {expenseLabel(category)} <span className="font-semibold text-neutral-800">{formatRupees(amount)}</span>
                </span>
              ))}
            </div>
            <ExpensesExcelButton
              expenses={expenses}
              fileName={`Expenses ${from === to ? from : `${from} to ${to}`}${location ? ` ${location.name}` : ""}`}
            />
          </div>
          <table className="w-full min-w-[720px]">
            <thead>
              <tr className="border-b border-gray-100">
                <th className={`${th} text-left`}>Date</th>
                {!locationId && <th className={`${th} text-left`}>Location</th>}
                <th className={`${th} text-left`}>For</th>
                <th className={`${th} text-left`}>Note</th>
                <th className={`${th} text-left`}>Paid by</th>
                <th className={`${th} text-left`}>Added by</th>
                <th className={`${th} text-right`}>Amount</th>
                <th className="w-28" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {expenses.map((e) => (
                <tr key={e.id} className="hover:bg-white/60">
                  <td className="px-4 py-3 text-sm text-neutral-500 whitespace-nowrap">
                    {format(new Date(e.spent_on), "dd MMM")}
                    <div className="text-xs text-neutral-400">{format(new Date(e.created_at), "hh:mm a")}</div>
                  </td>
                  {!locationId && <td className="px-4 py-3 text-sm text-neutral-600">{e.location?.name}</td>}
                  <td className="px-4 py-3 text-sm font-medium text-neutral-900">{expenseLabel(e.category)}</td>
                  <td className="px-4 py-3 text-sm text-neutral-600">{e.note || "—"}</td>
                  <td className="px-4 py-3">
                    <Badge variant={e.paid_by === "CASH" ? "success" : "info"}>{e.paid_by}</Badge>
                  </td>
                  <td className="px-4 py-3 text-sm text-neutral-500">{e.added_by || "—"}</td>
                  <td className="px-4 py-3 text-sm font-semibold text-neutral-900 text-right">{formatRupees(e.amount, e.amount % 1 ? 2 : 0)}</td>
                  <td className="px-2 py-3 text-right">{canRemove(e) && <DeleteExpenseButton expense={e} />}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-gray-200 bg-white/40">
                <td colSpan={locationId ? 5 : 6} className="px-4 py-3 text-sm font-semibold text-neutral-900">Total</td>
                <td className="px-4 py-3 text-sm font-bold text-neutral-900 text-right">{formatRupees(total)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
