// src/components/CryptoDiscovery/cdpSunburst.js
//
// Modelo y trazado del sunburst de exposición cuántica (Dashboard de
// Crypto Discovery, 2026-09-10). Funciones puras, sin React: el árbol se
// arma a partir de las MISMAS respuestas que alimentan Explore y Roadmap
// (/cdp/facets, /cdp/exposure, /cdp/roadmap), y el trazado devuelve arcos
// SVG y etiquetas ya posicionadas.
//
// Anillo interior FIJO, como pidió el usuario: CUATRO sectores base que
// están siempre, con o sin datos, para que el mapa sea el mismo hoy y
// cuando se conecten fuentes nuevas:
//
//   On-prem devices = el parque con agente (almacenes, keystores,
//                     listeners, ficheros, NSS, claves SSH, CBOM) y, DENTRO
//                     del mismo sector pero como grupo aparte, lo que la CA
//                     de Windows REPORTA (AD CS): son cosas distintas (un
//                     inventario frente a un registro de emisión) y el
//                     usuario quiere verlas separadas, no como quinta base.
//   Infra           = infraestructura virtual y de red: sondas remotas,
//                     Kubernetes, vCenter / hipervisores (gateway)
//   Cloud           = dominios públicos (CT), AWS ACM, Google Cloud
//   External key sources = Azure Key Vault, HashiCorp Vault
//
// En el anillo 2 los grupos de On-prem van seguidos (agente primero, CA al
// final) con una separación mayor entre ellos y la CA con su nombre. La
// pestaña Settings usa las MISMAS secciones (`SECTIONS`, cdpSources.js):
// las cuatro bases y, colgando de On-prem, Windows CA.
//
// Anillo 2 = origen; anillo 3 = algoritmo y tamaño (o KEM negociado en
// la vista de servicios). Color = estado cuántico, no identidad:
// quantum-broken en rojo, post-cuántico o híbrido en verde, lo que no es
// del cliente (raíces del fabricante) en gris, sector sin fuente en gris
// claro. Un tono por anillo dentro de cada familia.

import { BRAND, NEUTRAL } from "../../theme/brand";

/** Las secciones de Settings: las cuatro bases y, colgando de On-prem, la CA. */
export const SECTIONS = [
  { key: "onprem", label: "On-prem devices", note: "Collected by the agent on managed endpoints, plus what the Windows CA issued" },
  { key: "adcs", label: "Windows CA", parent: "onprem", note: "Issued by AD CS, reported by the agent on the CA server" },
  { key: "infra", label: "Infra", note: "Remote probes, Kubernetes, vCenter" },
  { key: "cloud", label: "Cloud", note: "Public domains, AWS ACM, Google Cloud" },
  { key: "external", label: "External key sources", note: "Azure Key Vault, HashiCorp Vault" }
];

/** Los sectores del anillo base del sunburst: solo las cuatro bases. */
export const BASES = SECTIONS.filter((s) => !s.parent);

/** Grupos del anillo 2 dentro de On-prem, en este orden. */
export const ONPREM_GROUPS = { agent: 0, adcs: 1 };

const BASE_OF_SOURCE = {
  store: "onprem", "java-store": "onprem", file: "onprem", nss: "onprem", listener: "onprem", ssh: "onprem", cbom: "onprem", adcs: "onprem",
  probe: "infra", k8s: "infra", vcenter: "infra",
  ct: "cloud", acm: "cloud", gcp: "cloud",
  keyvault: "external", vault: "external"
};

export const SOURCE_LABEL = {
  store: "Certificate stores", "java-store": "Java keystores", file: "Certificate files", nss: "NSS (Firefox, Thunderbird)", listener: "TLS listeners",
  adcs: "AD CS", ssh: "SSH host keys", cbom: "Imported CBOM", probe: "Remote probes", k8s: "Kubernetes", vcenter: "vCenter",
  ct: "Public domains (CT)", acm: "AWS ACM", gcp: "Google Cloud", keyvault: "Azure Key Vault", vault: "HashiCorp Vault"
};

