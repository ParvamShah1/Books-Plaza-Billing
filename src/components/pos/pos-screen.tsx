"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { checkCoupon, searchCustomerPhones, sendBillWhatsApp } from "@/lib/actions/sales";
import { sendPurchaseToMeta } from "@/lib/actions/meta";
import { addCategoryOtherBook, billUnknownCode, getCategoryOtherBooks, setNewBookPrices } from "@/lib/actions/catalog";
import { NO_PHONE, OTHER_BOOKS_SUFFIX, billName, billTotals, formatQty, formatRupees, isValidMobile, lineAmounts } from "@/lib/pos/billing";
import type { Category, CurrentStaff, Location, PaymentMode, PosItem, SellBy } from "@/lib/pos/types";
import { beep, toast } from "@/components/ui/toast";
import { Modal } from "@/components/ui/modal";
import {
  PayDialog,
  HoldDialog,
  PickerDialog,
  HeldBillsDialog,
  UnknownCodeDialog,
  type HeldBill,
} from "@/components/pos/pos-dialogs";
import {
  ScanBarcode,
  Minus,
  Plus,
  X,
  Loader2,
  PauseCircle,
  Smartphone,
  Banknote,
  Search,
  Printer,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Ticket,
  CreditCard,
} from "lucide-react";

type Line = {
  key: string; // the item id, or a fresh one per row for "Type price" items
  item_id: string;
  name: string;
  code: string;
  sell_by: SellBy;
  qty: string;
  price: string;
  discount: number;
  stock: number | null;
};

type LastBill = { id: string; invoice_no: string; payable: number };

// A paid bill an admin is fixing (opened from the Sales page)
export type EditSale = {
  id: string;
  invoice_no: string;
  location_id: string;
  phone: string | null;
  coupon_code: string | null;
  coupon_pct: number;
};

// Each tap on a "Type price" tile is a different book, so it gets its own row
const isOtherBooks = (item: { kind?: string; name: string }) => item.kind !== "PUBLISHER" && item.name.endsWith(OTHER_BOOKS_SUFFIX);
let rowSeq = 0;

const looksLikeCode = (s: string) => /^[0-9Xx-]{6,}$/.test(s) || /^BP\d+$/i.test(s);
const canNameSearch = (s: string) => s.length >= 3 && !looksLikeCode(s);
const canSuggestPhone = (s: string) => s.length >= 4 && s.length < 10;
const num = (s: string) => {
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
};

