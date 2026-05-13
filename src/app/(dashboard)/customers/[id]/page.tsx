import { notFound } from "next/navigation";
import { getCustomer } from "@/lib/actions/customers";
import { getCustomerInvoices } from "@/lib/actions/invoices";
import { getCustomerPayments, getCustomerBalance } from "@/lib/actions/payments";
import type { DateFilter } from "@/lib/actions/payments";
import { PageHeader } from "@/components/ui/page-header";
import { formatCurrency } from "@/lib/calculations";
import { CustomerPaymentSection } from "@/components/customer-payment-section";
import { PaymentFilters } from "@/components/payment-filters";
import { DownloadLedgerButton } from "@/components/download-ledger-button";
import Link from "next/link";
import { format } from "date-fns";

function getDateRange(filters: DateFilter): { from?: string; to?: string } {
  if (!filters.filter || filters.filter === "all") return {};

  const now = new Date();

  if (filters.filter === "last7days") {
    const from = new Date(now);
    from.setDate(from.getDate() - 7);
    return { from: from.toISOString(), to: now.toISOString() };
  }

  if (filters.filter === "thisMonth") {
    const from = new Date(now.getFullYear(), now.getMonth(), 1);
    return { from: from.toISOString(), to: now.toISOString() };
  }

  if (filters.filter === "lastMonth") {
    const from = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const to = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
    return { from: from.toISOString(), to: to.toISOString() };
  }

  if (filters.filter === "year" && filters.year) {
    const yr = parseInt(filters.year);
    const from = new Date(yr, 0, 1);
    const to = new Date(yr, 11, 31, 23, 59, 59);
    return { from: from.toISOString(), to: to.toISOString() };
  }

  if (filters.filter === "custom") {
    const from = filters.startDate
      ? new Date(filters.startDate).toISOString()
      : undefined;
    const to = filters.endDate
      ? new Date(filters.endDate + "T23:59:59").toISOString()
      : undefined;
    return { from, to };
  }

  return {};
}

