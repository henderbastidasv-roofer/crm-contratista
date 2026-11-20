import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { PDFDocument } from "pdf-lib";
import { buildContractPdf, signPdf } from "./contract-pdf";
import { DEFAULT_CONTRACT_TEMPLATES, fillContract } from "./contracts";

describe("PDF de contratos", () => {
  it("arma el contrato y la copia firmada con su hoja de firma", async () => {
    const body = fillContract(DEFAULT_CONTRACT_TEMPLATES.customer_contract.body, { nombre_completo: "José Pérez “Test”", compania: "Techos Ejemplo LLC" });
    expect(body).toContain("José Pérez");
    expect(body).toContain("_______________"); // los campos sin dato quedan para llenar a mano
    const original = await buildContractPdf({ company: { name: "Techos Ejemplo LLC", address: "100 Example St", phone: null, email: null }, title: "Roofing Agreement", number: 1, body: body.repeat(3) });
    const pages = (await PDFDocument.load(original)).getPageCount();
    expect(pages).toBeGreaterThan(1);
    const signed = await signPdf(original, {
      contractTitle: "Roofing Agreement", number: 1, signerName: "José Pérez", signerEmail: null, signedAt: new Date().toISOString(),
      ip: "1.2.3.4", userAgent: "Mozilla/5.0 test 😀", documentHash: "a".repeat(64), consent: "I agree", signatureImagePng: null, companyName: "Techos Ejemplo LLC",
    });
    expect((await PDFDocument.load(signed)).getPageCount()).toBe(pages + 1);
  });
});
