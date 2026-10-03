import { describe, expect, it } from "vitest";
import { addDays, computeHealth, deriveStatus, isOverdue } from "./rules";

const today = "2026-10-10";

describe("reglas de Delivery", () => {
  it("addDays suma días cruzando de mes", () => {
    expect(addDays("2026-10-30", 5)).toBe("2026-11-04");
  });

  it("vencida: no hecha y con fecha anterior a hoy", () => {
    expect(isOverdue({ status: "todo", dueOn: "2026-10-09" }, today)).toBe(true);
    expect(isOverdue({ status: "todo", dueOn: today }, today)).toBe(false);
    expect(isOverdue({ status: "done", dueOn: "2026-01-01" }, today)).toBe(false);
    expect(isOverdue({ status: "todo", dueOn: null }, today)).toBe(false);
  });

  it("salud: bloqueada → off_track; vencida → at_risk; si no → on_track", () => {
    expect(computeHealth([{ status: "blocked", dueOn: null }], today)).toBe("off_track");
    expect(computeHealth([{ status: "doing", dueOn: "2026-10-01" }], today)).toBe("at_risk");
    expect(computeHealth([{ status: "todo", dueOn: "2026-10-20" }], today)).toBe("on_track");
    expect(computeHealth([], today)).toBe("on_track");
  });

  it("estado derivado respeta planificado, hecho y cancelado", () => {
    expect(deriveStatus("in_progress", "at_risk")).toBe("at_risk");
    expect(deriveStatus("at_risk", "on_track")).toBe("in_progress");
    expect(deriveStatus("in_progress", "off_track")).toBe("blocked");
    for (const s of ["planned", "done", "cancelled"]) expect(deriveStatus(s, "off_track")).toBe(s);
  });
});
