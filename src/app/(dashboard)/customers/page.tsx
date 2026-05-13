import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { CustomerSearch } from "@/components/customer-search";
import { CreateCustomerButton, CustomerRowActions } from "@/components/customer-actions";
import { getCustomersWithBalance } from "@/lib/actions/customers";
import { formatCurrency } from "@/lib/calculations";
import { Users } from "lucide-react";

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | undefined }>;
}) {
  const params = await searchParams;
  const search = params?.search || undefined;

  const customers = await getCustomersWithBalance(search);

  return (
    <div>
      <PageHeader title="Customers" description="Manage your customer database">
        <CreateCustomerButton />
      </PageHeader>

      <CustomerSearch />

      {customers.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No customers yet"
          description="Add your first customer to start creating invoices."
        >
          <CreateCustomerButton />
        </EmptyState>
      ) : (
        <div className="glass-card rounded-xl overflow-x-auto">
          <table className="w-full min-w-[600px]">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left px-4 sm:px-6 py-3 text-xs font-medium text-neutral-500 uppercase tracking-wider">
                  Name
                </th>
                <th className="text-left px-4 sm:px-6 py-3 text-xs font-medium text-neutral-500 uppercase tracking-wider hidden sm:table-cell">
                  Phone
                </th>
                <th className="text-left px-4 sm:px-6 py-3 text-xs font-medium text-neutral-500 uppercase tracking-wider hidden md:table-cell">
                  Email
                </th>
                <th className="text-right px-4 sm:px-6 py-3 text-xs font-medium text-neutral-500 uppercase tracking-wider">
                  Pending
                </th>
                <th className="text-right px-4 sm:px-6 py-3 text-xs font-medium text-neutral-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {customers.map((customer) => (
                <tr key={customer.id} className="hover:bg-gray-50">
                  <td className="px-4 sm:px-6 py-3 sm:py-4">
                    <Link
                      href={`/customers/${customer.id}`}
                      className="text-sm font-medium text-neutral-900 hover:text-orange-500 transition-colors"
                    >
                      {customer.full_name}
                    </Link>
                    {customer.address && (
                      <div className="text-xs text-neutral-400 mt-0.5 truncate max-w-[200px] sm:max-w-xs">
                        {customer.address}
                      </div>
                    )}
                    <div className="sm:hidden text-xs text-neutral-500 mt-0.5">
                      {customer.phone || ""}
                    </div>
                  </td>
                  <td className="px-4 sm:px-6 py-3 sm:py-4 text-sm text-neutral-700 hidden sm:table-cell">
                    {customer.phone || "\u2014"}
                  </td>
                  <td className="px-4 sm:px-6 py-3 sm:py-4 text-sm text-neutral-700 hidden md:table-cell">
                    {customer.email || "\u2014"}
                  </td>
                  <td className="px-4 sm:px-6 py-3 sm:py-4 text-right">
                    <Link
                      href={`/customers/${customer.id}`}
                      className={`text-sm font-semibold ${
                        customer.pending_amount > 0
                          ? "text-red-500 hover:text-red-600"
                          : "text-green-600"
                      }`}
                    >
                      {customer.pending_amount > 0
                        ? formatCurrency(customer.pending_amount)
                        : "Settled"}
                    </Link>
                  </td>
                  <td className="px-4 sm:px-6 py-3 sm:py-4">
                    <CustomerRowActions customer={customer} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
