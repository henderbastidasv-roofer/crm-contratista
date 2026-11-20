import { describe, expect, it } from "vitest";
import { normalizeStreet, parseRoofrProposal } from "./roofr-pdf";

const MAPLE =
  "Carlos Perez\nTechos Ejemplo LLC\n(832) 555-0100\ninfo@techosejemplo.com\nD a t e P r e p a r e d\nA u g u s t 2 0 , 2 0 2 6\nRoof Replacement\nEstimate\nLaura Gomez\nlaura.gomez@example.com\n(713) 555-0142\n7606 Maple Grove Street\nHouston, TX 77040";
const OAK =
  "Date Prepared\nJul 30, 2025\nRoof Replacement Estimate\nCarlos Perez\nTechos Ejemplo LLC\n(832) 555-0100\ninfo@techosejemplo.com\nMario Ruiz\nmario.ruiz@example.com\n(323) 555-0177\n15019 Oak Hollow Drive\nHumble, TX 77396";

describe("propuestas PDF de Roofr", () => {
  it("portada con letras separadas (Maple Grove)", () => {
    const r = parseRoofrProposal([MAPLE, "Summary\nSubtotal $9,298.00 $8,000.00\nTotal $8,000.00\nCustomer notes"]);
    expect(r).toMatchObject({ customerName: "Laura Gomez", customerEmail: "laura.gomez@example.com", street: "7606 Maple Grove Street", cityLine: "Houston, TX 77040", date: "2026-08-20", total: 8000 });
  });
  it("portada normal (Oak Hollow), sin total único", () => {
    const r = parseRoofrProposal([OAK, "Summary\nTotal\nCustomer notes"]);
    expect(r).toMatchObject({ customerName: "Mario Ruiz", street: "15019 Oak Hollow Drive", date: "2025-07-30", total: null });
  });
  it("calles iguales aunque se escriban distinto", () => {
    expect(normalizeStreet("7606 Maple Grove Street")).toBe(normalizeStreet("7606 maple grove st."));
  });
});
