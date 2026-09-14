import { describe, expect, it } from "vitest";
import { REPORT_PAGES, REPORT_GROUP_LABELS, groupLabel, groupTypesByPage } from "./reportGroups";

const tipo = (key, group) => ({ key, label: key, group });

describe("groupLabel", () => {
  it("traduce la sigla del plugin al nombre que la página tiene en el menú", () => {
    expect(groupLabel("SCP")).toBe("Security Compliance");
    expect(groupLabel("PMP")).toBe("Patch Management");
    expect(groupLabel("CDP")).toBe("Crypto Discovery");
  });

  it("deja igual los grupos que ya se llaman como su página", () => {
    expect(groupLabel("Audit")).toBe("Audit");
  });

  it("'Global' es Overview: no tiene plugin, y es la página que resume", () => {
    expect(groupLabel("Global")).toBe("Overview");
  });

  it("un grupo desconocido se enseña TAL CUAL, no como 'Other'", () => {
    // Si el backend añade un plugin y aquí falta su rótulo, ver la sigla es
    // feo pero deja el informe encontrable. Mandarlo a "Other" lo escondería
    // entre los demás y nadie se enteraría de que falta una línea en el mapa.
    expect(groupLabel("XYZ")).toBe("XYZ");
  });

  it("sin grupo cae en 'Other'", () => {
    expect(groupLabel("")).toBe("Other");
    expect(groupLabel(null)).toBe("Other");
    expect(groupLabel(undefined)).toBe("Other");
  });

  it("cubre los grupos del registro, incluidos los reservados para los informes que faltan", () => {
    // AMP entra con `amp.asset-executive` (ADR-0021). SDP, RCP, ASP, MDM y
    // Alerts están reservados antes que sus informes, igual que en el
    // `ReportType.group` del backend.
    expect(Object.keys(REPORT_GROUP_LABELS).sort()).toEqual(
      ["AMP", "ASP", "Alerts", "Audit", "CDP", "Global", "MDM", "PKI", "PMP", "RCP", "SCP", "SDP"]
    );
  });

  it("un grupo reservado se rotula con el nombre de su página", () => {
    expect(groupLabel("RCP")).toBe("Remote Control");
    expect(groupLabel("ASP")).toBe("Assessment Suite");
  });
});

describe("REPORT_PAGES", () => {
  // ⭐ La razón de ser de la vista: con ocho informes para doce páginas, una
  // lista POR INFORME enseña ocho filas y esconde las seis ausencias.
  it("están las doce páginas de dominio del menú, en su orden, y PKI de Settings al final", () => {
    expect(REPORT_PAGES).toHaveLength(13);
    expect(REPORT_PAGES.map((p) => p.label)).toEqual([
      "Overview",
      "Asset Management",
      "Software Delivery",
      "Security Compliance",
      "Remote Control",
      "Patch Management",
      "Crypto Discovery",
      "Assessment Suite",
      "MDM / MAM",
      "Alerts",
      "Jobs",
      "Audit",
      "PKI",
    ]);
  });

  it("⚠️ Assessment Suite está: una página del menú fuera de esta lista no aparece ni como ausencia", () => {
    const asp = REPORT_PAGES.find((p) => p.page === "assessments");
    expect(asp).toMatchObject({ group: "ASP", plugin: "asp", borrows: null });
  });

  it("una página que presta un informe no puede tener grupo sin decidir Y además no prestar nada", () => {
    // Sin grupo y sin préstamo, la fila no tendría nada que decir de sí misma.
    for (const p of REPORT_PAGES) {
      if (!p.group) expect(p.borrows, p.label).toBeTruthy();
    }
  });

  it("cada `group` declarado existe en el mapa de rótulos", () => {
    for (const p of REPORT_PAGES) {
      if (p.group) expect(REPORT_GROUP_LABELS[p.group], p.label).toBeTruthy();
    }
  });
});

describe("groupTypesByPage", () => {
  it("⭐ las páginas SIN informe salen igualmente, con la lista vacía", () => {
    const filas = groupTypesByPage([tipo("cdp.cbom", "CDP")]);

    expect(filas).toHaveLength(13);
    // Jobs: no tiene informe propio ni grupo reservado. Software Delivery y
    // Asset Management ya tienen el suyo, y usarlas de ejemplo de "sin informe"
    // dejaría el test pasando mientras dice algo que ya no es cierto.
    const jobs = filas.find((f) => f.label === "Jobs");
    expect(jobs.types).toEqual([]);
    const cdp = filas.find((f) => f.label === "Crypto Discovery");
    expect(cdp.types).toHaveLength(1);
  });

  it("respeta el orden del menú", () => {
    const filas = groupTypesByPage([]);
    expect(filas[0].label).toBe("Overview");
    // PKI cuelga de Settings, no del menú de dominio: va detrás de todo.
    expect(filas[filas.length - 1].label).toBe("PKI");
  });

  it("el informe de certificados cae en la fila de PKI, no en 'Other'", () => {
    const filas = groupTypesByPage([tipo("pki.agent-certificates", "PKI")]);
    expect(filas.find((f) => f.page === "pki")?.types.map((t) => t.key)).toEqual(["pki.agent-certificates"]);
    expect(filas.some((f) => f.label === "Other")).toBe(false);
  });

  it("⚠️ el informe de activos cae en SU página, no en 'Other'", () => {
    // Con la fila de Asset Management en `group: null`, `amp.asset-executive`
    // habría ido a parar a "Other", al fondo, mientras esa fila seguía
    // diciendo que la página no tenía informe propio.
    const filas = groupTypesByPage([tipo("amp.asset-executive", "AMP")]);
    const assets = filas.find((f) => f.label === "Asset Management");
    expect(assets.types.map((t) => t.key)).toEqual(["amp.asset-executive"]);
    expect(assets.borrows).toBeNull();
    expect(filas.find((f) => f.label === "Other")).toBeUndefined();
  });

  it("agrupa varios informes bajo la misma página", () => {
    const filas = groupTypesByPage([
      tipo("scp.compliance-evidence", "SCP"),
      tipo("scp.evidence-pack", "SCP"),
    ]);
    const scp = filas.find((f) => f.label === "Security Compliance");
    expect(scp.types.map((t) => t.key)).toEqual(["scp.compliance-evidence", "scp.evidence-pack"]);
  });

  it("⚠️ un grupo que no case con ninguna página NO se pierde", () => {
    // Perder un informe del catálogo porque nadie actualizó una tabla sería
    // peor que enseñar una fila fea: el operador dejaría de poder generarlo.
    const filas = groupTypesByPage([tipo("xyz.something", "XYZ")]);

    const otros = filas.find((f) => f.label === "Other");
    expect(otros).toBeTruthy();
    expect(otros.types.map((t) => t.key)).toEqual(["xyz.something"]);
  });

  it("⭐ el primer informe de un grupo reservado cae en SU página, no en 'Other'", () => {
    // Es para lo que se reservan las siglas antes de que exista el informe.
    const filas = groupTypesByPage([tipo("rcp.access-audit", "RCP"), tipo("asp.service-assessment", "ASP")]);
    expect(filas.find((f) => f.label === "Remote Control").types.map((t) => t.key)).toEqual(["rcp.access-audit"]);
    expect(filas.find((f) => f.label === "Assessment Suite").types.map((t) => t.key)).toEqual(["asp.service-assessment"]);
    expect(filas.find((f) => f.label === "Other")).toBeUndefined();
  });

  it("sin tipos, ninguna fila trae informes", () => {
    const filas = groupTypesByPage([]);
    expect(filas.every((f) => f.types.length === 0)).toBe(true);
  });
});
