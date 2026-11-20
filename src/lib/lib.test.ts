import { describe, expect, it } from "vitest";
import { balanceDue, computeTotals, paymentStatus } from "./money";
import { isBot } from "./bots";
import { estimateSquares, pitchToRise, roundUpToThird } from "./roof";
import { canonicalJSON, newShareToken, sha256 } from "./hash";

describe("money", () => {
  it("suma, impuesto solo a lo gravable y redondea a centavos", () => {
    const t = computeTotals(
      [
        { quantity: 30.33, unit_price: 145.5, taxable: true }, // 4413.015 → 4413.02
        { quantity: 1, unit_price: 1200, taxable: false },
      ],
      0.0825,
    );
    expect(t.subtotal).toBe(5613.02);
    expect(t.taxable).toBe(4413.02);
    expect(t.tax).toBe(364.07);
    expect(t.total).toBe(5977.09);
  });

  it("saldo y estado de la invoice", () => {
    expect(balanceDue(1000, [{ amount: 400 }, { amount: "100.50" }])).toBe(499.5);
    expect(paymentStatus("sent", 1000, [{ amount: 400 }])).toBe("partial");
    expect(paymentStatus("viewed", 1000, [{ amount: 1000 }])).toBe("paid");
    expect(paymentStatus("draft", 1000, [{ amount: 1000 }])).toBe("draft");
    expect(paymentStatus("sent", 1000, [])).toBe("sent");
  });
});

describe("bots", () => {
  it("separa personas de escáneres de correo", () => {
    const iphone =
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1";
    const chrome =
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/157.0.0.0 Safari/537.36";
    expect(isBot(iphone)).toBe(false);
    expect(isBot(chrome)).toBe(false);
    expect(isBot("Mozilla/5.0 (Windows NT 5.1; rv:11.0) Gecko Firefox/11.0 (via ggpht.com GoogleImageProxy)")).toBe(true);
    expect(isBot("Mozilla/5.0 (compatible; Barracuda Sentinel)")).toBe(true);
    expect(isBot("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 HeadlessChrome/120.0 Safari/537.36")).toBe(true);
    expect(isBot("curl/8.4.0")).toBe(true);
    expect(isBot(null)).toBe(true);
  });
});

describe("roof", () => {
  it("convierte grados a x/12", () => {
    expect(pitchToRise(26.57)).toBe(6);
    expect(pitchToRise(33.69)).toBe(8);
  });

  it("redondea al tercio de square hacia arriba", () => {
    expect(roundUpToThird(30)).toBe(30);
    expect(roundUpToThird(30.1)).toBeCloseTo(30.333, 3);
  });

  it("calcula squares con desperdicio desde segmentos de Solar API", () => {
    // 4 caras de 70 m² inclinados = 280 m² = 3013.9 ft² = 30.14 SQ
    const segs = Array.from({ length: 4 }, () => ({ pitchDegrees: 26.57, stats: { areaMeters2: 70 } }));
    const e = estimateSquares(segs);
    expect(e.areaSqFt).toBe(3014);
    expect(e.rawSquares).toBe(30.14);
    expect(e.wastePct).toBe(10);
    expect(e.squaresWithWaste).toBe(33.33); // 33.15 → 33⅓
    expect(e.predominantPitch).toBe("6/12");
  });

  it("usa área de piso corregida por el pitch cuando falta el área inclinada", () => {
    const e = estimateSquares([{ pitchDegrees: 45, stats: { groundAreaMeters2: 100 } }], 0);
    expect(e.areaSqFt).toBe(1522); // 100 / cos45 = 141.42 m²
  });
});

describe("hash", () => {
  it("mismo contenido con llaves en otro orden da el mismo hash", () => {
    expect(sha256(canonicalJSON({ b: 1, a: [2, { d: 3, c: 4 }] }))).toBe(
      sha256(canonicalJSON({ a: [2, { c: 4, d: 3 }], b: 1 })),
    );
  });
  it("tokens largos y distintos", () => {
    const a = newShareToken();
    expect(a.length).toBeGreaterThanOrEqual(43);
    expect(a).not.toBe(newShareToken());
  });
});
