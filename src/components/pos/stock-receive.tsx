"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ScanBarcode, Minus, Plus, X, Loader2, PackageCheck, Layers, BookOpen, FileSpreadsheet } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { createStockReceipt } from "@/lib/actions/stock";
import { importSheetBooks, quickAddBook } from "@/lib/actions/catalog";
import { readSupplierSheet, sheetCode, type SheetLine, type SkippedLine } from "@/lib/pos/sheet";
import { toast } from "@/components/ui/toast";
import { Modal } from "@/components/ui/modal";
import { Badge } from "@/components/ui/badge";
import { ItemForm } from "@/components/pos/item-form";
import { PickerDialog } from "@/components/pos/pos-dialogs";
import { inputClass, labelClass, primaryButtonClass } from "@/components/pos/form-styles";
import { formatQty, formatRupees } from "@/lib/pos/billing";
import type { Category, CurrentStaff, Item, Location, PosItem } from "@/lib/pos/types";

type Line = {
  item_id: string;
  name: string;
  code: string;
  kind: Item["kind"];
  price: number;
  qty: number;
  codes: string[]; // scanned ISBNs to link to a lot
  pending?: boolean; // new book still being created
  noTitle?: boolean; // created without a title found online
};

type LineItem = Omit<Line, "qty" | "codes">;

type Mode = "NORMAL" | "LOT";

const DRAFT_KEY = "bp-receive-draft";
const DEFAULTS_KEY = "bp-receive-new-book";

// Plain ISBN-10 / ISBN-13, hyphens and spaces ignored
function asIsbn(code: string) {
  const clean = code.replace(/[\s-]/g, "").toUpperCase();
  return /^(97[89]\d{10}|\d{9}[\dX])$/.test(clean) ? clean : null;
}

