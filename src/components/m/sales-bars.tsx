"use client";

import { useState } from "react";
import { formatRupees } from "@/lib/pos/billing";

export type Bar = { label: string; short: string; value: number; bills: number };

// Sales by hour or by day. Tap a bar to read it; the busiest one shows until then.
export function SalesBars({ bars, title }: { bars: Bar[]; title: string }) {
  const max = Math.max(...bars.map((b) => b.value), 1);
  const busiest = bars.reduce((best, b) => (b.value > best.value ? b : best), bars[0]);
  const [picked, setPicked] = useState<number | null>(null);
  const shown = picked === null ? busiest : bars[picked];
  const labelEvery = Math.ceil(bars.length / 6);

  return (
    <section className="glass-card rounded-2xl p-4">
      <div className="flex items-baseline justify-between gap-2 mb-3">
        <h2 className="text-sm font-semibold text-neutral-900">{title}</h2>
        <p className="text-xs text-neutral-500 text-right">
          {picked === null && "Busiest: "}
          <span className="font-medium text-neutral-800">{shown.label}</span> · {formatRupees(shown.value)} · {shown.bills} bills
        </p>
      </div>
      <div className="flex items-end h-28 gap-[2px] border-b border-gray-200" role="list">
        {bars.map((b, i) => (
          <button
            key={b.label}
            type="button"
            role="listitem"
            aria-label={`${b.label}: ${formatRupees(b.value)}, ${b.bills} bills`}
            onClick={() => setPicked(i === picked ? null : i)}
            className="flex-1 h-full flex items-end"
          >
            <span
              className={`w-full rounded-t-[4px] ${i === picked ? "bg-orange-700" : "bg-orange-500"}`}
              style={{ height: b.value > 0 ? `${Math.max((b.value / max) * 100, 3)}%` : 0 }}
            />
          </button>
        ))}
      </div>
      <div className="flex gap-[2px] mt-1">
        {bars.map((b, i) => (
          <span key={b.label} className="flex-1 text-[10px] text-neutral-400 text-center overflow-visible whitespace-nowrap">
            {i % labelEvery === 0 ? b.short : ""}
          </span>
        ))}
      </div>
    </section>
  );
}
