// PDF export helper for 624 forms.
// Uses html2canvas + jsPDF (same approach as batch-sheet records).
// Pass an HTML string; it renders in a hidden iframe, canvases at scale 2,
// slices into A4 pages and saves.

export async function exportFormPdf(html: string, filename: string): Promise<void> {
  const iframe = document.createElement("iframe");
  iframe.style.cssText = "position:fixed;top:-9999px;left:-9999px;width:794px;height:1123px;visibility:hidden;border:0";
  document.body.appendChild(iframe);

  const iDoc = iframe.contentDocument!;
  iDoc.open();
  iDoc.write(html);
  iDoc.close();

  // Let styles settle
  await new Promise<void>((res) => setTimeout(res, 300));

  const html2canvas = (await import("html2canvas")).default;
  const { jsPDF } = await import("jspdf");

  const canvas = await html2canvas(iDoc.body, {
    backgroundColor: "#ffffff",
    scale: 2,
    useCORS: true,
    logging: false,
    width: 794,
    windowWidth: 794,
  });

  document.body.removeChild(iframe);

  const pdf = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
  const pageWidthPt = pdf.internal.pageSize.getWidth();
  const pageHeightPt = pdf.internal.pageSize.getHeight();
  const pxToPt = pageWidthPt / canvas.width;
  const pageHeightPx = Math.floor(pageHeightPt / pxToPt);
  const totalPages = Math.ceil(canvas.height / pageHeightPx);

  for (let i = 0; i < totalPages; i++) {
    if (i > 0) pdf.addPage();
    const slice = document.createElement("canvas");
    slice.width = canvas.width;
    slice.height = Math.min(pageHeightPx, canvas.height - i * pageHeightPx);
    slice.getContext("2d")!.drawImage(
      canvas, 0, i * pageHeightPx, canvas.width, slice.height, 0, 0, canvas.width, slice.height
    );
    pdf.addImage(slice.toDataURL("image/jpeg", 0.92), "JPEG", 0, 0, pageWidthPt, slice.height * pxToPt);
  }

  pdf.save(filename);
}
