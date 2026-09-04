// src/components/Policies/policyTransforms.probeTargets.test.js
//
// Fase 2 — objetivos del rol Probe en el formulario de policy. Lo que
// importa: lo inválido se marca (no se traga), loopback se rechaza, y
// lo que llega al backend está deduplicado y acotado.

import { describe, it, expect } from "vitest";
import { invalidProbeTargets, splitTargetLines, CDP_PROBE_TARGETS_MAX } from "./policyTransforms";

describe("probeTargets en la policy", () => {
  it("una línea o coma por objetivo", () => {
    expect(splitTargetLines("a.corp:443\nb.corp:8443, c.corp:636")).toEqual(["a.corp:443", "b.corp:8443", "c.corp:636"]);
  });

  it("⭐ marca lo inválido y el loopback", () => {
    expect(invalidProbeTargets("lb.corp:443\nlocalhost:443\n127.0.0.1:8443\nbad\nx.corp:70000\n[fd00::1]:636"))
      .toEqual(["localhost:443", "127.0.0.1:8443", "bad", "x.corp:70000"]);
  });

  it("vacío no es error", () => {
    expect(invalidProbeTargets("")).toEqual([]);
    expect(invalidProbeTargets(undefined)).toEqual([]);
  });

  it("expone el tope para que el formulario lo pinte", () => {
    expect(CDP_PROBE_TARGETS_MAX).toBe(200);
  });
});
