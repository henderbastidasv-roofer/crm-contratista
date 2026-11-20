import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

// Documentos con diseño propio (ej. Certificado de Terminación): un PDF base con el diseño
// y la firma del dueño ya puesta, y "fields" que dicen dónde escribir cada dato.

export type FormField = {
  key: string;
  label: string;
  page?: number;
  x: number;
  y: number;
  size: number;
  align?: "left" | "center" | "right";
  /** Si el texto no cabe, se achica la letra hasta que quepa. */
  maxWidth?: number;
};
export type SignatureBox = { page?: number; x: number; y: number; width: number; height: number };

export const FORM_FIELD_LABELS: Record<string, string> = {
  nombre_completo: "Nombre del cliente",
  direccion: "Dirección de la propiedad",
  fecha_contrato: "Fecha del contrato",
  fecha_terminacion: "Fecha de terminación",
};

/** Ejemplo de posiciones para un certificado con diseño propio (página horizontal de 842 × 604 pt). */
export const CERTIFICATE_FIELDS: FormField[] = [
  { key: "nombre_completo", label: "Nombre del cliente", x: 420.9, y: 379.3, size: 16.6, align: "center", maxWidth: 470 },
  { key: "direccion", label: "Dirección de la propiedad", x: 420.9, y: 328, size: 12, align: "center", maxWidth: 470 },
  { key: "fecha_contrato", label: "Fecha del contrato", x: 580.9, y: 308.3, size: 13.5, maxWidth: 90 },
  // Termina justo antes de "AND <COMPANY>" (segunda línea del párrafo).
  { key: "nombre_completo", label: "Nombre del cliente", x: 181, y: 294.5, size: 14, align: "right", maxWidth: 135 },
  { key: "fecha_terminacion", label: "Fecha de terminación", x: 424.6, y: 274.5, size: 13.5, maxWidth: 110 },
  { key: "nombre_completo", label: "Nombre del cliente", x: 331.1, y: 265, size: 16.6, maxWidth: 165 },
  { key: "nombre_completo", label: "Nombre del cliente", x: 644.2, y: 95.2, size: 16.6, align: "center", maxWidth: 150 },
];
export const CERTIFICATE_SIGNATURE: SignatureBox = { x: 574, y: 130, width: 150, height: 42 };

const safe = (t: string) =>
  t
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/[^\x20-\x7e\xa0-\xff]/g, "?");

/** Escribe los datos sobre el PDF base. */
export async function renderFormPdf(base: Uint8Array, fields: FormField[], values: Record<string, string>) {
  const pdf = await PDFDocument.load(base);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const pages = pdf.getPages();
  for (const f of fields) {
    const text = safe((values[f.key] ?? "").trim());
    if (!text) continue;
    const page = pages[f.page ?? 0];
    if (!page) continue;
    let size = f.size;
    while (f.maxWidth && size > 7 && font.widthOfTextAtSize(text, size) > f.maxWidth) size -= 0.5;
    const w = font.widthOfTextAtSize(text, size);
    page.drawText(text, { x: f.align === "center" ? f.x - w / 2 : f.align === "right" ? f.x - w : f.x, y: f.y, size, font, color: rgb(0, 0, 0) });
  }
  return pdf.save();
}

/** Pone la firma del cliente (dibujada o su nombre) en el recuadro y "Signed on …" debajo. */
export async function placeSignature(pdfBytes: Uint8Array, box: SignatureBox, sig: { name: string; png: Uint8Array | null; when: string }) {
  const pdf = await PDFDocument.load(pdfBytes);
  const page = pdf.getPages()[box.page ?? 0];
  if (!page) return pdfBytes;
  if (sig.png) {
    const img = await pdf.embedPng(sig.png);
    const scale = Math.min(box.width / img.width, box.height / img.height);
    const w = img.width * scale;
    const h = img.height * scale;
    page.drawImage(img, { x: box.x + (box.width - w) / 2, y: box.y, width: w, height: h });
  } else {
    const script = await pdf.embedFont(StandardFonts.HelveticaOblique);
    let size = 20;
    const name = safe(sig.name);
    while (size > 9 && script.widthOfTextAtSize(name, size) > box.width) size -= 1;
    page.drawText(name, { x: box.x + (box.width - script.widthOfTextAtSize(name, size)) / 2, y: box.y + 8, size, font: script, color: rgb(0.05, 0.1, 0.3) });
  }
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  page.drawText(safe(`Signed on ${sig.when}`), { x: box.x, y: box.y - 6, size: 6, font, color: rgb(0.3, 0.3, 0.35) });
  return pdf.save();
}
