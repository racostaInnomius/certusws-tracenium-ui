// src/components/Compliance/bulkFixPlan.test.js
//
// Lo que decide qué promete el botón «Apply fixes (N)».

import { describe, it, expect } from "vitest";
import { bulkFixPlan, bulkFixSummary, batchFinished } from "./bulkFixPlan";

const f = (over) => ({ checkId: "c1", status: "fail", agentRemediable: true, ...over });

describe("bulkFixPlan", () => {
  it("⭐ parte la selección: lo que se aplica, lo que sólo da fichero y lo manual", () => {
    const plan = bulkFixPlan([
      f({ checkId: "a" }),
      f({ checkId: "b", agentRemediable: false, remediationPlan: { guard: "LSA settings can break logons" } }),
      f({ checkId: "c", agentRemediable: false }),
      f({ checkId: "d" }),
    ]);
    expect(plan.checkIds).toEqual(["a", "d"]);
    expect(plan.guarded.map((x) => x.checkId)).toEqual(["b"]);
    expect(plan.manual.map((x) => x.checkId)).toEqual(["c"]);
  });

  it("⚠️ lo que ya no falla se queda fuera, aunque tenga handler", () => {
    // Escribirle el valor a un equipo que ya cumple es trabajo inútil en un
    // equipo de alguien, y ensucia el historial de remediaciones.
    const plan = bulkFixPlan([f({ checkId: "a" }), f({ checkId: "b", status: "remediated" }), f({ checkId: "c", status: "pass" })]);
    expect(plan.checkIds).toEqual(["a"]);
    expect(plan.notFailing).toHaveLength(2);
  });

  it("un check repetido en dos hallazgos viaja una vez", () => {
    expect(bulkFixPlan([f({ checkId: "a" }), f({ checkId: "a" })]).checkIds).toEqual(["a"]);
  });

  it("sin checkId no se cuenta nada", () => {
    expect(bulkFixPlan([{ status: "fail", agentRemediable: true }]).checkIds).toEqual([]);
    expect(bulkFixPlan(null).checkIds).toEqual([]);
  });

  it("el resumen no enseña partes en cero", () => {
    const plan = bulkFixPlan([f({ checkId: "a" }), f({ checkId: "b", status: "pass" })]);
    expect(bulkFixSummary(plan)).toBe("1 can be applied from here · 1 no longer failing");
  });

  it("el lote termina cuando TODAS han terminado", () => {
    expect(batchFinished([{ status: "completed" }, { status: "running" }])).toBe(false);
    expect(batchFinished([{ status: "completed" }, { status: "failed" }])).toBe(true);
    expect(batchFinished([])).toBe(false);
  });
});
