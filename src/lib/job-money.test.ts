import { describe, expect, it } from "vitest";
import { jobMoney, sumJobsMoney, type MoneyInvoice } from "./job-money";

const inv = (total: number, date: string, paid: { amount: number; on: string }[] = [], status = "sent", job_id = "j1"): MoneyInvoice => ({
  job_id,
  status,
  issue_date: date,
  tax_rate: 0,
  line_items: [{ quantity: 1, unit_price: total, taxable: false }],
  payments: paid.map((p) => ({ amount: p.amount, received_at: p.on })),
});

describe("jobMoney", () => {
  it("un recordatorio no se suma dos veces", () => {
    const r = jobMoney(15000, [inv(15000, "2026-10-02", [{ amount: 15000, on: "2026-10-05" }]), inv(15000, "2026-11-03")], "2026-11");
    expect(r.billed).toBe(15000);
    expect(r.billedMonth).toBe(0);
    expect(r.owed).toBe(0);
  });

  it("dos pagos que suman más que el trabajo se topan al total", () => {
    const r = jobMoney(29081.73, [
      inv(29081.73, "2025-11-26", [{ amount: 9244, on: "2025-11-26" }, { amount: 19837.73, on: "2025-11-26" }]),
      inv(19837.73, "2025-10-28", [{ amount: 19837.73, on: "2025-10-28" }]),
    ]);
    expect(r.collected).toBe(29081.73);
    expect(r.owed).toBe(0);
  });

  it("pagos en partes sí se suman hasta el total", () => {
    const r = jobMoney(30000, [inv(15000, "2026-10-01", [{ amount: 15000, on: "2026-10-01" }]), inv(15000, "2026-11-10")], "2026-11");
    expect(r.billed).toBe(30000);
    expect(r.billedMonth).toBe(15000);
    expect(r.owed).toBe(15000);
  });

  it("sin valor del trabajo, el total es la invoice más grande", () => {
    expect(jobMoney(0, [inv(1850, "2026-07-18"), inv(1850, "2026-07-24")]).billed).toBe(1850);
  });

  it("borradores y anuladas no cuentan", () => {
    expect(jobMoney(5000, [inv(5000, "2026-11-01", [], "draft"), inv(5000, "2026-11-01", [], "void")]).billed).toBe(0);
  });

  it("una fecha futura no cae en el mes actual", () => {
    expect(jobMoney(12650, [inv(12650, "2027-03-06")], "2026-11").billedMonth).toBe(0);
  });
});

describe("sumJobsMoney", () => {
  it("suma por trabajo", () => {
    const r = sumJobsMoney(
      [{ id: "a", value: 1000 }, { id: "b", value: 0 }],
      [inv(1000, "2026-11-01", [{ amount: 400, on: "2026-11-02" }], "partial", "a"), inv(500, "2026-11-01", [], "sent", "b"), inv(500, "2026-11-09", [], "sent", "b")],
      "2026-11",
    );
    expect(r).toEqual({ billed: 1500, collected: 400, owed: 1100, billedMonth: 1500, collectedMonth: 400 });
  });
});
