// src/utils/licenseEvents.js
//
// "El estado de licencia pudo cambiar" — lo emite Billing al contratar o
// guardar tarjeta, y lo escucha el AppShell, que es quien decide si la consola
// está bloqueada.
//
// Sin esto, el tenant con la prueba vencida pagaba en Billing (la única página
// que el bloqueo deja pasar) y al salir de ella seguía viendo la pantalla de
// bloqueo hasta recargar: el estado sólo se releía al cambiar de tenant.

export const LICENSE_STATE_CHANGED_EVENT = "tracenium:license-state-changed";

export function notifyLicenseStateChanged() {
  window.dispatchEvent(new Event(LICENSE_STATE_CHANGED_EVENT));
}
