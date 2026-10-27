"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Search } from "lucide-react";

type SelectFilter = {
  name: string;
  options: { value: string; label: string }[];
  placeholder?: string;
  defaultValue?: string;
};

type DateFilter = { name: string; label: string; defaultValue: string };

// Search box, dropdowns and dates that live in the URL (?search=&category=...)
export function UrlFilters({
  searchPlaceholder,
  selects = [],
  dates = [],
}: {
  searchPlaceholder?: string;
  selects?: SelectFilter[];
  dates?: DateFilter[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState(searchParams.get("search") || "");
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  function setParam(name: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(name, value);
    else params.delete(name);
    params.delete("page");
    router.push(`${pathname}?${params.toString()}`);
  }

  useEffect(() => {
    if (searchPlaceholder === undefined) return;
    if ((searchParams.get("search") || "") === search) return;
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setParam("search", search.trim()), 300);
    return () => clearTimeout(debounceRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const fieldClass =
    "px-3 py-2 border border-gray-200 rounded-lg bg-white/80 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent text-sm";

  return (
    <div className="flex flex-col sm:flex-row sm:flex-wrap gap-2 mb-4">
      {searchPlaceholder !== undefined && (
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
          <input
            type="text"
            placeholder={searchPlaceholder}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={`${fieldClass} w-full pl-10`}
          />
        </div>
      )}
      {dates.map((d) => (
        <label key={d.name} className="flex items-center gap-2 text-sm text-neutral-500">
          {d.label}
          <input
            type="date"
            value={searchParams.get(d.name) || d.defaultValue}
            onChange={(e) => setParam(d.name, e.target.value)}
            className={fieldClass}
          />
        </label>
      ))}
      {selects.map((s) => (
        <select
          key={s.name}
          value={searchParams.get(s.name) || s.defaultValue || ""}
          onChange={(e) => setParam(s.name, e.target.value)}
          className={`${fieldClass} sm:w-52`}
        >
          {s.placeholder !== undefined && <option value="">{s.placeholder}</option>}
          {s.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      ))}
    </div>
  );
}
