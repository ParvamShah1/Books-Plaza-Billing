"use client";

import { useEffect, useRef, useState } from "react";

export function InvoicePreviewWrapper({ children }: { children: React.ReactNode }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    function updateScale() {
      if (!containerRef.current) return;
      const containerWidth = containerRef.current.offsetWidth;
      // 210mm ≈ 793.7px at 96dpi
      const invoiceWidth = 793.7;
      if (containerWidth < invoiceWidth) {
        setScale(containerWidth / invoiceWidth);
      } else {
        setScale(1);
      }
    }

    updateScale();
    window.addEventListener("resize", updateScale);
    return () => window.removeEventListener("resize", updateScale);
  }, []);

  const invoiceHeightPx = 1122.5; // 297mm in px
  const scaledHeight = invoiceHeightPx * scale;

  return (
    <div ref={containerRef} className="invoice-preview-wrapper" style={{ width: "100%" }}>
      <div
        style={{
          transform: `scale(${scale})`,
          transformOrigin: "top left",
          height: scale < 1 ? `${scaledHeight}px` : undefined,
        }}
      >
        {children}
      </div>
    </div>
  );
}
