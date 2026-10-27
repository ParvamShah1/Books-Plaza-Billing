"use client";

import { useEffect, useRef, useState } from "react";
import { format } from "date-fns";
import { Loader2, Trash2, FolderOpen } from "lucide-react";
import { formatQty, formatRupees } from "@/lib/pos/billing";
import type { PaymentMode, PosItem } from "@/lib/pos/types";

export type HeldBill = {
  id: string;
  hold_ref: string | null;
  phone: string | null;
  payable: number;
  total_qty: number;
  created_at: string;
};

const primaryButton =
  "w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-orange-500 text-white text-base font-semibold hover:bg-orange-600 transition-colors disabled:opacity-60";

export function PayDialog({
  mode,
  payable,
  qty,
  saving,
  onConfirm,
}: {
  mode: PaymentMode;
  payable: number;
  qty: number;
  saving: boolean;
  onConfirm: () => void;
}) {
  const [received, setReceived] = useState("");
  const confirmRef = useRef<HTMLButtonElement>(null);
  const receivedNum = parseFloat(received) || 0;
  const change = receivedNum - payable;

  useEffect(() => {
    if (mode !== "CASH") confirmRef.current?.focus();
  }, [mode]);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!saving) onConfirm();
      }}
      className="space-y-5"
    >
      <div className="text-center py-2">
        <p className="text-sm text-neutral-500">{formatQty(qty)} books · amount to collect</p>
        <p className="text-4xl font-bold text-neutral-900 mt-1">{formatRupees(payable)}</p>
      </div>

      {mode === "CASH" && (
        <div className="space-y-2">
          <label className="block text-sm font-medium text-neutral-700">Cash received (optional)</label>
          <input
            autoFocus
            value={received}
            inputMode="numeric"
            onChange={(e) => setReceived(e.target.value.replace(/[^\d.]/g, ""))}
            placeholder={String(payable)}
            className="w-full px-4 py-3 border border-gray-200 rounded-xl text-xl font-semibold focus:outline-none focus:ring-2 focus:ring-orange-500"
          />
          <div className="flex gap-2">
            {[payable, Math.ceil(payable / 100) * 100, Math.ceil(payable / 500) * 500, 2000]
              .filter((v, i, arr) => v >= payable && arr.indexOf(v) === i)
              .slice(0, 4)
              .map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setReceived(String(v))}
                  className="flex-1 py-1.5 rounded-lg border border-gray-200 bg-white text-sm font-medium text-neutral-700 hover:bg-gray-50"
                >
                  ₹{v}
                </button>
              ))}
          </div>
          {received && (
            <p className={`text-center text-lg font-semibold ${change >= 0 ? "text-green-600" : "text-red-500"}`}>
              {change >= 0 ? `Return ${formatRupees(change)}` : `${formatRupees(-change)} short`}
            </p>
          )}
        </div>
      )}

      <button ref={confirmRef} type="submit" disabled={saving} className={primaryButton}>
        {saving && <Loader2 className="w-5 h-5 animate-spin" />}
        {mode === "UPI" ? "UPI received · save & print" : "Save & print"}
        <kbd className="text-[10px] font-medium opacity-80 bg-black/10 rounded px-1.5 py-0.5">Enter</kbd>
      </button>
    </form>
  );
}

export function HoldDialog({
  initialRef,
  saving,
  onConfirm,
}: {
  initialRef: string;
  saving: boolean;
  onConfirm: (ref: string) => void;
}) {
  const [ref, setRef] = useState(initialRef);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!saving) onConfirm(ref.trim());
      }}
      className="space-y-4"
    >
      <div>
        <label className="block text-sm font-medium text-neutral-700 mb-1">Reference</label>
        <input
          autoFocus
          value={ref}
          onChange={(e) => setRef(e.target.value)}
          placeholder="Customer name or counter, e.g. Red shirt uncle"
          className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
        />
        <p className="text-xs text-neutral-400 mt-1">Helps you find the bill when the customer comes back.</p>
      </div>
      <button type="submit" disabled={saving} className={primaryButton}>
        {saving && <Loader2 className="w-5 h-5 animate-spin" />}
        Hold bill
      </button>
    </form>
  );
}

export function PickerDialog({ items, onPick }: { items: PosItem[]; onPick: (item: PosItem) => void }) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const n = parseInt(e.key, 10);
      if (n >= 1 && n <= items.length) {
        e.preventDefault();
        onPick(items[n - 1]);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [items, onPick]);

  return (
    <div className="space-y-2">
      <p className="text-sm text-neutral-500">This barcode belongs to more than one item. Press the number or tap one.</p>
      {items.map((item, i) => (
        <button
          key={item.item_id}
          type="button"
          onClick={() => onPick(item)}
          className="w-full flex items-center gap-3 p-3 rounded-xl border border-gray-200 bg-white hover:border-orange-300 hover:bg-orange-50/50 text-left transition-colors"
        >
          <span className="w-7 h-7 rounded-lg bg-gray-100 text-sm font-semibold text-neutral-600 flex items-center justify-center flex-shrink-0">
            {i + 1}
          </span>
          <span className="flex-1 min-w-0">
            <span className="block text-sm font-medium text-neutral-900 truncate">{item.name}</span>
            <span className="block text-xs text-neutral-400">
              {item.kind === "LOT" ? "Lot" : "Publisher"} · {item.category_name ?? "No category"} · {formatQty(Number(item.stock))} in stock
            </span>
          </span>
          <span className="text-base font-bold text-neutral-900">{formatRupees(Number(item.price))}</span>
        </button>
      ))}
    </div>
  );
}

export function HeldBillsDialog({
  bills,
  onOpen,
  onDelete,
}: {
  bills: HeldBill[];
  onOpen: (bill: HeldBill) => void;
  onDelete: (bill: HeldBill) => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  if (bills.length === 0) {
    return <p className="text-sm text-neutral-500 text-center py-8">No bills on hold</p>;
  }

  return (
    <div className="divide-y divide-gray-100">
      {bills.map((bill) => (
        <div key={bill.id} className="flex items-center gap-3 py-3">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-neutral-900 truncate">{bill.hold_ref || bill.phone || "No reference"}</p>
            <p className="text-xs text-neutral-400">
              {format(new Date(bill.created_at), "hh:mm a, dd MMM")} · {formatQty(Number(bill.total_qty))} books
              {bill.hold_ref && bill.phone ? ` · ${bill.phone}` : ""}
            </p>
          </div>
          <span className="text-sm font-semibold text-neutral-900">{formatRupees(Number(bill.payable))}</span>
          <button
            type="button"
            onClick={() => onOpen(bill)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-orange-500 text-white text-sm font-medium hover:bg-orange-600"
          >
            <FolderOpen className="w-4 h-4" />
            Open
          </button>
          {confirmDelete === bill.id ? (
            <button
              type="button"
              onClick={() => {
                onDelete(bill);
                setConfirmDelete(null);
              }}
              className="px-3 py-1.5 rounded-lg bg-red-500 text-white text-sm font-medium hover:bg-red-600"
            >
              Delete?
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmDelete(bill.id)}
              className="p-1.5 rounded-lg text-neutral-400 hover:text-red-500 hover:bg-red-50"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
