import { notFound } from "next/navigation";
import { getSale } from "@/lib/actions/sales";
import { Receipt } from "@/components/pos/receipt";
import { AutoPrint } from "@/components/pos/auto-print";

export default async function ReceiptPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ print?: string }>;
}) {
  const { id } = await params;
  const { print } = await searchParams;
  const sale = await getSale(id);
  if (!sale || sale.status === "HELD") notFound();

  return (
    <div className="bg-white min-h-screen">
      <style>{`
        @page { size: 80mm auto; margin: 0; }
        body { background: white !important; }
      `}</style>
      <div className="mx-auto p-[4mm]" style={{ width: "80mm" }}>
        <Receipt
          cancelled={sale.status === "CANCELLED"}
          data={{
            invoice_no: sale.invoice_no,
            paid_at: sale.paid_at,
            payment_mode: sale.payment_mode,
            total_qty: sale.total_qty,
            total_mrp: sale.total_mrp,
            total_discount: sale.total_discount,
            payable: sale.payable,
            coupon_discount: sale.coupon_discount,
            location_name: sale.location?.name ?? "",
            location_address: sale.location?.address ?? "",
            items: sale.items ?? [],
          }}
        />
      </div>
      {print === "1" && <AutoPrint />}
    </div>
  );
}
