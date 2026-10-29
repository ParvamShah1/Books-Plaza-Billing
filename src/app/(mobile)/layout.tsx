import Image from "next/image";
import Link from "next/link";
import { LayoutGrid } from "lucide-react";
import { RefreshButton } from "@/components/m/refresh-button";

// Phone layout for the installed app: no desktop navbar, room for the notch
export default function MobileLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gradient-main pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
      <header className="max-w-md mx-auto px-4 pt-4 pb-2 flex items-center gap-3">
        <Image src="/booksplaza-logo.png" alt="" width={36} height={36} className="rounded-full" />
        <span className="font-semibold text-neutral-900 flex-1">Books Plaza</span>
        <RefreshButton />
        <Link
          href="/sales"
          aria-label="Open full app"
          className="p-2.5 rounded-xl bg-white/70 border border-gray-200 text-neutral-600 active:bg-gray-100"
        >
          <LayoutGrid className="w-4 h-4" />
        </Link>
      </header>
      <main className="max-w-md mx-auto px-4 pb-8">{children}</main>
    </div>
  );
}
