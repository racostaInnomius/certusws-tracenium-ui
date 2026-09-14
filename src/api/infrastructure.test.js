// src/api/infrastructure.test.js
//
// El gateway de vCenter por /infrastructure (2026-09-14): mismo contrato
// que /patch-management/gateways, otro prefijo, y sigue sin haber forma de
// mandar una contraseña en claro.

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./http", () => ({
  httpGetJson: vi.fn(async (u) => ({ ok: true, url: u })),
  httpPostJson: vi.fn(async (u, b) => ({ ok: true, url: u, body: b })),
  httpPatchJson: vi.fn(async (u, b) => ({ ok: true, url: u, body: b })),
  httpDeleteJson: vi.fn(async (u) => ({ ok: true, url: u })),
}));

import * as api from "./infrastructure";

const BASE = "/api/v1/infrastructure";

beforeEach(() => vi.clearAllMocks());

describe("infrastructure gateway endpoint contract", () => {
  it("hits the shared paths", async () => {
    expect((await api.listGateways()).url).toBe(`${BASE}/gateways`);
    expect((await api.getGateway(3)).url).toBe(`${BASE}/gateways/3`);
    expect((await api.getGatewayPublicKey(3)).url).toBe(`${BASE}/gateways/3/public-key`);
    expect((await api.verifyGateway(3)).url).toBe(`${BASE}/gateways/3/verify`);
    expect((await api.deleteGateway(3)).url).toBe(`${BASE}/gateways/3`);
    expect((await api.getGateway("a/b?c")).url).toBe(`${BASE}/gateways/a%2Fb%3Fc`);
  });

  it("⭐ switches certificate reading on with a partial PATCH", async () => {
    const res = await api.updateGateway(3, { readCertificates: true });
    expect(res.url).toBe(`${BASE}/gateways/3`);
    expect(res.body).toEqual({ readCertificates: true });
  });

  it("posts the SEALED envelope and nothing else; the fingerprint-change approval travels only when given", async () => {
    const envelope = { v: 1, alg: "RSA-OAEP-256+A256GCM", ct: "..." };
    expect((await api.provisionGatewayCredential(3, envelope)).body).toEqual({ envelope });
    expect((await api.provisionGatewayCredential(3, envelope, { confirmFingerprintChange: true })).body).toEqual({ envelope, confirmFingerprintChange: true });
    expect(Object.keys(api).some((k) => /password/i.test(k))).toBe(false);
  });
});
