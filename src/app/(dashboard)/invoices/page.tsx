"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { getInvoices } from "@/lib/actions/invoices";
import { formatCurrency } from "@/lib/calculations";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import type { Invoice } from "@/lib/types";
import { FileText, Plus, Search, ChevronLeft, ChevronRight } from "lucide-react";
import { format } from "date-fns";

const PAGE_SIZE = 20;

export default function InvoicesPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("");

  const totalPages = Math.ceil(total / PAGE_SIZE);

  const loadInvoices = useCallback(async () => {
    setLoading(true);
    const data = await getInvoices({
      type: typeFilter || undefined,
      search: search || undefined,
      page,
      pageSize: PAGE_SIZE,
    });
    setInvoices(data.invoices);
    setTotal(data.total);
    setLoading(false);
  }, [search, typeFilter, page]);

  useEffect(() => {
    loadInvoices();
  }, [loadInvoices]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setPage(1);
  }, [search, typeFilter]);

  return (
    <div>
      <PageHeader title="Invoices" description="Manage all your invoices and challans">
        <Link
          href="/invoices/new"
          className="px-4 py-2 bg-orange-500 text-white rounded-lg text-sm font-medium hover:bg-orange-600 transition-colors flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          New Invoice
        </Link>
      </PageHeader>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-6">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
          <input
            type="text"
            placeholder="Search by invoice number..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent text-sm w-64"
          />
        </div>

        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent text-sm"
        >
          <option value="">All Types</option>
          <option value="TAX_INVOICE">Tax Invoice</option>
          <option value="DELIVERY_CHALLAN">Delivery Challan</option>
        </select>
      </div>

      {/* Table */}
      {loading ? (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden animate-pulse">
          <div className="flex items-center gap-4 px-6 py-3 border-b border-gray-200">
            <div className="h-4 w-24 bg-gray-200 rounded" />
            <div className="h-4 w-28 bg-gray-200 rounded" />
            <div className="h-4 w-16 bg-gray-200 rounded" />
            <div className="h-4 w-20 bg-gray-200 rounded ml-auto" />
            <div className="h-4 w-20 bg-gray-200 rounded" />
          </div>
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-6 py-4 border-b border-gray-50">
              <div className="h-4 w-20 bg-gray-100 rounded" />
              <div className="h-4 w-32 bg-gray-100 rounded" />
              <div className="h-5 w-24 bg-gray-100 rounded-full" />
              <div className="h-4 w-16 bg-gray-100 rounded ml-auto" />
              <div className="h-4 w-20 bg-gray-100 rounded" />
            </div>
          ))}
        </div>
      ) : invoices.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No invoices found"
          description="Create your first invoice to start billing customers."
        >
          <Link
            href="/invoices/new"
            className="px-4 py-2 bg-orange-500 text-white rounded-lg text-sm font-medium hover:bg-orange-600 transition-colors"
          >
            Create Invoice
          </Link>
        </EmptyState>
      ) : (
        <>
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left px-6 py-3 text-xs font-medium text-neutral-500 uppercase tracking-wider">
                    Invoice #
                  </th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-neutral-500 uppercase tracking-wider">
                    Customer
                  </th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-neutral-500 uppercase tracking-wider">
                    Type
                  </th>
                  <th className="text-right px-6 py-3 text-xs font-medium text-neutral-500 uppercase tracking-wider">
                    Amount
                  </th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-neutral-500 uppercase tracking-wider">
                    Date
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {invoices.map((invoice) => (
                  <tr key={invoice.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <Link
                        href={`/invoices/${invoice.id}`}
                        className="text-sm font-medium text-orange-500 hover:text-orange-600"
                      >
                        {invoice.invoice_number}
                      </Link>
                    </td>
                    <td className="px-6 py-4 text-sm text-neutral-700">
                      {invoice.customer?.full_name || "—"}
                    </td>
                    <td className="px-6 py-4">
                      <Badge variant={invoice.type === "TAX_INVOICE" ? "info" : "default"}>
                        {invoice.type === "TAX_INVOICE" ? "Tax Invoice" : "Delivery Challan"}
                      </Badge>
                    </td>
                    <td className="px-6 py-4 text-sm font-medium text-neutral-900 text-right">
                      {formatCurrency(invoice.grand_total)}
                    </td>
                    <td className="px-6 py-4 text-sm text-neutral-500">
                      {format(new Date(invoice.created_at), "dd MMM yyyy")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <p className="text-sm text-neutral-500">
                Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of {total}
              </p>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="p-2 rounded-lg border border-gray-200 text-neutral-600 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                {Array.from({ length: totalPages }).map((_, i) => {
                  const p = i + 1;
                  // Show first, last, current, and neighbors
                  if (p === 1 || p === totalPages || (p >= page - 1 && p <= page + 1)) {
                    return (
                      <button
                        key={p}
                        onClick={() => setPage(p)}
                        className={`w-9 h-9 rounded-lg text-sm font-medium transition-colors ${
                          p === page
                            ? "bg-orange-500 text-white"
                            : "border border-gray-200 text-neutral-600 hover:bg-gray-50"
                        }`}
                      >
                        {p}
                      </button>
                    );
                  }
                  // Show ellipsis
                  if (p === page - 2 || p === page + 2) {
                    return <span key={p} className="px-1 text-neutral-400">...</span>;
                  }
                  return null;
                })}
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="p-2 rounded-lg border border-gray-200 text-neutral-600 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
