// src/components/discovery/coverageModel.test.js
//
// Las frases de Cobertura que hay que poder defender delante de un cliente.

import { describe, expect, it } from "vitest";
import { activitySignal, coverageCards, daysAgoText, runSummary, stateMeta } from "./coverageModel";

const NOW = Date.parse("2026-09-20T12:00:00.000Z");
const daysAgo = (d) => new Date(NOW - d * 86_400_000).toISOString();

describe("activitySignal", () => {
  it("⭐ la contraseña de máquina recién rotada manda sobre un lastLogon viejo", () => {
    // lastLogonTimestamp se replica con hasta 14 días de retraso: enseñarlo solo
    // haría parecer muerto a un equipo que está vivo.
    const s = activitySignal({ lastLogonUtc: daysAgo(40), passwordLastSetUtc: daysAgo(5) }, NOW);
    expect(s).toMatchObject({ source: "password", days: 5, label: "Domain password rotated" });
  });

  it("si el inicio de sesión es lo más reciente, se enseña ése", () => {
    const s = activitySignal({ lastLogonUtc: daysAgo(2), passwordLastSetUtc: daysAgo(20) }, NOW);
    expect(s).toMatchObject({ source: "logon", days: 2, label: "Last sign-in recorded" });
  });

  it("sin fechas no se inventa nada", () => {
    expect(activitySignal({}, NOW)).toMatchObject({ at: null, source: "none", label: "No date in AD" });
  });
});

describe("daysAgoText", () => {
  it("habla como una persona y nunca enseña un hueco vacío", () => {
    expect(daysAgoText(0)).toBe("today");
    expect(daysAgoText(1)).toBe("yesterday");
    expect(daysAgoText(45)).toBe("45 days ago");
    expect(daysAgoText(200)).toBe("7 months ago");
    expect(daysAgoText(900)).toBe("2 years ago");
    expect(daysAgoText(null)).toBe("—");
  });
});

describe("coverageCards", () => {
  it("⭐ la cifra destacada es el hueco, no el total de objetos de AD", () => {
    const cards = coverageCards({ total: 312, managed: 54, gap: 17, invited: 3, byState: { active: 118, dormant: 40, stale: 147, disabled: 7 } });
    expect(cards[0]).toMatchObject({ key: "gap", value: 17, emphasis: true });
    expect(cards.map((c) => c.key)).toEqual(["gap", "active", "managed", "invited", "total"]);
    expect(cards.find((c) => c.key === "total").value).toBe(312);
  });

  it("sin datos, ceros en vez de huecos", () => {
    expect(coverageCards(null).every((c) => c.value === 0)).toBe(true);
  });
});

describe("runSummary", () => {
  it("⚠️ una lectura que no se pudo hacer lo dice, y dice que la lista anterior se conserva", () => {
    expect(runSummary({ status: "missed" }).tone).toBe("warning");
    expect(runSummary({ status: "missed" }).text).toMatch(/collector was offline.*previous list is kept/);
    expect(runSummary({ status: "failed", error: "ldap_bind_failed" }).text).toMatch(/ldap_bind_failed/);
    expect(runSummary({ status: "failed", error: "run_expired" }).text).toMatch(/never came back/);
  });

  it("una lectura buena cuenta objetos y dominio; truncada, avisa", () => {
    expect(runSummary({ status: "complete", foundCount: 312, domain: "acme.local" }).text).toBe("312 computer objects read from acme.local.");
    expect(runSummary({ status: "complete", foundCount: 10000, error: "truncated" }).tone).toBe("warning");
  });

  it("sin lecturas todavía, y mientras corre", () => {
    expect(runSummary(null).text).toBe("No read yet.");
    expect(runSummary({ status: "running" }).text).toMatch(/Reading Active Directory/);
  });
});

describe("stateMeta", () => {
  it("cada estado tiene nombre y explicación; uno desconocido no rompe la tabla", () => {
    expect(stateMeta("active")).toMatchObject({ label: "Active", severity: "low" });
    expect(stateMeta("stale").help).toMatch(/180 days/);
    expect(stateMeta("lo que sea").label).toBe("lo que sea");
  });
});
