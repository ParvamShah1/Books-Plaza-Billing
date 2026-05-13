"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface InvoicePaginationProps {
  total: number;
  pageSize: number;
}

export function InvoicePagination({ total, pageSize }: InvoicePaginationProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const page = Number(searchParams.get("page") || "1");
  const totalPages = Math.ceil(total / pageSize);

  if (totalPages <= 1) return null;

  function goToPage(p: number) {
    const params = new URLSearchParams(searchParams.toString());
    if (p <= 1) {
      params.delete("page");
    } else {
      params.set("page", String(p));
    }
    router.push(`/invoices?${params.toString()}`);
  }

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mt-4">
      <p className="text-sm text-neutral-500">
        Showing {(page - 1) * pageSize + 1}&ndash;{Math.min(page * pageSize, total)} of {total}
      </p>
      <div className="flex items-center gap-1">
        <button
          onClick={() => goToPage(page - 1)}
          disabled={page === 1}
          className="p-2 rounded-lg border border-gray-200 text-neutral-600 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        {Array.from({ length: totalPages }).map((_, i) => {
          const p = i + 1;
          if (p === 1 || p === totalPages || (p >= page - 1 && p <= page + 1)) {
            return (
              <button
                key={p}
                onClick={() => goToPage(p)}
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
          if (p === page - 2 || p === page + 2) {
            return <span key={p} className="px-1 text-neutral-400">...</span>;
          }
          return null;
        })}
        <button
          onClick={() => goToPage(page + 1)}
          disabled={page === totalPages}
          className="p-2 rounded-lg border border-gray-200 text-neutral-600 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