export function baseOfSource(source) {
  return BASE_OF_SOURCE[String(source ?? "").toLowerCase()] ?? "onprem";
}

/** «source:<origin>:<resto>» de un sistema del roadmap → origen. */
export function originOfSourceName(sourceName) {
  const s = String(sourceName ?? "");
  const i = s.indexOf(":");
  return i >= 0 ? s.slice(0, i) : s;
}

/**
 * Nombre del gajo de origen (anillo 2) para un activo de fuera de los
 * equipos. Cada CA de Windows es su propio gajo dentro del sector «Windows
 * CA» —dos CAs no son «AD CS» dos veces—; el resto lleva el nombre del
 * origen.
 */
function outsideSourceLabel(origin, sourceName) {
  if (origin === "adcs") {
    const rest = String(sourceName ?? "").slice("adcs:".length);
    return rest ? `CA · ${rest}` : SOURCE_LABEL.adcs;
  }
  return SOURCE_LABEL[origin] ?? origin;
}

export const SHADES = {
  broken: [BRAND.alert.error, "#EDA39F", "#F5CBC8"],
  ok: [BRAND.alert.success, "#8FD1B0", "#C4E8D5"],
  mixed: [BRAND.teal, "#9CC7C7", "#CFE4E4"],
  other: [NEUTRAL[300], "#DADDE2", "#E9EBEF"],
  empty: ["#E4E7EC", "#E4E7EC", "#E4E7EC"]
};

const algoLabel = (algorithm, bits) => `${algorithm ?? "unknown"}${bits ? `-${bits}` : ""}`.replace(/^EC-/, "EC P-");

// Las mismas reglas por NOMBRE que el backend (crypto-classification.ts):
// las facetas traen `key_algorithm` sin familia, y sin esto las hojas de los
// equipos caían en «other» y salían grises, el color reservado a las raíces
// del fabricante y a los sectores sin fuente (bug visto por el usuario el
// 14-sep). Híbrido y post-cuántico son «ok» (verde, como dice la leyenda).
const PQ_SAFE_NAME_RE = /^(ML-DSA|ML-KEM|SLH-DSA|HSS-LMS|XMSS)/i;
const HYBRID_NAME_RE = /(hybrid|composite|catalyst)/i;
const QUANTUM_BROKEN_NAME_RE = /^(RSA|EC|ECDSA|DSA|ED25519|ED448|X25519|X448)|WithRSA|ecdsa-with|dsa-with/i;

/** Estado cuántico de un algoritmo por su nombre: broken · ok · other (desconocido). */
export function statusOfAlgorithm(name) {
  const n = String(name ?? "").trim();
  if (!n) return "other";
  if (HYBRID_NAME_RE.test(n) || PQ_SAFE_NAME_RE.test(n)) return "ok";
  if (QUANTUM_BROKEN_NAME_RE.test(n)) return "broken";
  return "other";
}

/**
 * Estado de un nodo con hijos, cuando no lo trae puesto: todo roto → broken,
 * todo bien → ok, de los dos → mixed. Sin hojas clasificadas queda sin
 * estado y el trazado usa el del padre (gris si nadie sabe).
 */
function rollupStatus(children) {
  let broken = 0;
  let ok = 0;
  for (const c of children) {
    const st = c.s ?? c.status;
    if (st === "broken") broken += 1;
    else if (st === "ok") ok += 1;
    else if (st === "mixed") {
      broken += 1;
      ok += 1;
    }
  }
  if (broken && ok) return "mixed";
  if (broken) return "broken";
  if (ok) return "ok";
  return undefined;
}

function skeleton() {
  const bases = new Map();
  for (const b of BASES) bases.set(b.key, { key: b.key, name: b.label, note: b.note, keep: true, children: new Map() });
  return bases;
}

