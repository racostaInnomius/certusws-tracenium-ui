// src/components/Policies/policyTransforms.cdpOla1.test.js
//
// Ola 1 de CDP en la policy del agente. Lo que se fija:
//   · ⭐ los dos enums de alcance van y vuelven, y un valor que el backend
//     rechazaría (`INVALID_TYPE`) no llega a escribirse;
//   · ⭐ en blanco NO se escribe la clave: el defecto del agente manda, y
//     fijarlo por escrito lo congelaría;
//   · ⭐ `cdp.probeRanges` SOBREVIVE a un guardado de Agent Settings. Esta
//     página no los edita y el guardado hace PATCH del bloque `cdp` entero:
//     sin el paso a través, tocar el intervalo los borraría en silencio;
//   · los topes de un rango son los MISMOS que valida el servidor.

import { describe, expect, it } from "vitest";
import {
  CDP_PROBE_RANGES_MAX,
  CDP_PROBE_RANGE_MAX_ADDRESSES,
  CDP_PROBE_RANGE_MAX_PORTS,
  formToPolicy,
  probeRangeIssues,
  probeRangeSize,
  readFormFromPolicy
} from "./policyTransforms";

const CATALOG = [{ key: "cdp" }];
const withCdp = (cdp) => ({ plugins: { enabled: ["cdp"] }, cdp });
const roundTrip = (cdp) => formToPolicy(readFormFromPolicy(withCdp(cdp), CATALOG), CATALOG).cdp ?? {};

describe("cdp.fileDiscovery / cdp.sshUserKeys", () => {
  it("a stored mode round-trips unchanged", () => {
    const out = roundTrip({ fileDiscovery: "configured", sshUserKeys: "full" });
    expect(out.fileDiscovery).toBe("configured");
    expect(out.sshUserKeys).toBe("full");
  });

  it.each(["default", "configured", "off"])("fileDiscovery accepts %s", (mode) => {
    expect(roundTrip({ fileDiscovery: mode }).fileDiscovery).toBe(mode);
  });

  it.each(["public-only", "full", "off"])("sshUserKeys accepts %s", (mode) => {
    expect(roundTrip({ sshUserKeys: mode }).sshUserKeys).toBe(mode);
  });

  it("a value outside the enum is dropped on read and never written back", () => {
    // El agente trata lo desconocido como su defecto EN SILENCIO, así que
    // "ful" parecería puesto. El formulario lo lee como «sin elegir».
    const form = readFormFromPolicy(withCdp({ sshUserKeys: "ful", fileDiscovery: "Default" }), CATALOG);
    expect(form.cdp.sshUserKeys).toBe("");
    expect(form.cdp.fileDiscovery).toBe("");
    const out = formToPolicy(form, CATALOG).cdp ?? {};
    expect(out).not.toHaveProperty("sshUserKeys");
    expect(out).not.toHaveProperty("fileDiscovery");
  });

  it("blank leaves the key out entirely instead of pinning today's default", () => {
    const out = roundTrip({ intervalSeconds: 3600 });
    expect(out.intervalSeconds).toBe(3600);
    expect(out).not.toHaveProperty("fileDiscovery");
    expect(out).not.toHaveProperty("sshUserKeys");
  });
});

describe("cdp.probeRanges survives an Agent Settings save", () => {
  const RANGES = [{ range: "10.0.4.0/24", ports: [443, 8443], sni: "www.corp.example" }];

  it("comes back byte-for-byte although this page never edits it", () => {
    const form = readFormFromPolicy(withCdp({ intervalSeconds: 3600, probeRanges: RANGES }), CATALOG);
    // Alguien cambia SÓLO el intervalo y guarda la sección CDP.
    form.cdp.intervalSeconds = 7200;
    const out = formToPolicy(form, CATALOG).cdp;
    expect(out.intervalSeconds).toBe(7200);
    expect(out.probeRanges).toEqual(RANGES);
  });

  it("no ranges means no key, not an empty array", () => {
    expect(roundTrip({ intervalSeconds: 3600 })).not.toHaveProperty("probeRanges");
  });
});

describe("probe range caps mirror the backend validator", () => {
  it("sizes a CIDR and a start-end pair", () => {
    expect(probeRangeSize("10.0.0.0/24")).toBe(256);
    expect(probeRangeSize("10.0.0.0/22")).toBe(CDP_PROBE_RANGE_MAX_ADDRESSES);
    expect(probeRangeSize("10.0.0.5")).toBe(null);
    expect(probeRangeSize("10.0.0.1-10.0.0.60")).toBe(60);
    expect(probeRangeSize("10.0.0.60-10.0.0.1")).toBe(null);
  });

  it("a prefix wider than /22 is not a size at all, so it is rejected", () => {
    expect(probeRangeSize("10.0.0.0/16")).toBe(null);
    expect(probeRangeIssues({ range: "10.0.0.0/16", ports: [443] })).not.toHaveLength(0);
  });

  it("a start-end pair over the address cap is rejected with its real size", () => {
    const issues = probeRangeIssues({ range: "10.0.0.0-10.0.7.255", ports: [443] });
    expect(issues.join(" ")).toMatch(/at most 1024 addresses/i);
    expect(issues.join(" ")).toMatch(/2,048/);
  });

  it("caps ports per entry and rejects a non-port", () => {
    const tooMany = probeRangeIssues({ range: "10.0.0.0/24", ports: [1, 2, 3, 4, 5, 6, 7, 8, 9] });
    expect(tooMany.join(" ")).toMatch(new RegExp(`at most ${CDP_PROBE_RANGE_MAX_PORTS} ports`, "i"));
    expect(probeRangeIssues({ range: "10.0.0.0/24", ports: [70000] }).join(" ")).toMatch(/Not a TCP port/i);
    expect(probeRangeIssues({ range: "10.0.0.0/24", ports: [] }).join(" ")).toMatch(/at least one tcp port/i);
  });

  it("SNI must be a hostname, and absent SNI is fine", () => {
    expect(probeRangeIssues({ range: "10.0.0.0/24", ports: [443] })).toEqual([]);
    expect(probeRangeIssues({ range: "10.0.0.0/24", ports: [443], sni: "www.corp.example" })).toEqual([]);
    expect(probeRangeIssues({ range: "10.0.0.0/24", ports: [443], sni: "not a host" }).join(" ")).toMatch(/DNS hostname/i);
  });

  it("the entry cap is the backend's", () => {
    expect(CDP_PROBE_RANGES_MAX).toBe(16);
  });
});
