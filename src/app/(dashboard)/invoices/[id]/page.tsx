import { notFound } from "next/navigation";
import { getInvoice } from "@/lib/actions/invoices";
import { formatCurrency, numberToWords } from "@/lib/calculations";
import { PageHeader } from "@/components/ui/page-header";
import { InvoiceActions } from "@/components/invoice-actions";
import { format } from "date-fns";
import Link from "next/link";

export default async function InvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const invoice = await getInvoice(id);

  if (!invoice) notFound();

  const items = invoice.items || [];
  const totalQty = items.reduce((sum, item) => sum + item.quantity, 0);
  const totalGrossAmt = items.reduce((sum, item) => sum + item.quantity * item.price, 0);
  const totalNetAmt = items.reduce((sum, item) => sum + item.amount, 0);
  const freight = invoice.freight_charges || 0;
  const totalBeforeRound = totalNetAmt + freight;
  const roundOff = Math.round(totalBeforeRound) - totalBeforeRound;
  const netPayable = Math.round(totalBeforeRound);

  return (
    <div>
      <div className="no-print">
        <PageHeader
          title={invoice.invoice_number}
          description={invoice.type === "TAX_INVOICE" ? "Tax Invoice" : "Delivery Challan"}
        >
          <Link
            href="/invoices"
            className="px-4 py-2 border border-gray-200 rounded-lg text-sm font-medium text-neutral-700 hover:bg-gray-50 transition-colors"
          >
            Back
          </Link>
          <InvoiceActions invoice={invoice} />
        </PageHeader>
      </div>

      {/* A4 Invoice Preview */}
      <div
        id="invoice-content"
        className="bg-white border border-gray-200 shadow-sm mx-auto flex flex-col"
        style={{ width: "210mm", minHeight: "297mm", padding: "12mm 14mm", fontFamily: "'Segoe UI', system-ui, -apple-system, sans-serif", color: "#000" }}
      >
        {/* === HEADER === */}
        {invoice.entity && (
          <div className="text-center mb-5 pb-3" style={{ borderBottom: "2px solid #000" }}>
            <div className="flex items-center justify-center">
              <div className="relative z-0 flex-shrink-0 overflow-hidden" style={{ width: "90px", height: "68px", marginRight: "-34px" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/logo.png" alt="" className="absolute top-0 left-0" style={{ width: "90px", height: "auto" }} />
              </div>
              <h2 className="relative z-10 uppercase" style={{ fontSize: "22px", fontWeight: 800, color: "#000", letterSpacing: "0.12em" }}>
                {invoice.entity.name}
              </h2>
            </div>
            {invoice.entity.address && (
              <p style={{ fontSize: "11px", color: "#333", marginTop: "4px" }}>{invoice.entity.address}</p>
            )}
            <div className="flex justify-center gap-4 mt-0.5" style={{ fontSize: "11px", color: "#333" }}>
              {invoice.entity.phone && <span>Phone: {invoice.entity.phone}</span>}
              {invoice.entity.email && <span>{invoice.entity.email}</span>}
            </div>
            {invoice.entity.gstin && (
              <p className="font-mono mt-0.5" style={{ fontSize: "11px", color: "#333" }}>
                GSTIN: {invoice.entity.gstin}
              </p>
            )}
            <p className="mt-2" style={{ fontSize: "10px", fontWeight: 700, color: "#000" }}>
              ALL BOOKS UNDER TARIFF ITEM NO - 4901 ARE UNDER GST NIL CATEGORY
            </p>
            <p className="mt-1 uppercase" style={{ fontSize: "13px", fontWeight: 700, color: "#000", letterSpacing: "0.1em" }}>
              {invoice.type === "TAX_INVOICE" ? "Tax Invoice" : "Delivery Challan"}
            </p>
          </div>
        )}

        {/* === BILL TO + INVOICE INFO === */}
        <div className="grid grid-cols-2 gap-6 mb-4 pb-3" style={{ borderBottom: "1px solid #000" }}>
          {invoice.customer && (
            <div>
              <p className="uppercase" style={{ fontSize: "9px", fontWeight: 700, color: "#000", letterSpacing: "0.05em", marginBottom: "3px" }}>Bill To</p>
              <p style={{ fontSize: "13px", fontWeight: 700, color: "#000" }}>{invoice.customer.full_name}</p>
              {invoice.customer.address && (
                <p style={{ fontSize: "11px", color: "#333", marginTop: "2px" }}>{invoice.customer.address}</p>
              )}
              {invoice.customer.phone && (
                <p style={{ fontSize: "11px", color: "#333" }}>Phone: {invoice.customer.phone}</p>
              )}
              {invoice.customer.gst_number && (
                <p className="font-mono" style={{ fontSize: "11px", color: "#333" }}>GSTIN: {invoice.customer.gst_number}</p>
              )}
            </div>
          )}
          <div className="text-right space-y-1">
            <div>
              <span style={{ fontSize: "10px", color: "#555", fontWeight: 500 }}>Invoice No.</span>
              <p style={{ fontSize: "13px", fontWeight: 700, color: "#000" }}>{invoice.invoice_number}</p>
            </div>
            <div>
              <span style={{ fontSize: "10px", color: "#555", fontWeight: 500 }}>Date</span>
              <p style={{ fontSize: "12px", fontWeight: 600, color: "#000" }}>
                {format(new Date(invoice.created_at), "dd-MMM-yyyy")}
              </p>
            </div>
          </div>
        </div>

        {/* === ITEMS TABLE === */}
        <div className="mb-4">
          <table className="w-full" style={{ fontSize: "11px", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ backgroundColor: "#f5f5f5", borderBottom: "2px solid #000" }}>
                <th className="text-left py-2 px-2 uppercase" style={{ fontWeight: 700, color: "#000", fontSize: "10px" }}>S.No</th>
                <th className="text-left py-2 px-2 uppercase" style={{ fontWeight: 700, color: "#000", fontSize: "10px" }}>Pub</th>
                <th className="text-left py-2 px-2 uppercase" style={{ fontWeight: 700, color: "#000", fontSize: "10px" }}>Particulars</th>
                <th className="text-right py-2 px-2 uppercase" style={{ fontWeight: 700, color: "#000", fontSize: "10px" }}>Qty</th>
                <th className="text-right py-2 px-2 uppercase" style={{ fontWeight: 700, color: "#000", fontSize: "10px" }}>Rate</th>
                <th className="text-right py-2 px-2 uppercase" style={{ fontWeight: 700, color: "#000", fontSize: "10px" }}>Gross Amt</th>
                <th className="text-right py-2 px-2 uppercase" style={{ fontWeight: 700, color: "#000", fontSize: "10px" }}>Disc%</th>
                <th className="text-right py-2 px-2 uppercase" style={{ fontWeight: 700, color: "#000", fontSize: "10px" }}>Net Amount</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, index) => {
                const grossAmt = item.quantity * item.price;
                return (
                  <tr key={item.id} style={{ borderBottom: "1px solid #ddd" }}>
                    <td className="py-1.5 px-2" style={{ color: "#666" }}>{index + 1}</td>
                    <td className="py-1.5 px-2" style={{ color: "#333" }}>{item.publisher || "-"}</td>
                    <td className="py-1.5 px-2" style={{ fontWeight: 500, color: "#000" }}>{item.title}</td>
                    <td className="py-1.5 px-2 text-right" style={{ color: "#333" }}>{item.quantity}</td>
                    <td className="py-1.5 px-2 text-right" style={{ color: "#333" }}>{item.price.toFixed(2)}</td>
                    <td className="py-1.5 px-2 text-right" style={{ color: "#333" }}>{grossAmt.toFixed(2)}</td>
                    <td className="py-1.5 px-2 text-right" style={{ color: "#333" }}>{item.discount.toFixed(2)}</td>
                    <td className="py-1.5 px-2 text-right" style={{ fontWeight: 600, color: "#000" }}>{item.amount.toFixed(2)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* === FOOTER (pushed to bottom) === */}
        <div className="mt-auto">
          {/* Totals — hidden when show_total is false (delivery challans without totals) */}
          {invoice.show_total !== false && (
            <table className="w-full mb-3" style={{ fontSize: "11px", borderCollapse: "collapse" }}>
              <tbody>
                <tr style={{ backgroundColor: "#f5f5f5", borderTop: "2px solid #000", borderBottom: "2px solid #000" }}>
                  <td className="py-2 px-2 text-right" style={{ width: "37%", fontWeight: 700, color: "#000" }}>Total:</td>
                  <td className="py-2 px-2 text-right" style={{ width: "9%", fontWeight: 700, color: "#000" }}>{totalQty}</td>
                  <td className="py-2 px-2" style={{ width: "12%" }}></td>
                  <td className="py-2 px-2 text-right" style={{ width: "14%", fontWeight: 700, color: "#000" }}>{totalGrossAmt.toFixed(2)}</td>
                  <td className="py-2 px-2" style={{ width: "9%" }}></td>
                  <td className="py-2 px-2 text-right" style={{ width: "14%", fontWeight: 700, color: "#000" }}>{totalNetAmt.toFixed(2)}</td>
                </tr>
                {freight > 0 && (
                  <tr>
                    <td colSpan={5} className="py-1 px-2 text-right" style={{ color: "#555" }}>Freight Charges</td>
                    <td className="py-1 px-2 text-right" style={{ fontWeight: 600, color: "#000" }}>{freight.toFixed(2)}</td>
                  </tr>
                )}
                {Math.abs(roundOff) > 0.001 && (
                  <tr>
                    <td colSpan={5} className="py-1 px-2 text-right" style={{ color: "#555" }}>Round Off</td>
                    <td className="py-1 px-2 text-right" style={{ fontWeight: 600, color: "#000" }}>{roundOff >= 0 ? "+" : "-"}{Math.abs(roundOff).toFixed(2)}</td>
                  </tr>
                )}
                <tr style={{ borderTop: "2px solid #000" }}>
                  <td colSpan={3} className="py-2 px-2" style={{ fontSize: "11px", color: "#000" }}>
                    <span style={{ fontWeight: 700 }}>Amount in Words:</span>{" "}
                    <span className="italic">{numberToWords(netPayable)}</span>
                  </td>
                  <td colSpan={2} className="py-2 px-2 text-right" style={{ fontWeight: 800, color: "#000", fontSize: "12px" }}>NET Amount Payable</td>
                  <td className="py-2 px-2 text-right" style={{ fontWeight: 800, color: "#000", fontSize: "13px" }}>{formatCurrency(netPayable)}</td>
                </tr>
              </tbody>
            </table>
          )}

          {/* Remarks */}
          {invoice.notes && (
            <div className="mb-3">
              <p style={{ fontSize: "11px" }}>
                <span style={{ fontWeight: 700, color: "#000" }}>Remarks:</span>{" "}
                <span style={{ color: "#333" }}>{invoice.notes}</span>
              </p>
            </div>
          )}

          {/* Bank Details (left) + Authorised Signatory (right) */}
          <div className="grid grid-cols-2 gap-4 mt-3 pt-2" style={{ borderTop: "1px solid #000" }}>
            {invoice.entity?.account_number ? (
              <div>
                <p className="uppercase" style={{ fontWeight: 700, color: "#000", fontSize: "9px", letterSpacing: "0.05em", marginBottom: "2px" }}>Bank Details</p>
                <div style={{ fontSize: "9px", color: "#333", lineHeight: "1.4" }}>
                  <p><span style={{ fontWeight: 600, color: "#000" }}>Account No.:</span> {invoice.entity.account_number}</p>
                  <p><span style={{ fontWeight: 600, color: "#000" }}>Account Type:</span> Current</p>
                  <p><span style={{ fontWeight: 600, color: "#000" }}>IFSC Code:</span> {invoice.entity.branch_ifsc}</p>
                  <p><span style={{ fontWeight: 600, color: "#000" }}>Branch:</span> {invoice.entity.branch_name}</p>
                </div>
              </div>
            ) : <div />}
            <div className="text-right">
              <p style={{ fontSize: "10px", fontWeight: 700, color: "#000", marginBottom: "2px" }}>
                For {invoice.entity?.name || ""}
              </p>
              <div className="ml-auto overflow-hidden" style={{ width: "120px", height: "45px", marginBottom: "2px" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/signature.png" alt="Signature" style={{ width: "120px", height: "auto", display: "block" }} />
              </div>
              <p style={{ fontSize: "9px", color: "#555", borderTop: "1px solid #000", display: "inline-block", paddingTop: "2px", paddingLeft: "20px", paddingRight: "2px" }}>
                Authorised Signatory
              </p>
            </div>
          </div>

          {/* Terms & Conditions */}
          <div className="mt-3 pt-2" style={{ borderTop: "1px solid #ccc" }}>
            <p style={{ fontSize: "10px", color: "#555" }}>
              <span style={{ fontWeight: 700, color: "#000" }}>Terms &amp; Conditions:</span> Goods once sold will not be taken back.
            </p>
          </div>

          {/* Computer generated note */}
          <div className="mt-3 pt-2 text-center" style={{ borderTop: "1px solid #ccc" }}>
            <p style={{ fontSize: "9px", color: "#999" }}>
              This is a Computer Generated Invoice, No signature required.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
