// src/utils/auditActor.js
//
// Quién hizo un evento de auditoría, resuelto a partir de la fila.
//
// Vive fuera de la página por la misma razón que jobInsights o
// policyTransforms: es una decisión con reglas, y dentro del componente no
// se puede probar. La DataGrid en jsdom mide 0 px y pinta las columnas de
// la derecha como skeleton, así que un test que mire la celda renderizada
// afirma cosas sobre un `<span>` vacío — comprobado al escribir esto.
//
// EL DEFECTO QUE ESTAS REGLAS CIERRAN. `security_events.actor_subject`
// existía desde el principio y estaba a NULL en las 172.406 filas desde el
// 6 de marzo; los 19 sitios que sí conocían al usuario metían el sujeto
// OIDC en `peer`, la misma columna donde los escritores de gRPC ponen la
// dirección del cliente. Ahí convivían, medido en producción:
//
//   "35"                        → un sujeto OIDC (javier.pacheco@…)
//   "ops:enable-cdp-tls-probe"  → una etiqueta de script de operaciones
//   "189.203.174.69:28574"      → un peer de red de verdad
//
// y la UI lo enseñaba bajo una cabecera "Peer", donde un cambio de
// permisos de rol se leía como `9`.

export const NO_ACTOR = "—";

/**
 * Qué hizo el evento cuando no fue una persona, según `actor_kind` del
 * backend (modules/audit/audit-actor-kind.ts). Medido el 21-sep-2026: de las
 * filas sin actor, el 99% las emitió el agente o el propio Tracenium, y «—»
 * las pintaba igual que las que perdieron el actor.
 */
const NON_PERSON = {
  agent: {
    label: "Agent",
    hint: "Reported by the agent on the device. No person was involved.",
  },
  system: {
    label: "System",
    hint: "Done automatically by Tracenium. No person was involved.",
  },
  script: {
    label: "Ops script",
    hint: "Run by a Tracenium operations script, not by a member of this tenant.",
  },
  device_user: {
    label: "Device user",
    hint: "Requested by the person using the device, from the self-service portal.",
  },
  unrecorded: {
    label: "Not recorded",
    hint: "Who did this was not recorded. Rows before 3 Sep 2026 never stored it.",
  },
};

const LEGACY_HINT =
  "No actor recorded. Machine events have no person behind them, and rows before 27 Aug 2026 never stored one.";

/**
 * Resuelve la fila a { label, subject, known, kind, hint }.
 *
 * Orden: `actor_kind` no-persona → email resuelto → subject → nada.
 * `known` es true SÓLO para una persona: es lo que la página pinta con
 * letra fuerte.
 *
 * ⚠️ `peer` NO entra en esa cadena, y es la regla entera de este módulo.
 * Rellenar el hueco desde `peer` reproduce el defecto original con otro
 * nombre de columna: volvería a presentar direcciones de red y etiquetas
 * de script como si fueran personas. Un hueco honesto es mejor que un dato
 * que no lo es — y en las filas anteriores al 27-ago-2026 el hueco es la
 * única respuesta verdadera, porque la identidad no se guardó.
 *
 * Sin `actor_kind` (un backend anterior) se comporta como siempre: «—».
 */
export function resolveActor(row) {
  const email = String(row?.actor_email ?? "").trim();
  const subject = String(row?.actor_subject ?? "").trim();
  const kind = String(row?.actor_kind ?? "").trim();

  const nonPerson = NON_PERSON[kind];
  if (nonPerson) {
    return { label: nonPerson.label, subject: subject || null, known: false, kind, hint: nonPerson.hint };
  }

  if (email) return { label: email, subject: subject || null, known: true, kind: "person", hint: "" };
  if (subject) return { label: subject, subject, known: true, kind: "person", hint: "" };
  return { label: NO_ACTOR, subject: null, known: false, kind: null, hint: LEGACY_HINT };
}
