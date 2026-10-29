"use client";

import { useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";

// Installed apps have no pull-to-refresh, so: a button, and a fresh load whenever the app is reopened
export function RefreshButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    const onVisible = () => document.visibilityState === "visible" && startTransition(() => router.refresh());
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [router]);

  return (
    <button
      type="button"
      onClick={() => startTransition(() => router.refresh())}
      aria-label="Refresh"
      className="p-2.5 rounded-xl bg-white/70 border border-gray-200 text-neutral-600 active:bg-gray-100"
    >
      <RefreshCw className={`w-4 h-4 ${pending ? "animate-spin" : ""}`} />
    </button>
  );
}
