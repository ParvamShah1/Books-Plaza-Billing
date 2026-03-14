import jsPDF from "jspdf";
import html2canvas from "html2canvas-pro";

export async function generateInvoicePdf(invoiceNumber: string) {
  const element = document.getElementById("invoice-content");
  if (!element) throw new Error("Invoice content not found");

  // Create an off-screen iframe to render the invoice in isolation
  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.left = "-99999px";
  iframe.style.top = "0";
  iframe.style.width = "210mm";
  iframe.style.height = "297mm";
  iframe.style.border = "none";
  document.body.appendChild(iframe);

  const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
  if (!iframeDoc) throw new Error("Cannot access iframe");

  // Copy all stylesheets from parent
  const styles = Array.from(document.styleSheets);
  let cssText = "";
  for (const sheet of styles) {
    try {
      const rules = Array.from(sheet.cssRules);
      for (const rule of rules) {
        cssText += rule.cssText + "\n";
      }
    } catch {
      // Cross-origin sheets — link them instead
      if (sheet.href) {
        const link = iframeDoc.createElement("link");
        link.rel = "stylesheet";
        link.href = sheet.href;
        iframeDoc.head.appendChild(link);
      }
    }
  }

  const styleEl = iframeDoc.createElement("style");
  styleEl.textContent = cssText;
  iframeDoc.head.appendChild(styleEl);

  // Clone the invoice into the iframe
  const clone = element.cloneNode(true) as HTMLElement;
  clone.style.width = "210mm";
  clone.style.height = "297mm";
  clone.style.minHeight = "297mm";
  clone.style.margin = "0";
  clone.style.border = "none";
  clone.style.boxShadow = "none";
  iframeDoc.body.style.margin = "0";
  iframeDoc.body.style.padding = "0";
  iframeDoc.body.appendChild(clone);

  // Wait for styles + images to load
  await new Promise((r) => setTimeout(r, 500));

  const canvas = await html2canvas(clone, {
    scale: 2,
    useCORS: true,
    logging: false,
    backgroundColor: "#ffffff",
    windowWidth: clone.scrollWidth,
    windowHeight: clone.scrollHeight,
  });

  // Clean up iframe
  document.body.removeChild(iframe);

  const imgData = canvas.toDataURL("image/jpeg", 1.0);
  const pageWidth = 210;
  const pageHeight = 297;
  const imgWidth = pageWidth;
  const imgHeight = (canvas.height * imgWidth) / canvas.width;

  const doc = new jsPDF("p", "mm", "a4");

  // Clamp to single page if image is within 2mm of A4 height (avoids blank second page from rounding)
  const effectiveHeight = imgHeight <= pageHeight + 2 ? Math.min(imgHeight, pageHeight) : imgHeight;

  if (effectiveHeight <= pageHeight) {
    doc.addImage(imgData, "JPEG", 0, 0, imgWidth, effectiveHeight);
  } else {
    let heightLeft = effectiveHeight;
    let position = 0;

    doc.addImage(imgData, "JPEG", 0, position, imgWidth, effectiveHeight);
    heightLeft -= pageHeight;

    while (heightLeft > 2) {
      position -= pageHeight;
      doc.addPage();
      doc.addImage(imgData, "JPEG", 0, position, imgWidth, effectiveHeight);
      heightLeft -= pageHeight;
    }
  }

  doc.save(`${invoiceNumber}.pdf`);
}
