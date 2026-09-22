// src/api/cdp.risk.test.js
//
// Contrato de /api/v1/cdp/risk/* y /crypto-policy (ola 1.6).
//
// Lo que importa fijar: la forma exacta de la petición (el PUT manda
// `{ rules }`, no las reglas sueltas) y que los errores del backend lleguen
// con su `code` — la UI decide por él qué campo marcar o qué aviso enseñar.

import { describe, expect, it } from "vitest";

import { respond } from "../test/msw/server";
import { getCdpCryptoPolicy, getCdpRiskSummary, listCdpRiskTop, putCdpCryptoPolicy } from "./cdp";

const BASE = "/api/v1/cdp";

describe("riesgo", () => {
  it("getCdpRiskSummary devuelve el sobre tal cual, pesos incluidos", async () => {
    const envelope = {
      ok: true,
      bands: { critical: 1, high: 2, medium: 0, low: 3, none: 4, unscored: 0 },
      factors: [{ key: "revoked", certificates: 1 }],
      weights: { revoked: 40 },
      bandThresholds: [{ band: "critical", min: 70 }]
    };
    respond("get", `${BASE}/risk/summary`, envelope);

    await expect(getCdpRiskSummary()).resolves.toEqual(envelope);
  });

  it("getCdpRiskSummary pasa la lente y no manda parámetros vacíos", async () => {
    const calls = respond("get", `${BASE}/risk/summary`, { ok: true });

    await getCdpRiskSummary({ certClass: "ca" });
    await getCdpRiskSummary();

    expect(calls[0].search).toEqual({ certClass: "ca" });
    expect(calls[1].searchString).toBe("");
  });

  it("listCdpRiskTop manda limit, certClass y minBand", async () => {
    const calls = respond("get", `${BASE}/risk/top`, { ok: true, items: [] });

    await listCdpRiskTop({ limit: 50, certClass: "all", minBand: "high" });

    expect(calls[0].pathname).toBe(`${BASE}/risk/top`);
    expect(calls[0].search).toEqual({ limit: "50", certClass: "all", minBand: "high" });
  });
});

describe("política criptográfica", () => {
  it("getCdpCryptoPolicy lee /crypto-policy", async () => {
    respond("get", `${BASE}/crypto-policy`, { ok: true, rules: { minRsaBits: 3072 } });

    await expect(getCdpCryptoPolicy()).resolves.toEqual({ ok: true, rules: { minRsaBits: 3072 } });
  });

  it("⭐ putCdpCryptoPolicy envuelve las reglas en { rules }", async () => {
    const calls = respond("put", `${BASE}/crypto-policy`, { ok: true, rules: {}, rescored: { scanned: 10, updated: 2 } });

    await putCdpCryptoPolicy({ minRsaBits: 3072, requireEku: true });

    expect(calls[0].method).toBe("PUT");
    expect(calls[0].body).toEqual({ rules: { minRsaBits: 3072, requireEku: true } });
  });

  it("sin argumentos manda { rules: {} } — política vacía, no un cuerpo ausente", async () => {
    const calls = respond("put", `${BASE}/crypto-policy`, { ok: true, rules: {}, rescored: { scanned: 0, updated: 0 } });

    await putCdpCryptoPolicy();

    expect(calls[0].body).toEqual({ rules: {} });
  });

  it("⭐ un 400 llega con el código del campo", async () => {
    respond("put", `${BASE}/crypto-policy`, { ok: false, error: "MIN_RSA_BITS_INVALID" }, { status: 400 });

    await expect(putCdpCryptoPolicy({ minRsaBits: 12 })).rejects.toMatchObject({ status: 400, code: "MIN_RSA_BITS_INVALID" });
  });

  it("⭐ un 503 SCHEMA_NOT_MIGRATED llega con su código", async () => {
    respond("put", `${BASE}/crypto-policy`, { ok: false, error: "SCHEMA_NOT_MIGRATED", message: "Migration pending" }, { status: 503 });

    await expect(putCdpCryptoPolicy({})).rejects.toMatchObject({ status: 503, code: "SCHEMA_NOT_MIGRATED" });
  });
});
