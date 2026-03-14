"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "@/lib/actions/auth";
import Image from "next/image";
import { LogOut } from "lucide-react";

const navItems = [
  { href: "/invoices", label: "Invoices" },
  { href: "/customers", label: "Customers" },
];

export function Navbar() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-50 bg-white border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 flex items-center justify-between h-14">
        {/* Logo + Nav */}
        <div className="flex items-center gap-4 sm:gap-8">
          <Link href="/invoices" className="flex items-center">
            <Image src="/booksplaza-logo.png" alt="BooksPlaza" width={0} height={0} sizes="100vw" className="h-8 sm:h-10 w-auto" />
          </Link>

          <nav className="flex items-center gap-1">
            {navItems.map((item) => {
              const isActive =
                pathname === item.href || pathname.startsWith(item.href + "/");

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`px-2 sm:px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                    isActive
                      ? "bg-orange-50 text-orange-600"
                      : "text-neutral-500 hover:text-neutral-900 hover:bg-gray-50"
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
            className="flex items-center gap-1.5 px-2 sm:px-3 py-1.5 rounded-md text-sm font-medium text-neutral-500 hover:text-neutral-900 hover:bg-gray-50 transition-colors"
          >
            <LogOut className="w-4 h-4" />
            <span className="hidden sm:inline">Sign Out</span>
          </button>
        </form>
      </div>
    </header>
  );
}
