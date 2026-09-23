// src/components/CryptoDiscovery/certEndpoints.test.js
//
// Ola 1.2 — la semántica de un extremo TLS, fijada donde vive.
//
// ⭐ El test que importa es `sniState`: `sni: null` NO es un dato que falte,
// es lo que sirve la IP desnuda cuando nadie le pide un nombre — el
// certificado por defecto del servidor, que suele ser el olvidado. Pintarlo
// como «desconocido» borraría el hallazgo.

import { describe, expect, it } from "vitest";
import {
  discoveryState,
  endpointAddress,
  endpointSourceLabel,
  kemState,
  readEndpoint,
  readEndpoints,
  sniState,
  summarizeEndpoints
} from "./certEndpoints";

const ep = (over = {}) => ({
  agentId: "a1",
  source: "probe",
  targetHost: "10.0.4.17",
  port: 443,
  sni: null,
  sweepRange: null,
  protocol: "TLSv1.3",
  cipher: "TLS_AES_256_GCM_SHA384",
  kexGroup: "x25519",
  kemHybrid: false,
  lastSeen: "2026-09-20T10:00:00.000Z",
  ...over
});

describe("⭐ no SNI is a measured fact, not missing data", () => {
  it("a probe with no SNI is «the bare IP», and says so", () => {
    const s = sniState(ep({ sni: null }));
    expect(s.state).toBe("default");
    expect(s.label).toMatch(/bare IP/i);
    // La frase que impide que alguien lo lea como un hueco.
    expect(s.hint).toMatch(/measured fact, not missing data/i);
    expect(s.hint).toMatch(/default certificate/i);
    // Y nunca las palabras que lo convertirían en un dato ausente.
    expect(s.label.toLowerCase()).not.toMatch(/unknown|missing|not collected|n\/a/);
  });

  it("a probe with an SNI shows the hostname that was asked for", () => {
    const s = sniState(ep({ sni: "www.corp.example" }));
    expect(s.state).toBe("named");
    expect(s.label).toBe("www.corp.example");
  });

  it("⭐ a local listener is «not applicable», a THIRD state — it has no ClientHello", () => {
    // Un listener nunca puede traer SNI. Meterlo en el mismo cubo que «la IP
    // desnuda contestó esto» inflaría el hallazgo con filas estructurales.
    const s = sniState(ep({ source: "listener", targetHost: null, sni: null }));
    expect(s.state).toBe("not-applicable");
    expect(s.state).not.toBe("default");
    expect(s.hint).toMatch(/Nothing is missing/i);
  });
});

describe("⭐ a sweep range is how it was found", () => {
  it("names the range that found it, and says nobody listed the host", () => {
    const d = discoveryState(ep({ sweepRange: "10.0.4.0/24" }));
    expect(d.state).toBe("sweep");
    expect(d.label).toBe("swept 10.0.4.0/24");
    expect(d.hint).toMatch(/Nobody listed this host/i);
    expect(d.hint).toMatch(/10\.0\.4\.0\/24/);
  });

  it("no range on a probe means somebody wrote the target down", () => {
    expect(discoveryState(ep({ sweepRange: null })).state).toBe("named");
  });

  it("a listener is neither: it was not reached over the network", () => {
    expect(discoveryState(ep({ source: "listener", sweepRange: null })).state).toBe("listener");
  });
});

describe("⭐ the key exchange is tri-state", () => {
  it("null is «not determined», never «classical»", () => {
    const k = kemState(ep({ kemHybrid: null }));
    expect(k.state).toBe("unknown");
    expect(k.tone).toBe("neutral");
    expect(k.label).not.toMatch(/classical/i);
    expect(k.hint).toMatch(/not «classical»/i);
  });

  it("true and false are the two real verdicts, and look different", () => {
    expect(kemState(ep({ kemHybrid: true })).state).toBe("hybrid");
    expect(kemState(ep({ kemHybrid: true })).tone).toBe("good");
    expect(kemState(ep({ kemHybrid: false })).state).toBe("classical");
    expect(kemState(ep({ kemHybrid: false })).tone).toBe("warn");
  });
});

describe("reading and ordering", () => {
  it("a missing field is null, never invented", () => {
    const e = readEndpoint({ agentId: "a1", port: 443 });
    expect(e.protocol).toBe(null);
    expect(e.cipher).toBe(null);
    expect(e.sweepRange).toBe(null);
    expect(e.kemHybrid).toBe(null);
    expect(e.targetHost).toBe(null);
  });

  it("⭐ what turned up on its own comes first", () => {
    // Un barrido es lo que nadie esperaba; un listener es lo que ya se
    // sabía. El orden es el de la sorpresa.
    const rows = readEndpoints([
      ep({ source: "listener", targetHost: null, port: 8443 }),
      ep({ targetHost: "lb.corp", sni: "lb.corp" }),
      ep({ targetHost: "10.0.4.17", sweepRange: "10.0.4.0/24" })
    ]);
    expect(rows.map((r) => r.discovery.state)).toEqual(["sweep", "named", "listener"]);
  });

  it("the address reads as host:port, or just the port when it is local", () => {
    expect(endpointAddress(readEndpoint(ep()))).toBe("10.0.4.17:443");
    expect(endpointAddress(readEndpoint(ep({ targetHost: null, port: 8443 })))).toBe("tcp/8443");
  });

  it("the two sources are named in words", () => {
    expect(endpointSourceLabel("listener")).toBe("Local listener");
    expect(endpointSourceLabel("probe")).toBe("Network probe");
    // Un valor nuevo del backend se enseña crudo antes que desaparecer.
    expect(endpointSourceLabel("something-new")).toBe("something-new");
  });

  it("garbage in is an empty list, not a crash", () => {
    expect(readEndpoints(null)).toEqual([]);
    expect(readEndpoints(undefined)).toEqual([]);
  });
});

describe("the counters", () => {
  it("count swept endpoints and bare-IP ones, and a listener is neither", () => {
    const s = summarizeEndpoints(
      readEndpoints([
        ep({ sweepRange: "10.0.4.0/24" }),
        ep({ targetHost: "lb.corp", sni: "lb.corp" }),
        ep({ source: "listener", targetHost: null })
      ])
    );
    expect(s.total).toBe(3);
    expect(s.swept).toBe(1);
    // Sólo el barrido llegó sin SNI; el listener no cuenta como «IP desnuda».
    expect(s.defaultSni).toBe(1);
  });
});
