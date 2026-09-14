// src/components/CryptoDiscovery/cdpSources.js
//
// Catálogo de fuentes de Crypto Discovery y su estado, por sector
// (2026-09-14). La pestaña Settings se organiza con los MISMOS sectores
// que el sunburst del Dashboard (cdpSunburst.js → BASES) para que la
// pregunta «¿qué falta por conectar para que ese gajo se llene?» tenga una
// respuesta en la misma página donde se conecta.
//
// Estados de una fuente:
//   reporting    — ha traído activos (hay filas con su origen)
//   configured   — está dada de alta / la policy la pide, pero aún no ha
//                  reportado nada
//   failed       — un conector cuya última corrida falló
//   disabled     — un conector apagado
//   unconfigured — no hay nada que la haga funcionar todavía
//   unavailable  — la plataforma aún no la ofrece (vCenter)
//
// Funciones puras: reciben lo que ya contestan /cdp/facets (by=source),
// /cdp/assets/summary, /cdp/connectors, /cdp/adcs-sources y el bloque `cdp`
// de la policy del tenant; no llaman a nada.

import { BASES, SOURCE_LABEL } from "./cdpSunburst";

export const CONNECTOR_KIND_LABEL = { keyvault: "Azure Key Vault", acm: "AWS Certificate Manager", gcp: "Google Cloud", vault: "HashiCorp Vault", k8s: "Kubernetes", ct: "Public domains (CT)" };

/** id DOM de la sección de Settings de cada sector (el mapa baja hasta ella). */
export const sectorAnchor = (baseKey) => `cdp-sector-${baseKey}`;

/** Qué tipos de conector viven en cada sector del anillo base. */
export const CONNECTOR_KINDS_BY_BASE = { infra: ["k8s"], cloud: ["ct", "acm", "gcp"], external: ["keyvault", "vault"] };

const CONNECTOR_ORIGINS = new Set(Object.keys(CONNECTOR_KIND_LABEL));

const AGENT_SOURCES = ["store", "java-store", "file", "nss", "listener"];

const fmt = (n) => Number(n ?? 0).toLocaleString();
const plural = (n, one, many = `${one}s`) => `${fmt(n)} ${Number(n) === 1 ? one : many}`;

function originOf(sourceName) {
  const s = String(sourceName ?? "");
  const i = s.indexOf(":");
  return i >= 0 ? s.slice(0, i) : s;
}

function connectorStatus(c) {
  const certs = Number(c.lastSummary?.certificates ?? 0);
  const keys = Number(c.lastSummary?.keys ?? 0);
  const label = `${CONNECTOR_KIND_LABEL[c.kind] ?? c.kind} · ${c.label}`;
  if (c.enabled === false) return { key: `connector:${c.connectorId}`, label, state: "disabled", detail: "Disabled: it keeps what it brought, nothing refreshes.", connectorId: c.connectorId };
  if (c.lastStatus === "failed" || c.lastError) return { key: `connector:${c.connectorId}`, label, state: "failed", detail: c.lastError || "The last run failed.", connectorId: c.connectorId };
  if (c.lastRunAt && certs + keys > 0) return { key: `connector:${c.connectorId}`, label, state: "reporting", detail: `${plural(certs, "certificate")}, ${plural(keys, "key")} · last run ${new Date(c.lastRunAt).toLocaleString()}`, connectorId: c.connectorId };
  if (c.lastRunAt) return { key: `connector:${c.connectorId}`, label, state: "configured", detail: `Ran ${new Date(c.lastRunAt).toLocaleString()} and found nothing.`, connectorId: c.connectorId };
  return { key: `connector:${c.connectorId}`, label, state: "configured", detail: "Added; not run yet (daily, or “Run now”).", connectorId: c.connectorId };
}

/**
 * @param {object} input
 * @param {Array} input.facets        filas de /cdp/facets?by=source ({keys:{source}, certs, uniqueCerts, devices})
 * @param {object} input.assets       /cdp/assets/summary ({sources:[{sourceName, assets, lastSeen}], imports:[{sourceName}]})
 * @param {Array}  input.connectors   /cdp/connectors
 * @param {Array}  input.adcs         /cdp/adcs-sources
 * @param {object} input.cdp          bloque `cdp` de la policy del tenant
 * @returns {Array<{key,label,note,sources:Array,reporting:number,total:number}>}
 */
