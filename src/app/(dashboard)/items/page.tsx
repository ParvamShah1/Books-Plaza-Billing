import { requireRole } from "@/lib/pos/guard";
import { getCategories, getItems } from "@/lib/actions/catalog";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { UrlFilters } from "@/components/pos/url-filters";
import { AddItemButton, ItemsTable } from "@/components/pos/items-table";
import { InvoicePagination } from "@/components/invoice-pagination";
import type { ItemKind } from "@/lib/pos/types";
import { BookOpen } from "lucide-react";

export const metadata = { title: "Books - Books Plaza" };

const PAGE_SIZE = 50;

export default async function ItemsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | undefined }>;
}) {
  await requireRole(["ADMIN"]);
  const params = await searchParams;
  const [categories, { items, total }] = await Promise.all([
    getCategories(),
    getItems({
      search: params.search,
      category_id: params.category,
      kind: params.kind as ItemKind | undefined,
      page: Number(params.page || "1"),
      pageSize: PAGE_SIZE,
    }),
  ]);

  return (
    <div>
      <PageHeader title="Books" description={`${total.toLocaleString("en-IN")} books and lots`}>
        <AddItemButton categories={categories} />
      </PageHeader>

      <UrlFilters
        searchPlaceholder="Search title, publisher, code or ISBN"
        selects={[
          {
            name: "category",
            placeholder: "All categories",
            options: categories.map((c) => ({ value: c.id, label: c.name })),
          },
          {
            name: "kind",
            placeholder: "Publisher + lot",
            options: [
              { value: "PUBLISHER", label: "Publisher books" },
              { value: "LOT", label: "Lots" },
            ],
          },
        ]}
      />

      {items.length === 0 ? (
        <div className="glass-card rounded-xl">
          <EmptyState
            icon={BookOpen}
            title={params.search ? "No books match" : "No books yet"}
            description="Add books here, or scan them in from Stock → Receive stock."
          />
        </div>
      ) : (
        <>
          <ItemsTable items={items} categories={categories} />
          <InvoicePagination total={total} pageSize={PAGE_SIZE} />
        </>
      )}
    </div>
  );
}