export default async function CustomerDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ [key: string]: string | undefined }>;
}) {
  const { id } = await params;
  const resolvedSearchParams = await searchParams;

  const dateFilter: DateFilter = {
    filter: resolvedSearchParams?.filter || "all",
    year: resolvedSearchParams?.year,
    startDate: resolvedSearchParams?.startDate,
    endDate: resolvedSearchParams?.endDate,
  };

  const dateRange = getDateRange(dateFilter);

  const [customer, invoices, payments, balance] = await Promise.all([
    getCustomer(id),
    getCustomerInvoices(id, dateRange),
    getCustomerPayments(id, dateFilter),
    getCustomerBalance(id, dateFilter),
  ]);

  if (!customer) notFound();

  return (
    <div>
      <PageHeader
        title={customer.full_name}
        description={[customer.phone, customer.email].filter(Boolean).join(" | ") || "Customer details"}
      >
        <Link
          href="/customers"
          className="px-4 py-2 border border-gray-200 rounded-lg text-sm font-medium text-neutral-700 hover:bg-gray-50 transition-colors"
        >
          Back
        </Link>
      </PageHeader>

      {/* Filters */}
      <div className="glass-card rounded-xl p-4 mb-6 overflow-x-auto">
        <PaymentFilters customerId={id} />
      </div>

      {/* Balance Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <div className="glass-card rounded-xl p-5">
          <p className="text-xs font-medium text-neutral-500 uppercase tracking-wider mb-1">
            Total Invoiced
          </p>
          <p className="text-2xl font-bold text-neutral-900">
            {formatCurrency(balance.totalInvoiced)}
          </p>
        </div>
        <div className="glass-card rounded-xl p-5">
          <p className="text-xs font-medium text-neutral-500 uppercase tracking-wider mb-1">
            Total Paid
          </p>
          <p className="text-2xl font-bold text-green-600">
            {formatCurrency(balance.totalPaid)}
          </p>
        </div>
        <div className="glass-card rounded-xl p-5">
          <p className="text-xs font-medium text-neutral-500 uppercase tracking-wider mb-1">
            Pending Amount
          </p>
          <p className={`text-2xl font-bold ${balance.pendingAmount > 0 ? "text-red-500" : "text-green-600"}`}>
            {balance.pendingAmount > 0 ? formatCurrency(balance.pendingAmount) : "Settled"}
          </p>
        </div>
      </div>

      {/* Download Ledger */}
      <div className="flex justify-end mb-6">
        <DownloadLedgerButton
          customer={customer}
          invoices={invoices}
          payments={payments}
          totalInvoiced={balance.totalInvoiced}
          totalPaid={balance.totalPaid}
          pendingAmount={balance.pendingAmount}
        />
      </div>

      {/* Record Payment */}
      <CustomerPaymentSection customerId={id} currentBalance={balance.pendingAmount} />

      {/* Invoices */}
      <div className="mb-8">
        <h3 className="text-sm font-semibold text-neutral-900 mb-3">
          Invoices ({invoices.length})
        </h3>
        {invoices.length === 0 ? (
          <div className="glass-card rounded-xl p-6 text-center text-sm text-neutral-500">
            No invoices yet
          </div>
        ) : (
          <div className="glass-card rounded-xl overflow-x-auto">
            <table className="w-full min-w-[500px]">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left px-4 sm:px-6 py-3 text-xs font-medium text-neutral-500 uppercase tracking-wider">
                    Invoice #
                  </th>
                  <th className="text-left px-4 sm:px-6 py-3 text-xs font-medium text-neutral-500 uppercase tracking-wider">
                    Entity
                  </th>
                  <th className="text-right px-4 sm:px-6 py-3 text-xs font-medium text-neutral-500 uppercase tracking-wider">
                    Amount
                  </th>
                  <th className="text-left px-4 sm:px-6 py-3 text-xs font-medium text-neutral-500 uppercase tracking-wider">
                    Date
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {invoices.map((inv) => (
                  <tr key={inv.id} className="hover:bg-gray-50">
                    <td className="px-4 sm:px-6 py-3">
                      <Link
                        href={`/invoices/${inv.id}`}
                        className="text-sm font-medium text-orange-500 hover:text-orange-600"
                      >
                        {inv.invoice_number}
                      </Link>
                    </td>
                    <td className="px-4 sm:px-6 py-3 text-sm text-neutral-700">
                      {inv.entity?.name || "\u2014"}
                    </td>
                    <td className="px-4 sm:px-6 py-3 text-sm font-medium text-neutral-900 text-right">
                      {formatCurrency(inv.grand_total)}
                    </td>
                    <td className="px-4 sm:px-6 py-3 text-sm text-neutral-500">
                      {format(new Date(inv.created_at), "dd MMM yyyy")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Payment History */}
      <div>
        <h3 className="text-sm font-semibold text-neutral-900 mb-3">
          Payment History ({payments.length})
        </h3>
        {payments.length === 0 ? (
          <div className="glass-card rounded-xl p-6 text-center text-sm text-neutral-500">
            No payments recorded
          </div>
        ) : (
          <div className="glass-card rounded-xl overflow-x-auto">
            <table className="w-full min-w-[500px]">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left px-4 sm:px-6 py-3 text-xs font-medium text-neutral-500 uppercase tracking-wider">
                    Date
                  </th>
                  <th className="text-right px-4 sm:px-6 py-3 text-xs font-medium text-neutral-500 uppercase tracking-wider">
                    Amount
                  </th>
                  <th className="text-left px-4 sm:px-6 py-3 text-xs font-medium text-neutral-500 uppercase tracking-wider">
                    Mode
                  </th>
                  <th className="text-left px-4 sm:px-6 py-3 text-xs font-medium text-neutral-500 uppercase tracking-wider">
                    Notes
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {payments.map((payment) => (
                  <tr key={payment.id} className="hover:bg-gray-50">
                    <td className="px-4 sm:px-6 py-3 text-sm text-neutral-700">
                      {format(new Date(payment.created_at), "dd MMM yyyy, hh:mm a")}
                    </td>
                    <td className="px-4 sm:px-6 py-3 text-sm font-medium text-green-600 text-right">
                      +{formatCurrency(payment.amount)}
                    </td>
                    <td className="px-4 sm:px-6 py-3">
                      <span className="inline-block px-2 py-0.5 bg-gray-100 text-neutral-600 text-xs font-medium rounded">
                        {payment.mode}
                      </span>
                    </td>
                    <td className="px-4 sm:px-6 py-3 text-sm text-neutral-500">
                      {payment.notes || "\u2014"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
