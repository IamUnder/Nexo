import { describe, expect, it } from "vitest";
import { conversionRate, fillMonths, lastMonths, nextMonths, periodStart } from "./periods";

const now = new Date("2026-10-15T12:00:00.000Z");

describe("periodos de insights", () => {
  it("el inicio del periodo resta N días", () => {
    expect(periodStart("30d", now).toISOString()).toBe("2026-09-15T12:00:00.000Z");
    expect(periodStart("365d", now).toISOString()).toBe("2025-10-15T12:00:00.000Z");
  });

  it("lastMonths devuelve los 8 meses que acaban en el actual, cruzando de año", () => {
    expect(lastMonths(new Date("2026-02-10T00:00:00Z"), 8)).toEqual([
      "2025-07",
      "2025-08",
      "2025-09",
      "2025-10",
      "2025-11",
      "2025-12",
      "2026-01",
      "2026-02",
    ]);
  });

  it("nextMonths empieza en el mes actual", () => {
    expect(nextMonths(new Date("2026-11-30T00:00:00Z"), 4)).toEqual([
      "2026-11",
      "2026-12",
      "2027-01",
      "2027-02",
    ]);
  });

  it("fillMonths rellena los huecos con ceros y respeta el orden", () => {
    const rows = [{ month: "2026-09", amountCents: 500 }];
    expect(
      fillMonths(["2026-08", "2026-09", "2026-10"], rows, (month) => ({ month, amountCents: 0 })),
    ).toEqual([
      { month: "2026-08", amountCents: 0 },
      { month: "2026-09", amountCents: 500 },
      { month: "2026-10", amountCents: 0 },
    ]);
  });

  it("la conversión es null sin cierres y una proporción con ellos", () => {
    expect(conversionRate(0, 0)).toBeNull();
    expect(conversionRate(3, 1)).toBe(0.75);
    expect(conversionRate(0, 4)).toBe(0);
  });
});
