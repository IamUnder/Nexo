import { describe, expect, it } from "vitest";
import { checkAmountChange, checkMove, checkNextAction, checkReopen, weightedCents } from "./deals";
import { DEFAULT_STAGES, normalizeStages, validateStages } from "./pipelines";

describe("etapas de un pipeline", () => {
  it("la plantilla por defecto es válida y termina en ganada y perdida", () => {
    expect(validateStages(DEFAULT_STAGES)).toBeNull();
    const n = normalizeStages(DEFAULT_STAGES);
    expect(n.at(-2)).toMatchObject({ kind: "won", probability: 100 });
    expect(n.at(-1)).toMatchObject({ kind: "lost", probability: 0 });
    expect(n.map((s) => s.position)).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it.each([
    [
      [
        { name: "Ganada", probability: 100, kind: "won" },
        { name: "Perdida", probability: 0, kind: "lost" },
      ],
      "needs_open_stage",
    ],
    [
      [
        { name: "A", probability: 10, kind: "open" },
        { name: "Perdida", probability: 0, kind: "lost" },
      ],
      "needs_one_won",
    ],
    [
      [
        { name: "A", probability: 10, kind: "open" },
        { name: "Ganada", probability: 100, kind: "won" },
      ],
      "needs_one_lost",
    ],
    [
      [
        { name: "A", probability: 10, kind: "open" },
        { name: "a", probability: 20, kind: "open" },
        { name: "G", probability: 100, kind: "won" },
        { name: "P", probability: 0, kind: "lost" },
      ],
      "duplicate_name",
    ],
    [[{ name: "  ", probability: 10, kind: "open" }], "empty_name"],
  ] as const)("rechaza configuraciones inválidas (%#)", (stages, problem) => {
    expect(validateStages(stages as never)).toBe(problem);
  });

  it("normaliza: ordena abiertas → ganada → perdida y fuerza 100 % / 0 % y 0-99 % en abiertas", () => {
    const n = normalizeStages([
      { name: "Perdida", probability: 40, kind: "lost" },
      { name: "Ganada", probability: 50, kind: "won" },
      { name: "  Nueva ", probability: 140, kind: "open" },
      { name: "Antes", probability: -5, kind: "open" },
    ]);
    expect(n.map((s) => [s.name, s.probability, s.kind])).toEqual([
      ["Nueva", 99, "open"],
      ["Antes", 0, "open"],
      ["Ganada", 100, "won"],
      ["Perdida", 0, "lost"],
    ]);
  });
});

describe("reglas de oportunidades", () => {
  it("la siguiente acción es obligatoria solo en abiertas y cuando el tenant lo exige", () => {
    const base = {
      required: true,
      status: "open",
      nextActionAt: null,
      nextActionText: null,
    } as const;
    expect(checkNextAction(base)).toBe("next_action_required");
    expect(checkNextAction({ ...base, nextActionText: "  " })).toBe("next_action_required");
    expect(checkNextAction({ ...base, nextActionText: "Llamar" })).toBeNull();
    expect(checkNextAction({ ...base, nextActionAt: new Date() })).toBeNull();
    expect(checkNextAction({ ...base, required: false })).toBeNull();
    expect(checkNextAction({ ...base, status: "won" })).toBeNull();
  });

  it("mover: desde cerrada hay que reabrir; a perdida exige motivo", () => {
    expect(checkMove({ fromStatus: "won", toKind: "open", lostReason: undefined })).toBe(
      "already_closed",
    );
    expect(checkMove({ fromStatus: "open", toKind: "lost", lostReason: undefined })).toBe(
      "lost_reason_required",
    );
    expect(checkMove({ fromStatus: "open", toKind: "lost", lostReason: "x" })).toBe(
      "lost_reason_required",
    );
    expect(checkMove({ fromStatus: "open", toKind: "lost", lostReason: "Precio" })).toBeNull();
    expect(checkMove({ fromStatus: "open", toKind: "open", lostReason: undefined })).toBeNull();
  });

  it("reabrir solo tiene sentido en cerradas", () => {
    expect(checkReopen("open")).toBe("not_closed");
    expect(checkReopen("won")).toBeNull();
    expect(checkReopen("lost")).toBeNull();
  });

  it("el importe de una oportunidad ganada es inmutable salvo con permiso de gestión", () => {
    expect(checkAmountChange({ status: "won", amountChanged: true, canManage: false })).toBe(
      "closed_amount_locked",
    );
    expect(checkAmountChange({ status: "won", amountChanged: true, canManage: true })).toBeNull();
    expect(checkAmountChange({ status: "open", amountChanged: true, canManage: false })).toBeNull();
    expect(checkAmountChange({ status: "won", amountChanged: false, canManage: false })).toBeNull();
  });

  it("pondera con céntimos enteros y redondea al más cercano", () => {
    expect(weightedCents(100_000, 25)).toBe(25_000);
    expect(weightedCents(333, 50)).toBe(167);
    expect(weightedCents(0, 80)).toBe(0);
  });
});
