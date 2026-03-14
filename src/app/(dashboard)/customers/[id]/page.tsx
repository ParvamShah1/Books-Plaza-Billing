import { notFound } from "next/navigation";
import { getCustomer } from "@/lib/actions/customers";
import { getCustomerInvoices } from "@/lib/actions/invoices";
import { getCustomerPayments, getCustomerBalance } from "@/lib/actions/payments";
import { PageHeader } from "@/components/ui/page-header";
import { formatCurrency } from "@/lib/calculations";
import { CustomerPaymentSection } from "@/components/customer-payment-section";
import Link from "next/link";
import { format } from "date-fns";

export default async function CustomerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [customer, invoices, payments, balance] = await Promise.all([
    getCustomer(id),
    getCustomerInvoices(id),
    getCustomerPayments(id),
    getCustomerBalance(id),
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

      {/* Balance Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <div className="bg-white rounded-lg border border-gray-200 p-5">
          <p className="text-xs font-medium text-neutral-500 uppercase tracking-wider mb-1">
            Total Invoiced
          </p>
          <p className="text-2xl font-bold text-neutral-900">
            {formatCurrency(balance.totalInvoiced)}
          </p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-5">
          <p className="text-xs font-medium text-neutral-500 uppercase tracking-wider mb-1">
            Total Paid
          </p>
          <p className="text-2xl font-bold text-green-600">
            {formatCurrency(balance.totalPaid)}
          </p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-5">
          <p className="text-xs font-medium text-neutral-500 uppercase tracking-wider mb-1">
            Pending Amount
          </p>
          <p className={`text-2xl font-bold ${balance.pendingAmount > 0 ? "text-red-500" : "text-green-600"}`}>
            {balance.pendingAmount > 0 ? formatCurrency(balance.pendingAmount) : "Settled"}
          </p>
        </div>
      </div>

      {/* Record Payment */}
      <CustomerPaymentSection customerId={id} currentBalance={balance.pendingAmount} />

      {/* Invoices */}
      <div className="mb-8">
        <h3 className="text-sm font-semibold text-neutral-900 mb-3">
          Invoices ({invoices.length})
        </h3>
        {invoices.length === 0 ? (
          <div className="bg-white rounded-lg border border-gray-200 p-6 text-center text-sm text-neutral-500">
            No invoices yet
          </div>
        ) : (
          <div className="bg-white rounded-lg border border-gray-200 overflow-x-auto">
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
                      {inv.entity?.name || "—"}
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
          <div className="bg-white rounded-lg border border-gray-200 p-6 text-center text-sm text-neutral-500">
            No payments recorded
          </div>
        ) : (
          <div className="bg-white rounded-lg border border-gray-200 overflow-x-auto">
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
                      {payment.notes || "—"}
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