export function sourcesByBase({ facets = [], assets = null, connectors = [], adcs = [], cdp = {} } = {}) {
  const byAgentSource = new Map((facets ?? []).map((r) => [String(r.keys?.source ?? ""), r]));
  const assetSources = assets?.sources ?? [];
  const assetsByName = new Map(assetSources.map((s) => [String(s.sourceName), s]));
  const bases = new Map(BASES.map((b) => [b.key, { key: b.key, label: b.label, note: b.note, sources: [] }]));
  const push = (base, s) => bases.get(base).sources.push(s);

  // ── On-prem devices: lo que el agente recoge ──
  for (const src of AGENT_SOURCES) {
    const row = byAgentSource.get(src);
    const n = Number(row?.uniqueCerts ?? row?.certs ?? 0);
    const label = SOURCE_LABEL[src] ?? src;
    if (n > 0) push("onprem", { key: src, label, state: "reporting", detail: `${plural(n, "certificate")} on ${plural(row.devices, "device")}` });
    else if (src === "listener" && cdp?.scanTlsListeners === false) push("onprem", { key: src, label, state: "unconfigured", detail: "Off in the agent policy (Scan TLS listeners)." });
    else push("onprem", { key: src, label, state: "configured", detail: "Scanned by every agent; nothing reported yet." });
  }
  const ssh = assetsByName.get("ssh");
  push("onprem", ssh ? { key: "ssh", label: SOURCE_LABEL.ssh, state: "reporting", detail: plural(ssh.assets, "host key") } : { key: "ssh", label: SOURCE_LABEL.ssh, state: "configured", detail: "Read from disk by every agent; nothing reported yet." });
  const importNames = new Set((assets?.imports ?? []).map((i) => String(i.sourceName)));
  const cbomAssets = assetSources.filter((s) => importNames.has(String(s.sourceName))).reduce((t, s) => t + Number(s.assets ?? 0), 0);
  push("onprem", importNames.size > 0
    ? { key: "cbom", label: SOURCE_LABEL.cbom, state: "reporting", detail: `${plural(importNames.size, "import")}, ${plural(cbomAssets, "asset")}` }
    : { key: "cbom", label: SOURCE_LABEL.cbom, state: "unconfigured", detail: "Upload a CycloneDX file from a scanner below." });

  // ── Windows CA: lo que AD CS reporta ──
  const caHosts = Array.isArray(cdp?.adcs?.hosts) ? cdp.adcs.hosts : Array.isArray(cdp?.adcsHosts) ? cdp.adcsHosts : [];
  if ((adcs ?? []).length > 0) {
    for (const s of adcs) {
      const cf = s.columnsFound || {};
      const broken = !cf.requestId || !cf.rawCertificate;
      push("adcs", {
        key: `adcs:${s.caName}`,
        label: s.caName,
        state: broken ? "failed" : "reporting",
        detail: broken ? "certutil's header was not recognized: nothing decoded." : `${plural(s.assetsValid, "valid certificate")} of ${fmt(s.assets)} read · last read ${s.lastSeen ? new Date(s.lastSeen).toLocaleString() : "never"}`
      });
    }
  } else if (caHosts.length > 0) {
    push("adcs", { key: "adcs", label: "AD CS reader", state: "configured", detail: `Named in the agent policy (${caHosts.join(", ")}); waiting for the first read.` });
  } else {
    push("adcs", { key: "adcs", label: "AD CS reader", state: "unconfigured", detail: "Name the CA servers in Agent Settings → Crypto Discovery." });
  }

  // ── Infra ──
  const probeHosts = Array.isArray(cdp?.probeHosts) ? cdp.probeHosts : [];
  const probeTargets = Array.isArray(cdp?.probeTargets) ? cdp.probeTargets : [];
  const probeRow = byAgentSource.get("probe");
  const probeCerts = Number(probeRow?.uniqueCerts ?? probeRow?.certs ?? 0);
  if (probeCerts > 0) push("infra", { key: "probe", label: SOURCE_LABEL.probe, state: "reporting", detail: `${plural(probeCerts, "certificate")} from ${plural(probeTargets.length, "target")}, probed from ${plural(probeHosts.length, "device")}` });
  else if (probeHosts.length > 0 && probeTargets.length > 0) push("infra", { key: "probe", label: SOURCE_LABEL.probe, state: "configured", detail: `${plural(probeTargets.length, "target")} probed from ${probeHosts.join(", ")}; nothing reported yet.` });
  else push("infra", { key: "probe", label: SOURCE_LABEL.probe, state: "unconfigured", detail: probeHosts.length === 0 ? "No device named under “Runs from” (Agent Settings)." : "No targets yet: add one below." });

  // ── Conectores, cada tipo en su sector ──
  for (const [base, kinds] of Object.entries(CONNECTOR_KINDS_BY_BASE)) {
    for (const kind of kinds) {
      const mine = (connectors ?? []).filter((c) => c.kind === kind);
      if (mine.length === 0) {
        push(base, kind === "ct"
          ? { key: "ct", label: SOURCE_LABEL.ct, state: "unconfigured", detail: "Add a domain below: its public certificates come from CT logs, no credentials needed." }
          : { key: kind, label: CONNECTOR_KIND_LABEL[kind], state: "unconfigured", detail: "Not connected." });
        continue;
      }
      for (const c of mine) {
        const st = connectorStatus(c);
        if (kind === "ct") {
          const domains = Array.isArray(c.config?.domains) ? c.config.domains : [];
          st.label = `${SOURCE_LABEL.ct} · ${domains.length ? domains.join(", ") : c.label}`;
        }
        push(base, st);
      }
    }
    if (base === "infra") {
      push("infra", {
        key: "vcenter",
        label: SOURCE_LABEL.vcenter,
        state: "unavailable",
        detail: "Not available yet. Meanwhile add vCenter and each ESXi host as remote probe targets (host:443): the certificate they serve lands here under Remote probes."
      });
    }
  }

  // Lo que hay en activos con un origen que no es de ningún conector ni de
  // las fuentes conocidas (p. ej. un import de CBOM ya contado, o un origen
  // nuevo del servidor) no se pierde: cae en On-prem devices como «otros».
  const known = new Set(["ssh", ...importNames]);
  const stray = assetSources.filter((s) => !known.has(String(s.sourceName)) && !CONNECTOR_ORIGINS.has(originOf(s.sourceName)) && originOf(s.sourceName) !== "adcs");
  if (stray.length > 0) push("onprem", { key: "other", label: "Other assets", state: "reporting", detail: stray.map((s) => `${s.sourceName} (${fmt(s.assets)})`).join(", ") });

  return Array.from(bases.values()).map((b) => ({ ...b, reporting: b.sources.filter((s) => s.state === "reporting").length, total: b.sources.filter((s) => s.state !== "unavailable").length }));
}
