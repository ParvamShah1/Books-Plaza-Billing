"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { checkCoupon, searchCustomerPhones, sendBillWhatsApp } from "@/lib/actions/sales";
import { sendPurchaseToMeta } from "@/lib/actions/meta";
import { billTotals, formatQty, formatRupees, isValidMobile, lineAmounts } from "@/lib/pos/billing";
import type { Category, CurrentStaff, Location, PaymentMode, PosItem, SellBy } from "@/lib/pos/types";
import { toast } from "@/components/ui/toast";
import { Modal } from "@/components/ui/modal";
import { PayDialog, HoldDialog, PickerDialog, HeldBillsDialog, type HeldBill } from "@/components/pos/pos-dialogs";
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
} from "lucide-react";

type Line = {
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
}: {
  locations: Location[];
  categories: Category[];
  staff: CurrentStaff;
}) {
  const supabase = useMemo(() => createClient(), []);
  const isAdmin = staff.role === "ADMIN";

  const [locationId, setLocationId] = useState(
    (!isAdmin && staff.location_id) || (locations.length === 1 ? locations[0].id : "")
  );
  const [phone, setPhone] = useState("");
  const [phoneSuggestions, setPhoneSuggestions] = useState<string[]>([]);
  const [lines, setLines] = useState<Line[]>([]);
  const [heldSaleId, setHeldSaleId] = useState<string | null>(null);
  const [holdRef, setHoldRef] = useState("");
  const [scan, setScan] = useState("");
  const [nameMatches, setNameMatches] = useState<PosItem[]>([]);
  const [activeMatch, setActiveMatch] = useState(0);
  const [picker, setPicker] = useState<PosItem[] | null>(null);
  const [payMode, setPayMode] = useState<PaymentMode | null>(null);
  const [holdOpen, setHoldOpen] = useState(false);
  const [heldOpen, setHeldOpen] = useState(false);
  const [heldBills, setHeldBills] = useState<HeldBill[]>([]);
  const [saving, setSaving] = useState(false);
  const [lastBill, setLastBill] = useState<LastBill | null>(null);
  const [flashId, setFlashId] = useState<string | null>(null);
  const [coupon, setCoupon] = useState<{ code: string; pct: number; phone: string } | null>(null);
  const [couponInput, setCouponInput] = useState("");
  const [couponChecking, setCouponChecking] = useState(false);

  // Catalog panel
  const [categoryId, setCategoryId] = useState("");
  const [catalogQuery, setCatalogQuery] = useState("");
  const [catalog, setCatalog] = useState<PosItem[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);

  const phoneRef = useRef<HTMLInputElement>(null);
  const scanRef = useRef<HTMLInputElement>(null);
  const couponRef = useRef<HTMLInputElement>(null);
  const tableRef = useRef<HTMLDivElement>(null);
  const qtyRefs = useRef(new Map<string, HTMLInputElement>());
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
  const phoneValid = phone === "" || isValidMobile(phone);
  const visibleMatches = canNameSearch(scan.trim()) ? nameMatches : [];
  const visiblePhones = canSuggestPhone(phone) ? phoneSuggestions : [];
  const anyDialogOpen = !!picker || !!payMode || holdOpen || heldOpen;

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
  useEffect(() => {
    if (!locationId) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      setCatalogLoading(true);
      const { data, error } = await supabase.rpc("pos_items", {
        p_location: locationId,
        p_query: catalogQuery || null,
        p_category: categoryId || null,
        p_limit: 60,
      });
      if (cancelled) return;
      setCatalogLoading(false);
      if (error) toast.error(error.message);
      else setCatalog(data as PosItem[]);
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
    setLines((prev) => {
      const existing = prev.find((l) => l.item_id === item.item_id);
      if (existing) {
        if (existing.sell_by === "KG") return prev;
        return prev.map((l) => (l.item_id === item.item_id ? { ...l, qty: String(num(l.qty) + 1) } : l));
      }
      return [
        ...prev,
        {
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
    setFlashId(item.item_id);
    setTimeout(() => setFlashId((id) => (id === item.item_id ? null : id)), 700);

    // Weight items: jump to the qty box so the cashier types the kg
    setTimeout(() => {
      const qtyInput = qtyRefs.current.get(item.item_id);
      if (item.sell_by === "KG" && qtyInput) {
        qtyInput.focus();
        qtyInput.select();
      } else {
        qtyInput?.scrollIntoView({ block: "nearest" });
        scanRef.current?.focus();
      }
    }, 0);
  }, []);

  function updateLine(itemId: string, patch: Partial<Line>) {
    setLines((prev) => prev.map((l) => (l.item_id === itemId ? { ...l, ...patch } : l)));
  }

  function stepQty(line: Line, delta: number) {
    const next = Math.max(1, Math.round(num(line.qty)) + delta);
    updateLine(line.item_id, { qty: String(next) });
  }

  function removeLine(itemId: string) {
    setLines((prev) => prev.filter((l) => l.item_id !== itemId));
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
      toast.error(`No book found for "${code}"`);
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
  function validateBill(): boolean {
    if (!locationId) {
      toast.error("Select the exhibition first");
      return false;
    }
    if (lines.length === 0) {
      toast.error("Add at least one book");
      return false;
    }
    if (phone && !isValidMobile(phone)) {
      toast.error("Enter a real 10-digit mobile number, or leave it empty");
      phoneRef.current?.focus();
      return false;
    }
    const bad = lines.find((l) => num(l.qty) <= 0 || (l.sell_by === "PIECE" && !Number.isInteger(num(l.qty))));
    if (bad) {
      toast.error(`Check the quantity of "${bad.name}"`);
      qtyRefs.current.get(bad.item_id)?.focus();
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

  async function saveBill(status: "HELD" | "PAID", mode?: PaymentMode, ref?: string) {
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
      if (phone) {
        sendBillWhatsApp(result.id).then((r) => {
          if ("error" in r) toast.error(`Bill ${result.invoice_no}: ${r.error}`);
        });
        // Ad tracking only: failures are logged on the server, the cashier doesn't need to know
        sendPurchaseToMeta(result.id);
      }
      setLastBill({ id: result.id, invoice_no: result.invoice_no!, payable: Number(result.payable) });
      toast.success(
        result.coupon ? `Bill ${result.invoice_no} saved · coupon ${result.coupon}` : `Bill ${result.invoice_no} saved`
      );
    } else {
      toast.success("Bill put on hold");
    }
    resetBill();
    loadHeldBills();
    return true;
  }

  function startPayment(mode: PaymentMode) {
    if (saving || !validateBill()) return;
    setPayMode(mode);
  }

  function startHold() {
    if (saving || !validateBill()) return;
    setHoldOpen(true);
  }

  async function openHeldBill(bill: HeldBill) {
    if (lines.length > 0) {
      toast.error("Finish or hold the current bill first");
      return;
    }
    const { data, error } = await supabase
      .from("sale_items")
      .select("item_id, name, qty, price, discount, item:items(code, category:categories(sell_by))")
      .eq("sale_id", bill.id)
      .order("sort_order");
    if (error) {
      toast.error(error.message);
      return;
    }

    type Row = {
      item_id: string;
      name: string;
      qty: number;
      price: number;
      discount: number;
      item: { code: string; category: { sell_by: SellBy } | null } | null;
    };
    setLines(
      (data as unknown as Row[]).map((r) => ({
        item_id: r.item_id,
        name: r.name,
        code: r.item?.code ?? "",
        sell_by: r.item?.category?.sell_by ?? "PIECE",
        qty: String(Number(r.qty)),
        price: String(Number(r.price)),
        discount: Number(r.discount),
        stock: null,
      }))
    );
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
                disabled={!isAdmin || lines.length > 0}
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
                  placeholder="10-digit mobile"
                  onChange={(e) => {
                    const v = e.target.value.replace(/\D/g, "").slice(0, 10);
                    setPhone(v);
                    if (coupon && v !== coupon.phone) {
                      setCoupon(null);
                      toast.info("Coupon removed: it belongs to the previous mobile number");
                    }
                    if (v.length === 10 && isValidMobile(v)) scanRef.current?.focus();
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
                <p className="text-xs text-red-500 mt-1">This looks like a fake number</p>
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
                        if (coupon && p !== coupon.phone) setCoupon(null);
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
              {(lines.length > 0 || phone) && (
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

          {heldSaleId && (
            <p className="text-xs text-orange-700 bg-orange-50 border border-orange-100 rounded-lg px-3 py-1.5">
              Editing held bill{holdRef ? ` "${holdRef}"` : ""}. Finish it with Cash/UPI or hold it again.
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
                      key={line.item_id}
                      className={`transition-colors ${flashId === line.item_id ? "bg-orange-50" : "hover:bg-white/60"}`}
                    >
                      <td className="pl-4 pr-2 py-2 text-sm text-neutral-400">{index + 1}</td>
                      <td className="px-2 py-2">
                        <div className="text-sm font-medium text-neutral-900 leading-snug">{line.name}</div>
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
                              if (el) qtyRefs.current.set(line.item_id, el);
                              else qtyRefs.current.delete(line.item_id);
                            }}
                            value={line.qty}
                            inputMode="decimal"
                            onChange={(e) => {
                              const v = line.sell_by === "PIECE"
                                ? e.target.value.replace(/\D/g, "")
                                : e.target.value.replace(/[^\d.]/g, "").replace(/(\..*)\./g, "$1");
                              updateLine(line.item_id, { qty: v });
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
                          value={line.price}
                          inputMode="decimal"
                          onChange={(e) =>
                            updateLine(line.item_id, {
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
                          onClick={() => removeLine(line.item_id)}
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
              <button
                type="button"
                onClick={() => setCoupon(null)}
                title="Remove coupon"
                className="ml-auto p-1 rounded-md text-green-700 hover:bg-green-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
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
          <div className="grid grid-cols-3 gap-2">
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
          </div>
        </div>
      </section>

      {/* ================= CATALOG ================= */}
      <section className="lg:col-span-4 glass-card rounded-2xl flex flex-col min-h-[50vh] lg:min-h-0">
        <div className="p-4 border-b border-gray-100 space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
            <input
              value={catalogQuery}
              onChange={(e) => setCatalogQuery(e.target.value)}
              placeholder="Search books"
              className={`${inputClass} pl-9`}
            />
          </div>
          <div className="flex gap-1.5 overflow-x-auto pb-1 -mb-1">
            <CategoryChip active={categoryId === ""} onClick={() => setCategoryId("")} label="All" />
            {categories.map((c) => (
              <CategoryChip
                key={c.id}
                active={categoryId === c.id}
                onClick={() => setCategoryId(c.id)}
                label={c.sell_by === "KG" ? `${c.name} · kg` : c.name}
              />
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-3">
          {!locationId ? (
            <p className="text-sm text-neutral-400 text-center py-10">Select the exhibition to see books</p>
          ) : catalogLoading && catalog.length === 0 ? (
            <div className="flex justify-center py-10">
              <Loader2 className="w-5 h-5 animate-spin text-neutral-400" />
            </div>
          ) : catalog.length === 0 ? (
            <p className="text-sm text-neutral-400 text-center py-10">No books found</p>
          ) : (
            <div className="grid grid-cols-2 xl:grid-cols-3 gap-2">
              {catalog.map((item) => (
                <button
                  key={item.item_id}
                  type="button"
                  onClick={() => addItem(item)}
                  className="text-left rounded-xl bg-white/80 border border-gray-100 p-3 hover:border-orange-300 hover:shadow-sm active:scale-[0.98] transition-all"
                >
                  <div className="text-[13px] font-medium text-neutral-900 leading-snug line-clamp-2 min-h-[2.4em]">
                    {item.name}
                  </div>
                  <div className="flex items-end justify-between mt-2">
                    <span className="text-sm font-bold text-orange-600">{formatRupees(Number(item.price))}</span>
                    <span className={`text-[11px] ${Number(item.stock) > 0 ? "text-neutral-400" : "text-amber-600"}`}>
                      {Number(item.stock) > 0 ? `${formatQty(Number(item.stock))} left` : "no stock"}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ================= DIALOGS ================= */}
      <Modal open={!!payMode} onClose={() => setPayMode(null)} title={payMode === "UPI" ? "UPI payment" : "Cash payment"}>
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

function CategoryChip({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
        active ? "bg-orange-500 text-white" : "bg-white/80 border border-gray-200 text-neutral-600 hover:bg-white"
      }`}
    >
      {label}
    </button>
  );
}
