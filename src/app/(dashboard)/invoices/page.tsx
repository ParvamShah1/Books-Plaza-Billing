import Link from "next/link";
import { getInvoices } from "@/lib/actions/invoices";
import { getEntities } from "@/lib/actions/entities";
import { formatCurrency } from "@/lib/calculations";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { InvoiceFilters } from "@/components/invoice-filters";
import { InvoicePagination } from "@/components/invoice-pagination";
import { FileText, Plus } from "lucide-react";
import { format } from "date-fns";

const PAGE_SIZE = 20;

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | undefined }>;
}) {
  const params = await searchParams;
  const page = Number(params?.page || "1");
  const search = params?.search || undefined;
  const type = params?.type || undefined;
  const entity_id = params?.entity_id || undefined;

  const [{ invoices, total }, entities] = await Promise.all([
    getInvoices({ type, entity_id, search, page, pageSize: PAGE_SIZE }),
    getEntities(),
  ]);

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

      <InvoiceFilters entities={entities} />

      {invoices.length === 0 ? (
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
          <div className="glass-card rounded-xl overflow-x-auto">
            <table className="w-full min-w-[600px]">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left px-4 sm:px-6 py-3 text-xs font-medium text-neutral-500 uppercase tracking-wider">
                    Invoice #
                  </th>
                  <th className="text-left px-4 sm:px-6 py-3 text-xs font-medium text-neutral-500 uppercase tracking-wider">
                    Customer
                  </th>
                  <th className="text-left px-4 sm:px-6 py-3 text-xs font-medium text-neutral-500 uppercase tracking-wider hidden sm:table-cell">
                    Type
                  </th>
                  <th className="text-right px-4 sm:px-6 py-3 text-xs font-medium text-neutral-500 uppercase tracking-wider">
                    Amount
                  </th>
                  <th className="text-left px-4 sm:px-6 py-3 text-xs font-medium text-neutral-500 uppercase tracking-wider hidden sm:table-cell">
                    Date
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {invoices.map((invoice) => (
                  <tr key={invoice.id} className="hover:bg-gray-50">
                    <td className="px-4 sm:px-6 py-3 sm:py-4">
                      <Link
                        href={`/invoices/${invoice.id}`}
                        className="text-sm font-medium text-orange-500 hover:text-orange-600"
                      >
                        {invoice.invoice_number}
                      </Link>
                    </td>
                    <td className="px-4 sm:px-6 py-3 sm:py-4 text-sm text-neutral-700">
                      {invoice.customer?.full_name || "\u2014"}
                    </td>
                    <td className="px-4 sm:px-6 py-3 sm:py-4 hidden sm:table-cell">
                      <Badge variant={invoice.type === "TAX_INVOICE" ? "info" : "default"}>
                        {invoice.type === "TAX_INVOICE" ? "Tax Invoice" : "Delivery Challan"}
                      </Badge>
                    </td>
                    <td className="px-4 sm:px-6 py-3 sm:py-4 text-sm font-medium text-neutral-900 text-right">
                      {formatCurrency(invoice.grand_total)}
                    </td>
                    <td className="px-4 sm:px-6 py-3 sm:py-4 text-sm text-neutral-500 hidden sm:table-cell">
                      {format(new Date(invoice.created_at), "dd MMM yyyy")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <InvoicePagination total={total} pageSize={PAGE_SIZE} />
        </>
      )}
    </div>
  );
}
