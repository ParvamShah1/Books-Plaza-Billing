import Link from "next/link";
import { format } from "date-fns";
import { TrendingDown, TrendingUp } from "lucide-react";
import { requireRole } from "@/lib/pos/guard";
import { getLocations } from "@/lib/actions/catalog";
import { getOwnerOverview, type Overview } from "@/lib/actions/sales";
import { SalesBars, type Bar } from "@/components/m/sales-bars";
import { formatQty, formatRupees } from "@/lib/pos/billing";

export const metadata = { title: "Overview - Books Plaza" };

const RANGES = [
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "7d", label: "7 days" },
  { key: "month", label: "This month" },
];

function todayInIndia() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
}

function addDays(day: string, n: number) {
  return new Date(new Date(`${day}T00:00:00Z`).getTime() + n * 86400000).toISOString().slice(0, 10);
}

function daysBetween(from: string, to: string) {
  return Math.round((new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime()) / 86400000) + 1;
}

function rangeDates(range: string, today: string, params: { from?: string; to?: string }) {
  const isDay = (d?: string) => !!d && /^\d{4}-\d{2}-\d{2}$/.test(d);
  if (range === "custom" && isDay(params.from) && isDay(params.to) && params.from! <= params.to!) {
    return { from: params.from!, to: params.to! };
  }
  if (range === "yesterday") return { from: addDays(today, -1), to: addDays(today, -1) };
  if (range === "7d") return { from: addDays(today, -6), to: today };
  if (range === "month") return { from: `${today.slice(0, 8)}01`, to: today };
  return { from: today, to: today };
}

function hourLabel(h: number) {
  return `${h % 12 || 12} ${h < 12 ? "am" : "pm"}`;
}

// One bar per hour on a single day (opening hours at least), else one per day
function chartBars(overview: Overview, from: string, to: string): Bar[] | null {
  if (from === to) {
    const hours = overview.hours.map((h) => h.hour);
    const first = Math.min(10, ...hours);
    const last = Math.max(21, ...hours);
    return Array.from({ length: last - first + 1 }, (_, i) => {
      const hour = first + i;
      const row = overview.hours.find((h) => h.hour === hour);
      return { label: hourLabel(hour), short: hourLabel(hour).replace(" ", "").slice(0, -1), value: row?.total ?? 0, bills: row?.bills ?? 0 };
    });
  }
  const count = daysBetween(from, to);
  if (count > 62) return null;
  return Array.from({ length: count }, (_, i) => {
    const day = addDays(from, i);
    const row = overview.days.find((d) => d.day === day);
    return { label: format(new Date(day), "EEE d MMM"), short: day.slice(8), value: row?.total ?? 0, bills: row?.bills ?? 0 };
  });
}

