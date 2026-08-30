// src/utils/auditSentence.js
//
// Una fila de auditoría, leída como una frase.
//
// La tabla tenía siete columnas —chip de tipo, outcome, device,
// correlation, peer, reason— y para responder "qué pasó aquí" había que
// recomponer mentalmente cuatro de ellas. Con ~50 acciones administrativas
// al mes, esa densidad no compra nada: no hay que escanear miles de filas,
// hay que leer cincuenta.
//
// La frase NO incluye quién: eso vive en la columna Who. Aquí va sólo el
// predicado, para que la fila se lea "R. Acosta · cambió los permisos del
// rol IT Support". En eventos de máquina no hay actor y la frase se
// sostiene sola porque el sujeto es el equipo.
//
// ⚠️ LA REGLA QUE NO SE PUEDE ROMPER: un tipo sin plantilla NO produce una
// frase vacía ni una a medias. Cae a la etiqueta del catálogo, y si
// tampoco está ahí, al token crudo. Comprobado el 2026-08-27: de los 24
// tipos vivos en producción, 14 no estaban en el catálogo de la UI —el
// mismo patrón de enum re-listado a mano que ya hizo divergir
// SOURCE_LABEL y VALID_SOURCES—, así que la caída no es un caso teórico:
// hoy es la mayoría.

import { getEventTypeMeta } from "../constants/auditEventTypes";

/** Texto de `details` si es una cadena con contenido, si no null. */
function str(value) {
  const s = String(value ?? "").trim();
  return s || null;
}

/**
 * Plantillas por tipo de evento.
 *
 * Cada una recibe (details, ctx) y devuelve segmentos. `strong: true`
 * marca el objeto de la acción — el rol, el equipo, el paquete — que es lo
 * que el ojo busca al recorrer la columna.
 *
 * Sólo se escriben plantillas para lo que aporta algo por encima de la
 * etiqueta. `REPORT_RUN` no está: "Report run" ya lo dice todo, y una
 * plantilla que sólo repita la etiqueta es código que mantener a cambio de
 * nada.
 */
const TEMPLATES = {
  // ── Identidad y roles ──────────────────────────────────────────────
  TENANT_ROLE_CREATED: (d) => [
    { text: "created the role " },
    { text: str(d?.name) || "(unnamed)", strong: true },
  ],
  TENANT_ROLE_PERMISSIONS_CHANGED: (d) => [
    { text: "changed the permissions of role " },
    { text: str(d?.name) || "(unnamed)", strong: true },
    ...(Array.isArray(d?.permissions)
      ? [{ text: ` — now ${d.permissions.length} capabilit${d.permissions.length === 1 ? "y" : "ies"}` }]
      : []),
  ],
  TENANT_MEMBER_ROLE_ASSIGNED: (d) => [
    { text: "assigned role " },
    { text: str(d?.role) || str(d?.name) || "(unnamed)", strong: true },
    { text: " to a member" },
  ],

  // ── Facturación ────────────────────────────────────────────────────
  TRIAL_EXTENDED: (d) => [
    { text: "extended the trial by " },
    { text: `${d?.months ?? "?"} month${d?.months === 1 ? "" : "s"}`, strong: true },
  ],

  // ── Política ───────────────────────────────────────────────────────
  POLICY_TENANT_PUSHED: () => [{ text: "pushed the tenant policy to every device" }],
  POLICY_TENANT_SECURITY_CHANGED: () => [{ text: "changed the " }, { text: "security policy", strong: true }],
  POLICY_TENANT_PLUGINS_CHANGED: () => [{ text: "changed which " }, { text: "plugins", strong: true }, { text: " are enabled" }],
  POLICY_TENANT_CONFIG_CHANGED: () => [{ text: "changed the tenant agent configuration" }],
  POLICY_DEVICE_CREATED: (d, ctx) => [
    { text: "created a policy override on " },
    { text: ctx.host, strong: true },
  ],

  // ── Equipos y PKI ──────────────────────────────────────────────────
  DEVICE_DECOMMISSION_REQUESTED: (d, ctx) => [{ text: "requested decommission of " }, { text: ctx.host, strong: true }],
  DEVICE_DECOMMISSION_STARTED: (d, ctx) => [{ text: "started decommissioning " }, { text: ctx.host, strong: true }],
  DEVICE_DECOMMISSION_COMPLETED: (d, ctx) => [{ text: "finished decommissioning " }, { text: ctx.host, strong: true }],
  DEVICE_CERTIFICATES_REVOKED: (d, ctx) => [{ text: "revoked the certificates of " }, { text: ctx.host, strong: true }],
  cert_revoked: (d, ctx) => [{ text: "revoked a certificate on " }, { text: ctx.host, strong: true }],

  // ── Seguridad ──────────────────────────────────────────────────────
  SECURITY_DRIFT_REMEDIATED: (d, ctx) => [
    { text: "remediated " },
    { text: str(d?.capability) || "a security drift", strong: true },
    { text: " on " },
    { text: ctx.host },
  ],

  // ── Software ───────────────────────────────────────────────────────
  sdp_self_service_install: (d, ctx) => [
    { text: "installed " },
    { text: str(d?.packageName) || "a package", strong: true },
    { text: " from self-service on " },
    { text: ctx.host },
  ],

  // ── Sesiones de agente ─────────────────────────────────────────────
  // Sólo el rechazo tiene plantilla. Los `ok` de estos tipos viven en el
  // carril de sistema y su etiqueta ya basta; el rechazo es la señal de
  // seguridad y merece decir por qué.
  grpc_connect: (d, ctx, row) =>
    row?.outcome === "rejected"
      ? [{ text: "was refused a connection" }, ...(str(row?.reason) ? [{ text: " — " }, { text: str(row.reason), strong: true }] : [])]
      : null,
};

/**
 * Describe una fila.
 *
 * @param row       la fila de security_events
 * @param deps.getHostname  resuelve device_id → hostname (la página ya lo tiene)
 * @returns { known, segments }  `known` distingue "hay plantilla" de "caí
 *          al nombre del evento", para que la UI pueda atenuar la segunda.
 */
export function describeEvent(row, deps = {}) {
  const type = String(row?.event_type ?? "");
  const details = row?.details && typeof row.details === "object" ? row.details : {};
  const getHostname = typeof deps.getHostname === "function" ? deps.getHostname : null;
  const host = row?.device_id
    ? (getHostname ? getHostname(row.device_id) : String(row.device_id))
    : "an unknown device";

  const template = TEMPLATES[type];
  if (template) {
    let segments = null;
    try {
      segments = template(details, { host }, row);
    } catch {
      // Un `details` con una forma inesperada no puede vaciar la fila. Se
      // cae a la etiqueta como cualquier tipo sin plantilla.
      segments = null;
    }
    if (Array.isArray(segments) && segments.length > 0) {
      return { known: true, segments };
    }
  }

  // Caída. NUNCA una frase vacía: la etiqueta del catálogo si existe, y si
  // no, el token crudo humanizado por getEventTypeMeta.
  const label = getEventTypeMeta(type)?.label || type || "(unknown event)";
  return { known: false, segments: [{ text: label }] };
}

/** La frase en texto plano — para el tooltip, el export y los tests. */
export function describeEventText(row, deps) {
  return describeEvent(row, deps)
    .segments.map((s) => s.text)
    .join("");
}
