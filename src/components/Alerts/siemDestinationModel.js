// src/components/Alerts/siemDestinationModel.js
//
// ADR-0028 — constantes y cuerpo del formulario de destinos SIEM, fuera del
// componente para poder probarlos solos.

export const EMPTY_SENTINEL = { azureTenantId: "", clientId: "", dcrImmutableId: "", streamName: "Custom-TraceniumEvents_CL" };

export const AUDIT_SCOPE_LABEL = {
  off: "Don't send",
  admin: "Actions by people",
  admin_and_failures: "Actions by people + anything that failed",
  all: "Everything, including the fleet's routine events",
};

/** Lo que el formulario manda: completo al crear, sólo lo cambiado al editar. */
export function destinationBody(v, initial, editing) {
  const body = {
    kind: v.kind,
    label: v.label,
    url: v.url,
    minSeverity: v.minSeverity,
    includeResolved: v.includeResolved,
    sources: v.sources.length ? v.sources : null,
    enabled: v.enabled,
    auditScope: v.auditScope,
  };
  if (v.kind === "sentinel") body.config = v.config;
  if (!editing) {
    body.secret = v.secret;
    return body;
  }
  const before = destinationBody(initial, null, null);
  for (const k of Object.keys(body)) {
    if (JSON.stringify(body[k]) === JSON.stringify(before[k])) delete body[k];
  }
  // Un secreto vacío es «no lo cambies»: nunca vuelve del servidor.
  if (v.secret) body.secret = v.secret;
  return body;
}