function addLeaf(bases, baseKey, sourceKey, sourceName, leafKey, leafName, value, extra) {
  if (!(value > 0)) return;
  const base = bases.get(baseKey);
  let src = base.children.get(sourceKey);
  if (!src) {
    src = { key: sourceKey, name: sourceName, children: new Map(), ...(extra?.source ?? {}) };
    base.children.set(sourceKey, src);
  }
  let leaf = src.children.get(leafKey);
  if (!leaf) {
    leaf = { key: leafKey, name: leafName, v: 0, ...(extra?.leaf ?? {}) };
    src.children.set(leafKey, leaf);
  }
  leaf.v += value;
}

const groupRank = (n) => ONPREM_GROUPS[n.group ?? "agent"] ?? 0;

function finish(bases) {
  const toArray = (m, depth = 0) =>
    Array.from(m.values()).map((n) => {
      if (!(n.children instanceof Map)) return n;
      let children = toArray(n.children, depth + 1);
      // En el anillo 2 los grupos van seguidos: agente primero, CA al final.
      if (depth === 0) children = children.map((c, i) => [c, i]).sort((a, b) => groupRank(a[0]) - groupRank(b[0]) || a[1] - b[1]).map(([c]) => c);
      const status = n.status ?? rollupStatus(children);
      return { ...n, children, ...(status ? { status } : {}) };
    });
  return toArray(bases);
}

/**
 * Los activos de fuera de los equipos (exposure.outside): un gajo por
 * fuente en su base, con desglose por algoritmo cuando el servidor lo da
 * (`byAlgorithm`, 14-sep) y una sola hoja si no. `skip` = orígenes que no
 * pintan en esta vista; `leafName` = nombre de la hoja sin desglose.
 */
function addOutside(bases, outsideBySource, outsideByAlgorithm, { skip, leafName }) {
  const detailed = new Set((outsideByAlgorithm ?? []).map((a) => a.sourceName));
  for (const a of outsideByAlgorithm ?? []) {
    const origin = a.origin ?? originOfSourceName(a.sourceName);
    if (skip.has(origin)) continue;
    const st = a.family === "pq_safe" || a.family === "hybrid" ? "ok" : "broken";
    addLeaf(bases, baseOfSource(origin), `outside:${a.sourceName}`, outsideSourceLabel(origin, a.sourceName), algoLabel(a.algorithm, a.bits), algoLabel(a.algorithm, a.bits), Number(a.certificates ?? 0), {
      source: { note: a.sourceName, ...(origin === "adcs" ? { group: "adcs" } : {}) },
      leaf: { s: st }
    });
  }
  for (const s of outsideBySource ?? []) {
    const origin = s.origin ?? originOfSourceName(s.sourceName);
    if (skip.has(origin) || detailed.has(s.sourceName)) continue;
    addLeaf(bases, baseOfSource(origin), `outside:${s.sourceName}`, outsideSourceLabel(origin, s.sourceName), leafName, leafName, Number(s.certificates ?? 0), {
      source: { note: s.sourceName, ...(origin === "adcs" ? { group: "adcs" } : {}) },
      leaf: { s: "broken" }
    });
  }
}

/**
 * Vista «Certificates»: facetas by=ownership,source,key_algorithm con
 * stack=key_size_bits (certificados únicos por celda), más los activos de
 * fuera de los equipos (exposure.outside.bySource, sin desglose de
 * algoritmo todavía: entran como una hoja «certificates» por origen).
 */
export function buildCertificatesTree(facetRows, outsideBySource, outsideByAlgorithm = []) {
  const bases = skeleton();
  for (const r of facetRows ?? []) {
    const own = r.keys?.ownership ?? "foreign";
    const source = r.keys?.source ?? "store";
    const algo = r.keys?.key_algorithm ?? "unknown";
    const bits = r.stack ?? null;
    const n = Number(r.uniqueCerts ?? r.certs ?? 0);
    const isVendor = own === "vendor";
    const srcKey = isVendor ? "vendor" : source;
    const srcName = isVendor ? "Vendor roots" : SOURCE_LABEL[source] ?? source;
    addLeaf(bases, baseOfSource(source), srcKey, srcName, algoLabel(algo, bits), algoLabel(algo, bits), n, {
      source: isVendor ? { status: "other", note: "Shipped with the OS and the JVM: not yours to migrate" } : {},
      // Las raíces del fabricante no llevan estado propio: heredan el gris
      // de su fuente, porque no son del cliente y no las migra él.
      leaf: isVendor
        ? { drill: { includeRoots: true, scope: "system-roots", keyAlgorithm: algo, keySizeBits: bits } }
        : { s: statusOfAlgorithm(algo), drill: { source, keyAlgorithm: algo, keySizeBits: bits } }
    });
  }
  addOutside(bases, outsideBySource, outsideByAlgorithm, { skip: new Set(["ssh"]), leafName: "certificates" });
  return finish(bases);
}

