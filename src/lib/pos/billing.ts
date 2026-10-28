// Shared by the billing screen and receipts. Must match save_sale in pos_inventory.sql.

const DUMMY_NUMBERS = new Set([
  "9876543210",
  "9898989898",
  "9090909090",
  "9999999999",
  "8888888888",
  "7777777777",
  "6666666666",
]);

// Real Indian mobile: 10 digits, starts 6-9, not a common fake number
export function isValidMobile(phone: string): boolean {
  if (!/^[6-9]\d{9}$/.test(phone)) return false;
  if (DUMMY_NUMBERS.has(phone)) return false;
  if (/^(\d)\1+$/.test(phone)) return false;
  return true;
}

export type BillLine = {
  qty: number;
  price: number;
  discount: number;
};

export function lineAmounts(line: BillLine) {
  const gross = round2(line.qty * line.price);
  const discountAmt = round2((gross * line.discount) / 100);
  return { gross, discountAmt, amount: round2(gross - discountAmt) };
}

// couponPct: one-time coupon, taken off after category discounts (same as save_sale)
export function billTotals(lines: BillLine[], couponPct = 0) {
  let qty = 0;
  let mrp = 0;
  let discount = 0;
  for (const line of lines) {
    const { gross, discountAmt } = lineAmounts(line);
    qty += line.qty;
    mrp += gross;
    discount += discountAmt;
  }
  const amount = round2(mrp - discount);
  const coupon = round2((amount * couponPct) / 100);
  return {
    qty: Math.round(qty * 1000) / 1000,
    mrp: round2(mrp),
    discount: round2(discount),
    amount,
    coupon,
    payable: Math.round(amount - coupon),
  };
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function formatRupees(amount: number, decimals = 0): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(amount);
}

export function formatQty(qty: number): string {
  return Number.isInteger(qty) ? String(qty) : qty.toFixed(3).replace(/0+$/, "");
}
