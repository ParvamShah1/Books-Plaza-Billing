import jsPDF from "jspdf";
import html2canvas from "html2canvas-pro";

export async function generateInvoicePdf(invoiceNumber: string) {
  const element = document.getElementById("invoice-content");
  if (!element) throw new Error("Invoice content not found");

  const canvas = await html2canvas(element, {
    scale: 2,
    useCORS: true,
    logging: false,
    backgroundColor: "#ffffff",
  });

  const pageWidth = 210;
  const pageHeight = 297;
  const imgData = canvas.toDataURL("image/jpeg", 1.0);
  const imgWidth = pageWidth;
  const imgHeight = (canvas.height * imgWidth) / canvas.width;

  // Single page
  if (imgHeight <= pageHeight) {
    const doc = new jsPDF("p", "mm", "a4");
    doc.addImage(imgData, "JPEG", 0, 0, imgWidth, imgHeight);
    doc.save(`${invoiceNumber}.pdf`);
    return;
  }

  // Multi-page: render full image offset on each page, clipped by page bounds
  const doc = new jsPDF("p", "mm", "a4");
  let heightLeft = imgHeight;
  let position = 0;

  doc.addImage(imgData, "JPEG", 0, position, imgWidth, imgHeight);
  heightLeft -= pageHeight;

  while (heightLeft > 0) {
    position -= pageHeight;
    doc.addPage();
    doc.addImage(imgData, "JPEG", 0, position, imgWidth, imgHeight);
    heightLeft -= pageHeight;
  }

  doc.save(`${invoiceNumber}.pdf`);
}
