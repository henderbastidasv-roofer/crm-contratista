import { describe, expect, it } from "vitest";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { PDFDocument } from "pdf-lib";
import { CERTIFICATE_FIELDS, CERTIFICATE_SIGNATURE, placeSignature, renderFormPdf } from "./contract-form";

const BASE = process.env.CERT_TEMPLATE ?? "";

describe("certificado de terminación", () => {
  it.skipIf(!BASE || !existsSync(BASE))("escribe los datos y la firma sobre el diseño", async () => {
    const base = new Uint8Array(readFileSync(BASE));
    const filled = await renderFormPdf(base, CERTIFICATE_FIELDS, {
      nombre_completo: "Maria Guadalupe Hernandez-Villarreal",
      direccion: "15019 Sunset Creek Drive, Humble, TX 77396",
      fecha_contrato: "Aug 11, 2025",
      fecha_terminacion: "Nov 19, 2026",
    });
    const signed = await placeSignature(filled, CERTIFICATE_SIGNATURE, { name: "Maria Hernandez", png: null, when: "Nov 19, 2026 at 2:30 PM" });
    expect((await PDFDocument.load(signed)).getPageCount()).toBe(1);
    if (process.env.CERT_OUT) writeFileSync(process.env.CERT_OUT, signed);
  });
});