export default async function OverviewPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; from?: string; to?: string; loc?: string }>;
}) {
  await requireRole(["ADMIN"]);
  const params = await searchParams;
  const today = todayInIndia();
  const range = params.range || "today";
  const { from, to } = rangeDates(range, today, params);
  const locationId = params.loc || undefined;

  const [locations, { overview, categories, recent }] = await Promise.all([
    getLocations({ activeOnly: true }),
    getOwnerOverview({ from, to, location_id: locationId }),
  ]);

  const sum = (key: "total" | "bills" | "pieces" | "kg" | "cash" | "upi" | "card" | "expenses" | "cash_expenses") =>
    overview.locations.reduce((t, l) => t + l[key], 0);
  const total = sum("total");
  const bills = sum("bills");
  const cashLeft = sum("cash") - sum("cash_expenses");
  const days = daysBetween(from, to);
  const compareTo =
    range === "today" ? "yesterday" : range === "yesterday" ? "the day before" : `the ${days} days before`;
  const change = overview.prev_total > 0 ? Math.round(((total - overview.prev_total) / overview.prev_total) * 100) : null;
  const bars = chartBars(overview, from, to);
  const maxLocation = Math.max(...overview.locations.map((l) => l.total), 1);
  const maxCategory = Math.max(...categories.map((c) => c.amount), 1);

  const link = (next: { range?: string; loc?: string | null }) => {
    const p = new URLSearchParams();
    const r = next.range ?? range;
    p.set("range", r);
    if (r === "custom") {
      p.set("from", from);
      p.set("to", to);
    }
    const loc = next.loc === undefined ? locationId : next.loc;
    if (loc) p.set("loc", loc);
    return `/m?${p.toString()}`;
  };
  const chip = (active: boolean) =>
    `shrink-0 px-3.5 py-1.5 rounded-full text-sm font-medium border ${
      active ? "bg-neutral-900 text-white border-neutral-900" : "bg-white/70 text-neutral-600 border-gray-200"
    }`;
  const salesLink = (extra = "") => `/sales?from=${from}&to=${to}${locationId ? `&location=${locationId}` : ""}${extra}`;

  return (
    <div className="space-y-4">
      <div className="space-y-2 -mx-4 px-4">
        <div className="flex gap-2 overflow-x-auto no-scrollbar">
          {RANGES.map((r) => (
            <Link key={r.key} href={link({ range: r.key })} className={chip(range === r.key)}>
              {r.label}
            </Link>
          ))}
        </div>
        {locations.length > 1 && (
          <div className="flex gap-2 overflow-x-auto no-scrollbar">
            <Link href={link({ loc: null })} className={chip(!locationId)}>
              All
            </Link>
            {locations.map((l) => (
              <Link key={l.id} href={link({ loc: l.id })} className={chip(locationId === l.id)}>
                {l.name}
              </Link>
            ))}
          </div>
        )}
        <details className="text-sm" open={range === "custom"}>
          <summary className="text-neutral-500 cursor-pointer">
            {from === to ? format(new Date(from), "EEEE, d MMM yyyy") : `${format(new Date(from), "d MMM")} – ${format(new Date(to), "d MMM yyyy")}`}
            <span className="text-orange-600 ml-2">Change dates</span>
          </summary>
          <form action="/m" className="flex items-end gap-2 mt-2">
            <input type="hidden" name="range" value="custom" />
            {locationId && <input type="hidden" name="loc" value={locationId} />}
            <label className="flex-1 text-xs text-neutral-500">
              From
              <input type="date" name="from" defaultValue={from} max={today} className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-sm text-neutral-900" />
            </label>
            <label className="flex-1 text-xs text-neutral-500">
              To
              <input type="date" name="to" defaultValue={to} max={today} className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-sm text-neutral-900" />
            </label>
            <button type="submit" className="px-3 py-1.5 rounded-lg bg-orange-500 text-white text-sm font-medium">
              Show
            </button>
          </form>
        </details>
      </div>

      <section className="glass-card rounded-2xl p-5">
        <p className="text-sm text-neutral-500">Sales</p>
        <p className="text-4xl font-bold text-neutral-900 mt-1 tracking-tight">{formatRupees(total)}</p>
        {change !== null && (
          <p className={`flex items-center gap-1 text-sm font-medium mt-1 ${change >= 0 ? "text-emerald-700" : "text-red-600"}`}>
            {change >= 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
            {change >= 0 ? "+" : ""}
            {change}% <span className="text-neutral-500 font-normal">vs {compareTo} ({formatRupees(overview.prev_total)})</span>
          </p>
        )}
        <p className="text-sm text-neutral-500 mt-3">
          {bills} bills · {sum("pieces")} books
          {sum("kg") > 0 && <> · {formatQty(Math.round(sum("kg") * 1000) / 1000)} kg</>}
          {bills > 0 && <> · avg {formatRupees(total / bills)}</>}
        </p>
      </section>

      <div className="grid grid-cols-3 gap-2">
        {(["cash", "upi", "card"] as const).map((k) => (
          <div key={k} className="glass-card rounded-xl p-3">
            <p className="text-xs text-neutral-500">{k === "upi" ? "UPI" : k[0].toUpperCase() + k.slice(1)}</p>
            <p className="text-base font-semibold text-neutral-900 mt-0.5">{formatRupees(sum(k))}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Link href="/expenses" className="glass-card rounded-xl p-3">
          <p className="text-xs text-neutral-500">Expenses</p>
          <p className="text-base font-semibold text-neutral-900 mt-0.5">{formatRupees(sum("expenses"))}</p>
        </Link>
        <div className="glass-card rounded-xl p-3">
          <p className="text-xs text-neutral-500">Cash left</p>
          <p className={`text-base font-semibold mt-0.5 ${cashLeft < 0 ? "text-red-600" : "text-neutral-900"}`}>{formatRupees(cashLeft)}</p>
          <p className="text-[11px] text-neutral-400">cash sales − cash expenses</p>
        </div>
      </div>

      {bars && total > 0 && <SalesBars bars={bars} title={from === to ? "Sales by hour" : "Sales by day"} />}

      {!locationId && overview.locations.length > 0 && (
        <section className="glass-card rounded-2xl p-4">
          <h2 className="text-sm font-semibold text-neutral-900 mb-3">Exhibitions</h2>
          <ul className="space-y-3">
            {overview.locations.map((l) => (
              <li key={l.id}>
                <Link href={link({ loc: l.id })} className="block">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-sm font-medium text-neutral-800 truncate">{l.name}</span>
                    <span className="text-sm font-semibold text-neutral-900">{formatRupees(l.total)}</span>
                  </div>
                  <div className="h-1.5 mt-1 rounded-full bg-gray-100">
                    <div className="h-full rounded-full bg-orange-500" style={{ width: `${(l.total / maxLocation) * 100}%` }} />
                  </div>
                  <p className="text-xs text-neutral-500 mt-1">
                    {l.bills} bills · expenses {formatRupees(l.expenses)}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {categories.length > 0 && (
        <section className="glass-card rounded-2xl p-4">
          <div className="flex items-baseline justify-between mb-3">
            <h2 className="text-sm font-semibold text-neutral-900">Top categories</h2>
            <Link href={salesLink("&status=CATEGORY")} className="text-xs text-orange-600">
              See all
            </Link>
          </div>
          <ul className="space-y-2.5">
            {categories.slice(0, 6).map((c) => (
              <li key={c.category}>
                <div className="flex items-baseline justify-between gap-2 text-sm">
                  <span className="text-neutral-800 truncate">{c.category}</span>
                  <span className="font-medium text-neutral-900">{formatRupees(c.amount)}</span>
                </div>
                <div className="h-1.5 mt-1 rounded-full bg-gray-100">
                  <div className="h-full rounded-full bg-orange-500" style={{ width: `${(c.amount / maxCategory) * 100}%` }} />
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="glass-card rounded-2xl p-4">
        <div className="flex items-baseline justify-between mb-2">
          <h2 className="text-sm font-semibold text-neutral-900">Latest bills</h2>
          <Link href={salesLink()} className="text-xs text-orange-600">
            See all
          </Link>
        </div>
        {recent.length === 0 ? (
          <p className="text-sm text-neutral-500 py-4 text-center">No bills for these days.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {recent.map((b) => (
              <li key={b.id}>
                <Link href={`/receipt/${b.id}`} className="flex items-center gap-3 py-2.5">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-neutral-800 truncate">{b.invoice_no}</p>
                    <p className="text-xs text-neutral-500">
                      {new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }).format(new Date(b.paid_at))}
                      {" · "}
                      {b.payment_mode}
                      {!locationId && b.location && <> · {b.location.code}</>}
                    </p>
                  </div>
                  <span className="text-sm font-semibold text-neutral-900">{formatRupees(b.payable)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
