import { describe, expect, it } from "vitest";
import { counterMilestones, isActivated } from "./activation";

describe("activación", () => {
  it("los contadores alcanzan sus hitos en el umbral exacto", () => {
    expect(counterMilestones(49, 2)).toEqual([]);
    expect(counterMilestones(50, 2)).toEqual(["import_50_records"]);
    expect(counterMilestones(120, 3)).toEqual(["import_50_records", "invited_3_users"]);
  });

  it("activado solo con todos los pasos disponibles (el buzón no cuenta aún)", () => {
    const all = [
      "import_50_records",
      "invited_3_users",
      "deal_created_or_moved",
      "project_from_deal",
    ];
    expect(isActivated(new Set(all))).toBe(true);
    expect(isActivated(new Set(all.slice(1)))).toBe(false);
    expect(isActivated(new Set())).toBe(false);
  });
});