/**
 * Vista «Keys»: facetas by=source,store_name,key_algorithm con
 * stack=key_size_bits y hasPrivateKey=true, más claves huérfanas, claves de
 * host SSH (activos con origen ssh) y las fuentes de FUERA que guardan o
 * certifican claves: la CA de Windows (grupo de On-prem: las claves que
 * certificó viven en los solicitantes, pero es la CA quien las emitió con
 * ese algoritmo — pedido del usuario, 14-sep), los vaults, los clusters,
 * ACM/GCP y los hosts de vCenter. Los dominios públicos (CT) no: ahí solo
 * hay certificados, ninguna clave.
 */
const KEYLESS_ORIGINS = new Set(["ssh", "ct"]);

export function buildKeysTree(facetRows, { orphanKeys = 0, sshHostKeys = 0, outsideBySource = [], outsideByAlgorithm = [] } = {}) {
  const bases = skeleton();
  for (const r of facetRows ?? []) {
    const source = r.keys?.source ?? "store";
    const store = r.keys?.store_name || SOURCE_LABEL[source] || source;
    const algo = r.keys?.key_algorithm ?? "unknown";
    const bits = r.stack ?? null;
    const n = Number(r.uniqueCerts ?? r.certs ?? 0);
    addLeaf(bases, baseOfSource(source), `${source}:${store}`, String(store).replace(/\s*\(S-1-5-[^)]*\)/, ""), algoLabel(algo, bits), algoLabel(algo, bits), n, {
      leaf: { s: statusOfAlgorithm(algo), drill: { hasPrivateKey: true, source, storeName: r.keys?.store_name ?? undefined, keyAlgorithm: algo, keySizeBits: bits } }
    });
  }
  addLeaf(bases, "onprem", "orphan", "Orphan keys", "keys", "keys", Number(orphanKeys), { leaf: { s: "broken" } });
  addLeaf(bases, "onprem", "ssh", "SSH host keys", "keys", "keys", Number(sshHostKeys), { leaf: { s: "broken" } });
  addOutside(bases, outsideBySource, outsideByAlgorithm, { skip: KEYLESS_ORIGINS, leafName: "keys" });
  return finish(bases);
}

/**
 * Vista «Services / Resources»: los sistemas del roadmap. Un proceso o un
 * objetivo remoto es un servicio con su KEM negociado; un origen externo
 * es un recurso que emite o guarda claves clásicas.
 */
export function buildServicesTree(systems) {
  const bases = skeleton();
  for (const s of systems ?? []) {
    const key = String(s.key ?? "");
    const f = s.factors ?? {};
    if (key.startsWith("process:") || key.startsWith("target:") || key === "self-per-device") {
      const baseKey = key.startsWith("target:") ? "infra" : "onprem";
      const name = key === "self-per-device" ? "Self-signed per device" : key.slice(key.indexOf(":") + 1);
      const hybrid = Number(f.kemHybrid ?? 0), classical = Number(f.kemClassical ?? 0), unknown = Number(f.kemUnknown ?? 0);
      if (hybrid + classical + unknown === 0) continue;
      const srcKey = `svc:${key}`;
      addLeaf(bases, baseKey, srcKey, name, "hybrid", "Hybrid", hybrid, { leaf: { s: "ok", drill: { kem: "hybrid" } } });
      addLeaf(bases, baseKey, srcKey, name, "classical", "Classical", classical, { leaf: { s: "broken", drill: { kem: "classical" } } });
      addLeaf(bases, baseKey, srcKey, name, "unknown", "Unknown", unknown, { leaf: { s: "other", drill: { kem: "unknown" } } });
    } else if (key.startsWith("source:")) {
      const origin = originOfSourceName(key.slice("source:".length));
      if (origin === "ssh") continue;
      const n = Number(f.uniqueCerts ?? f.certs ?? 0);
      addLeaf(bases, baseOfSource(origin), `res:${key}`, s.name ?? key, "certs", "issues or holds", n, { source: origin === "adcs" ? { group: "adcs" } : {}, leaf: { s: "broken" } });
    }
  }
  for (const b of bases.values()) {
    if (b.key === "onprem" && b.children.size > 0) b.status = "mixed";
  }
  return finish(bases);
}

