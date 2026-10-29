"use client";

import { Download } from "lucide-react";
import { formatQty, formatRupees } from "@/lib/pos/billing";
import type { CategorySales } from "@/lib/actions/sales";

const round2 = (n: number) => Math.round(n * 100) / 100;

export function CategorySalesTable({ rows, fileName }: { rows: CategorySales[]; fileName: string }) {
  const totals = rows.reduce(
    (t, r) => ({ qty: t.qty + r.qty, mrp: t.mrp + r.mrp, discount: t.discount + r.discount, amount: t.amount + r.amount }),
    { qty: 0, mrp: 0, discount: 0, amount: 0 }
  );
  const share = (amount: number) => (totals.amount > 0 ? `${((amount / totals.amount) * 100).toFixed(1)}%` : "—");

  async function download() {
    const XLSX = await import("xlsx");
    const sheet = XLSX.utils.json_to_sheet([
      ...rows.map((r) => ({
        Category: r.category,
        "Books sold": r.qty,
        Bills: r.bills,
        "MRP value": r.mrp,
        Discount: r.discount,
        Sales: r.amount,
        "Share %": totals.amount > 0 ? Number(((r.amount / totals.amount) * 100).toFixed(1)) : 0,
      })),
      {
        Category: "Total",
        "Books sold": totals.qty,
        "MRP value": round2(totals.mrp),
        Discount: round2(totals.discount),
        Sales: round2(totals.amount),
      },
    ]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, "By category");
    XLSX.writeFile(workbook, `${fileName}.xlsx`);
  }

  const th = "px-4 py-3 text-xs font-medium text-neutral-500 uppercase tracking-wider";
  const td = "px-4 py-3 text-sm text-neutral-600 text-right";

  return (
    <div className="glass-card rounded-xl overflow-x-auto">
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-gray-100">
        <p className="text-xs text-neutral-500">
          Discount includes category discounts and coupons. Bills counts every bill with that category in it.
        </p>
        <button
          type="button"
          onClick={download}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-sm font-medium text-neutral-700 hover:bg-gray-50"
        >
          <Download className="w-4 h-4" />
          Excel
        </button>
      </div>
      <table className="w-full min-w-[720px]">
        <thead>
          <tr className="border-b border-gray-100">
            <th className={`${th} text-left`}>Category</th>
            <th className={`${th} text-right`}>Books sold</th>
            <th className={`${th} text-right`}>Bills</th>
            <th className={`${th} text-right`}>MRP value</th>
            <th className={`${th} text-right`}>Discount</th>
            <th className={`${th} text-right`}>Sales</th>
            <th className={`${th} text-right`}>Share</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows.map((r) => (
            <tr key={r.category} className="hover:bg-white/60">
              <td className="px-4 py-3 text-sm font-medium text-neutral-900">{r.category}</td>
              <td className={td}>{formatQty(r.qty)}</td>
              <td className={td}>{r.bills}</td>
              <td className={td}>{formatRupees(r.mrp)}</td>
              <td className={td}>{formatRupees(r.discount)}</td>
              <td className="px-4 py-3 text-sm font-semibold text-neutral-900 text-right">{formatRupees(r.amount)}</td>
              <td className={td}>{share(r.amount)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-gray-200 bg-white/40">
            <td className="px-4 py-3 text-sm font-semibold text-neutral-900">Total</td>
            <td className={`${td} font-semibold`}>{formatQty(totals.qty)}</td>
            <td className={td} />
            <td className={`${td} font-semibold`}>{formatRupees(totals.mrp)}</td>
            <td className={`${td} font-semibold`}>{formatRupees(totals.discount)}</td>
            <td className="px-4 py-3 text-sm font-bold text-neutral-900 text-right">{formatRupees(totals.amount)}</td>
            <td className={td}>100%</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
