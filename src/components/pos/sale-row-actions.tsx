"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Printer, Ban, Loader2, Pencil } from "lucide-react";
import { cancelSale } from "@/lib/actions/sales";
import { Modal } from "@/components/ui/modal";
import { toast } from "@/components/ui/toast";
import { inputClass, labelClass } from "@/components/pos/form-styles";
import type { Sale } from "@/lib/pos/types";

export function SaleRowActions({ sale, canCancel }: { sale: Sale; canCancel: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  async function confirmCancel(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const result = await cancelSale(sale.id, reason);
    setSaving(false);
    if (result.error) return toast.error(result.error);
    toast.success(`${sale.invoice_no} cancelled, books back in stock`);
    setOpen(false);
    router.refresh();
  }

  if (sale.status === "HELD") return null;

  return (
    <div className="flex items-center justify-end gap-1">
      <a
        href={`/receipt/${sale.id}?print=1`}
        target="_blank"
        rel="noreferrer"
        title="Print"
        className="p-2 rounded-lg text-neutral-400 hover:text-neutral-900 hover:bg-white"
      >
        <Printer className="w-4 h-4" />
      </a>
      {canCancel && sale.status === "PAID" && (
        <Link
          href={`/pos?edit=${sale.id}`}
          title="Edit bill"
          className="p-2 rounded-lg text-neutral-400 hover:text-orange-600 hover:bg-orange-50"
        >
          <Pencil className="w-4 h-4" />
        </Link>
      )}
      {canCancel && sale.status === "PAID" && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          title="Cancel bill"
          className="p-2 rounded-lg text-neutral-400 hover:text-red-500 hover:bg-red-50"
        >
          <Ban className="w-4 h-4" />
        </button>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title={`Cancel ${sale.invoice_no}?`}>
        <form onSubmit={confirmCancel} className="space-y-4">
          <p className="text-sm text-neutral-600">
            The bill stays in records as cancelled and its books go back into stock.
          </p>
          <div>
            <label className={labelClass}>Reason</label>
            <input
              autoFocus
              required
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Wrong book billed"
              className={inputClass}
            />
          </div>
          <button
            type="submit"
            disabled={saving}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-red-500 text-white text-sm font-medium hover:bg-red-600 disabled:opacity-60"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            Cancel bill
          </button>
        </form>
      </Modal>
    </div>
  );
}
