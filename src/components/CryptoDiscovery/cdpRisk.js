// src/components/CryptoDiscovery/cdpRisk.js
//
// Lo que comparten la tira del Dashboard y la pestaña Risk (ola 1.6).
//
// ⚠️ Aquí NO hay pesos ni umbrales. Viajan con GET /cdp/risk/summary y se
// pintan tal cual: una copia en la UI se desincroniza el primer día que
// alguien recalibre risk.ts (ya pasó el 22-sep con `expiredStale`). Lo único
// propio de la UI son las ETIQUETAS legibles, y toda clave desconocida se
// enseña igualmente con su nombre crudo — nunca se esconde.

import { BRAND, TEXT_MUTED } from "../../theme/brand";
import { severityMeta } from "../../theme/severity";

/** Bandas con lista debajo (score ≥ 1), de más a menos grave. */
export const RISK_BANDS_AT_RISK = ["critical", "high", "medium", "low"];
/** Todas las que devuelve el resumen, en orden de lectura. */
export const RISK_BANDS_ALL = [...RISK_BANDS_AT_RISK, "none", "unscored"];

/**
 * Presentación de una banda. `fg` es color de LETRA (AA sobre `bg`), sale de
 * theme/severity.js. «unscored» no es una severidad: es «aún no se ha
 * calculado», y se pinta neutra y con borde discontinuo para que no se lea
 * como «sin riesgo».
 */
export function bandMeta(band) {
  if (band === "unscored") return { label: "Not scored", fg: TEXT_MUTED, bg: BRAND.surfaceMuted, dashed: true };
  if (band === "none") return { ...severityMeta("none"), label: "No risk" };
  return severityMeta(band);
}

/**
 * En qué estado está el resumen, para decidir QUÉ frase va. Las cuatro son
 * distintas y confundirlas es mentir:
 *   empty    — no hay certificados en esta lente;
 *   unscored — los hay, pero ninguno tiene cifra (migración pendiente o
 *              primer barrido sin correr): NO es «todo bien»;
 *   clean    — puntuados y ninguno con factores;
 *   scored   — hay algo en alguna banda con riesgo.
 * (El quinto, «no pude leerlo», es un error y lo decide quien llama.)
 */
export function riskSummaryState(summary) {
  const bands = summary?.bands ?? {};
  const n = (k) => Number(bands[k] ?? 0) || 0;
  const total = RISK_BANDS_ALL.reduce((s, k) => s + n(k), 0);
  const unscored = n("unscored");
  const atRisk = RISK_BANDS_AT_RISK.reduce((s, k) => s + n(k), 0);
  let state = "scored";
  if (total === 0) state = "empty";
  else if (unscored === total) state = "unscored";
  else if (atRisk === 0) state = "clean";
  return { state, total, unscored, atRisk, scored: total - unscored };
}

const FACTOR_LABELS = {
  revoked: "Revoked",
  expired: "Expired",
  expired_stale: "Expired long ago, not served",
  expires_7d: "Expires within 7 days",
  expires_30d: "Expires within 30 days",
  expires_90d: "Expires within 90 days",
  weak_signature: "Weak signature",
  weak_key: "Weak key",
  shared_private_key: "Shared private key",
  reused_key: "Reused key",
  chain_untrusted: "Untrusted chain",
  chain_incomplete: "Incomplete chain",
  self_signed_leaf: "Self-signed leaf",
  nonstandard_root: "Nonstandard root",
  quantum_past_2030: "Quantum-broken past 2030",
  quantum_past_2035: "Quantum-broken past 2035",
  exposed: "Served on the network",
  cabf_san_missing: "CA/B Forum: no SAN",
  cabf_cn_not_in_san: "CA/B Forum: CN not in SAN",
  cabf_validity: "CA/B Forum: validity too long",
  cabf_rsa_size: "CA/B Forum: RSA key too small",
  cabf_ec_curve: "CA/B Forum: curve not allowed",
  cabf_signature_hash: "CA/B Forum: signature hash",
  cabf_any_eku: "CA/B Forum: anyExtendedKeyUsage",
  policy_min_rsa: "Your policy: RSA key too small",
  policy_curve: "Your policy: curve not allowed",
  policy_validity: "Your policy: validity too long",
  policy_signature_hash: "Your policy: forbidden signature hash",
  policy_blocked_issuer: "Your policy: blocked issuer",
  policy_eku_missing: "Your policy: no Extended Key Usage"
};

// Claves de RISK_WEIGHTS (camelCase). Las de «cada / máximo» se agrupan
// al pintar; aquí sólo el nombre.
const WEIGHT_LABELS = {
  revoked: "Revoked",
  expired: "Expired and served, or expired within 30 days",
  expiredStale: "Expired over 30 days ago, not served",
  expires7d: "Expires within 7 days",
  expires30d: "Expires within 30 days",
  expires90d: "Expires within 90 days",
  weakSignature: "Weak signature (MD5/SHA-1)",
  weakKey: "Weak key",
  sharedPrivateKey: "Private key on more than one device",
  reusedKey: "Key pair reused by another certificate",
  chainUntrusted: "Chain does not reach a trusted root",
  chainIncomplete: "Intermediates not sent",
  selfSignedLeaf: "Self-signed and served",
  selfSignedLeafStored: "Self-signed, sitting in a store",
  nonstandardRoot: "Root its peers do not trust",
  cabfEach: "CA/B Forum rule broken (each)",
  cabfMax: "CA/B Forum rules (maximum)",
  policyEach: "Your crypto policy rule broken (each)",
  policyMax: "Your crypto policy rules (maximum)",
  quantumPast2030: "Quantum-broken key valid past 2030",
  quantumPast2035: "Quantum-broken key valid past 2035",
  exposed: "Served on the network, on top of another factor"
};

/** «some_key» / «someKey» → «Some key». Para lo que la UI aún no nombra. */
function humanize(key) {
  const s = String(key ?? "")
    .replace(/([a-z])([A-Z0-9])/g, "$1 $2")
    .replace(/_/g, " ")
    .trim()
    .toLowerCase();
  return s ? s[0].toUpperCase() + s.slice(1) : "—";
}

export const factorLabel = (key) => FACTOR_LABELS[key] ?? humanize(key);
export const weightLabel = (key) => WEIGHT_LABELS[key] ?? humanize(key);

/**
 * Umbrales como rangos legibles, a partir de `bandThresholds` del backend
 * ([{ band, min }], cualquier orden). El techo de cada banda es el suelo de
 * la de encima menos uno; la más alta no tiene techo (la cifra se corta en
 * 100 en el servidor, no aquí).
 */
export function bandRanges(thresholds) {
  if (!Array.isArray(thresholds)) return [];
  const sorted = thresholds
    .filter((t) => t && t.band != null && Number.isFinite(Number(t.min)))
    .map((t) => ({ band: String(t.band), min: Number(t.min) }))
    .sort((a, b) => b.min - a.min);
  return sorted.map((t, i) => {
    const max = i === 0 ? null : sorted[i - 1].min - 1;
    let range;
    if (max == null) range = `${t.min} or more`;
    else if (max <= t.min) range = String(t.min);
    else range = `${t.min}–${max}`;
    return { ...t, max, range };
  });
}