export function StockReceive({
  locations,
  categories,
  lots,
  staff,
}: {
  locations: Location[];
  categories: Category[];
  lots: Item[];
  staff: CurrentStaff;
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const isAdmin = staff.role === "ADMIN";

  const [locationId, setLocationId] = useState(
    (!isAdmin && staff.location_id) || locations.find((l) => l.kind === "WAREHOUSE")?.id || ""
  );
  const [supplier, setSupplier] = useState("");
  const [notes, setNotes] = useState("");
  const [mode, setMode] = useState<Mode>("NORMAL");
  const [lotId, setLotId] = useState(lots[0]?.id ?? "");
  const [lines, setLines] = useState<Line[]>([]);
  const [scan, setScan] = useState("");
  const [newIsbn, setNewIsbn] = useState<string | null>(null);
  const [picker, setPicker] = useState<PosItem[] | null>(null);
  const [lastNew, setLastNew] = useState<{ category_id: string; price: string } | null>(null);
  // Defaults for new ISBNs. With a category set, new books are created without a form.
  const [newCategoryId, setNewCategoryId] = useState("");
  const [newPrice, setNewPrice] = useState("");
  const [editItem, setEditItem] = useState<Item | null>(null);
  const quickAdded = useRef(new Map<string, "pending" | LineItem>()); // isbn -> created book
  const createdItems = useRef(new Map<string, Item>()); // item id -> book created here, for editing
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [skipped, setSkipped] = useState<SkippedLine[]>([]); // sheet rows with a bad ISBN
  const [fixing, setFixing] = useState<number | null>(null);
  const [restored, setRestored] = useState(false);
  const scanRef = useRef<HTMLInputElement>(null);

  // Keep an unsaved scan list safe across refreshes
  useEffect(() => {
    try {
      const draft = JSON.parse(localStorage.getItem(DRAFT_KEY) || "null");
      const defaults = JSON.parse(localStorage.getItem(DEFAULTS_KEY) || "null");
      if (defaults?.category_id && categories.some((c) => c.id === defaults.category_id)) {
        setNewCategoryId(defaults.category_id);
        setNewPrice(defaults.price ?? "");
      }
      const draftLines = (draft?.lines as Line[] | undefined)?.filter((l) => !l.pending);
      if (draftLines?.length) {
        setLines(draftLines);
        if (draft.locationId && (isAdmin || draft.locationId === staff.location_id)) setLocationId(draft.locationId);
        setSupplier(draft.supplier ?? "");
        toast.info(`Restored ${draftLines.length} unsaved books`);
      }
    } catch {
      // ignore broken draft
    }
    setRestored(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!restored) return;
    if (lines.length) localStorage.setItem(DRAFT_KEY, JSON.stringify({ lines, locationId, supplier }));
    else localStorage.removeItem(DRAFT_KEY);
  }, [lines, locationId, supplier, restored]);

  useEffect(() => {
    if (!restored) return;
    localStorage.setItem(DEFAULTS_KEY, JSON.stringify({ category_id: newCategoryId, price: newPrice }));
  }, [newCategoryId, newPrice, restored]);

  const totalQty = lines.reduce((sum, l) => sum + l.qty, 0);
  const pendingCount = lines.filter((l) => l.pending).length;
  const lot = lots.find((l) => l.id === lotId);

  function addLine(item: LineItem, linkCode?: string) {
    setLines((prev) => {
      const existing = prev.find((l) => l.item_id === item.item_id);
      const codes = (codesOf: string[]) =>
        linkCode && !codesOf.includes(linkCode) ? [...codesOf, linkCode] : codesOf;
      if (existing) {
        const updated = { ...existing, qty: existing.qty + 1, codes: codes(existing.codes) };
        return [updated, ...prev.filter((l) => l.item_id !== item.item_id)];
      }
      return [{ ...item, qty: 1, codes: codes([]) }, ...prev];
    });
    scanRef.current?.focus();
  }

  async function handleScan() {
    const code = scan.trim();
    setScan("");
    if (!code) return;
    if (!locationId) return toast.error("Choose where the stock is going");

    if (mode === "LOT") {
      if (!lot) return toast.error("Choose the lot first");
      const isLotSticker = code.toUpperCase() === lot.code;
      addLine(
        { item_id: lot.id, name: lot.name, code: lot.code, kind: "LOT", price: Number(lot.price) },
        isLotSticker ? undefined : code.toUpperCase()
      );
      return;
    }

    // A new book from this session: no need to ask the database again
    const isbn = asIsbn(code);
    const known = isbn && quickAdded.current.get(isbn);
    if (known) return addLine(known === "pending" ? pendingLine(isbn) : known);

    const { data, error } = await supabase.rpc("lookup_code", { p_code: code, p_location: locationId });
    if (error) return toast.error(error.message);
    const matches = (data as PosItem[]) || [];
    if (matches.length === 1) addLine(toLineItem(matches[0]));
    else if (matches.length > 1) setPicker(matches);
    else if (isbn && newCategoryId) quickAdd(isbn);
    else setNewIsbn(code);
  }

  function pendingLine(isbn: string) {
    return { item_id: `new:${isbn}`, name: `Finding ${isbn}…`, code: isbn, kind: "PUBLISHER" as const, price: 0, pending: true };
  }

  // Creates the book in the background so scanning never waits
  async function quickAdd(isbn: string) {
    const existing = quickAdded.current.get(isbn);
    if (existing) return addLine(existing === "pending" ? pendingLine(isbn) : existing);

    const placeholder = pendingLine(isbn);
    quickAdded.current.set(isbn, "pending");
    addLine(placeholder);

    const result = await quickAddBook(isbn, newCategoryId, newPrice);
    if (result.error || !result.item) {
      quickAdded.current.delete(isbn);
      setLines((prev) => prev.filter((l) => l.item_id !== placeholder.item_id));
      return toast.error(`${isbn}: ${result.error ?? "could not add"}. Scan it again.`);
    }

    createdItems.current.set(result.item.id, result.item);
    const line = { ...itemToLine(result.item), noTitle: !result.found };
    quickAdded.current.set(isbn, line);
    setLines((prev) =>
      prev.map((l) => (l.item_id === placeholder.item_id ? { ...l, ...line, pending: false } : l))
    );
  }

  function onEdited(item: Item) {
    createdItems.current.set(item.id, item);
    const changes = { name: item.name, price: Number(item.price), noTitle: false };
    for (const [isbn, line] of quickAdded.current) {
      if (line !== "pending" && line.item_id === item.id) quickAdded.current.set(isbn, { ...line, ...changes });
    }
    setLines((prev) => prev.map((l) => (l.item_id === item.id ? { ...l, ...changes } : l)));
    setEditItem(null);
    scanRef.current?.focus();
  }

  // Finds or creates the sheet's books and adds them to the list with the sheet's quantities
  async function addSheetLines(sheetLines: SheetLine[]) {
    const result = await importSheetBooks(
      sheetLines.map((l) => ({
        isbn: l.isbn,
        name: l.name,
        author: l.author,
        publisher: l.publisher,
        price: l.price,
        cost_price: l.cost_price,
      })),
      newCategoryId
    );
    if (result.error || !result.items) return { error: result.error ?? "Could not import" };

    const qtyOf = new Map(sheetLines.map((l) => [l.isbn, l.qty]));
    const imported = result.items.map(({ item, isNew, noTitle }) => {
      const line = { ...itemToLine(item), noTitle };
      if (isNew && item.isbn) {
        createdItems.current.set(item.id, item);
        quickAdded.current.set(item.isbn, line);
      }
      return { ...line, qty: qtyOf.get(item.isbn ?? "") ?? 1 };
    });
    setLines((prev) => {
      const byId = new Map(imported.map((l) => [l.item_id, l]));
      const merged = prev.map((l) => {
        const add = byId.get(l.item_id);
        if (!add) return l;
        byId.delete(l.item_id);
        return { ...l, qty: l.qty + add.qty };
      });
      return [...[...byId.values()].map((l) => ({ ...l, codes: [] })), ...merged];
    });
    return { titles: imported.length, books: imported.reduce((sum, l) => sum + l.qty, 0), created: result.created, priced: result.priced };
  }

  // Supplier invoice / stock list: every row's book and quantity in one go
  async function importSheet(file: File) {
    if (!locationId) return toast.error("Choose where the stock is going");
    setImporting(true);
    try {
      const sheet = await readSupplierSheet(file).catch(() => ({ error: "Couldn't read this file. Save it as .xlsx or .csv." }));
      if ("error" in sheet) return toast.error(sheet.error);
      if (!sheet.lines.length && !sheet.skipped.length) return toast.error("No rows with an ISBN in this sheet");

      setSkipped(sheet.skipped);
      if (!sheet.lines.length) return;
      const result = await addSheetLines(sheet.lines);
      if (result.error) return toast.error(result.error);

      const extras = [
        result.created && `${result.created} new books created`,
        result.priced && `${result.priced} prices filled`,
        !sheet.hasQty && "no Qty column, so 1 each",
      ].filter(Boolean);
      toast.success(`${result.titles} titles · ${formatQty(result.books ?? 0)} books from ${file.name}${extras.length ? ` (${extras.join(", ")})` : ""}`);
    } finally {
      setImporting(false);
      scanRef.current?.focus();
    }
  }

  // A skipped sheet row with its ISBN corrected (typed or scanned from the book)
  async function fixSkipped(row: SkippedLine, value: string) {
    const isbn = sheetCode(value);
    if (!isbn) return toast.error(`${value || "This"} is still not a full ISBN. Scan the book's barcode.`);
    setFixing(row.rowNo);
    const result = await addSheetLines([{ ...row, isbn }]);
    setFixing(null);
    if (result.error) return toast.error(result.error);
    setSkipped((prev) => prev.filter((r) => r.rowNo !== row.rowNo));
    toast.success(`${row.name || isbn} added · ${formatQty(row.qty)} books`);
  }

  function updateQty(itemId: string, qty: number) {
    setLines((prev) => prev.map((l) => (l.item_id === itemId ? { ...l, qty: Math.max(1, qty) } : l)));
  }

  async function save() {
    if (!locationId) return toast.error("Choose where the stock is going");
    if (lines.length === 0) return toast.error("Scan at least one book");
    if (pendingCount) return toast.error("Wait a second, new books are still being added");
    if (skipped.length) return toast.error("Fix or ignore the sheet rows marked in yellow first");
    setSaving(true);
    const result = await createStockReceipt({
      location_id: locationId,
      supplier,
      notes,
      items: lines.map((l) => ({ item_id: l.item_id, qty: l.qty, codes: l.codes })),
    });
    setSaving(false);
    if (result.error || !result.receipt) return toast.error(result.error ?? "Could not save");

    toast.success(`${result.receipt.receipt_no} saved · ${formatQty(Number(result.receipt.total_qty))} books added`);
    setLines([]);
    setNotes("");
    quickAdded.current.clear();
    createdItems.current.clear();
    router.refresh();
    scanRef.current?.focus();
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      {/* Settings */}
      <div className="glass-card rounded-xl p-5 space-y-4 h-fit">
        <div>
          <label className={labelClass}>Stock going to</label>
          <select
            value={locationId}
            onChange={(e) => setLocationId(e.target.value)}
            disabled={!isAdmin}
            className={`${inputClass} disabled:bg-gray-50`}
          >
            <option value="">Choose</option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClass}>Supplier / publisher (optional)</label>
          <input value={supplier} onChange={(e) => setSupplier(e.target.value)} className={inputClass} />
        </div>

        <div>
          <label className={labelClass}>What are you scanning?</label>
          <div className="grid grid-cols-2 gap-2">
            <ModeButton
              active={mode === "NORMAL"}
              onClick={() => setMode("NORMAL")}
              icon={BookOpen}
              title="Publisher books"
              hint="Each title separately"
            />
            <ModeButton
              active={mode === "LOT"}
              onClick={() => setMode("LOT")}
              icon={Layers}
              title="Lot books"
              hint="All go into one lot"
            />
          </div>
        </div>

        {mode === "NORMAL" && (
          <div className="rounded-lg border border-orange-100 bg-orange-50/40 p-3 space-y-3">
            <div>
              <p className="text-sm font-medium text-neutral-800">New books</p>
              <p className="text-xs text-neutral-500">
                Pick a category and new ISBNs are added straight away, title from Google. No form.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className={labelClass}>Category</label>
                <select value={newCategoryId} onChange={(e) => setNewCategoryId(e.target.value)} className={inputClass}>
                  <option value="">Ask each time</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelClass}>Price ₹ (optional)</label>
                <input
                  value={newPrice}
                  inputMode="decimal"
                  disabled={!newCategoryId}
                  onChange={(e) => setNewPrice(e.target.value.replace(/[^\d.]/g, ""))}
                  placeholder="Set later"
                  className={`${inputClass} disabled:bg-gray-50`}
                />
              </div>
            </div>
            <label
              className={`flex items-center justify-center gap-2 w-full px-3 py-2 rounded-lg border border-dashed border-orange-300 bg-white text-sm font-medium text-orange-700 hover:bg-orange-50 ${
                importing ? "opacity-60 pointer-events-none" : "cursor-pointer"
              }`}
            >
              {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileSpreadsheet className="w-4 h-4" />}
              {importing ? "Importing…" : "Import supplier Excel"}
              <input
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                disabled={importing}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (file) importSheet(file);
                }}
              />
            </label>
            <p className="text-xs text-neutral-400 -mt-1.5">
              Invoice or stock list with an ISBN column. Title, author, MRP and Qty are picked up when present.
            </p>
          </div>
        )}

        {mode === "LOT" && (
          <div>
            <label className={labelClass}>Lot</label>
            {lots.length === 0 ? (
              <p className="text-sm text-neutral-500">
                No lots yet. Add one in Books with type “Lot”, e.g. “Lot ₹100”.
              </p>
            ) : (
              <select value={lotId} onChange={(e) => setLotId(e.target.value)} className={inputClass}>
                {lots.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name} · {formatRupees(Number(l.price))}
                  </option>
                ))}
              </select>
            )}
            <p className="text-xs text-neutral-400 mt-1.5">
              Every ISBN you scan is linked to this lot, so at billing that ISBN sells at the lot price.
            </p>
          </div>
        )}

        <div>
          <label className={labelClass}>Notes (optional)</label>
          <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} className={inputClass} />
        </div>
      </div>

      {/* Scan list */}
      <div className="lg:col-span-2 glass-card rounded-xl flex flex-col min-h-[60vh]">
        <div className="p-4 border-b border-gray-100">
          <div className="relative">
            <ScanBarcode className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-orange-500" />
            <input
              ref={scanRef}
              autoFocus
              value={scan}
              onChange={(e) => setScan(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleScan();
                }
              }}
              placeholder={mode === "LOT" ? `Scan books for ${lot?.name ?? "the lot"}` : "Scan each book (every scan adds 1)"}
              className="w-full pl-11 pr-4 py-3 border-2 border-orange-200 rounded-xl bg-white text-base focus:outline-none focus:border-orange-500 focus:ring-4 focus:ring-orange-500/10"
            />
          </div>
        </div>

        {skipped.length > 0 && (
          <div className="border-b border-amber-200 bg-amber-50/60 px-4 py-3 space-y-2">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-medium text-amber-900">
                {skipped.length === 1 ? "1 book" : `${skipped.length} books`} not added: the ISBN in the sheet is wrong
              </p>
              <button type="button" onClick={() => setSkipped([])} className="text-xs text-amber-700 hover:underline">
                Ignore all
              </button>
            </div>
            <p className="text-xs text-amber-800/80">
              Check the box against the barcode on the book (or scan it into the box), then press Add.
            </p>
            {skipped.map((row) => (
              <SkippedRow key={row.rowNo} row={row} busy={fixing === row.rowNo} onFix={fixSkipped} onIgnore={() => setSkipped((prev) => prev.filter((r) => r.rowNo !== row.rowNo))} />
            ))}
          </div>
        )}

        <div className="flex-1 overflow-y-auto">
          {lines.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-10">
              <div className="w-14 h-14 rounded-full bg-orange-500/10 flex items-center justify-center mb-3">
                <ScanBarcode className="w-7 h-7 text-orange-500" />
              </div>
              <p className="text-sm font-medium text-neutral-700">Start scanning</p>
              <p className="text-xs text-neutral-400 mt-1 max-w-xs">
                Same book again adds +1.{" "}
                {mode === "NORMAL" && newCategoryId
                  ? "New ISBNs are added on their own with the title from Google."
                  : "A new ISBN opens a short form with the title filled in."}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {lines.map((line) => (
                <div key={line.item_id} className="flex items-center gap-3 px-4 py-2.5">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      {line.pending && <Loader2 className="w-3.5 h-3.5 animate-spin text-orange-500 flex-shrink-0" />}
                      {createdItems.current.has(line.item_id) ? (
                        <button
                          type="button"
                          tabIndex={-1}
                          onClick={() => setEditItem(createdItems.current.get(line.item_id) ?? null)}
                          className="text-sm font-medium text-neutral-900 truncate hover:text-orange-600 hover:underline"
                          title="Edit this book"
                        >
                          {line.name}
                        </button>
                      ) : (
                        <span className={`text-sm font-medium truncate ${line.pending ? "text-neutral-400" : "text-neutral-900"}`}>
                          {line.name}
                        </span>
                      )}
                      {line.kind === "LOT" && <Badge variant="warning">Lot</Badge>}
                      {line.noTitle && <Badge variant="error">Title not found</Badge>}
                      {!line.pending && line.kind === "PUBLISHER" && line.price === 0 && <Badge variant="warning">No price</Badge>}
                    </div>
                    <div className="text-xs text-neutral-400">
                      {line.code} · {formatRupees(line.price)}
                      {line.codes.length > 0 && ` · ${line.codes.length} ISBNs linked`}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      tabIndex={-1}
                      onClick={() => updateQty(line.item_id, line.qty - 1)}
                      className="w-7 h-7 rounded-lg border border-gray-200 bg-white flex items-center justify-center text-neutral-500 hover:bg-gray-50"
                    >
                      <Minus className="w-3.5 h-3.5" />
                    </button>
                    <input
                      value={line.qty}
                      inputMode="numeric"
                      onChange={(e) => updateQty(line.item_id, parseInt(e.target.value.replace(/\D/g, "") || "1", 10))}
                      className="w-14 px-1.5 py-1 text-center border border-gray-200 rounded-lg bg-white text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-orange-500"
                    />
                    <button
                      type="button"
                      tabIndex={-1}
                      onClick={() => updateQty(line.item_id, line.qty + 1)}
                      className="w-7 h-7 rounded-lg border border-gray-200 bg-white flex items-center justify-center text-neutral-500 hover:bg-gray-50"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={() => setLines((prev) => prev.filter((l) => l.item_id !== line.item_id))}
                    className="p-1.5 rounded-lg text-neutral-300 hover:text-red-500 hover:bg-red-50"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="border-t border-gray-100 p-4 flex items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-wider text-neutral-400 font-medium">Total</p>
            <p className="text-xl font-bold text-neutral-900">
              {formatQty(totalQty)} books <span className="text-sm font-normal text-neutral-400">· {lines.length} titles</span>
            </p>
          </div>
          <button
            type="button"
            onClick={save}
            disabled={saving || lines.length === 0 || pendingCount > 0}
            className={`${primaryButtonClass} py-3 px-6`}
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <PackageCheck className="w-4 h-4" />}
            Save to stock
          </button>
        </div>
      </div>

      <Modal open={!!newIsbn} onClose={() => setNewIsbn(null)} title="New book" size="lg">
        {newIsbn && (
          <ItemForm
            item={null}
            categories={categories}
            initial={{
              isbn: /^[0-9Xx-]+$/.test(newIsbn) ? newIsbn : undefined,
              category_id: lastNew?.category_id,
              price: lastNew?.price,
            }}
            onSaved={(item) => {
              setLastNew({ category_id: item.category_id ?? "", price: String(Number(item.price)) });
              setNewIsbn(null);
              addLine(itemToLine(item));
            }}
          />
        )}
      </Modal>

      <Modal open={!!editItem} onClose={() => setEditItem(null)} title="Edit book" size="lg">
        {editItem && <ItemForm item={editItem} categories={categories} onSaved={onEdited} />}
      </Modal>

      <Modal open={!!picker} onClose={() => setPicker(null)} title="Which one is it?">
        {picker && (
          <PickerDialog
            items={picker}
            onPick={(item) => {
              addLine(toLineItem(item));
              setPicker(null);
            }}
          />
        )}
      </Modal>
    </div>
  );
}

function toLineItem(item: PosItem) {
  return { item_id: item.item_id, name: item.name, code: item.code, kind: item.kind, price: Number(item.price) };
}

function itemToLine(item: Item) {
  return { item_id: item.id, name: item.name, code: item.code, kind: item.kind, price: Number(item.price) };
}

function SkippedRow({
  row,
  busy,
  onFix,
  onIgnore,
}: {
  row: SkippedLine;
  busy: boolean;
  onFix: (row: SkippedLine, value: string) => void;
  onIgnore: () => void;
}) {
  const [value, setValue] = useState(row.suggestion ?? row.isbn);
  return (
    <div className="flex items-center gap-3 rounded-lg bg-white border border-amber-200 px-3 py-2">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-neutral-900 truncate">{row.name || "No title in sheet"}</p>
        <p className="text-xs text-neutral-500">
          Row {row.rowNo} · {formatQty(row.qty)} books{row.price ? ` · ${formatRupees(row.price)}` : ""}
        </p>
        <p className="text-xs text-red-600">
          Sheet says <span className="font-mono">{row.isbn}</span>, which {row.problem}.
          {row.suggestion && <span className="text-emerald-700"> Probably {row.suggestion} (filled in).</span>}
        </p>
      </div>
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onFocus={(e) => e.target.select()}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            onFix(row, value.trim());
          }
        }}
        placeholder="Correct ISBN"
        className="w-44 px-2.5 py-1.5 border border-gray-200 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-orange-500"
      />
      <button
        type="button"
        disabled={busy}
        onClick={() => onFix(row, value.trim())}
        className="px-3 py-1.5 rounded-lg bg-orange-500 text-white text-sm font-medium hover:bg-orange-600 disabled:opacity-60"
      >
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Add"}
      </button>
      <button type="button" onClick={onIgnore} title="Leave this row out" className="p-1.5 rounded-lg text-neutral-300 hover:text-red-500 hover:bg-red-50">
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}

function ModeButton({
  active,
  onClick,
  icon: Icon,
  title,
  hint,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  hint: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-left p-3 rounded-lg border transition-colors ${
        active ? "border-orange-500 bg-orange-50" : "border-gray-200 bg-white hover:bg-gray-50"
      }`}
    >
      <Icon className={`w-4 h-4 mb-1 ${active ? "text-orange-600" : "text-neutral-400"}`} />
      <span className={`block text-sm font-medium ${active ? "text-orange-700" : "text-neutral-700"}`}>{title}</span>
      <span className="block text-xs text-neutral-400">{hint}</span>
    </button>
  );
}
