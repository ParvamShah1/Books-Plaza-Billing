"use client";

import { useEffect } from "react";

export function AutoPrint() {
  useEffect(() => {
    // Wait for the logo to load so it appears on the printout
    const img = document.querySelector<HTMLImageElement>(".receipt img");
    if (img && !img.complete) {
      img.addEventListener("load", () => window.print(), { once: true });
      img.addEventListener("error", () => window.print(), { once: true });
    } else {
      window.print();
    }
  }, []);
  return null;
}
