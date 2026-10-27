"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/components/ui/toast";
import { ItemForm } from "@/components/pos/item-form";
import { primaryButtonClass } from "@/components/pos/form-styles";
import { formatQty, formatRupees } from "@/lib/pos/billing";
import type { Category, Item } from "@/lib/pos/types";

export function AddItemButton({ categories }: { categories: Category[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={primaryButtonClass}>
        <Plus className="w-4 h-4" />
        Add book
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="Add book" size="lg">
        {open && (
          <ItemForm
            item={null}
            categories={categories}
            onSaved={(item) => {
              toast.success(`${item.name} added (${item.code})`);
              setOpen(false);
              router.refresh();
            }}
          />
        )}
      </Modal>
    </>
  );
}

export function ItemsTable({
  items,
  categories,
}: {
  items: (Item & { total_stock: number })[];
  categories: Category[];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<Item | null>(null);
  const th = "px-4 py-3 text-xs font-medium text-neutral-500 uppercase tracking-wider";

  return (
    <div className="glass-card rounded-xl overflow-x-auto">
      <table className="w-full min-w-[760px]">
        <thead>
          <tr className="border-b border-gray-100">
            <th className={`${th} text-left`}>Book</th>
            <th className={`${th} text-left`}>Code / ISBN</th>
            <th className={`${th} text-left`}>Category</th>
            <th className={`${th} text-right`}>Price</th>
            <th className={`${th} text-right`}>Stock</th>
            <th className="w-12" />
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {items.map((item) => (
            <tr key={item.id} className={`hover:bg-white/60 ${item.is_active ? "" : "opacity-50"}`}>
              <td className="px-4 py-3">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-neutral-900">{item.name}</span>
                  {item.kind === "LOT" && <Badge variant="warning">Lot</Badge>}
                </div>
                {(item.author || item.publisher) && (
                  <div className="text-xs text-neutral-400 mt-0.5">
                    {[item.author, item.publisher].filter(Boolean).join(" · ")}
                  </div>
                )}
              </td>
              <td className="px-4 py-3 text-sm text-neutral-600">
                <div className="font-mono text-xs">{item.code}</div>
                {item.isbn && <div className="font-mono text-xs text-neutral-400">{item.isbn}</div>}
              </td>
              <td className="px-4 py-3 text-sm text-neutral-600">{item.category?.name ?? "—"}</td>
              <td className="px-4 py-3 text-sm font-semibold text-neutral-900 text-right">
                {formatRupees(Number(item.price), Number(item.price) % 1 ? 2 : 0)}
              </td>
              <td
                className={`px-4 py-3 text-sm text-right font-medium ${
                  item.total_stock > 0 ? "text-neutral-900" : item.total_stock < 0 ? "text-red-500" : "text-neutral-300"
                }`}
              >
                {formatQty(item.total_stock)}
                {item.category?.sell_by === "KG" && <span className="text-xs text-neutral-400"> kg</span>}
              </td>
              <td className="px-2 py-3">
                <button
                  type="button"
                  onClick={() => setEditing(item)}
                  className="p-2 rounded-lg text-neutral-400 hover:text-neutral-900 hover:bg-white"
                >
                  <Pencil className="w-4 h-4" />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <Modal open={!!editing} onClose={() => setEditing(null)} title="Edit book" size="lg">
        {editing && (
          <ItemForm
            item={editing}
            categories={categories}
            onSaved={() => {
              toast.success("Saved");
              setEditing(null);
              router.refresh();
            }}
          />
        )}
      </Modal>
    </div>
  );
}
