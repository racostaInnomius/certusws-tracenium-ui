// src/components/Overview/overviewAccess.test.js
//
// Los tres estados de las capacidades no se mezclan: "aún no lo sé" y "no lo
// pude saber" no son "el rol no tiene nada".

import { describe, expect, it } from "vitest";
import { canFrom, pagesForRole, seesNothingOnOverview } from "./overviewAccess";

describe("overviewAccess", () => {
  it("⭐ sólo `enrollment` (el rol «App Review»): nada en el Overview; MDM / MAM y Device Enrollment", () => {
    const perms = new Set(["enrollment"]);
    expect(seesNothingOnOverview(perms)).toBe(true);
    expect(pagesForRole(perms).map((p) => p.label)).toEqual(["MDM / MAM", "Device Enrollment"]);
  });

  it("⚠️ sin saber el rol (undefined) o sin poder saberlo (null) NO es «no ve nada», y se permite todo", () => {
    for (const unknown of [undefined, null]) {
      expect(seesNothingOnOverview(unknown)).toBe(false);
      expect(canFrom(unknown)("remote_control")).toBe(true);
      expect(pagesForRole(unknown)).toEqual([]);
    }
  });

  it("una sola capacidad del Overview basta para tener la página", () => {
    expect(seesNothingOnOverview(new Set(["jobs"]))).toBe(false);
    expect(seesNothingOnOverview(new Set(["enrollment", "pki"]))).toBe(false);
  });

  it("un rol vacío no ve nada y no tiene páginas a las que ir", () => {
    expect(seesNothingOnOverview(new Set())).toBe(true);
    expect(pagesForRole(new Set())).toEqual([]);
  });

  it("can() responde por el Set conocido", () => {
    const can = canFrom(new Set(["assets_view"]));
    expect(can("assets_view")).toBe(true);
    expect(can("audit_log")).toBe(false);
  });

  it("MDM / MAM sale una vez aunque el rol tenga sus dos capacidades", () => {
    const labels = pagesForRole(new Set(["enrollment", "device_management", "alerts"])).map((p) => p.label);
    expect(labels).toEqual(["MDM / MAM", "Device Enrollment", "Alerts"]);
  });
});
