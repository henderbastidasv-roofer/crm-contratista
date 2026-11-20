import { describe, expect, it } from "vitest";
import { addDays, houstonParts, houstonToIso, isoToHoustonInput } from "./calendar";
import { fillTemplate } from "./templates";

describe("horas de Houston", () => {
  it("invierno (CST, UTC-6)", () => {
    expect(houstonToIso("2026-11-20T10:30")).toBe("2026-11-20T16:30:00.000Z");
  });
  it("verano (CDT, UTC-5)", () => {
    expect(houstonToIso("2026-07-04T09:00")).toBe("2026-07-04T14:00:00.000Z");
  });
  it("ida y vuelta", () => {
    expect(isoToHoustonInput(houstonToIso("2026-03-09T08:15"))).toBe("2026-03-09T08:15");
    expect(houstonParts("2026-11-19T05:30:00Z").date).toBe("2026-11-18");
  });
  it("sumar días cruzando el mes", () => {
    expect(addDays("2026-11-30", 1)).toBe("2026-12-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });
});

describe("plantillas", () => {
  it("llena los campos y deja vacíos los que faltan", () => {
    expect(fillTemplate("Hi {{nombre}}, see you {{ fecha_cita }} {{hora_cita}}", { nombre: "Laura", fecha_cita: "Friday" })).toBe("Hi Laura, see you Friday ");
  });
});
