// src/components/CryptoDiscovery/cdpSources.test.js
//
// El mapa de fuentes de Settings: mismos sectores que el sunburst, y de
// cada fuente si reporta, si está configurada y muda, si falla o si no
// está conectada.

import { describe, expect, it } from "vitest";
import { SECTIONS } from "./cdpSunburst";
import { CONNECTOR_KINDS_BY_BASE, sourcesByBase } from "./cdpSources";

const facet = (source, uniqueCerts, devices) => ({ keys: { source }, certs: uniqueCerts, uniqueCerts, devices });
const find = (bases, baseKey, key) => bases.find((b) => b.key === baseKey).sources.find((s) => s.key === key);

describe("sourcesByBase", () => {
  it("⭐ sin nada cargado: las cuatro bases del sunburst más Windows CA colgando de On-prem, en su orden, y cada fuente con su estado por defecto", () => {
    const bases = sourcesByBase({});
    expect(bases.map((b) => b.key)).toEqual(SECTIONS.map((b) => b.key));
    expect(bases.find((b) => b.key === "adcs").parent).toBe("onprem");
    // El agente escanea almacenes por defecto: «configurada, nada aún», no «no conectada».
    expect(find(bases, "onprem", "store").state).toBe("configured");
    expect(find(bases, "onprem", "cbom").state).toBe("unconfigured");
    expect(find(bases, "adcs", "adcs").state).toBe("unconfigured");
    expect(find(bases, "infra", "probe").state).toBe("unconfigured");
    expect(find(bases, "infra", "vcenter").state).toBe("unconfigured");
    expect(find(bases, "cloud", "ct").state).toBe("unconfigured");
    expect(find(bases, "external", "keyvault").state).toBe("unconfigured");
    const infra = bases.find((b) => b.key === "infra");
    expect(infra.total).toBe(3);
    expect(infra.reporting).toBe(0);
  });

  it("⭐ lo que el agente trae cuenta como reporting con certificados y equipos; los listeners apagados en la policy lo dicen", () => {
    const bases = sourcesByBase({ facets: [facet("store", 1043, 76), facet("java-store", 43, 12)], cdp: { scanTlsListeners: false } });
    expect(find(bases, "onprem", "store")).toMatchObject({ state: "reporting", detail: "1,043 certificates on 76 devices" });
    expect(find(bases, "onprem", "java-store").state).toBe("reporting");
    expect(find(bases, "onprem", "listener")).toMatchObject({ state: "unconfigured", detail: expect.stringMatching(/Off in the agent policy/) });
    expect(bases[0].reporting).toBe(2);
  });

  it("⭐ la CA de Windows va en su sector: una ficha por CA que reportó; nombrada en la policy pero muda = configurada", () => {
    const named = sourcesByBase({ cdp: { adcs: { hosts: ["msig-radius-ca"] } } });
    expect(find(named, "adcs", "adcs")).toMatchObject({ state: "configured", detail: expect.stringMatching(/msig-radius-ca/) });
    const reporting = sourcesByBase({
      adcs: [
        { sourceName: "adcs:MSIG-RADIUS-CA", caName: "MSIG-RADIUS-CA", assets: 4700, assetsValid: 812, lastSeen: "2026-09-06T20:00:00Z", columnsFound: { requestId: true, rawCertificate: true } },
        { sourceName: "adcs:CA02", caName: "CA02", assets: 0, assetsValid: 0, lastSeen: null, columnsFound: { requestId: false, rawCertificate: false } }
      ]
    });
    const ca = reporting.find((b) => b.key === "adcs");
    expect(ca.sources.map((s) => [s.label, s.state])).toEqual([["MSIG-RADIUS-CA", "reporting"], ["CA02", "failed"]]);
    // Sin cabecera juzgada (lectura vacia, columnsFound null) la CA que ya
    // leyo emisiones sigue reporting: era el falso «header not recognized» de T111.
    const idle = sourcesByBase({ adcs: [{ sourceName: "adcs:X", caName: "X", assets: 51, assetsValid: 51, lastSeen: "2026-09-16T03:09:06Z", columnsFound: null }] });
    expect(find(idle, "adcs", "adcs:X").state).toBe("reporting");
    // No se cuela en On-prem devices.
    expect(reporting[0].sources.some((s) => /adcs/i.test(s.key))).toBe(false);
  });

  it("las sondas remotas necesitan equipos que sondeen Y objetivos; con resultados, reportan", () => {
    expect(find(sourcesByBase({ cdp: { probeHosts: ["probe01"] } }), "infra", "probe")).toMatchObject({ state: "unconfigured", detail: expect.stringMatching(/No targets/) });
    expect(find(sourcesByBase({ cdp: { probeTargets: ["lb:443"] } }), "infra", "probe")).toMatchObject({ state: "unconfigured", detail: expect.stringMatching(/Runs from/) });
    expect(find(sourcesByBase({ cdp: { probeHosts: ["probe01"], probeTargets: ["lb:443"] } }), "infra", "probe").state).toBe("configured");
    expect(find(sourcesByBase({ facets: [facet("probe", 3, 1)], cdp: { probeHosts: ["probe01"], probeTargets: ["lb:443", "db:5432"] } }), "infra", "probe")).toMatchObject({ state: "reporting", detail: "3 certificates from 2 targets, probed from 1 device" });
  });

  it("⭐ cada conector cae en el sector de su tipo con el estado de su última corrida; los dominios públicos enseñan los dominios", () => {
    const bases = sourcesByBase({
      connectors: [
        { connectorId: 1, kind: "keyvault", label: "Prod vault", enabled: true, lastRunAt: "2026-09-05T06:00:00Z", lastStatus: "ok", lastSummary: { certificates: 120, keys: 11 } },
        { connectorId: 2, kind: "ct", label: "Public domains", config: { domains: ["tracenium.com"] }, enabled: true, lastRunAt: "2026-09-05T22:22:00Z", lastStatus: "ok", lastSummary: { certificates: 8, keys: 0 } },
        { connectorId: 3, kind: "acm", label: "AWS prod", enabled: true, lastRunAt: "2026-09-04T06:00:00Z", lastStatus: "failed", lastError: "AWS denied access", lastSummary: null },
        { connectorId: 4, kind: "k8s", label: "Prod cluster", enabled: false, lastRunAt: null },
        { connectorId: 5, kind: "gcp", label: "GCP", enabled: true, lastRunAt: null }
      ]
    });
    expect(find(bases, "external", "connector:1")).toMatchObject({ state: "reporting", label: "Azure Key Vault · Prod vault" });
    expect(find(bases, "external", "vault").state).toBe("unconfigured");
    expect(find(bases, "cloud", "connector:2")).toMatchObject({ state: "reporting", label: "Public domains (CT) · tracenium.com" });
    expect(find(bases, "cloud", "connector:3")).toMatchObject({ state: "failed", detail: "AWS denied access" });
    expect(find(bases, "cloud", "connector:5").state).toBe("configured");
    expect(find(bases, "infra", "connector:4").state).toBe("disabled");
    expect(bases.find((b) => b.key === "cloud").reporting).toBe(1);
  });

  it("SSH y CBOM salen del resumen de activos; un origen que nadie reclama no se pierde", () => {
    const bases = sourcesByBase({
      assets: {
        sources: [{ sourceName: "ssh", assets: 38 }, { sourceName: "scanner-q3", assets: 12 }, { sourceName: "mystery", assets: 2 }, { sourceName: "adcs:X", assets: 5 }, { sourceName: "keyvault:kv", assets: 3 }],
        imports: [{ sourceName: "scanner-q3" }]
      }
    });
    expect(find(bases, "onprem", "ssh")).toMatchObject({ state: "reporting", detail: "38 host keys" });
    expect(find(bases, "onprem", "cbom")).toMatchObject({ state: "reporting", detail: "1 import, 12 assets" });
    expect(find(bases, "onprem", "other")).toMatchObject({ state: "reporting", detail: "mystery (2)" });
  });

  it("los tipos de conector por sector cubren todos los tipos, una vez cada uno", () => {
    const all = Object.values(CONNECTOR_KINDS_BY_BASE).flat();
    expect([...all].sort()).toEqual(["acm", "ct", "gcp", "k8s", "keyvault", "vault"]);
    expect(new Set(all).size).toBe(all.length);
  });
});