// ── Trazado ───────────────────────────────────────────────────────────

export function sumNode(n) {
  return n.v != null ? n.v : (n.children ?? []).reduce((s, c) => s + sumNode(c), 0);
}

export function arcPath(r0, r1, a0, a1) {
  // Ángulos en radianes, 0 = arriba, sentido horario. Un gajo que da la
  // vuelta entera tendría el mismo punto de inicio y fin y el arco SVG no
  // se pinta: se deja una costura del ancho de las demás separaciones.
  if (a1 - a0 >= Math.PI * 2 - 1e-4) a1 = a0 + Math.PI * 2 - 0.012;
  const big = a1 - a0 > Math.PI ? 1 : 0;
  const p = (r, a) => `${(r * Math.sin(a)).toFixed(2)} ${(-r * Math.cos(a)).toFixed(2)}`;
  return `M${p(r1, a0)} A${r1} ${r1} 0 ${big} 1 ${p(r1, a1)} L${p(r0, a1)} A${r0} ${r0} 0 ${big} 0 ${p(r0, a0)} Z`;
}

const textWidth = (t, size) => String(t).length * size * 0.56;

/**
 * Devuelve arcos y etiquetas para un árbol de 3 niveles. Las etiquetas van
 * TODAS radiales (misma orientación en todos los anillos, pedido del
 * usuario): recortadas con «…» si no caben en el ancho del anillo, a dos
 * líneas en el anillo base, y ninguna si el gajo es más estrecho que la
 * propia letra. El nombre completo vive en el tooltip del arco.
 */
