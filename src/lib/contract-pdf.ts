import "server-only";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { APP_NAME, TIME_ZONE } from "./brand";

// PDF de contratos con pdf-lib. Fuente estándar Helvetica (incluida en todo lector de PDF).

const LETTER: [number, number] = [612, 792];
const MARGIN = 56;
const INK = rgb(0.04, 0.08, 0.15);
const MUTED = rgb(0.36, 0.42, 0.52);

/** Quita caracteres que Helvetica (WinAnsi) no puede escribir, para que el PDF nunca falle. */
function safe(text: string) {
  return text
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/…/g, "...")
    .replace(/•/g, "-")
    .replace(/[^\x09\x0a\x0d\x20-\x7e\xa0-\xff]/g, "?");
}

function wrap(text: string, font: PDFFont, size: number, width: number) {
  const out: string[] = [];
  for (const para of safe(text).split("\n")) {
    if (!para.trim()) {
      out.push("");
      continue;
    }
    let line = "";
    for (const word of para.split(/\s+/)) {
      const test = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(test, size) <= width) line = test;
      else {
        if (line) out.push(line);
        line = word;
      }
    }
    out.push(line);
  }
  return out;
}

export type CompanyInfo = { name: string; address: string | null; phone: string | null; email: string | null };

/** PDF de una plantilla de contrato ya llenada. */
export async function buildContractPdf(opts: { company: CompanyInfo; title: string; number: number; body: string }) {
  const pdf = await PDFDocument.create();
  pdf.setTitle(safe(opts.title));
  pdf.setProducer(APP_NAME);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const width = LETTER[0] - MARGIN * 2;
  let page: PDFPage = pdf.addPage(LETTER);
  let y = LETTER[1] - MARGIN;

  const header = () => {
    page.drawText(safe(opts.company.name), { x: MARGIN, y, size: 15, font: bold, color: INK });
    const info = [opts.company.address, opts.company.phone, opts.company.email].filter(Boolean).join(" · ");
    page.drawText(safe(info), { x: MARGIN, y: y - 15, size: 8.5, font, color: MUTED });
    page.drawText(safe(`Contract #${opts.number}`), { x: LETTER[0] - MARGIN - bold.widthOfTextAtSize(`Contract #${opts.number}`, 9), y, size: 9, font: bold, color: MUTED });
    page.drawLine({ start: { x: MARGIN, y: y - 26 }, end: { x: LETTER[0] - MARGIN, y: y - 26 }, thickness: 0.6, color: rgb(0.85, 0.89, 0.95) });
    y -= 50;
  };
  header();

  const lines = wrap(opts.body, font, 10.5, width);
  for (const [i, line] of lines.entries()) {
    if (y < MARGIN + 30) {
      page = pdf.addPage(LETTER);
      y = LETTER[1] - MARGIN;
      header();
    }
    // La primera línea (o las de solo mayúsculas) van en negrita como títulos.
    const isHeading = (i === 0 || /^[A-Z0-9 .&'-]{4,}$/.test(line)) && line.length < 70;
    page.drawText(line, { x: MARGIN, y, size: isHeading ? (i === 0 ? 14 : 10.5) : 10.5, font: isHeading ? bold : font, color: INK });
    y -= isHeading && i === 0 ? 22 : 15;
  }
  return pdf.save();
}

export type SignatureInfo = {
  contractTitle: string;
  number: number;
  signerName: string;
  signerEmail: string | null;
  signedAt: string;
  ip: string | null;
  userAgent: string | null;
  documentHash: string;
  consent: string;
  signatureImagePng: Uint8Array | null;
  companyName: string;
  /** Línea "Signed electronically…" al pie de cada página (no en documentos con diseño). */
  stampPages?: boolean;
};

/**
 * Copia firmada: el documento original + una línea de firma al pie de cada página
 * + una hoja final con la firma y la bitácora (quién, cuándo, desde dónde y la huella SHA-256).
 */
export async function signPdf(original: Uint8Array, s: SignatureInfo) {
  const pdf = await PDFDocument.load(original, { ignoreEncryption: true });
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const oblique = await pdf.embedFont(StandardFonts.HelveticaOblique);
  const when = new Intl.DateTimeFormat("en-US", { timeZone: TIME_ZONE, dateStyle: "long", timeStyle: "short" }).format(new Date(s.signedAt)) + " (Houston time)";

  const stamp = safe(`Signed electronically by ${s.signerName} on ${when} · Contract #${s.number} · ${s.documentHash.slice(0, 16)}`);
  for (const p of s.stampPages === false ? [] : pdf.getPages()) {
    const { width } = p.getSize();
    p.drawText(stamp, { x: 24, y: 12, size: 6.5, font, color: MUTED, maxWidth: width - 48 });
  }

  const page = pdf.addPage(LETTER);
  let y = LETTER[1] - MARGIN;
  const line = (label: string, value: string, size = 10) => {
    page.drawText(safe(label), { x: MARGIN, y, size: 8.5, font: bold, color: MUTED });
    const rows = wrap(value, font, size, LETTER[0] - MARGIN * 2 - 120);
    rows.forEach((r, i) => page.drawText(r, { x: MARGIN + 120, y: y - i * 13, size, font, color: INK }));
    y -= Math.max(1, rows.length) * 13 + 8;
  };
  page.drawText("SIGNATURE CERTIFICATE", { x: MARGIN, y, size: 15, font: bold, color: INK });
  y -= 18;
  page.drawText(safe(`${s.companyName} · ${s.contractTitle} · Contract #${s.number}`), { x: MARGIN, y, size: 9.5, font, color: MUTED });
  y -= 40;

  // Firma
  if (s.signatureImagePng) {
    const img = await pdf.embedPng(s.signatureImagePng);
    const scale = Math.min(240 / img.width, 80 / img.height);
    page.drawImage(img, { x: MARGIN, y: y - img.height * scale, width: img.width * scale, height: img.height * scale });
    y -= img.height * scale + 6;
  } else {
    page.drawText(safe(s.signerName), { x: MARGIN, y: y - 30, size: 28, font: oblique, color: INK });
    y -= 40;
  }
  page.drawLine({ start: { x: MARGIN, y }, end: { x: MARGIN + 260, y }, thickness: 0.8, color: INK });
  y -= 14;
  page.drawText(safe(s.signerName), { x: MARGIN, y, size: 10, font: bold, color: INK });
  y -= 36;

  line("Signed by", s.signerName);
  line("Email", s.signerEmail ?? "-");
  line("Date and time", when);
  line("IP address", s.ip ?? "-");
  line("Device", s.userAgent ?? "-", 8);
  line("Document SHA-256", s.documentHash, 8);
  line("Consent accepted", s.consent, 9);
  y -= 6;
  page.drawText(
    safe("Signed under the U.S. ESIGN Act and the Texas Uniform Electronic Transactions Act. The SHA-256 fingerprint identifies the exact document that was signed."),
    { x: MARGIN, y, size: 8, font, color: MUTED, maxWidth: LETTER[0] - MARGIN * 2, lineHeight: 11 },
  );
  return pdf.save();
}
