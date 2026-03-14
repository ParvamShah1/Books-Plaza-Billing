import { notFound } from "next/navigation";
import Link from "next/link";
import { getInvoice } from "@/lib/actions/invoices";
import { getCustomers } from "@/lib/actions/customers";
import { getEntities } from "@/lib/actions/entities";
import { InvoiceForm } from "@/components/invoice-form";
import { PageHeader } from "@/components/ui/page-header";

export default async function EditInvoicePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [invoice, customers, entities] = await Promise.all([
    getInvoice(id),
    getCustomers(),
    getEntities(),
  ]);

  if (!invoice) notFound();

  return (
    <div>
      <PageHeader
        title={`Edit ${invoice.invoice_number}`}
        description="Update invoice details and items"
      >
        <Link
          href={`/invoices/${id}`}
          className="px-4 py-2 border border-gray-200 rounded-lg text-sm font-medium text-neutral-700 hover:bg-gray-50 transition-colors"
        >
          Cancel
        </Link>
      </PageHeader>

      <InvoiceForm customers={customers} entities={entities} invoice={invoice} />
    </div>
  );
}