export function layoutSunburst(tree, { radii = [58, 128, 198, 270], gap = 0.012, placeholder = 0.38, foldBelow = 0.025, minArc = { 0: 0.3, 1: 0.14 } } = {}) {
  const arcs = [];
  const labels = [];

  const colorFor = (st, depth) => (SHADES[st] ?? SHADES.other)[Math.min(depth, 2)];

  const label = (name, v, depth, start, end, st) => {
    const mid = (start + end) / 2;
    const rm = (radii[depth] + radii[depth + 1]) / 2;
    const arcLen = (end - start) * rm - 6;
    const radial = radii[depth + 1] - radii[depth] - 10;
    const size = 10;
    let text = depth === 2 && v > 0 ? `${name} · ${v.toLocaleString()}` : name;
    const deg = (mid * 180) / Math.PI;
    if (arcLen < size + 4) return;
    let wrap = 0;
    const w = textWidth(text, size);
    if (w > radial) {
      // El anillo base puede partir en 2-3 líneas («External key sources»)
      // si el gajo es lo bastante ancho; el resto se recorta.
      const lines = Math.ceil(w / radial);
      if (depth === 0 && lines <= 3 && arcLen >= lines * size + 4) wrap = radial;
      else text = `${text.slice(0, Math.max(3, Math.floor(radial / (size * 0.56)) - 1))}…`;
    }
    const rot = deg > 180 ? deg + 90 : deg - 90;
    labels.push({
      left: 280 + rm * Math.sin(mid),
      top: 280 - rm * Math.cos(mid),
      rotate: rot,
      text,
      size,
      weight: depth === 0 ? 700 : 500,
      wrap: wrap > 0,
      width: wrap || null,
      color: depth === 0 && st !== "other" && st !== "empty" ? "#FFFFFF" : BRAND.dark
    });
  };

  const walk = (rawNodes, depth, a0, a1, parentStatus, path) => {
    let nodes = (rawNodes ?? []).filter((n) => sumNode(n) > 0 || (depth === 0 && n.keep));
    if (nodes.length === 0) return;
    const tot = nodes.reduce((s, n) => s + sumNode(n), 0);
    if (depth === 2 && nodes.length > 2 && tot > 0) {
      const small = nodes.filter((n) => sumNode(n) / tot < foldBelow);
      if (small.length > 1) {
        nodes = nodes.filter((n) => sumNode(n) / tot >= foldBelow).concat([{ key: "other", name: "Other", v: small.reduce((s, n) => s + sumNode(n), 0), s: small[0].s, drill: null }]);
      }
    }
    const empties = nodes.filter((n) => sumNode(n) <= 0).length;
    // Entre dos grupos distintos del mismo sector (agente | CA) la
    // separación es mayor: es lo que hace visible la partición sin gastar
    // un sector base en ella.
    const gapAfter = (i) => (i < nodes.length - 1 ? (depth === 1 && (nodes[i].group ?? "agent") !== (nodes[i + 1].group ?? "agent") ? gap * 4 : gap) : 0);
    const gaps = nodes.reduce((t, _n, i) => t + gapAfter(i), 0);
    const usable = a1 - a0 - gaps - empties * placeholder;
    // Ancho mínimo en los anillos base y de origen (14-sep): con 185
    // claves en un almacén y 3 en vCenter, Infra era una astilla sin
    // etiqueta y la mayor parte del círculo un solo gajo. Un gajo pequeño
    // se queda con lo mínimo legible y el resto se reparte en proporción;
    // el número real va en la etiqueta y en el tooltip.
    const widths = nodes.map((n) => (sumNode(n) <= 0 ? placeholder : usable * (sumNode(n) / tot)));
    const floor = minArc?.[depth] ?? 0;
    if (floor > 0 && nodes.length > 1) {
      const small = nodes.map((n, i) => (sumNode(n) > 0 && widths[i] < floor ? i : -1)).filter((i) => i >= 0);
      const big = nodes.map((n, i) => (sumNode(n) > 0 && widths[i] >= floor ? i : -1)).filter((i) => i >= 0);
      const reserved = small.length * floor;
      const bigTot = big.reduce((t, i) => t + sumNode(nodes[i]), 0);
      if (small.length > 0 && big.length > 0 && reserved < usable * 0.6) {
        const rest = usable - reserved;
        for (const i of small) widths[i] = floor;
        for (const i of big) widths[i] = rest * (sumNode(nodes[i]) / bigTot);
      }
    }
    let cursor = a0;
    for (const [i, n] of nodes.entries()) {
      const v = sumNode(n);
      const isEmpty = v <= 0;
      const start = cursor;
      const end = cursor + widths[i];
      const st = isEmpty ? "empty" : n.s ?? n.status ?? parentStatus ?? "other";
      const id = [...path, n.key ?? n.name].join("/");
      arcs.push({
        id,
        d: arcPath(radii[depth], radii[depth + 1] - 2, start, end),
        fill: isEmpty ? SHADES.empty[0] : colorFor(st, depth),
        depth,
        name: n.name,
        value: v,
        empty: isEmpty,
        note: n.note ?? null,
        drill: n.drill ?? null
      });
      label(n.name, v, depth, start, end, st);
      if (!isEmpty && n.children && depth < 2) walk(n.children, depth + 1, start, end, st, [...path, n.key ?? n.name]);
      cursor = end + gapAfter(i);
    }
  };
  walk(tree, 0, 0, Math.PI * 2, "other", []);
  return { arcs, labels, total: (tree ?? []).reduce((s, n) => s + sumNode(n), 0) };
}
