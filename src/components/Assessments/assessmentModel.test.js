// src/components/Assessments/assessmentModel.test.js

import { describe, expect, it } from "vitest";
import { adjustedScoreText, coverageText, describeRunNow, effectiveTarget, evidenceLine, liveExceptionCount, notAssessedReason, openBySeverity, projectionLabel, scheduleText, scoreDelta, sortFindings, targetGapText, exceptionHistoryLine, EXCEPTION_STATUS, exceptionGate, pendingRequestLine
} from "./assessmentModel";
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

describe("evidenceLine — permisos y dueños, no sólo el nombre", () => {
  it("un DN suelto se enseña tal cual", () => {
    expect(evidenceLine("CN=svc,OU=IT,DC=m")).toBe("CN=svc,OU=IT,DC=m");
  });

  it("⭐ un dueño dice cuántos objetos posee y un ejemplo", () => {
    expect(evidenceLine({ sid: "S-1-5-21-1-1105", name: "D\\helpdesk", objects: 7, exampleDn: "CN=svc,DC=m" })).toBe(
      "D\\helpdesk — 7 objects (e.g. CN=svc,DC=m)"
    );
    expect(evidenceLine({ sid: "S-1-5-21-1-1105", name: "D\\helpdesk", objects: 1 })).toBe("D\\helpdesk — 1 object");
  });

  it("un trustee dice su derecho, y sin nombre cae al SID", () => {
    expect(evidenceLine({ sid: "S-1-5-21-1-1106", rights: "WriteDacl", objects: 3 })).toBe("S-1-5-21-1-1106 — WriteDacl · 3 objects");
    expect(evidenceLine({ sid: null, name: null, rights: "GenericAll" })).toBe("(unresolved) — GenericAll");
  });
});

describe("score ajustado por excepciones", () => {
  it("cuenta sólo las excepciones VIVAS", () => {
    expect(liveExceptionCount([
      { exception: { active: true } },
      { exception: { active: false } },
      { exception: null },
      {}
    ])).toBe(1);
    expect(liveExceptionCount(null)).toBe(0);
  });

  it("⭐ lo dice con cuántas excepciones se ha llegado a ese número", () => {
    expect(adjustedScoreText(51, 58, 1)).toBe("58 with 1 accepted exception");
    expect(adjustedScoreText(51, 72, 3)).toBe("72 with 3 accepted exceptions");
  });

  it("⚠️ callado cuando no hay nada que decir: sin excepciones, o si coincide con el bruto", () => {
    expect(adjustedScoreText(51, 51, 0)).toBeNull();
    expect(adjustedScoreText(51, 51, 2)).toBeNull(); // p.ej. la excepción era sobre un pass
    expect(adjustedScoreText(51, null, 2)).toBeNull();
    expect(adjustedScoreText(null, 58, 2)).toBeNull();
  });
});

describe("historial de excepciones", () => {
  it("una línea dice quién, desde cuándo y hasta cuándo", () => {
    expect(exceptionHistoryLine({
      author: "ana", createdAt: "2026-09-24T10:00:00Z", expiresAt: "2026-12-23T23:59:59Z", status: "expired", closedAt: null
    })).toBe("ana · 2026-09-24 → 2026-12-23");
  });

  it("⭐ la que se cortó antes dice quién la cortó; la que se cumplió no lo dice", () => {
    const base = { author: "ana", createdAt: "2026-09-24T10:00:00Z", expiresAt: "2026-12-23T23:59:59Z" };
    expect(exceptionHistoryLine({ ...base, status: "revoked", closedAt: "2026-10-01T09:00:00Z", closedBy: "bruno" }))
      .toBe("ana · 2026-09-24 → 2026-12-23 · revoked by bruno on 2026-10-01");
    expect(exceptionHistoryLine({ ...base, status: "superseded", closedAt: "2026-10-01T09:00:00Z", closedBy: "bruno" }))
      .toBe("ana · 2026-09-24 → 2026-12-23 · replaced by bruno on 2026-10-01");
    // Caducada: se cumplió tal cual se concedió, así que no hay nadie a quien señalar.
    expect(exceptionHistoryLine({ ...base, status: "expired", closedAt: "2026-10-01T09:00:00Z", closedBy: "bruno" }))
      .toBe("ana · 2026-09-24 → 2026-12-23");
  });

  it("⚠️ «caducada» y «revocada» NO se leen igual: es la diferencia que mira el auditor", () => {
    expect(EXCEPTION_STATUS.expired.label).toBe("Expired");
    expect(EXCEPTION_STATUS.revoked.label).toBe("Revoked");
    expect(EXCEPTION_STATUS.expired.label).not.toBe(EXCEPTION_STATUS.revoked.label);
  });

  it("sin autor no se inventa uno, y una entrada rota no rompe la lista", () => {
    expect(exceptionHistoryLine({ author: null, createdAt: "2026-09-24T10:00:00Z", expiresAt: "2026-12-23T00:00:00Z", status: "expired" }))
      .toBe("(unknown) · 2026-09-24 → 2026-12-23");
    expect(exceptionHistoryLine(null)).toBe("");
    expect(exceptionHistoryLine({ author: "ana", createdAt: "no-es-fecha", expiresAt: "tampoco", status: "expired" })).toBe("ana");
  });
});

describe("aprobación de segunda persona", () => {
  const pending = { id: 1, reason: "acepto el riesgo", riskOwner: "ciso@acme.com", requestedBy: "ana", requestedAt: "2026-09-24T10:00:00Z", expiresAt: "2026-12-23T00:00:00Z" };

  it("🔴 quien la pidió NO puede aprobarla, aunque sea OWNER", () => {
    const g = exceptionGate({ pendingException: pending }, { subject: "ana", role: "OWNER" });
    expect(g.mode).toBe("pending");
    expect(g.canDecide).toBe(false);
    expect(g.blockedReason).toMatch(/Someone else has to approve it/);
    // Pero sí puede retirarla.
    expect(g.canCancel).toBe(true);
  });

  it("⭐ otro OWNER/ADMIN sí decide, y sin excusa que enseñar", () => {
    const g = exceptionGate({ pendingException: pending }, { subject: "bruno", role: "ADMIN" });
    expect(g.canDecide).toBe(true);
    expect(g.blockedReason).toBeNull();
  });

  it("⚠️ un rol sin aprobación ve por qué no hay botón, no un hueco mudo", () => {
    const g = exceptionGate({ pendingException: pending }, { subject: "carla", role: "MEMBER" });
    expect(g.canDecide).toBe(false);
    expect(g.blockedReason).toMatch(/owner or admin/i);
  });

  it("⚠️ una pendiente NO es una excepción concedida: el modo lo distingue", () => {
    expect(exceptionGate({ pendingException: pending, exception: null }, { subject: "b", role: "OWNER" }).mode).toBe("pending");
    expect(exceptionGate({ exception: { active: true, reason: "r" } }, { subject: "b", role: "OWNER" }).mode).toBe("granted");
    expect(exceptionGate({ exception: { active: false } }, { subject: "b", role: "OWNER" }).mode).toBe("none");
    expect(exceptionGate(null, null).mode).toBe("none");
  });

  it("la línea de la solicitud dice quién, cuándo, el dueño del riesgo y hasta cuándo duraría", () => {
    expect(pendingRequestLine(pending)).toBe("asked by ana on 2026-09-24 · risk owner ciso@acme.com · would expire 2026-12-23");
    expect(pendingRequestLine(null)).toBe("");
  });
});
