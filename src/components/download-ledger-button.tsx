"use client";

import { useState } from "react";
import { Download, Loader2 } from "lucide-react";
import type { Customer, Invoice, Payment } from "@/lib/types";

interface DownloadLedgerButtonProps {
  customer: Customer;
  invoices: Invoice[];
  payments: Payment[];
  totalInvoiced: number;
  totalPaid: number;
  pendingAmount: number;
}

export function DownloadLedgerButton({
  customer,
  invoices,
  payments,
  totalInvoiced,
  totalPaid,
  pendingAmount,
}: DownloadLedgerButtonProps) {
  const [loading, setLoading] = useState(false);

  async function handleDownload() {
    setLoading(true);
    try {
      const { jsPDF } = await import("jspdf");
      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 15;
      const contentWidth = pageWidth - margin * 2;
      let y = margin;
      const bottomLimit = pageHeight - margin;
      const rowHeight = 7;

      function ensureSpace(needed: number) {
        if (y + needed > bottomLimit) {
          pdf.addPage();
          y = margin;
        }
      }

      const formatAmt = (amt: number) =>
        `Rs. ${Number(amt).toLocaleString("en-IN")}`;

      const formatDate = (dateStr: string) =>
        new Date(dateStr).toLocaleDateString("en-IN", {
          day: "2-digit",
          month: "short",
          year: "numeric",
        });

      // ── Header ──
      pdf.setFontSize(18);
      pdf.setFont("helvetica", "bold");
      pdf.text("BooksPlaza", margin, y);
      y += 8;

      pdf.setFontSize(12);
      pdf.setFont("helvetica", "normal");
      pdf.text("Customer Ledger", margin, y);
      y += 10;

      // ── Customer info ──
      pdf.setFontSize(11);
      pdf.setFont("helvetica", "bold");
      pdf.text(`Customer: ${customer.full_name}`, margin, y);
      y += 6;
      pdf.setFont("helvetica", "normal");
      if (customer.phone) {
        pdf.text(`Phone: ${customer.phone}`, margin, y);
        y += 6;
      }

      const today = new Date().toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });
      pdf.text(`Date: ${today}`, margin, y);
      y += 10;

      pdf.setDrawColor(200);
      pdf.line(margin, y, pageWidth - margin, y);
      y += 8;

      // ── Helper: draw a table header row ──
      function drawTableHeader(cols: { label: string; x: number; width: number; align?: string }[]) {
        ensureSpace(12);
        pdf.setFontSize(10);
        pdf.setFont("helvetica", "bold");
        pdf.setFillColor(245, 245, 245);
        pdf.rect(margin, y - 4, contentWidth, 8, "F");
        cols.forEach((col) => {
          if (col.align === "right") {
            pdf.text(col.label, col.x + col.width, y, { align: "right" });
          } else {
            pdf.text(col.label, col.x, y);
          }
        });
        y += 8;
        pdf.setFont("helvetica", "normal");
      }

      // ── Invoices Table ──
      if (invoices.length > 0) {
        ensureSpace(20);
        pdf.setFontSize(13);
        pdf.setFont("helvetica", "bold");
        pdf.text("Invoices", margin, y);
        y += 8;

        const invCols = [
          { label: "Invoice #", x: margin, width: 35 },
          { label: "Date", x: margin + 40, width: 45 },
          { label: "Amount", x: pageWidth - margin - 40, width: 40, align: "right" },
        ];

        drawTableHeader(invCols);

        invoices.forEach((inv) => {
          // If not enough room for a row, add page and re-draw header
          if (y + rowHeight > bottomLimit) {
            pdf.addPage();
            y = margin;
            drawTableHeader(invCols);
          }

          pdf.setFontSize(10);
          pdf.setFont("helvetica", "normal");
          pdf.text(String(inv.invoice_number), invCols[0].x, y);
          pdf.text(formatDate(inv.created_at), invCols[1].x, y);
          pdf.text(
            formatAmt(inv.grand_total),
            invCols[2].x + invCols[2].width,
            y,
            { align: "right" }
          );
          y += rowHeight;
        });

        y += 3;
        ensureSpace(5);
        pdf.setDrawColor(200);
        pdf.line(margin, y, pageWidth - margin, y);
        y += 8;
      }

      // ── Payment History Table ──
      if (payments.length > 0) {
        ensureSpace(20);
        pdf.setFontSize(13);
        pdf.setFont("helvetica", "bold");
        pdf.text("Payment History", margin, y);
        y += 8;

        const payCols = [
          { label: "Date", x: margin, width: 35 },
          { label: "Amount", x: margin + 40, width: 35 },
          { label: "Method", x: margin + 80, width: 30 },
          { label: "Notes", x: margin + 115, width: 50 },
        ];

        drawTableHeader(payCols);

        payments.forEach((payment) => {
          if (y + rowHeight > bottomLimit) {
            pdf.addPage();
            y = margin;
            drawTableHeader(payCols);
          }

          pdf.setFontSize(10);
          pdf.setFont("helvetica", "normal");
          pdf.text(formatDate(payment.created_at), payCols[0].x, y);
          pdf.text(formatAmt(payment.amount), payCols[1].x, y);
          pdf.text(payment.mode || "", payCols[2].x, y);
          const notes = payment.notes || "-";
          const truncated =
            notes.length > 30 ? notes.substring(0, 27) + "..." : notes;
          pdf.text(truncated, payCols[3].x, y);
          y += rowHeight;
        });
      }

      // ── Account Summary ──
      y += 5;
      ensureSpace(40);
      pdf.setDrawColor(200);
      pdf.line(margin, y, pageWidth - margin, y);
      y += 8;

      const rightX = pageWidth - margin;
      const labelX = rightX - 70;

      pdf.setFontSize(13);
      pdf.setFont("helvetica", "bold");
      pdf.text("Account Summary", rightX, y, { align: "right" });
      y += 8;

      pdf.setFontSize(11);
      pdf.setFont("helvetica", "normal");
      pdf.text("Total Invoiced:", labelX, y);
      pdf.text(formatAmt(totalInvoiced), rightX, y, { align: "right" });
      y += 7;

      pdf.text("Total Paid:", labelX, y);
      pdf.setTextColor(34, 139, 34);
      pdf.text(formatAmt(totalPaid), rightX, y, { align: "right" });
      pdf.setTextColor(0);
      y += 7;

      pdf.setFont("helvetica", "bold");
      pdf.text("Total Pending:", labelX, y);
      if (pendingAmount > 0) pdf.setTextColor(220, 120, 0);
      pdf.text(formatAmt(pendingAmount), rightX, y, { align: "right" });
      pdf.setTextColor(0);

      pdf.save(`Ledger_${customer.full_name.replace(/\s+/g, "_")}.pdf`);
    } catch (err) {
      console.error("PDF generation failed:", err);
      alert("Failed to generate PDF. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleDownload}
      disabled={loading}
      className="px-4 py-2 bg-orange-500 text-white rounded-lg text-sm font-medium hover:bg-orange-600 transition-colors disabled:opacity-50 flex items-center gap-1.5"
    >
      {loading ? (
        <Loader2 className="w-4 h-4 animate-spin" />
      ) : (
        <Download className="w-4 h-4" />
      )}
      {loading ? "Generating..." : "Download Ledger"}
    </button>
  );
}