export function PosScreen({
  locations,
  categories,
  staff,
  editSale,
}: {
  locations: Location[];
  categories: Category[];
  staff: CurrentStaff;
  editSale?: EditSale;
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const isAdmin = staff.role === "ADMIN";

  const [locationId, setLocationId] = useState(
    editSale?.location_id || (!isAdmin && staff.location_id) || (locations.length === 1 ? locations[0].id : "")
  );
  const [phone, setPhone] = useState(editSale?.phone ?? "");
  const [phoneSuggestions, setPhoneSuggestions] = useState<string[]>([]);
  const [lines, setLines] = useState<Line[]>([]);
  const [heldSaleId, setHeldSaleId] = useState<string | null>(null);
  const [holdRef, setHoldRef] = useState("");
  const [scan, setScan] = useState("");
  const [nameMatches, setNameMatches] = useState<PosItem[]>([]);
  const [activeMatch, setActiveMatch] = useState(0);
  const [picker, setPicker] = useState<PosItem[] | null>(null);
  const [unknownCode, setUnknownCode] = useState<string | null>(null);
  const [payMode, setPayMode] = useState<PaymentMode | null>(null);
  const [holdOpen, setHoldOpen] = useState(false);
  const [heldOpen, setHeldOpen] = useState(false);
  const [heldBills, setHeldBills] = useState<HeldBill[]>([]);
  const [saving, setSaving] = useState(false);
  const [lastBill, setLastBill] = useState<LastBill | null>(null);
  const [flashId, setFlashId] = useState<string | null>(null);
  const [coupon, setCoupon] = useState<{ code: string; pct: number; phone: string } | null>(
    editSale?.coupon_code ? { code: editSale.coupon_code, pct: editSale.coupon_pct, phone: editSale.phone ?? "" } : null
  );
  const [couponInput, setCouponInput] = useState("");
  const [couponChecking, setCouponChecking] = useState(false);

  // Catalog panel, as in the old billing screen: loose items (bookmarks, books by kg...) to start with;
  // choosing a category or typing a filter shows every book that matches
  const [categoryId, setCategoryId] = useState("");
  const [catalogQuery, setCatalogQuery] = useState("");
  const [catalog, setCatalog] = useState<PosItem[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);

  const phoneRef = useRef<HTMLInputElement>(null);
  const scanRef = useRef<HTMLInputElement>(null);
  const couponRef = useRef<HTMLInputElement>(null);
  const tableRef = useRef<HTMLDivElement>(null);
  const qtyRefs = useRef(new Map<string, HTMLInputElement>());
  const priceRefs = useRef(new Map<string, HTMLInputElement>());
  // Books created from an unknown barcode during this bill; their typed price is saved after payment
  const newBookIds = useRef(new Set<string>());
  const printFrame = useRef<HTMLIFrameElement | null>(null);

  const location = locations.find((l) => l.id === locationId);
  const totals = useMemo(
    () =>
      billTotals(
        lines.map((l) => ({ qty: num(l.qty), price: num(l.price), discount: l.discount })),
        coupon?.pct ?? 0
      ),
    [lines, coupon]
  );
  const phoneValid = phone === "" || phone === NO_PHONE || isValidMobile(phone);
  const visibleMatches = canNameSearch(scan.trim()) ? nameMatches : [];
  const visiblePhones = canSuggestPhone(phone) ? phoneSuggestions : [];
  const anyDialogOpen = !!picker || !!unknownCode || !!payMode || holdOpen || heldOpen;

  // ---------- Held bills ----------
  const fetchHeldBills = useCallback(async () => {
    if (!locationId) return [];
    const { data } = await supabase
      .from("sales")
      .select("id, hold_ref, phone, payable, total_qty, created_at, coupon_code")
      .eq("status", "HELD")
      .eq("location_id", locationId)
      .order("created_at", { ascending: false });
    return (data as HeldBill[]) || [];
  }, [supabase, locationId]);

  async function loadHeldBills() {
    setHeldBills(await fetchHeldBills());
  }

  useEffect(() => {
    let cancelled = false;
    fetchHeldBills().then((bills) => {
      if (!cancelled) setHeldBills(bills);
    });
    return () => {
      cancelled = true;
    };
  }, [fetchHeldBills]);

  // ---------- Catalog ----------
  const [addingOther, setAddingOther] = useState<string | null>(null);
  // "Other book" tiles: one per category sold by piece, for books with no data. On the start
  // screen every category gets one; inside a category only that one.
  const otherBookCategories = catalogQuery.trim()
    ? []
    : categories.filter((c) => c.sell_by === "PIECE" && (!categoryId || c.id === categoryId));

  // Loaded once per exhibition so a tap adds the line straight away
  const [otherBooks, setOtherBooks] = useState<Map<string, PosItem>>(new Map());
  useEffect(() => {
    if (!locationId) return;
    let cancelled = false;
    getCategoryOtherBooks(locationId).then((items) => {
      if (!cancelled) setOtherBooks(new Map(items.map((i) => [i.category_id ?? "", i])));
    });
    return () => {
      cancelled = true;
    };
  }, [locationId]);

  async function addOtherBook(categoryIdToAdd: string) {
    if (!locationId) return;
    const loaded = otherBooks.get(categoryIdToAdd);
    if (loaded) return addItem(loaded);
    // Category added after the screen opened: fetch it this once
    setAddingOther(categoryIdToAdd);
    const result = await addCategoryOtherBook(categoryIdToAdd, locationId);
    setAddingOther(null);
    if ("error" in result) return toast.error(result.error ?? "Could not add the book");
    setOtherBooks((m) => new Map(m).set(categoryIdToAdd, result.item));
    addItem(result.item);
  }

  useEffect(() => {
    if (!locationId) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      setCatalogLoading(true);
      const { data, error } = await supabase.rpc("pos_items", {
        p_location: locationId,
        p_query: catalogQuery || null,
        p_category: categoryId || null,
        p_limit: 200,
        p_kind: categoryId || catalogQuery.trim() ? null : "LOT",
      });
      if (cancelled) return;
      setCatalogLoading(false);
      if (error) toast.error(error.message);
      // The "Other book" box stands in for each category's general item
      else setCatalog((data as PosItem[]).filter((i) => !(i.kind === "LOT" && i.name.endsWith(OTHER_BOOKS_SUFFIX))));
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [supabase, locationId, categoryId, catalogQuery]);

  // ---------- Name search inside the scan box ----------
  useEffect(() => {
    const q = scan.trim();
    if (!locationId || !canNameSearch(q)) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      const { data } = await supabase.rpc("pos_items", {
        p_location: locationId,
        p_query: q,
        p_category: null,
        p_limit: 8,
      });
      if (!cancelled) {
        setNameMatches((data as PosItem[]) || []);
        setActiveMatch(0);
      }
    }, 180);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [supabase, scan, locationId]);

  // ---------- Phone suggestions ----------
  useEffect(() => {
    if (!canSuggestPhone(phone)) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      const result = await searchCustomerPhones(phone);
      if (!cancelled) setPhoneSuggestions(result);
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [phone]);

  // ---------- Bill lines ----------
  const addItem = useCallback((item: PosItem) => {
    const key = isOtherBooks(item) ? `${item.item_id}:${++rowSeq}` : item.item_id;
    setLines((prev) => {
      const existing = prev.find((l) => l.key === key);
      if (existing) {
        if (existing.sell_by === "KG") return prev;
        return prev.map((l) => (l.key === key ? { ...l, qty: String(num(l.qty) + 1) } : l));
      }
      return [
        ...prev,
        {
          key,
          item_id: item.item_id,
          name: item.name,
          code: item.code,
          sell_by: item.sell_by,
          qty: "1",
          price: String(Number(item.price)),
          discount: Number(item.discount),
          stock: Number(item.stock),
        },
      ];
    });
    setFlashId(key);
    setTimeout(() => setFlashId((id) => (id === key ? null : id)), 700);

    // Weight items: jump to the qty box so the cashier types the kg; no price yet: to the price box
    setTimeout(() => {
      const qtyInput = qtyRefs.current.get(key);
      const priceInput = priceRefs.current.get(key);
      if (item.sell_by === "KG" && qtyInput) {
        qtyInput.focus();
        qtyInput.select();
      } else if (Number(item.price) <= 0 && priceInput) {
        priceInput.focus();
        priceInput.select();
      } else {
        qtyInput?.scrollIntoView({ block: "nearest" });
        scanRef.current?.focus();
      }
    }, 0);
  }, []);

  function updateLine(key: string, patch: Partial<Line>) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  function stepQty(line: Line, delta: number) {
    const next = Math.max(1, Math.round(num(line.qty)) + delta);
    updateLine(line.key, { qty: String(next) });
  }

  function removeLine(key: string) {
    setLines((prev) => prev.filter((l) => l.key !== key));
    scanRef.current?.focus();
  }

  function resetBill() {
    setLines([]);
    setPhone("");
    setHeldSaleId(null);
    setHoldRef("");
    setScan("");
    setNameMatches([]);
    setCoupon(null);
    setCouponInput("");
    phoneRef.current?.focus();
  }

  // ---------- Coupon ----------
  async function applyCoupon(code = couponInput, forPhone = phone) {
    const clean = code.replace(/[^a-z0-9]/gi, "").toUpperCase();
    if (!clean) return;
    if (!isValidMobile(forPhone)) {
      toast.error("Enter the customer mobile number first. Coupons work only for their own number.");
      phoneRef.current?.focus();
      return;
    }
    setCouponChecking(true);
    const result = await checkCoupon(clean, forPhone);
    setCouponChecking(false);
    if (!result.ok) {
      toast.error(result.message);
      couponRef.current?.select();
      return;
    }
    setCoupon({ code: result.code, pct: Number(result.discount_pct), phone: forPhone });
    setCouponInput("");
    toast.success(`Coupon ${result.code} applied · ${Number(result.discount_pct)}% off`);
    scanRef.current?.focus();
  }

  // ---------- Scanning ----------
  async function handleScanEnter() {
    const code = scan.trim();
    if (!code) return;
    if (!locationId) {
      toast.error("Select the exhibition first");
      return;
    }

    if (visibleMatches.length > 0 && !looksLikeCode(code)) {
      addItem(visibleMatches[activeMatch] ?? visibleMatches[0]);
      setScan("");
      setNameMatches([]);
      return;
    }

    setScan("");
    const { data, error } = await supabase.rpc("lookup_code", { p_code: code, p_location: locationId });
    if (error) {
      toast.error(error.message);
    } else if (!data || data.length === 0) {
      beep();
      setUnknownCode(code);
    } else if (data.length === 1) {
      addItem(data[0] as PosItem);
    } else {
      setPicker(data as PosItem[]);
    }
  }

  function handleScanKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      handleScanEnter();
    } else if (e.key === "ArrowDown" && visibleMatches.length) {
      e.preventDefault();
      setActiveMatch((i) => Math.min(i + 1, visibleMatches.length - 1));
    } else if (e.key === "ArrowUp" && visibleMatches.length) {
      e.preventDefault();
      setActiveMatch((i) => Math.max(i - 1, 0));
    } else if (e.key === "Escape") {
      setScan("");
      setNameMatches([]);
    }
  }

  // ---------- Saving ----------
  function validateBill(forPayment: boolean): boolean {
    if (!locationId) {
      toast.error("Select the exhibition first");
      return false;
    }
    if (lines.length === 0) {
      toast.error("Add at least one book");
      return false;
    }
    if (forPayment && !phone) {
      toast.error("Enter the customer mobile. If they won't give one, type 0000000000");
      phoneRef.current?.focus();
      return false;
    }
    if (phone && !phoneValid) {
      toast.error("Enter a real 10-digit mobile number, or 0000000000 if the customer won't give one");
      phoneRef.current?.focus();
      return false;
    }
    const unpriced = forPayment && lines.find((l) => num(l.price) <= 0);
    if (unpriced) {
      toast.error(`Type the price of "${unpriced.name}"`);
      priceRefs.current.get(unpriced.key)?.focus();
      return false;
    }
    const bad = lines.find((l) => num(l.qty) <= 0 || (l.sell_by === "PIECE" && !Number.isInteger(num(l.qty))));
    if (bad) {
      toast.error(`Check the quantity of "${bad.name}"`);
      qtyRefs.current.get(bad.key)?.focus();
      return false;
    }
    return true;
  }

  function printReceipt(saleId: string) {
    printFrame.current?.remove();
    const frame = document.createElement("iframe");
    frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;";
    frame.src = `/receipt/${saleId}?print=1`;
    document.body.appendChild(frame);
    printFrame.current = frame;
  }

  async function saveEditedBill(mode: PaymentMode) {
    if (!editSale) return false;
    setSaving(true);
    const { error } = await supabase.rpc("edit_sale", {
      p: {
        sale_id: editSale.id,
        phone: phone || null,
        payment_mode: mode,
        items: lines.map((l) => ({ item_id: l.item_id, qty: num(l.qty), price: num(l.price) })),
      },
    });
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return false;
    }
    const newPrices = lines
      .filter((l) => newBookIds.current.has(l.item_id))
      .map((l) => ({ item_id: l.item_id, price: num(l.price) }));
    if (newPrices.length) setNewBookPrices(newPrices);
    toast.success(`Bill ${editSale.invoice_no} updated`);
    printReceipt(editSale.id);
    router.push("/sales");
    return true;
  }

  async function saveBill(status: "HELD" | "PAID", mode?: PaymentMode, ref?: string) {
    if (editSale && status === "PAID" && mode) return saveEditedBill(mode);
    setSaving(true);
    const { data, error } = await supabase.rpc("save_sale", {
      p: {
        sale_id: heldSaleId,
        location_id: locationId,
        phone: phone || null,
        status,
        payment_mode: mode ?? null,
        hold_ref: ref ?? holdRef,
        coupon_code: coupon?.code ?? null,
        items: lines.map((l) => ({ item_id: l.item_id, qty: num(l.qty), price: num(l.price) })),
      },
    });
    setSaving(false);

    if (error) {
      toast.error(error.message);
      // Someone used the code in the meantime: drop it so the cashier can bill without it
      if (error.message.startsWith("Coupon ")) setCoupon(null);
      return false;
    }

    const result = data as { id: string; invoice_no: string | null; payable: number; coupon: string | null };
    if (status === "PAID") {
      printReceipt(result.id);
      const newPrices = lines
        .filter((l) => newBookIds.current.has(l.item_id))
        .map((l) => ({ item_id: l.item_id, price: num(l.price) }));
      if (newPrices.length) setNewBookPrices(newPrices);
      newBookIds.current.clear();
      if (isValidMobile(phone)) {
        sendBillWhatsApp(result.id).then((r) => {
          if ("error" in r) toast.error(`Bill ${result.invoice_no}: ${r.error}`);
        });
        // Ad tracking only: failures are logged on the server, the cashier doesn't need to know
        sendPurchaseToMeta(result.id);
      }
      setLastBill({ id: result.id, invoice_no: result.invoice_no!, payable: Number(result.payable) });
      toast.success(`Bill ${result.invoice_no} saved`);
    } else {
      toast.success("Bill put on hold");
    }
    resetBill();
    loadHeldBills();
    return true;
  }

  function startPayment(mode: PaymentMode) {
    if (saving || !validateBill(true)) return;
    setPayMode(mode);
  }

  function startHold() {
    if (editSale) return toast.error("A paid bill can't go on hold. Save it with Cash/UPI/Card");
    if (saving || !validateBill(false)) return;
    setHoldOpen(true);
  }

  // Lines of a saved bill, as they go on the billing screen
  const fetchBillLines = useCallback(
    async (saleId: string): Promise<Line[] | null> => {
      const { data, error } = await supabase
        .from("sale_items")
        .select("item_id, name, qty, price, discount, item:items(code, category:categories(sell_by))")
        .eq("sale_id", saleId)
        .order("sort_order");
      if (error) {
        toast.error(error.message);
        return null;
      }

      type Row = {
        item_id: string;
        name: string;
        qty: number;
        price: number;
        discount: number;
        item: { code: string; category: { sell_by: SellBy } | null } | null;
      };
      return (data as unknown as Row[]).map((r) => ({
        key: isOtherBooks(r) ? `${r.item_id}:${++rowSeq}` : r.item_id,
        item_id: r.item_id,
        name: r.name,
        code: r.item?.code ?? "",
        sell_by: r.item?.category?.sell_by ?? "PIECE",
        qty: String(Number(r.qty)),
        price: String(Number(r.price)),
        discount: Number(r.discount),
        stock: null,
      }));
    },
    [supabase]
  );

  useEffect(() => {
    if (!editSale) return;
    fetchBillLines(editSale.id).then((billLines) => billLines && setLines(billLines));
  }, [editSale, fetchBillLines]);

  async function openHeldBill(bill: HeldBill) {
    if (lines.length > 0) {
      toast.error("Finish or hold the current bill first");
      return;
    }
    const billLines = await fetchBillLines(bill.id);
    if (!billLines) return;
    setLines(billLines);
    setHeldSaleId(bill.id);
    setHoldRef(bill.hold_ref ?? "");
    setPhone(bill.phone ?? "");
    setCoupon(null);
    if (bill.coupon_code && bill.phone) applyCoupon(bill.coupon_code, bill.phone);
    setHeldOpen(false);
    setTimeout(() => scanRef.current?.focus(), 0);
  }

  async function deleteHeldBill(bill: HeldBill) {
    const { error } = await supabase.from("sales").delete().eq("id", bill.id).eq("status", "HELD");
    if (error) toast.error(error.message);
    else {
      toast.success("Held bill deleted");
      loadHeldBills();
    }
  }

  // ---------- Keyboard shortcuts ----------
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (anyDialogOpen) return;
      if (e.key === "F2") {
        e.preventDefault();
        phoneRef.current?.focus();
      } else if (e.key === "F3") {
        e.preventDefault();
        scanRef.current?.focus();
      } else if (e.key === "F6") {
        e.preventDefault();
        couponRef.current?.focus();
      } else if (e.key === "F4") {
        e.preventDefault();
        startHold();
      } else if (e.key === "F8") {
        e.preventDefault();
        startPayment("UPI");
      } else if (e.key === "F9") {
        e.preventDefault();
        startPayment("CASH");
      } else if (e.key === "F10") {
        e.preventDefault();
        startPayment("CARD");
      } else if (
        e.key.length === 1 &&
        !e.ctrlKey &&
        !e.metaKey &&
        !(e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement || e.target instanceof HTMLTextAreaElement)
      ) {
        // Scanner typed while nothing was focused: send it to the scan box
        scanRef.current?.focus();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  // ---------- Render ----------
  const inputClass =
    "w-full px-3 py-2 border border-gray-200 rounded-lg bg-white/80 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent text-sm";

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 lg:h-[calc(100vh-5.75rem)]">
      {/* ================= BILL ================= */}
      <section className="lg:col-span-8 glass-card rounded-2xl flex flex-col min-h-[70vh] lg:min-h-0">
        {/* Header */}
        <div className="p-4 border-b border-gray-100 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
            <div className="sm:col-span-4">
              <label className="block text-xs font-medium text-neutral-500 mb-1">Exhibition</label>
              <select
                value={locationId}
                onChange={(e) => setLocationId(e.target.value)}
                disabled={!isAdmin || lines.length > 0 || !!editSale}
                className={`${inputClass} disabled:bg-gray-50 disabled:text-neutral-700`}
                title={lines.length > 0 ? "Finish the current bill to change exhibition" : undefined}
              >
                <option value="">Select exhibition</option>
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="sm:col-span-4 relative">
              <label className="block text-xs font-medium text-neutral-500 mb-1">
                Customer mobile <span className="text-neutral-400">(F2)</span>
              </label>
              <div className="relative">
                <input
                  ref={phoneRef}
                  value={phone}
                  inputMode="numeric"
                  maxLength={10}
                  autoFocus
                  placeholder="10-digit mobile (required)"
                  onChange={(e) => {
                    const v = e.target.value.replace(/\D/g, "").slice(0, 10);
                    setPhone(v);
                    if (coupon && v !== coupon.phone && !editSale) {
                      setCoupon(null);
                      toast.info("Coupon removed: it belongs to the previous mobile number");
                    }
                    if (v === NO_PHONE || isValidMobile(v)) scanRef.current?.focus();
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      scanRef.current?.focus();
                    }
                  }}
                  onBlur={() => setTimeout(() => setPhoneSuggestions([]), 150)}
                  className={`${inputClass} pr-9 tracking-wider ${!phoneValid && phone.length === 10 ? "border-red-300 focus:ring-red-400" : ""}`}
                />
                {phone.length === 10 && (
                  <span className="absolute right-3 top-1/2 -translate-y-1/2">
                    {phoneValid ? (
                      <CheckCircle2 className="w-4 h-4 text-green-500" />
                    ) : (
                      <AlertTriangle className="w-4 h-4 text-red-500" />
                    )}
                  </span>
                )}
              </div>
              {phone.length === 10 && !phoneValid && (
                <p className="text-xs text-red-500 mt-1">This looks like a fake number. Use 0000000000 if they won&apos;t give one</p>
              )}
              {phone === NO_PHONE && (
                <p className="text-xs text-neutral-500 mt-1">No number given: the bill won&apos;t go on WhatsApp</p>
              )}
              {visiblePhones.length > 0 && (
                <div className="absolute z-20 mt-1 w-full glass-strong rounded-lg shadow-lg overflow-hidden">
                  {visiblePhones.map((p) => (
                    <button
                      key={p}
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        setPhone(p);
                        if (coupon && p !== coupon.phone && !editSale) setCoupon(null);
                        setPhoneSuggestions([]);
                        scanRef.current?.focus();
                      }}
                      className="block w-full text-left px-3 py-2 text-sm hover:bg-orange-50 tracking-wider"
                    >
                      {p}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="sm:col-span-4 flex items-end gap-2">
              <button
                type="button"
                onClick={() => setHeldOpen(true)}
                className="flex-1 flex items-center justify-center gap-2 px-3 py-2 border border-gray-200 rounded-lg bg-white/80 text-sm font-medium text-neutral-700 hover:bg-white transition-colors"
              >
                <PauseCircle className="w-4 h-4 text-neutral-400" />
                Held bills
                {heldBills.length > 0 && (
                  <span className="min-w-5 h-5 px-1.5 rounded-full bg-orange-500 text-white text-xs flex items-center justify-center">
                    {heldBills.length}
                  </span>
                )}
              </button>
              {!editSale && (lines.length > 0 || phone) && (
                <button
                  type="button"
                  onClick={resetBill}
                  title="Clear this bill"
                  className="p-2 border border-gray-200 rounded-lg bg-white/80 text-neutral-500 hover:text-red-500 hover:bg-white transition-colors"
                >
                  <RotateCcw className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          {/* Scan box */}
          <div className="relative">
            <ScanBarcode className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-orange-500" />
            <input
              ref={scanRef}
              value={scan}
              onChange={(e) => setScan(e.target.value)}
              onKeyDown={handleScanKeyDown}
              onBlur={() => setTimeout(() => setNameMatches([]), 150)}
              placeholder={location ? "Scan barcode, or type a book name  (F3)" : "Select the exhibition to start billing"}
              disabled={!locationId}
              className="w-full pl-11 pr-4 py-3 border-2 border-orange-200 rounded-xl bg-white text-base focus:outline-none focus:border-orange-500 focus:ring-4 focus:ring-orange-500/10 disabled:bg-gray-50 disabled:border-gray-200 transition-colors"
            />
            {visibleMatches.length > 0 && (
              <div className="absolute z-20 mt-1 w-full glass-strong rounded-xl shadow-lg overflow-hidden">
                {visibleMatches.map((m, i) => (
                  <button
                    key={m.item_id}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      addItem(m);
                      setScan("");
                      setNameMatches([]);
                    }}
                    className={`flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left text-sm ${
                      i === activeMatch ? "bg-orange-50" : "hover:bg-gray-50"
                    }`}
                  >
                    <span className="truncate">
                      <span className="font-medium text-neutral-900">{m.name}</span>
                      <span className="text-neutral-400 ml-2 text-xs">{m.category_name}</span>
                    </span>
                    <span className="flex-shrink-0 font-semibold text-neutral-900">{formatRupees(Number(m.price))}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {editSale && (
            <div className="flex items-center gap-3 text-xs text-blue-800 bg-blue-50 border border-blue-100 rounded-lg px-3 py-1.5">
              <span className="flex-1">
                Editing paid bill <b>{editSale.invoice_no}</b>. Change books, qty, price or mobile, then press Cash/UPI/Card
                to save. Bill number and time stay the same.
              </span>
              <button type="button" onClick={() => router.push("/sales")} className="font-semibold hover:underline">
                Cancel edit
              </button>
            </div>
          )}
          {heldSaleId && (
            <p className="text-xs text-orange-700 bg-orange-50 border border-orange-100 rounded-lg px-3 py-1.5">
              Editing held bill{holdRef ? ` "${holdRef}"` : ""}. Finish it with Cash/UPI/Card or hold it again.
            </p>
          )}
        </div>

        {/* Lines */}
        <div ref={tableRef} className="flex-1 overflow-y-auto">
          {lines.length === 0 ? (
            <div className="h-full min-h-48 flex flex-col items-center justify-center text-center p-8">
              <div className="w-14 h-14 rounded-full bg-orange-500/10 flex items-center justify-center mb-3">
                <ScanBarcode className="w-7 h-7 text-orange-500" />
              </div>
              <p className="text-sm font-medium text-neutral-700">Scan a book to start the bill</p>
              <p className="text-xs text-neutral-400 mt-1">or tap a book on the right</p>
              {lastBill && (
                <div className="mt-6 flex items-center gap-3 text-sm text-neutral-600 bg-white/70 border border-gray-100 rounded-xl px-4 py-2.5">
                  <CheckCircle2 className="w-4 h-4 text-green-500" />
                  <span>
                    Last bill <b className="text-neutral-900">{lastBill.invoice_no}</b> · {formatRupees(lastBill.payable)}
                  </span>
                  <button
                    type="button"
                    onClick={() => printReceipt(lastBill.id)}
                    className="flex items-center gap-1 text-orange-600 hover:text-orange-700 font-medium"
                  >
                    <Printer className="w-4 h-4" />
                    Reprint
                  </button>
                </div>
              )}
            </div>
          ) : (
            <table className="w-full min-w-[640px]">
              <thead className="sticky top-0 bg-white/90 backdrop-blur z-10">
                <tr className="border-b border-gray-100 text-xs font-medium text-neutral-500 uppercase tracking-wider">
                  <th className="text-left pl-4 pr-2 py-2.5 w-8">#</th>
                  <th className="text-left px-2 py-2.5">Book</th>
                  <th className="text-center px-2 py-2.5 w-36">Qty</th>
                  <th className="text-right px-2 py-2.5 w-28">Price</th>
                  <th className="text-right px-2 py-2.5 w-24">Disc</th>
                  <th className="text-right px-2 py-2.5 w-28">Amount</th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {lines.map((line, index) => {
                  const { discountAmt, amount } = lineAmounts({
                    qty: num(line.qty),
                    price: num(line.price),
                    discount: line.discount,
                  });
                  return (
                    <tr
                      key={line.key}
                      className={`transition-colors ${flashId === line.key ? "bg-orange-50" : "hover:bg-white/60"}`}
                    >
                      <td className="pl-4 pr-2 py-2 text-sm text-neutral-400">{index + 1}</td>
                      <td className="px-2 py-2">
                        <div className="text-sm font-medium text-neutral-900 leading-snug">{billName(line.name)}</div>
                        <div className="text-xs text-neutral-400 flex items-center gap-2">
                          {line.code}
                          {line.stock !== null && line.stock <= 0 && (
                            <span className="text-amber-600">· not in stock here</span>
                          )}
                        </div>
                      </td>
                      <td className="px-2 py-2">
                        <div className="flex items-center justify-center gap-1">
                          {line.sell_by === "PIECE" && (
                            <button
                              type="button"
                              tabIndex={-1}
                              onClick={() => stepQty(line, -1)}
                              disabled={num(line.qty) <= 1}
                              className="w-7 h-7 rounded-lg border border-gray-200 bg-white flex items-center justify-center text-neutral-500 hover:bg-gray-50 disabled:opacity-40"
                            >
                              <Minus className="w-3.5 h-3.5" />
                            </button>
                          )}
                          <input
                            ref={(el) => {
                              if (el) qtyRefs.current.set(line.key, el);
                              else qtyRefs.current.delete(line.key);
                            }}
                            value={line.qty}
                            inputMode="decimal"
                            onChange={(e) => {
                              const v = line.sell_by === "PIECE"
                                ? e.target.value.replace(/\D/g, "")
                                : e.target.value.replace(/[^\d.]/g, "").replace(/(\..*)\./g, "$1");
                              updateLine(line.key, { qty: v });
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                scanRef.current?.focus();
                              }
                            }}
                            className="w-14 px-1.5 py-1 text-center border border-gray-200 rounded-lg bg-white text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                          />
                          {line.sell_by === "PIECE" ? (
                            <button
                              type="button"
                              tabIndex={-1}
                              onClick={() => stepQty(line, 1)}
                              className="w-7 h-7 rounded-lg border border-gray-200 bg-white flex items-center justify-center text-neutral-500 hover:bg-gray-50"
                            >
                              <Plus className="w-3.5 h-3.5" />
                            </button>
                          ) : (
                            <span className="text-xs text-neutral-400">kg</span>
                          )}
                        </div>
                      </td>
                      <td className="px-2 py-2">
                        <input
                          ref={(el) => {
                            if (el) priceRefs.current.set(line.key, el);
                            else priceRefs.current.delete(line.key);
                          }}
                          value={line.price}
                          inputMode="decimal"
                          onChange={(e) =>
                            updateLine(line.key, {
                              price: e.target.value.replace(/[^\d.]/g, "").replace(/(\..*)\./g, "$1"),
                            })
                          }
                          className="w-full px-2 py-1 text-right border border-transparent hover:border-gray-200 focus:border-gray-200 rounded-lg bg-transparent focus:bg-white text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                        />
                      </td>
                      <td className="px-2 py-2 text-right">
                        {line.discount > 0 ? (
                          <>
                            <div className="text-sm text-green-600">-{discountAmt.toFixed(2)}</div>
                            <div className="text-xs text-neutral-400">{line.discount}%</div>
                          </>
                        ) : (
                          <span className="text-sm text-neutral-300">—</span>
                        )}
                      </td>
                      <td className="px-2 py-2 text-right text-sm font-semibold text-neutral-900">
                        {amount.toFixed(2)}
                      </td>
                      <td className="pr-3 py-2">
                        <button
                          type="button"
                          tabIndex={-1}
                          onClick={() => removeLine(line.key)}
                          className="p-1.5 rounded-lg text-neutral-300 hover:text-red-500 hover:bg-red-50 transition-colors"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Totals + pay */}
        <div className="border-t border-gray-100 p-4 space-y-3">
          {coupon ? (
            <div className="flex items-center gap-2 text-sm rounded-xl border border-green-200 bg-green-50 px-3 py-2">
              <Ticket className="w-4 h-4 text-green-600" />
              <span className="font-semibold text-green-800 tracking-wider">{coupon.code}</span>
              <span className="text-green-700">
                {coupon.pct}% off · -{totals.coupon.toFixed(2)}
              </span>
              {!editSale && (
                <button
                  type="button"
                  onClick={() => setCoupon(null)}
                  title="Remove coupon"
                  className="ml-auto p-1 rounded-md text-green-700 hover:bg-green-100"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          ) : editSale ? null : (
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Ticket className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
                <input
                  ref={couponRef}
                  value={couponInput}
                  onChange={(e) => setCouponInput(e.target.value.toUpperCase())}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      applyCoupon();
                    }
                  }}
                  placeholder="Coupon code  (F6)"
                  className={`${inputClass} pl-9 tracking-wider`}
                />
              </div>
              <button
                type="button"
                onClick={() => applyCoupon()}
                disabled={!couponInput.trim() || couponChecking}
                className="flex items-center gap-1.5 px-4 rounded-lg border border-gray-200 bg-white/80 text-sm font-medium text-neutral-700 hover:bg-white disabled:opacity-50"
              >
                {couponChecking && <Loader2 className="w-4 h-4 animate-spin" />}
                Apply
              </button>
            </div>
          )}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            <Total label="Total qty" value={formatQty(totals.qty)} />
            <Total label="MRP" value={totals.mrp.toFixed(2)} />
            <Total
              label="Discount"
              value={(totals.discount + totals.coupon).toFixed(2)}
              accent={totals.discount + totals.coupon > 0 ? "green" : undefined}
            />
            <Total label="Amount" value={(totals.amount - totals.coupon).toFixed(2)} />
            <div className="col-span-2 sm:col-span-1 rounded-xl bg-orange-500 text-white px-3 py-2">
              <div className="text-[11px] font-medium uppercase tracking-wider text-orange-100">Payable</div>
              <div className="text-2xl font-bold leading-tight">{formatRupees(totals.payable)}</div>
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <PayButton onClick={startHold} disabled={saving} variant="hold" icon={PauseCircle} label="Hold" shortcut="F4" />
            <PayButton onClick={() => startPayment("UPI")} disabled={saving} variant="upi" icon={Smartphone} label="UPI" shortcut="F8" />
            <PayButton
              onClick={() => startPayment("CASH")}
              disabled={saving}
              variant="cash"
              icon={saving ? Loader2 : Banknote}
              label="Cash"
              shortcut="F9"
            />
            <PayButton onClick={() => startPayment("CARD")} disabled={saving} variant="card" icon={CreditCard} label="Card" shortcut="F10" />
          </div>
        </div>
      </section>

      {/* ================= CATALOG ================= */}
      <section className="lg:col-span-4 glass-card rounded-2xl flex flex-col min-h-[50vh] lg:min-h-0">
        <div className="p-4 border-b border-gray-100 grid grid-cols-2 gap-2">
          <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className={inputClass}>
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.sell_by === "KG" ? `${c.name} (By kg)` : c.name}
              </option>
            ))}
          </select>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
            <input
              value={catalogQuery}
              onChange={(e) => setCatalogQuery(e.target.value)}
              placeholder="Filter items"
              className={`${inputClass} pl-9`}
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-3">
          {!locationId ? (
            <p className="text-sm text-neutral-400 text-center py-10">Select the exhibition first</p>
          ) : catalogLoading && catalog.length === 0 ? (
            <div className="flex justify-center py-10">
              <Loader2 className="w-5 h-5 animate-spin text-neutral-400" />
            </div>
          ) : catalog.length === 0 && otherBookCategories.length === 0 ? (
            <p className="text-sm text-neutral-400 text-center py-10">
              No items here. Scan publisher books with the barcode reader.
            </p>
          ) : (
            <div className="grid grid-cols-2 xl:grid-cols-3 gap-2">
              {otherBookCategories.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => addOtherBook(c.id)}
                  disabled={!!addingOther}
                  className="text-left rounded-xl bg-orange-50/60 border border-dashed border-orange-300 p-3 min-h-20 flex flex-col justify-between hover:bg-orange-50 active:scale-[0.98] transition-all disabled:opacity-60"
                >
                  <span className="text-[13px] font-medium text-neutral-900 leading-snug line-clamp-2">{c.name}</span>
                  <span className="flex items-center gap-1 mt-2 text-sm font-bold text-orange-600">
                    {addingOther === c.id && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                    Type price
                  </span>
                </button>
              ))}
              {catalog.map((item) => (
                <button
                  key={item.item_id}
                  type="button"
                  onClick={() => addItem(item)}
                  className="text-left rounded-xl bg-white/80 border border-gray-100 p-3 min-h-20 flex flex-col justify-between hover:border-orange-300 hover:shadow-sm active:scale-[0.98] transition-all"
                >
                  <span className="text-[13px] font-medium text-neutral-900 leading-snug line-clamp-2">{item.name}</span>
                  <span className="flex items-end justify-between gap-1 mt-2">
                    <span className="text-sm font-bold text-orange-600">
                      {Number(item.price) > 0 ? formatRupees(Number(item.price)) : "Type price"}
                    </span>
                    {item.sell_by === "KG" && <span className="text-[11px] text-neutral-400">per kg</span>}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ================= DIALOGS ================= */}
      <Modal open={!!payMode} onClose={() => setPayMode(null)} title={payMode === "UPI" ? "UPI payment" : payMode === "CARD" ? "Card payment" : "Cash payment"}>
        {payMode && (
          <PayDialog
            mode={payMode}
            payable={totals.payable}
            qty={totals.qty}
            saving={saving}
            onConfirm={async () => {
              const ok = await saveBill("PAID", payMode);
              if (ok) setPayMode(null);
            }}
          />
        )}
      </Modal>

      <Modal open={holdOpen} onClose={() => setHoldOpen(false)} title="Hold this bill">
        <HoldDialog
          initialRef={holdRef}
          saving={saving}
          onConfirm={async (ref) => {
            const ok = await saveBill("HELD", undefined, ref);
            if (ok) setHoldOpen(false);
          }}
        />
      </Modal>

      <Modal open={!!picker} onClose={() => setPicker(null)} title="Which one is it?">
        {picker && (
          <PickerDialog
            items={picker}
            onPick={(item) => {
              addItem(item);
              setPicker(null);
            }}
          />
        )}
      </Modal>

      <Modal open={!!unknownCode} onClose={() => setUnknownCode(null)} title="Not in the book list">
        {unknownCode && (
          <UnknownCodeDialog
            code={unknownCode}
            categories={categories.filter((c) => c.sell_by === "PIECE")}
            onPick={async (categoryId) => {
              const result = await billUnknownCode(unknownCode, categoryId, locationId);
              if ("error" in result) return toast.error(result.error ?? "Could not add the book");
              setUnknownCode(null);
              if (result.isNewBook) newBookIds.current.add(result.item.item_id);
              addItem(result.item);
            }}
          />
        )}
      </Modal>

      <Modal open={heldOpen} onClose={() => setHeldOpen(false)} title="Held bills" size="lg">
        <HeldBillsDialog bills={heldBills} onOpen={openHeldBill} onDelete={deleteHeldBill} />
      </Modal>
    </div>
  );
}

function Total({ label, value, accent }: { label: string; value: string; accent?: "green" }) {
  return (
    <div className="rounded-xl bg-white/70 border border-gray-100 px-3 py-2">
      <div className="text-[11px] font-medium uppercase tracking-wider text-neutral-400">{label}</div>
      <div className={`text-lg font-semibold leading-tight ${accent === "green" ? "text-green-600" : "text-neutral-900"}`}>
        {value}
      </div>
    </div>
  );
}

const payVariants = {
  hold: "bg-white border border-gray-200 text-neutral-700 hover:bg-gray-50",
  upi: "bg-neutral-900 text-white hover:bg-neutral-800",
  cash: "bg-orange-500 text-white hover:bg-orange-600",
  card: "bg-blue-600 text-white hover:bg-blue-700",
};

function PayButton({
  onClick,
  disabled,
  variant,
  icon: Icon,
  label,
  shortcut,
}: {
  onClick: () => void;
  disabled: boolean;
  variant: keyof typeof payVariants;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  shortcut: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex items-center justify-center gap-2 py-3 rounded-xl text-base font-semibold transition-colors disabled:opacity-60 ${payVariants[variant]}`}
    >
      <Icon className={`w-5 h-5 ${disabled && variant === "cash" ? "animate-spin" : ""}`} />
      {label}
      <kbd className="hidden md:inline text-[10px] font-medium opacity-70 bg-black/10 rounded px-1.5 py-0.5">{shortcut}</kbd>
    </button>
  );
}
