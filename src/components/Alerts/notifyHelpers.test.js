import { describe, it, expect } from "vitest";
import {
  parseRecipients,
  validateRecipients,
  MAX_RECIPIENTS,
  hasAnyTarget,
  describeTargets,
  normalizeMatrix,
  severitiesFor,
  MATRIX_SEVERITIES,
} from "./notifyHelpers";

describe("parseRecipients", () => {
  it("accepts the three separators operators actually paste", () => {
    expect(parseRecipients("a@x.com\nb@x.com, c@x.com; d@x.com")).toEqual([
      "a@x.com",
      "b@x.com",
      "c@x.com",
      "d@x.com",
    ]);
  });

  it("trims, lowercases and drops blanks", () => {
    expect(parseRecipients("  OPS@Example.COM \n\n , ;  ")).toEqual(["ops@example.com"]);
  });

  it("returns [] for non-strings", () => {
    expect(parseRecipients(null)).toEqual([]);
    expect(parseRecipients(42)).toEqual([]);
  });
});

describe("validateRecipients", () => {
  it("passes a clean list", () => {
    const r = validateRecipients(["ops@example.com", "sec@example.com"]);
    expect(r.ok).toBe(true);
    expect(r.invalid).toEqual([]);
    expect(r.unique).toHaveLength(2);
  });

  it("reports malformed addresses instead of quietly dropping them", () => {
    // Silently dropping is exactly how a rule ends up looking configured
    // and never delivering.
    const r = validateRecipients(["ops@example.com", "not-an-email", "no@tld"]);
    expect(r.ok).toBe(false);
    expect(r.invalid).toEqual(["not-an-email", "no@tld"]);
  });

  it("dedupes without treating duplicates as an error", () => {
    const r = validateRecipients(["a@x.com", "a@x.com"]);
    expect(r.ok).toBe(true);
    expect(r.unique).toEqual(["a@x.com"]);
  });

  it("flags going over the recipient cap", () => {
    const many = Array.from({ length: MAX_RECIPIENTS + 1 }, (_, i) => `u${i}@x.com`);
    const r = validateRecipients(many);
    expect(r.overCap).toBe(true);
    expect(r.ok).toBe(false);
  });

  it("allows exactly the cap", () => {
    const exactly = Array.from({ length: MAX_RECIPIENTS }, (_, i) => `u${i}@x.com`);
    expect(validateRecipients(exactly).ok).toBe(true);
  });

  it("treats an empty list as valid — that is how delivery is turned off", () => {
    const r = validateRecipients([]);
    expect(r.ok).toBe(true);
    expect(r.unique).toEqual([]);
  });

  it("survives junk input", () => {
    expect(validateRecipients(null).ok).toBe(true);
    expect(validateRecipients(undefined).unique).toEqual([]);
  });
});

// ADR-0007 fase 1 — el destino deja de ser una lista de correos.
//
// El badge de la fila leía `notify.email.length`, así que una regla que
// avisa a los OWNER del tenant se mostraba como "No email" — justo lo
// contrario de lo que hace. Estas fijan que "tiene destino" y "qué
// destino" cuenten todas las formas de apuntar a alguien.

describe("hasAnyTarget", () => {
  it("cuenta roles y miembros, no solo direcciones", () => {
    expect(hasAnyTarget({ roles: ["OWNER"] })).toBe(true);
    expect(hasAnyTarget({ members: ["s1"] })).toBe(true);
    expect(hasAnyTarget({ email: ["a@b.co"] })).toBe(true);
  });

  it("es falso solo cuando no hay ningún destino — el estado 'solo consola'", () => {
    expect(hasAnyTarget({})).toBe(false);
    expect(hasAnyTarget({ email: [], roles: [], members: [] })).toBe(false);
    expect(hasAnyTarget(null)).toBe(false);
    // minSeverity sin destinatarios no es una entrega configurada.
    expect(hasAnyTarget({ minSeverity: "high" })).toBe(false);
  });
});

describe("describeTargets", () => {
  it("nombra el rol, que es lo que el operador eligió", () => {
    expect(describeTargets({ roles: ["OWNER", "ADMIN"] })).toBe("OWNER, ADMIN");
  });

  it("combina las tres formas en una sola frase", () => {
    expect(describeTargets({ roles: ["OWNER"], members: ["s1"], email: ["a@b.co"] }))
      .toBe("OWNER · 1 member · 1 address");
  });

  it("singulariza bien", () => {
    expect(describeTargets({ members: ["s1", "s2"] })).toBe("2 members");
    expect(describeTargets({ email: ["a@b.co", "c@d.co"] })).toBe("2 addresses");
  });
});

// ADR-0007 fase 2 — la matriz en la UI. Refleja el parser del backend,
// que es quien la impone de verdad; esto existe para que el operador vea
// el invariante mientras edita, no para hacerlo cumplir.

describe("normalizeMatrix (UI)", () => {
  it("fuerza console en toda severidad", () => {
    const m = normalizeMatrix({ critical: ["email"], high: [] });
    for (const sev of MATRIX_SEVERITIES) expect(m[sev], sev).toContain("console");
  });

  it("rellena las severidades ausentes con solo consola", () => {
    const m = normalizeMatrix({ critical: ["email"] });
    expect(m.low).toEqual(["console"]);
    expect(m.medium).toEqual(["console"]);
  });

  it("descarta canales inventados", () => {
    expect(normalizeMatrix({ critical: ["email", "sms"] }).critical).toEqual(["console", "email"]);
  });

  it("sobrevive a que no haya matriz guardada", () => {
    // Una regla anterior a la fase 2 no trae `channels`.
    const m = normalizeMatrix(undefined);
    expect(Object.keys(m).sort()).toEqual([...MATRIX_SEVERITIES].sort());
    expect(severitiesFor(m, "email")).toEqual([]);
  });
});

describe("severitiesFor (UI)", () => {
  it("nombra exactamente lo que va por correo", () => {
    const m = normalizeMatrix({ critical: ["email"], high: ["email"], medium: [], low: [] });
    expect(severitiesFor(m, "email")).toEqual(["critical", "high"]);
  });

  it("console siempre son las cuatro", () => {
    expect(severitiesFor(normalizeMatrix({}), "console")).toHaveLength(4);
  });
});
