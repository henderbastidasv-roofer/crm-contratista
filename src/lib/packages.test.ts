import { describe, expect, it } from "vitest";
import { buildPackageLines, DEFAULT_PACKAGES, itemQuantity, needsSquares, PACKAGE_CATALOG } from "./packages";
import { computeTotals } from "./money";

describe("paquetes", () => {
  it("cantidad por square: SQ al tercio de arriba, LF/EA al entero de arriba", () => {
    expect(itemQuantity({ qty_basis: "per_square", quantity: 1.1, unit: "SQ" }, 28)).toBe(31); // 30.8 → 31
    expect(itemQuantity({ qty_basis: "per_square", quantity: 1, unit: "SQ" }, 30.1)).toBe(30.33);
    expect(itemQuantity({ qty_basis: "per_square", quantity: 6.5, unit: "LF" }, 28)).toBe(182);
    expect(itemQuantity({ qty_basis: "fixed", quantity: 200, unit: "LF" }, 28)).toBe(200);
    expect(itemQuantity({ qty_basis: "per_square", quantity: 1, unit: "SQ" }, 0)).toBe(0);
  });

  it("usa el precio del catálogo salvo que el item traiga uno", () => {
    const lines = buildPackageLines(
      [
        { catalog_item_id: "a", description: "Shingles", unit: "SQ", qty_basis: "per_square", quantity: 1.1, unit_price: null, taxable: true, catalog: { name: "Shingles", unit: "SQ", unit_price: 150, taxable: true } },
        { catalog_item_id: "b", description: "Permit", unit: "EA", qty_basis: "fixed", quantity: 1, unit_price: 275, taxable: false, catalog: { name: "Permit", unit: "EA", unit_price: 250, taxable: false } },
      ],
      30,
    );
    expect(lines).toEqual([
      { catalog_item_id: "a", description: "Shingles", quantity: 33, unit: "SQ", unit_price: 150, taxable: true },
      { catalog_item_id: "b", description: "Permit", quantity: 1, unit: "EA", unit_price: 275, taxable: false },
    ]);
    // 33 × 150 = 4950 gravable + 275 sin impuesto; 8.25% de 4950 = 408.38
    expect(computeTotals(lines, 0.0825).total).toBe(5633.38);
  });

  it("sin squares, los items por square no se agregan (cantidad 0)", () => {
    const lines = buildPackageLines(
      [{ catalog_item_id: null, description: "Tear off", unit: "SQ", qty_basis: "per_square", quantity: 1, unit_price: 50, taxable: true }],
      0,
    );
    expect(lines).toEqual([]);
  });

  it("los 4 paquetes predeterminados solo usan items que existen en el catálogo", () => {
    const names = new Set(PACKAGE_CATALOG.map((c) => c.name));
    expect(DEFAULT_PACKAGES.map((p) => p.name)).toEqual([
      "Retail Good - Cambridge Class 3",
      "Retail Better - OC Duration",
      "Retail Best - OC Duration FLEX",
      "Roof Replacement",
      "Shingle Repair",
      "Valley Repair",
      "Maintenance",
    ]);
    for (const p of DEFAULT_PACKAGES) for (const it of p.items) expect(names.has(it.catalog)).toBe(true);
    expect(DEFAULT_PACKAGES.filter((p) => p.tier).map((p) => p.tier)).toEqual(["good", "better", "best"]);
    expect(needsSquares(DEFAULT_PACKAGES[3].items)).toBe(true);
    expect(needsSquares(DEFAULT_PACKAGES[4].items)).toBe(false);
  });

  it("retail: un solo precio por square, sin impuesto aparte", () => {
    const duration = buildPackageLines(
      [{ catalog_item_id: "d", description: "Complete roof replacement - Owens Corning Duration Class 3", unit: "SQ", qty_basis: "per_square", quantity: 1, unit_price: null, taxable: false, catalog: { name: "x", unit: "SQ", unit_price: 428, taxable: false } }],
      32,
    );
    expect(computeTotals(duration, 0.0825).total).toBe(13696); // 32 × $428
  });
});
