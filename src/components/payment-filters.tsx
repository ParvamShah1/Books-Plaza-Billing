"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

interface PaymentFiltersProps {
  customerId: string;
}

export function PaymentFilters({ customerId }: PaymentFiltersProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentFilter = searchParams.get("filter") || "all";
  const currentYear = searchParams.get("year");

  const [selectedYear, setSelectedYear] = useState(
    currentYear || new Date().getFullYear().toString()
  );
  const [startDate, setStartDate] = useState(
    searchParams.get("startDate") || ""
  );
  const [endDate, setEndDate] = useState(searchParams.get("endDate") || "");

  const filters = [
    { value: "all", label: "All Time" },
    { value: "last7days", label: "Last 7 Days" },
    { value: "thisMonth", label: "This Month" },
    { value: "lastMonth", label: "Last Month" },
    { value: "year", label: "Year" },
    { value: "custom", label: "Custom Range" },
  ];

  const currentYearNum = new Date().getFullYear();
  const years = Array.from({ length: 5 }, (_, i) => currentYearNum - i);

  function handleFilterChange(filterValue: string) {
    const params = new URLSearchParams(searchParams.toString());

    if (filterValue === "all") {
      params.delete("filter");
      params.delete("year");
      params.delete("startDate");
      params.delete("endDate");
    } else if (filterValue === "year") {
      params.set("filter", filterValue);
      params.set("year", selectedYear);
      params.delete("startDate");
      params.delete("endDate");
    } else if (filterValue === "custom") {
      params.set("filter", filterValue);
      params.delete("year");
      if (startDate) params.set("startDate", startDate);
      if (endDate) params.set("endDate", endDate);
    } else {
      params.set("filter", filterValue);
      params.delete("year");
      params.delete("startDate");
      params.delete("endDate");
    }

    router.push(`/customers/${customerId}?${params.toString()}`);
  }

  function handleYearChange(year: string) {
    setSelectedYear(year);
    const params = new URLSearchParams(searchParams.toString());
    params.set("filter", "year");
    params.set("year", year);
    params.delete("startDate");
    params.delete("endDate");
    router.push(`/customers/${customerId}?${params.toString()}`);
  }

  function handleCustomDateApply() {
    const params = new URLSearchParams(searchParams.toString());
    params.set("filter", "custom");
    if (startDate) params.set("startDate", startDate);
    if (endDate) params.set("endDate", endDate);
    params.delete("year");
    router.push(`/customers/${customerId}?${params.toString()}`);
  }

  return (
    <div className="flex flex-wrap gap-2 items-center">
      {filters.map((filter) => (
        <div key={filter.value} className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => handleFilterChange(filter.value)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              currentFilter === filter.value
                ? "bg-orange-500 text-white"
                : "bg-gray-100 text-neutral-700 hover:bg-gray-200"
            }`}
          >
            {filter.label}
          </button>

          {filter.value === "year" && currentFilter === "year" && (
            <select
              value={selectedYear}
              onChange={(e) => handleYearChange(e.target.value)}
              className="px-2 py-1.5 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-orange-500 focus:border-transparent"
            >
              {years.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
          )}

          {filter.value === "custom" && currentFilter === "custom" && (
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="px-2 py-1.5 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-orange-500 focus:border-transparent"
              />
              <span className="text-xs text-neutral-500">to</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="px-2 py-1.5 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-orange-500 focus:border-transparent"
              />
              <button
                type="button"
                onClick={handleCustomDateApply}
                className="px-3 py-1.5 bg-orange-500 text-white rounded-lg text-xs font-medium hover:bg-orange-600 transition-colors"
              >
                Apply
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
