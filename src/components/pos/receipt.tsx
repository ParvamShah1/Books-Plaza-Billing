import { format } from "date-fns";
import { BUSINESS } from "@/lib/pos/business";
import { formatQty } from "@/lib/pos/billing";

export type ReceiptData = {
  invoice_no: string | null;
  paid_at: string | null;
  payment_mode: string | null;
  total_qty: number;
  total_mrp: number;
  total_discount: number;
  payable: number;
  coupon_code?: string | null;
  coupon_discount?: number;
  next_coupon?: { code: string; discount_pct: number } | null;
  location_name: string;
  location_address: string;
  items: { name: string; qty: number; price: number; discount_amt: number; amount: number }[];
};

function money(n: number) {
  return Number(n).toFixed(2);
}

// Item columns are narrow on 80mm paper: drop ".00" for whole rupees
function compact(n: number) {
  const v = Number(n);
  return Number.isInteger(v) ? String(v) : v.toFixed(2);
}

// 80mm thermal receipt. Also used (wider) for the public bill page.
export function Receipt({ data, cancelled = false }: { data: ReceiptData; cancelled?: boolean }) {
  const couponDiscount = Number(data.coupon_discount ?? 0);
  const savings = Number(data.total_discount) + couponDiscount;

  return (
    <div className="receipt text-black bg-white" style={{ fontFamily: "'Segoe UI', system-ui, sans-serif" }}>
      <div className="text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/booksplaza-logo.png" alt={BUSINESS.name} className="mx-auto h-14 w-auto" />
        <p className="font-bold text-base mt-2">{data.location_name}</p>
        {data.location_address && <p className="text-xs">{data.location_address}</p>}
        <p className="text-xs mt-1">Ph: {BUSINESS.phone}</p>
        <p className="text-xs">{BUSINESS.email}</p>
        <p className="text-xs">GSTIN: {BUSINESS.gstin}</p>
      </div>

      {cancelled && (
        <p className="text-center font-bold text-sm border border-black my-2 py-1">CANCELLED</p>
      )}

      <div className="border-t border-dashed border-black my-2" />
      <div className="flex justify-between text-xs">
        <span>Bill: <b>{data.invoice_no}</b></span>
        <span>{data.payment_mode}</span>
      </div>
      {data.paid_at && (
        <p className="text-xs">{format(new Date(data.paid_at), "dd/MM/yyyy hh:mm a")}</p>
      )}
      <div className="border-t border-dashed border-black my-2" />

      <table className="w-full table-fixed text-xs">
        <colgroup>
          <col />
          <col style={{ width: "11%" }} />
          <col style={{ width: "21%" }} />
          <col style={{ width: "23%" }} />
        </colgroup>
        <thead>
          <tr className="border-b border-black">
            <th className="text-left font-semibold py-1">Item</th>
            <th className="text-right font-semibold py-1 pl-2">Qty</th>
            <th className="text-right font-semibold py-1 pl-2">Rate</th>
            <th className="text-right font-semibold py-1 pl-2">Amt</th>
          </tr>
        </thead>
        <tbody>
          {data.items.map((item, i) => (
            <tr key={i} className="align-top">
              <td className="py-1 pr-1 break-words">
                {item.name}
                {Number(item.discount_amt) > 0 && (
                  <div className="text-[10px]">Disc -{compact(item.discount_amt)}</div>
                )}
              </td>
              <td className="py-1 pl-2 text-right whitespace-nowrap tabular-nums">{formatQty(Number(item.qty))}</td>
              <td className="py-1 pl-2 text-right whitespace-nowrap tabular-nums">{compact(item.price)}</td>
              <td className="py-1 pl-2 text-right whitespace-nowrap tabular-nums">{compact(item.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="border-t border-dashed border-black my-2" />
      <div className="text-xs space-y-0.5">
        <div className="flex justify-between"><span>Total qty</span><span>{formatQty(Number(data.total_qty))}</span></div>
        <div className="flex justify-between"><span>MRP total</span><span>{money(data.total_mrp)}</span></div>
        {Number(data.total_discount) > 0 && (
          <div className="flex justify-between"><span>Discount</span><span>-{money(data.total_discount)}</span></div>
        )}
        {couponDiscount > 0 && (
          <div className="flex justify-between"><span>Coupon {data.coupon_code}</span><span>-{money(couponDiscount)}</span></div>
        )}
      </div>
      <div className="flex justify-between font-bold text-base border-t border-black mt-1 pt-1">
        <span>Total</span>
        <span>₹{money(data.payable)}</span>
      </div>
      {savings > 0 && (
        <p className="text-center text-xs font-semibold mt-1">You saved ₹{money(savings)}</p>
      )}

      {data.next_coupon && !cancelled && (
        <div className="border border-black border-dashed rounded mt-3 p-2 text-center">
          <p className="text-xs font-semibold">Your gift for the next visit</p>
          <p className="text-lg font-bold tracking-widest">{data.next_coupon.code}</p>
          <p className="text-[11px]">
            {Number(data.next_coupon.discount_pct)}% off your next bill at any Books Plaza exhibition. Valid once,
            only for the mobile number on this bill.
          </p>
        </div>
      )}

      <div className="border-t border-dashed border-black my-2" />
      {BUSINESS.footer.map((line) => (
        <p key={line} className="text-center text-xs font-semibold">{line}</p>
      ))}
    </div>
  );
}