describe("sourcesByBase — vCenter por el gateway de infraestructura", () => {
  const gw = (over = {}) => ({ id: 7, name: "MSIG-vCenter-Gateway", vcenterUrl: "https://vcenter.corp.example", readCertificates: true, credentialState: "delivered", health: "verified", ...over });

  it("⭐ un gateway que lee y ya reportó es reporting con hosts y vigentes; el mismo gateway sin lectura es «no conectado»", () => {
    const on = sourcesByBase({ gateways: [gw()], vcenterSources: [{ sourceName: "vcenter:vcenter.corp.example", host: "vcenter.corp.example", hosts: 3, machine: true, assets: 4, assetsValid: 4, lastSeen: "2026-09-14T10:00:00.000Z" }] });
    expect(find(on, "infra", "vcenter:7")).toMatchObject({ state: "reporting", label: "vCenter · MSIG-vCenter-Gateway", detail: expect.stringMatching(/3 ESXi hosts \+ vCenter · 4 valid certificates/) });
    expect(on.find((b) => b.key === "infra").reporting).toBe(1);
    const off = sourcesByBase({ gateways: [gw({ readCertificates: false })] });
    expect(find(off, "infra", "vcenter:7")).toMatchObject({ state: "unconfigured", detail: expect.stringMatching(/Reads certificates/) });
  });

  it("lee pero aún nada: configurada, y dice si falta la credencial o si la verificación falló", () => {
    expect(find(sourcesByBase({ gateways: [gw()] }), "infra", "vcenter:7")).toMatchObject({ state: "configured", detail: expect.stringMatching(/next Crypto Discovery scan/) });
    expect(find(sourcesByBase({ gateways: [gw({ credentialState: "not_configured" })] }), "infra", "vcenter:7")).toMatchObject({ state: "configured", detail: expect.stringMatching(/No credential/) });
    expect(find(sourcesByBase({ gateways: [gw({ health: "failed", lastVerifyClassify: "bad_credentials" })] }), "infra", "vcenter:7")).toMatchObject({ state: "failed", detail: expect.stringMatching(/bad_credentials/) });
  });
});
