"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { convertToTaxInvoice } from "@/lib/actions/invoices";
import type { Invoice } from "@/lib/types";
import Link from "next/link";
import { Printer, FileDown, ArrowRightLeft, Loader2, Pencil } from "lucide-react";

interface InvoiceActionsProps {
  invoice: Invoice;
}

export function InvoiceActions({ invoice }: InvoiceActionsProps) {
  const router = useRouter();
  const [loading, setLoading] = useState("");

  async function handleConvert() {
    setLoading("convert");
    const result = await convertToTaxInvoice(invoice.id);
    if (result?.error) {
      alert(result.error);
    } else {
      router.refresh();
    }
    setLoading("");
  }

  async function handlePrint() {
    // Clear title and URL to prevent browser from printing them as headers/footers
    const originalTitle = document.title;
    document.title = " ";
    window.print();
    document.title = originalTitle;
  }

  async function handleDownloadPdf() {
    setLoading("pdf");
    try {
      const { generateInvoicePdf } = await import("@/lib/pdf");
      await generateInvoicePdf(invoice.invoice_number);
    } catch (err) {
      console.error("PDF generation error:", err);
      alert("Failed to generate PDF");
    }
    setLoading("");
  }

  return (
    <div className="flex items-center gap-2 no-print">
      <Link
        href={`/invoices/${invoice.id}/edit`}
        className="px-3 py-2 border border-gray-200 rounded-lg text-sm font-medium text-neutral-700 hover:bg-gray-50 transition-colors flex items-center gap-1.5"
      >
        <Pencil className="w-4 h-4" />
        Edit
      </Link>

      {invoice.type === "DELIVERY_CHALLAN" && (
        <button
          onClick={handleConvert}
          disabled={!!loading}
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm font-medium text-neutral-700 hover:bg-gray-50 transition-colors flex items-center gap-1.5 disabled:opacity-50"
        >
          {loading === "convert" ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <ArrowRightLeft className="w-4 h-4" />
          )}
          Convert to Tax Invoice
        </button>
      )}

      <button
        onClick={handleDownloadPdf}
        disabled={!!loading}
        className="px-3 py-2 border border-gray-200 rounded-lg text-sm font-medium text-neutral-700 hover:bg-gray-50 transition-colors flex items-center gap-1.5 disabled:opacity-50"
      >
        {loading === "pdf" ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <FileDown className="w-4 h-4" />
        )}
        Download PDF
      </button>

      <button
        onClick={handlePrint}
        className="px-3 py-2 bg-orange-500 text-white rounded-lg text-sm font-medium hover:bg-orange-600 transition-colors flex items-center gap-1.5"
      >
        <Printer className="w-4 h-4" />
        Print
      </button>
    </div>
  );
}
