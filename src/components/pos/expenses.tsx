"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Download, Loader2, Plus, Trash2 } from "lucide-react";
import { addExpense, deleteExpense } from "@/lib/actions/expenses";
import { EXPENSE_CATEGORIES, EXPENSE_PAID_BY } from "@/lib/pos/validations";
import { toast } from "@/components/ui/toast";
import { errorBoxClass, inputClass, labelClass, primaryButtonClass } from "@/components/pos/form-styles";
import type { Expense, Location } from "@/lib/pos/types";

export const expenseLabel = (category: string) =>
  EXPENSE_CATEGORIES.find((c) => c.value === category)?.label ?? category;

// Quick entry at the exhibition: what for, how much, cash or UPI
export function ExpenseForm({
  locations,
  defaultLocationId,
  today,
  isAdmin,
}: {
  locations: Pick<Location, "id" | "name">[];
  defaultLocationId: string;
  today: string;
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [form, setForm] = useState({
    location_id: defaultLocationId,
    spent_on: today,
    category: "",
    amount: "",
    paid_by: "CASH" as (typeof EXPENSE_PAID_BY)[number],
    note: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const yesterday = new Date(new Date(`${today}T00:00:00Z`).getTime() - 86400000).toISOString().slice(0, 10);

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    const result = await addExpense(form);
    setSaving(false);
    if (result.error) return setError(result.error);
    toast.success(`${expenseLabel(form.category)} ₹${Number(form.amount)} added`);
    setForm((f) => ({ ...f, category: "", amount: "", note: "" }));
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="glass-card rounded-xl p-4 mb-6 space-y-3">
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
        <div>
          <label className={labelClass}>Date</label>
          <input
            type="date"
            required
            value={form.spent_on}
            min={isAdmin ? undefined : yesterday}
            max={today}
            onChange={(e) => set("spent_on", e.target.value)}
            className={inputClass}
          />
        </div>
        {isAdmin && (
          <div>
            <label className={labelClass}>Location</label>
            <select required value={form.location_id} onChange={(e) => set("location_id", e.target.value)} className={inputClass}>
              <option value="">Choose</option>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </div>
        )}
        <div>
          <label className={labelClass}>For</label>
          <select required value={form.category} onChange={(e) => set("category", e.target.value)} className={inputClass}>
            <option value="">Choose</option>
            {EXPENSE_CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClass}>Amount (₹)</label>
          <input
            type="number"
            required
            min="1"
            step="0.01"
            inputMode="decimal"
            value={form.amount}
            onChange={(e) => set("amount", e.target.value)}
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass}>Paid by</label>
          <select value={form.paid_by} onChange={(e) => set("paid_by", e.target.value as typeof form.paid_by)} className={inputClass}>
            {EXPENSE_PAID_BY.map((p) => (
              <option key={p} value={p}>
                {p === "BANK" ? "Bank transfer" : p.charAt(0) + p.slice(1).toLowerCase()}
              </option>
            ))}
          </select>
        </div>
        <div className={isAdmin ? "col-span-2 lg:col-span-1" : "col-span-2"}>
          <label className={labelClass}>Note {form.category !== "OTHER" && <span className="text-neutral-400 font-normal">(optional)</span>}</label>
          <input
            value={form.note}
            onChange={(e) => set("note", e.target.value)}
            placeholder="e.g. Tempo from warehouse"
            className={inputClass}
          />
        </div>
      </div>
      {error && <div className={errorBoxClass}>{error}</div>}
      <div className="flex justify-end">
        <button type="submit" disabled={saving} className={primaryButtonClass}>
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          Add expense
        </button>
      </div>
    </form>
  );
}

export function DeleteExpenseButton({ expense }: { expense: Expense }) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);
  const [confirming, setConfirming] = useState(false);

  async function remove() {
    setDeleting(true);
    const result = await deleteExpense(expense.id);
    setDeleting(false);
    setConfirming(false);
    if (result.error) return toast.error(result.error);
    toast.success("Expense removed");
    router.refresh();
  }

  if (confirming) {
    return (
      <div className="flex items-center justify-end gap-1">
        <button
          type="button"
          onClick={remove}
          disabled={deleting}
          className="px-2 py-1 rounded-lg bg-red-500 text-white text-xs font-medium hover:bg-red-600 disabled:opacity-60"
        >
          {deleting ? "Removing…" : "Remove"}
        </button>
        <button type="button" onClick={() => setConfirming(false)} className="px-2 py-1 rounded-lg text-xs text-neutral-500 hover:bg-white">
          Keep
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setConfirming(true)}
      title="Remove"
      className="p-2 rounded-lg text-neutral-400 hover:text-red-500 hover:bg-red-50"
    >
      <Trash2 className="w-4 h-4" />
    </button>
  );
}

export function ExpensesExcelButton({ expenses, fileName }: { expenses: Expense[]; fileName: string }) {
  async function download() {
    const XLSX = await import("xlsx");
    const sheet = XLSX.utils.json_to_sheet([
      ...expenses.map((e) => ({
        Date: e.spent_on,
        Location: e.location?.name ?? "",
        For: expenseLabel(e.category),
        Note: e.note,
        "Paid by": e.paid_by,
        Amount: e.amount,
        "Added by": e.added_by,
      })),
      { Date: "Total", Amount: Math.round(expenses.reduce((t, e) => t + e.amount, 0) * 100) / 100 },
    ]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, "Expenses");
    XLSX.writeFile(workbook, `${fileName}.xlsx`);
  }

  return (
    <button
      type="button"
      onClick={download}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-sm font-medium text-neutral-700 hover:bg-gray-50"
    >
      <Download className="w-4 h-4" />
      Excel
    </button>
  );
}
