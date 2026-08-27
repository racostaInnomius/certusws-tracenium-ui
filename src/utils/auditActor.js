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
 * Resuelve la fila a { label, subject, known }.
 *
 * Orden: email resuelto → subject → nada.
 *
 * ⚠️ `peer` NO entra en esa cadena, y es la regla entera de este módulo.
 * Rellenar el hueco desde `peer` reproduce el defecto original con otro
 * nombre de columna: volvería a presentar direcciones de red y etiquetas
 * de script como si fueran personas. Un hueco honesto es mejor que un dato
 * que no lo es — y en las filas anteriores al 27-ago-2026 el hueco es la
 * única respuesta verdadera, porque la identidad no se guardó.
 */
export function resolveActor(row) {
  const email = String(row?.actor_email ?? "").trim();
  const subject = String(row?.actor_subject ?? "").trim();

  if (email) return { label: email, subject: subject || null, known: true };
  if (subject) return { label: subject, subject, known: true };
  return { label: NO_ACTOR, subject: null, known: false };
}
