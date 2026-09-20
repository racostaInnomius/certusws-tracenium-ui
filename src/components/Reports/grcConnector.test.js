// src/components/Reports/grcConnector.test.js
//
// Los helpers puros del panel de conectores GRC.

import { describe, it, expect } from "vitest";
import { TARGET_KINDS, targetKindLabel, describeTarget, deliveryColor } from "./grcConnector";

describe("targetKindLabel", () => {
  it("cae al propio valor si el tipo es desconocido", () => {
    expect(targetKindLabel("loquesea")).toBe("loquesea");
    expect(targetKindLabel(null)).toBe("—");
  });
});

describe("deliveryColor", () => {
  it("cada estado tiene su color, y lo desconocido no se pinta de éxito", () => {
    expect(deliveryColor("ok")).toBe("success");
    expect(deliveryColor("skipped")).toBe("warning");
    expect(deliveryColor("failed")).toBe("error");
    expect(deliveryColor("vete a saber")).toBe("default");
  });
});
// ── SharePoint (ADR-0014 E4, tercer destino) ────────────────────────
//
// El backend acepta `sharepoint`, pero si el selector del portal no lo
// ofrece nadie puede crear uno: un tipo montado y no alcanzable.
describe("destino sharepoint", () => {
  it("está en el selector, con etiqueta propia", () => {
    expect(TARGET_KINDS.map((k) => k.value)).toContain("sharepoint");
    expect(targetKindLabel("sharepoint")).toMatch(/SharePoint/i);
  });

  it("la descripción enseña la carpeta donde va a aterrizar el pack", () => {
    expect(describeTarget({ kind: "sharepoint", config: { siteId: "certusitm.sharepoint.com,a,b" } }))
      .toMatch(/04-Evidence\/<framework>\/<period>/);
    expect(describeTarget({ kind: "sharepoint", config: { siteId: "s", rootFolder: "Evidencia" } }))
      .toMatch(/Evidencia\/<framework>\/<period>/);
  });
});
