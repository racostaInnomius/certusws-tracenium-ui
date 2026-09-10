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
    expect(groupLabel("RCP")).toBe("RCP");
  });

  it("sin grupo cae en 'Other'", () => {
    expect(groupLabel("")).toBe("Other");
    expect(groupLabel(null)).toBe("Other");
    expect(groupLabel(undefined)).toBe("Other");
  });

  it("cubre los cinco grupos que el registro declara hoy", () => {
    expect(Object.keys(REPORT_GROUP_LABELS).sort()).toEqual(
      ["Audit", "CDP", "Global", "PMP", "SCP"]
    );
  });
});

describe("REPORT_PAGES", () => {
  // ⭐ La razón de ser de la vista: con seis informes para once páginas, una
  // lista POR INFORME enseña seis filas y esconde las cinco ausencias.
  it("están las ONCE páginas que tienen botón «Report»", () => {
    expect(REPORT_PAGES).toHaveLength(11);
    expect(REPORT_PAGES.map((p) => p.label)).toEqual([
      "Overview",
      "Asset Management",
      "Software Delivery",
      "Security Compliance",
      "Remote Control",
      "Patch Management",
      "Crypto Discovery",
      "MDM / MAM",
      "Alerts",
      "Jobs",
      "Audit",
    ]);
  });

  it("una página sin informe propio dice qué abre su botón hoy", () => {
    // Sin esto, la fila diría "nada" justo cuando el operador acaba de pulsar
    // ese botón y ha salido algo — y dejaría de creerse la lista.
    for (const p of REPORT_PAGES) {
      if (!p.group) expect(p.borrows, p.label).toBeTruthy();
      else expect(p.borrows, p.label).toBeNull();
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

    expect(filas).toHaveLength(11);
    const assets = filas.find((f) => f.label === "Asset Management");
    expect(assets.types).toEqual([]);
    const cdp = filas.find((f) => f.label === "Crypto Discovery");
    expect(cdp.types).toHaveLength(1);
  });

  it("respeta el orden del menú", () => {
    const filas = groupTypesByPage([]);
    expect(filas[0].label).toBe("Overview");
    expect(filas[filas.length - 1].label).toBe("Audit");
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
    const filas = groupTypesByPage([tipo("rcp.sessions", "RCP")]);

    const otros = filas.find((f) => f.label === "Other");
    expect(otros).toBeTruthy();
    expect(otros.types.map((t) => t.key)).toEqual(["rcp.sessions"]);
  });

  it("sin tipos, ninguna fila trae informes", () => {
    const filas = groupTypesByPage([]);
    expect(filas.every((f) => f.types.length === 0)).toBe(true);
  });
});
