// src/components/Assessments/assessmentModel.test.js

import { describe, expect, it } from "vitest";
import { coverageText, describeRunNow, effectiveTarget, notAssessedReason, openBySeverity, projectionLabel, scheduleText, scoreDelta, sortFindings, targetGapText } from "./assessmentModel";
import { formToPolicy, readFormFromPolicy } from "../Policies/policyTransforms";

describe("assessmentModel", () => {
  it("la cobertura se dice en palabras y sin inventar un denominador", () => {
    expect(coverageText({ assessable: 29, total: 30 })).toBe("29 of 30 assessable from this collector");
    expect(coverageText(null)).toBe("—");
  });

  it("explica los motivos de not_assessed que escribe el agente", () => {
    expect(notAssessedReason("requires_privileged_read:0x8007200A")).toMatch(/machine account cannot read this \(0x8007200A\)/);
    expect(notAssessedReason("requires_dc_registry")).toMatch(/not one/);
    expect(notAssessedReason("requires_agent:1.1.73")).toMatch(/agent 1\.1\.73 or later/);
    expect(notAssessedReason("algo_nuevo")).toBe("algo_nuevo");
  });

  it("ordena: fail > needs_review > not_assessed > pass, y dentro por criticidad", () => {
    const sorted = sortFindings([
      { controlId: "a", status: "pass", severity: "critical" },
      { controlId: "b", status: "fail", severity: "low" },
      { controlId: "c", status: "fail", severity: "critical" },
      { controlId: "d", status: "not_assessed", severity: "high" },
      { controlId: "e", status: "needs_review", severity: "critical" },
    ]);
    expect(sorted.map((f) => f.controlId)).toEqual(["c", "b", "e", "d", "a"]);
  });

  it("abiertos por criticidad cuentan fail y needs_review, nada más", () => {
    expect(openBySeverity([
      { status: "fail", severity: "critical" },
      { status: "needs_review", severity: "critical" },
      { status: "not_assessed", severity: "high" },
      { status: "pass", severity: "medium" },
    ])).toEqual({ critical: 2, high: 0, medium: 0, low: 0 });
  });

  it("Run now: missed y en curso tienen su mensaje", () => {
    expect(describeRunNow(null, { body: { error: "ASP_COLLECTOR_UNAVAILABLE", message: "primary offline" } })).toMatchObject({ severity: "warning" });
    expect(describeRunNow(null, { body: { error: "ASP_RUN_IN_PROGRESS" } })).toMatchObject({ severity: "info" });
    expect(describeRunNow({ run: { collectorDeviceId: "dc" } }, null)).toMatchObject({ severity: "success" });
  });

  it("agenda en UTC", () => {
    expect(scheduleText({ frequency: "weekly", window: { days: ["sun"], startHour: 2 } })).toBe("Weekly · sun · 02:00 UTC");
    expect(scheduleText({ frequency: "manual" })).toBe("Manual");
  });
});

describe("gauge del score", () => {
  const bands = { goodMin: 85, warningMin: 60 };

  it("sin objetivo propio, el objetivo es el umbral On track del tenant", () => {
    expect(effectiveTarget({ targetScore: null }, bands)).toEqual({ value: 85, source: "bands" });
    expect(effectiveTarget({ targetScore: 90 }, bands)).toEqual({ value: 90, source: "instance" });
    expect(effectiveTarget({ targetScore: 0 }, { goodMin: 70, warningMin: 50 })).toEqual({ value: 70, source: "bands" });
  });

  it("la variación es contra la corrida puntuada anterior; con una sola, no hay", () => {
    expect(scoreDelta([{ score: 51, scoredAt: "2026-09-14" }])).toBeNull();
    expect(scoreDelta([{ score: 51, scoredAt: "2026-09-07" }, { score: 57, scoredAt: "2026-09-14" }])).toEqual({ delta: 6, previousScore: 51, previousAt: "2026-09-07" });
  });

  it("la distancia al objetivo se dice en puntos", () => {
    expect(targetGapText(51, 85)).toBe("34 points to target");
    expect(targetGapText(84, 85)).toBe("1 point to target");
    expect(targetGapText(85, 85)).toBe("Target met");
    expect(targetGapText(90, 85)).toBe("Target met · 5 above");
    expect(targetGapText(null, 85)).toBe("No score yet");
  });

  it("las proyecciones se leen como una acción", () => {
    expect(projectionLabel({ severities: ["critical"], fixes: 1, score: 58 })).toBe("Fix the 1 critical finding");
    expect(projectionLabel({ severities: ["critical", "high"], fixes: 4, score: 71 })).toBe("Fix the 4 critical and high findings");
  });
});

describe("Agent Settings · sección asp (policyTransforms)", () => {
  const catalog = [{ key: "amp", required: true }, { key: "asp" }];

  it("lee y escribe los defectos de servidor sin tocar asp.collector", () => {
    const policy = {
      plugins: { enabled: ["amp", "asp"] },
      asp: { schedule: { frequency: "monthly", window: { days: ["mon"], startHour: 4 } }, evidenceLimit: 50, collector: { domains: [{ domain: "x" }] } },
    };
    const form = readFormFromPolicy(policy, catalog);
    expect(form.asp).toEqual({ frequency: "monthly", days: "mon", startHour: 4, evidenceLimit: 50 });
    const out = formToPolicy(form, catalog);
    expect(out.asp).toEqual({ schedule: { frequency: "monthly", window: { days: ["mon"], startHour: 4 } }, evidenceLimit: 50 });
  });

  it("vacío = defectos del backend: no se escribe la sección", () => {
    const form = readFormFromPolicy({ plugins: { enabled: ["amp", "asp"] } }, catalog);
    expect(formToPolicy(form, catalog).asp).toBeUndefined();
  });

  it("sin el plugin no se escribe nada de asp", () => {
    const form = readFormFromPolicy({ plugins: { enabled: ["amp"] }, asp: { evidenceLimit: 50 } }, catalog);
    expect(formToPolicy({ ...form, plugins: { amp: true, asp: false } }, catalog).asp).toBeUndefined();
  });
});
