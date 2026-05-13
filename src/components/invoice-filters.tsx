"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useEffect, useRef } from "react";
import type { Entity } from "@/lib/types";
import { Search } from "lucide-react";

interface InvoiceFiltersProps {
  entities: Entity[];
}

export function InvoiceFilters({ entities }: InvoiceFiltersProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [search, setSearch] = useState(searchParams.get("search") || "");
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Debounced search
  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString());
      if (search) {
        params.set("search", search);
      } else {
        params.delete("search");
      }
      params.delete("page");
      router.push(`/invoices?${params.toString()}`);
    }, 300);
    return () => clearTimeout(debounceRef.current);
  }, [search]);

  function handleFilterChange(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    params.delete("page");
    router.push(`/invoices?${params.toString()}`);
  }

  return (
    <div className="flex flex-wrap gap-3 mb-6">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
        <input
          type="text"
          placeholder="Search by invoice number..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent text-sm w-full sm:w-64"
        />
      </div>

      <select
        defaultValue={searchParams.get("type") || ""}
        onChange={(e) => handleFilterChange("type", e.target.value)}
        className="px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent text-sm"
      >
        <option value="">All Types</option>
        <option value="TAX_INVOICE">Tax Invoice</option>
        <option value="DELIVERY_CHALLAN">Delivery Challan</option>
      </select>

      <select
        defaultValue={searchParams.get("entity_id") || ""}
        onChange={(e) => handleFilterChange("entity_id", e.target.value)}
        className="px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent text-sm"
      >
        <option value="">All Entities</option>
        {entities.map((e) => (
          <option key={e.id} value={e.id}>
            {e.name}
          </option>
        ))}
      </select>
    </div>
  );
}
