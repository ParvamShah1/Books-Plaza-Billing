import { getCustomers } from "@/lib/actions/customers";
import { getEntities } from "@/lib/actions/entities";
import { InvoiceForm } from "@/components/invoice-form";
import { PageHeader } from "@/components/ui/page-header";
import Link from "next/link";

export default async function NewInvoicePage() {
  const [customers, entities] = await Promise.all([
    getCustomers(),
    getEntities(),
  ]);

  return (
    <div>
      <PageHeader
        title="Create Invoice"
        description="Add a new invoice or delivery challan"
      >
        <Link
          href="/invoices"
          className="px-4 py-2 border border-gray-200 rounded-lg text-sm font-medium text-neutral-700 hover:bg-gray-50 transition-colors"
        >
          Back to Invoices
        </Link>
      </PageHeader>

      <InvoiceForm customers={customers} entities={entities} />
    </div>
  );
}
