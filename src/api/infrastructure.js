// src/api/infrastructure.js
//
// Infraestructura compartida por plugins (2026-09-14): el gateway de vCenter.
//
// Mismos recursos que /patch-management/gateways (misma tabla, mismos
// handlers en el backend), montados en /infrastructure con un gate que pasa
// con patch_management O crypto_discovery. Es el camino que usa Crypto
// Discovery → Settings → Infra: un tenant sin Patch Management registra el
// gateway y sella la credencial desde aquí. Patch Management sigue en su
// propio módulo (api/patchManagement.js) con el mismo contrato.
//
// Como allí: ningún endpoint lleva jamás una credencial en claro. El navegador
// sella contra el certificado del gateway y solo viaja el sobre.

import { httpGetJson, httpPostJson, httpPatchJson, httpDeleteJson } from "./http";

const BASE = "/api/v1/infrastructure";

export async function listGateways() {
  return httpGetJson(`${BASE}/gateways`);
}

export async function getGateway(id) {
  return httpGetJson(`${BASE}/gateways/${encodeURIComponent(id)}`);
}

export async function createGateway(payload) {
  return httpPostJson(`${BASE}/gateways`, payload);
}

/** PATCH parcial: `{ readCertificates }` a secas basta para encender la lectura. */
export async function updateGateway(id, payload) {
  return httpPatchJson(`${BASE}/gateways/${encodeURIComponent(id)}`, payload);
}

export async function deleteGateway(id) {
  return httpDeleteJson(`${BASE}/gateways/${encodeURIComponent(id)}`);
}

export async function getGatewayPublicKey(id) {
  return httpGetJson(`${BASE}/gateways/${encodeURIComponent(id)}/public-key`);
}

export async function provisionGatewayCredential(id, envelope, opts = {}) {
  const body = { envelope };
  if (opts.confirmFingerprintChange === true) body.confirmFingerprintChange = true;
  return httpPostJson(`${BASE}/gateways/${encodeURIComponent(id)}/credential`, body);
}

export async function verifyGateway(id) {
  return httpPostJson(`${BASE}/gateways/${encodeURIComponent(id)}/verify`, {});
}
