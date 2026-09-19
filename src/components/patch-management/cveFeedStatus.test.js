// Las líneas de estado de los feeds del catálogo CVE.
//
// Lo que se fija aquí es que ningún número salga sin decir QUÉ cuenta. La línea
// decía «41 CVEs from 12 products» y ese 41 eran las filas ESCRITAS, no lo que
// devolvió NVD ni lo que casó con nuestro software. El mismo malentendido ya
// costó una conclusión equivocada sobre «crowdstrike windows sensor».

import { describe, it, expect } from "vitest";
import { nvdStatusLine, kevStatusLine, timeAgo } from "./cveFeedStatus";

const NOW = Date.parse("2026-09-18T12:00:00Z");
const HACE_2H = "2026-09-18T10:00:00Z";

const corrida = (over = {}) => ({
  status: "completed",
  finishedAt: HACE_2H,
  summary: {
    productsInFleet: 96,
    productsQueried: 12,
    productsTruncated: false,
    cvesMapped: 38,
    cvesUpserted: 35,
    cvesAwaitingAnalysis: 6,
    errors: 0,
    productsRefused: 0,
    ...over,
  },
});

describe("nvdStatusLine", () => {
  it("⭐ cada número dice qué cuenta: mapeados en la línea, escritos en el detalle", () => {
    const r = nvdStatusLine(corrida(), NOW);
    expect(r.text).toBe("Last NVD sync 2h ago · 12 products checked · 38 CVEs matched our software");
    // Y el 35 no desaparece: está, pero llamado por su nombre.
    expect(r.detail).toContain("35 entries written");
    // Lo que NO puede pasar es que un número vaya suelto detrás de «CVEs».
    expect(r.text).not.toMatch(/35 CVEs/);
  });

  it("⚠️ una corrida vieja, sin `cvesMapped`, dice «stored» y no «matched»", () => {
    // Las corridas guardadas antes del 18-sep sólo tienen los escritos. Llamar
    // «matched» a ese número sería exactamente la mentira que se arregla aquí.
    const r = nvdStatusLine(corrida({ cvesMapped: undefined }), NOW);
    expect(r.text).toContain("35 CVEs stored");
    expect(r.text).not.toContain("matched");
    expect(r.detail).not.toContain("written");
  });

  it("⭐ los CVEs sin rango de versiones se explican, no se callan", () => {
    // Están guardados pero la detección no puede evaluar una versión contra
    // ellos: contarlos como cobertura sería un verde falso.
    const r = nvdStatusLine(corrida(), NOW);
    expect(r.detail).toMatch(/6 CVEs stored with no affected-version range/);
    expect(r.detail).toMatch(/not analysed them/);
  });

  it("cuando todo lo mapeado se escribió, no insinúa que falte algo", () => {
    const r = nvdStatusLine(corrida({ cvesMapped: 35, cvesUpserted: 35 }), NOW);
    expect(r.detail).toContain("All 35 entries written");
  });

  it("⚠️ una corrida cortada a medias no se presenta como completa", () => {
    // El estado en la base es «completed», pero preguntó 3 de 96 productos.
    const r = nvdStatusLine(
      corrida({ aborted: "NVD unreachable after 3 failures", productsQueried: 3 }),
      NOW
    );
    expect(r.text).toContain("cut short");
    expect(r.tone).toBe("warning");
    expect(r.detail).toContain("NVD unreachable after 3 failures.");
    // Las frases del detalle no se pegan entre sí.
    expect(r.detail).not.toMatch(/failures [A-Z]/);
  });

  it("el recorte de la rotación se dice con el total de la flota", () => {
    const r = nvdStatusLine(corrida({ productsTruncated: true, productsQueried: 100 }), NOW);
    expect(r.detail).toContain("Capped at 100 of 96 products");
  });

  it("fallos y rechazos de NVD aparecen en el detalle", () => {
    const r = nvdStatusLine(corrida({ errors: 2, productsRefused: 1 }), NOW);
    expect(r.detail).toContain("2 products failed to query");
    expect(r.detail).toContain("1 product refused by NVD");
  });

  it("los estados sin corrida no inventan cifras", () => {
    expect(nvdStatusLine(null, NOW)).toMatchObject({ text: "Never synced from NVD.", detail: null });
    expect(nvdStatusLine({ status: "running" }, NOW).text).toBe("NVD sync running…");
    const f = nvdStatusLine({ status: "failed", finishedAt: HACE_2H, error: "429 from NVD" }, NOW);
    expect(f).toMatchObject({ text: "Last NVD sync failed 2h ago", detail: "429 from NVD", tone: "error" });
  });

  it("singular y plural, para no leer «1 products»", () => {
    const r = nvdStatusLine(corrida({ productsQueried: 1, cvesMapped: 1, cvesUpserted: 1 }), NOW);
    expect(r.text).toContain("1 product checked");
    expect(r.text).toContain("1 CVE matched");
  });
});

describe("kevStatusLine", () => {
  const kev = (over = {}) => ({
    status: "completed",
    finishedAt: HACE_2H,
    summary: { fetched: 1310, upserted: 1204, removed: 3, catalogVersion: "2026.09.15", ...over },
  });

  it("⭐ «entries» era lo ESCRITO y se leía como el tamaño del catálogo", () => {
    const r = kevStatusLine(kev(), NOW);
    expect(r.text).toBe("KEV catalog refreshed 2h ago · 1,310 entries in the CISA feed (catalog 2026.09.15)");
    expect(r.detail).toContain("1,204 entries written");
  });

  it("⭐ una entrada que SALE del KEV es noticia: CISA la des-listó", () => {
    expect(kevStatusLine(kev(), NOW).detail).toMatch(/3 entries dropped out of the CISA catalog/);
    expect(kevStatusLine(kev({ removed: 0 }), NOW).detail).not.toMatch(/dropped out/);
  });

  it("⚠️ una corrida vieja, sin `fetched`, no se inventa el tamaño del feed", () => {
    const r = kevStatusLine(kev({ fetched: undefined }), NOW);
    expect(r.text).toContain("1,204 entries written");
    expect(r.text).not.toContain("in the CISA feed");
  });

  it("los estados sin corrida no inventan cifras", () => {
    expect(kevStatusLine(undefined, NOW).text).toBe("KEV catalog not synced yet.");
    expect(kevStatusLine({ status: "running" }, NOW).text).toBe("Refreshing CISA KEV catalog…");
    expect(kevStatusLine({ status: "failed", finishedAt: HACE_2H, error: "CISA 503" }, NOW).tone).toBe("error");
  });
});

describe("timeAgo", () => {
  it("escala de minutos a días y aguanta una fecha inservible", () => {
    expect(timeAgo("2026-09-18T11:59:40Z", NOW)).toBe("just now");
    expect(timeAgo("2026-09-18T11:30:00Z", NOW)).toBe("30m ago");
    expect(timeAgo(HACE_2H, NOW)).toBe("2h ago");
    expect(timeAgo("2026-09-15T12:00:00Z", NOW)).toBe("3d ago");
    expect(timeAgo(null, NOW)).toBe("");
    expect(timeAgo("no es una fecha", NOW)).toBe("");
  });
});
