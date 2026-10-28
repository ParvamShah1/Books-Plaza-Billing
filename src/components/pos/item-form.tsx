"use client";

import { useEffect, useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { lookupIsbn, saveItem } from "@/lib/actions/catalog";
import { errorBoxClass, inputClass, labelClass, primaryButtonClass } from "@/components/pos/form-styles";
import type { Category, Item, ItemKind } from "@/lib/pos/types";

export function ItemForm({
  item,
  categories,
  initial,
  onSaved,
}: {
  item: Item | null;
  categories: Category[];
  initial?: { isbn?: string; kind?: ItemKind; category_id?: string; price?: string };
  onSaved: (item: Item) => void;
}) {
  const [form, setForm] = useState({
    kind: item?.kind ?? initial?.kind ?? "PUBLISHER",
    name: item?.name ?? "",
    isbn: item?.isbn ?? initial?.isbn ?? "",
    author: item?.author ?? "",
    publisher: item?.publisher ?? "",
    category_id: item?.category_id ?? initial?.category_id ?? "",
    price: item ? String(Number(item.price)) : initial?.price ?? "",
    cost_price: item?.cost_price != null ? String(Number(item.cost_price)) : "",
    lot_no: item?.lot_no ?? "",
    is_active: item?.is_active ?? true,
  });
  const [saving, setSaving] = useState(false);
  const [looking, setLooking] = useState(false);
  const [error, setError] = useState("");
  const [foundFrom, setFoundFrom] = useState<string | null>(null);
  const isLot = form.kind === "LOT";

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function fillFromIsbn() {
    if (!form.isbn) return;
    // A typo (missing digit) is the usual reason a lookup finds nothing
    const digits = form.isbn.replace(/[^0-9Xx]/g, "").length;
    if (digits !== 10 && digits !== 13) {
      return setError(`This ISBN has ${digits} digits. A book ISBN has 13, so check the number on the barcode.`);
    }
    setLooking(true);
    const info = await lookupIsbn(form.isbn);
    setLooking(false);
    if (!info) return setError("Couldn't find this ISBN online. Type the details.");
    setError("");
    setFoundFrom(info.source);
    setForm((f) => ({
      ...f,
      name: f.name || info.title,
      author: f.author || info.author,
      publisher: f.publisher || info.publisher,
    }));
  }

  // New book from a scan: fetch the title straight away
  useEffect(() => {
    if (!item && initial?.isbn) fillFromIsbn();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    const result = await saveItem(item?.id ?? null, {
      ...form,
      isbn: isLot ? "" : form.isbn,
      author: isLot ? "" : form.author,
      publisher: isLot ? "" : form.publisher,
    });
    setSaving(false);
    if (result.error || !result.item) return setError(result.error ?? "Could not save");
    onSaved(result.item);
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {error && <div className={errorBoxClass}>{error}</div>}

      <div className="grid grid-cols-2 gap-2">
        {(["PUBLISHER", "LOT"] as const).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => set("kind", k)}
            className={`py-2.5 rounded-lg border text-left px-3 ${
              form.kind === k ? "border-orange-500 bg-orange-50" : "border-gray-200"
            }`}
          >
            <span className={`block text-sm font-medium ${form.kind === k ? "text-orange-700" : "text-neutral-700"}`}>
              {k === "PUBLISHER" ? "Publisher book" : "Lot (fixed price)"}
            </span>
            <span className="block text-xs text-neutral-400">
              {k === "PUBLISHER" ? "One title, own ISBN" : "Many titles, one price"}
            </span>
          </button>
        ))}
      </div>

      {!isLot && (
        <div>
          <label className={labelClass}>ISBN / barcode</label>
          <div className="flex gap-2">
            <input
              value={form.isbn}
              onChange={(e) => set("isbn", e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  fillFromIsbn();
                }
              }}
              placeholder="Scan or type ISBN"
              className={inputClass}
            />
            <button
              type="button"
              onClick={fillFromIsbn}
              disabled={!form.isbn || looking}
              className="flex items-center gap-1.5 px-3 rounded-lg border border-gray-200 bg-white text-sm font-medium text-neutral-700 hover:bg-gray-50 disabled:opacity-50 whitespace-nowrap"
            >
              {looking ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4 text-orange-500" />}
              Fill details
            </button>
          </div>
          {foundFrom ? (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-md px-2 py-1 mt-1.5">
              Details filled from {foundFrom}. Check they match the book in your hand.
            </p>
          ) : (
            <p className="text-xs text-neutral-400 mt-1">Leave empty if the book has no barcode. It will get a sticker code.</p>
          )}
        </div>
      )}

      <div>
        <label className={labelClass}>{isLot ? "Lot name" : "Title"}</label>
        <input
          required
          autoFocus={!!item || !!initial?.isbn || isLot}
          value={form.name}
          onChange={(e) => set("name", e.target.value)}
          placeholder={isLot ? "Lot ₹100" : "Book title"}
          className={inputClass}
        />
      </div>

      {!isLot && (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Author</label>
            <input value={form.author} onChange={(e) => set("author", e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Publisher</label>
            <input value={form.publisher} onChange={(e) => set("publisher", e.target.value)} className={inputClass} />
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelClass}>Category</label>
          <select
            required
            value={form.category_id}
            onChange={(e) => set("category_id", e.target.value)}
            className={inputClass}
          >
            <option value="">Choose</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        {isLot && (
          <div>
            <label className={labelClass}>Lot number (optional)</label>
            <input value={form.lot_no} onChange={(e) => set("lot_no", e.target.value)} placeholder="L-12" className={inputClass} />
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelClass}>Selling price (₹)</label>
          <input
            required
            value={form.price}
            inputMode="decimal"
            onChange={(e) => set("price", e.target.value.replace(/[^\d.]/g, ""))}
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass}>Cost price (₹, optional)</label>
          <input
            value={form.cost_price}
            inputMode="decimal"
            onChange={(e) => set("cost_price", e.target.value.replace(/[^\d.]/g, ""))}
            className={inputClass}
          />
        </div>
      </div>

      {item && (
        <label className="flex items-center gap-2 text-sm text-neutral-700">
          <input
            type="checkbox"
            checked={form.is_active}
            onChange={(e) => set("is_active", e.target.checked)}
            className="rounded accent-orange-500"
          />
          Active (inactive books can&apos;t be billed)
        </label>
      )}

      <button type="submit" disabled={saving} className={`${primaryButtonClass} w-full`}>
        {saving && <Loader2 className="w-4 h-4 animate-spin" />}
        Save
      </button>
    </form>
  );
}
