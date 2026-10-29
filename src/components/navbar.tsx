"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "@/lib/actions/auth";
import Image from "next/image";
import { LogOut } from "lucide-react";
import type { Role } from "@/lib/pos/types";

const navItems: { href: string; label: string; roles: Role[] }[] = [
  { href: "/pos", label: "Billing", roles: ["ADMIN", "STAFF"] },
  { href: "/sales", label: "Sales", roles: ["ADMIN", "STAFF"] },
  { href: "/stock", label: "Stock", roles: ["ADMIN", "STAFF"] },
  { href: "/expenses", label: "Expenses", roles: ["ADMIN", "STAFF"] },
  { href: "/items", label: "Books", roles: ["ADMIN"] },
  { href: "/invoices", label: "Invoices", roles: ["ADMIN", "PENDING"] },
  { href: "/customers", label: "Customers", roles: ["ADMIN", "PENDING"] },
  { href: "/settings", label: "Settings", roles: ["ADMIN"] },
];

export function Navbar({ role, fullWidth = false }: { role: Role; fullWidth?: boolean }) {
  const pathname = usePathname();
  const visibleItems = navItems.filter((item) => item.roles.includes(role));

  return (
    <header className={`sticky top-0 z-50 pt-3 ${fullWidth ? "px-3 sm:px-4" : "max-w-7xl mx-auto px-4 sm:px-6"}`}>
      <div className="glass-strong rounded-2xl shadow-lg shadow-black/5 px-3 sm:px-4 flex items-center justify-between gap-4 h-14">
        {/* Logo + Nav */}
        <div className="flex items-center gap-4 sm:gap-8 min-w-0">
          <Link href="/pos" className="flex items-center flex-shrink-0">
            <Image src="/booksplaza-logo.png" alt="BooksPlaza" width={0} height={0} sizes="100vw" className="h-8 sm:h-10 w-auto" />
          </Link>

          <nav className="flex items-center gap-1 overflow-x-auto">
            {visibleItems.map((item) => {
              const isActive =
                pathname === item.href || pathname.startsWith(item.href + "/");

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`px-2 sm:px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                    isActive
                      ? "bg-orange-500/10 text-orange-600"
                      : "text-neutral-500 hover:text-neutral-900 hover:bg-white/50"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Sign out */}
        <form action={signOut}>
          <button
            type="submit"
            className="flex items-center gap-1.5 px-2 sm:px-3 py-1.5 rounded-lg text-sm font-medium text-neutral-500 hover:text-neutral-900 hover:bg-white/50 transition-colors"
          >
            <LogOut className="w-4 h-4" />
            <span className="hidden sm:inline">Sign Out</span>
          </button>
        </form>
      </div>
    </header>
  );
}
