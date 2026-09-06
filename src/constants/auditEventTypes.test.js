// src/constants/auditEventTypes.test.js
//
// Que el catálogo de la UI no se quede atrás del backend.
//
// LO QUE PASÓ. Este catálogo es una lista escrita a mano de los
// `event_type` que el backend escribe, y se había quedado con 29 entradas
// mientras el backend emitía 56. Medido el 2026-08-27: de los 24 tipos que
// existían de verdad en producción, 14 no estaban aquí — entre ellos
// TRIAL_EXTENDED, REPORT_RUN y los tres del ciclo de baja de un equipo.
// Todos caían al bucket "Other" con el token crudo humanizado, así que
// nadie lo notaba: la página no se rompe cuando esto diverge, sólo enseña
// peor.
//
// Es el tercer enum re-listado a mano de esta app que diverge, después de
// VALID_SOURCES y SOURCE_LABEL en alerts. La solución de fondo sería que
// el backend publicase el catálogo; mientras tanto, este test convierte la
// divergencia en un fallo en vez de en una degradación silenciosa.

import { describe, it, expect } from "vitest";
import {
  getEventTypeMeta,
  groupFacetsByCategory,
  CATEGORY_ORDER,
} from "./auditEventTypes";

// Todos los `event_type` que certusws-tracenium puede escribir en
// security_events. Regenerar con, desde la raíz del backend:
//
//   grep -rhoE 'eventType: *"[A-Za-z_0-9]+"' modules --include="*.ts" \
//     | grep -v __tests__ | sed 's/.*"\(.*\)"/\1/' | sort -u
//
// … más los cuatro que classifyChange construye por interpolación
// (`POLICY_${scope}_...` con scope TENANT|DEVICE) y los cinco de
// SECURITY_*, que se emiten desde el ingest de facts.
//
// ⚠️ NO incluye los de compliance_finding_events (opened, closed,
// acknowledged, acknowledgement_revoked, remediation_status_changed):
// esos van a OTRA tabla y no salen nunca en la página de Audit. Meterlos
// aquí sería llenar el desplegable de filtros con opciones que no
// devuelven nada.
// ⚠️ ESTA LISTA SE MANTIENE A MANO Y SE QUEDA VIEJA. Es lo que pasó con
// `PAYMENT_FAILED` y `cert_issued`: el backend los emite, nadie los añadió
// aquí, y el test de cobertura pasó en verde mientras la pantalla enseñaba
// el token crudo. Para refrescarla, comparar contra:
//   grep -rhoE 'eventType: "[A-Za-z_.]+"' --include="*.ts" modules/
// en certusws-tracenium (⚠️ no ve los tipos que se arman por plantilla,
// como los POLICY_*_CHANGED de classifyChange).
const TIPOS_DEL_BACKEND = [
  "AI_GATEWAY_CALL",
  "DEVICE_CERTIFICATES_REVOKED",
  "DEVICE_DECOMMISSION_COMPLETED",
  "DEVICE_DECOMMISSION_FAILED",
  "DEVICE_DECOMMISSION_REQUESTED",
  "DEVICE_DECOMMISSION_STARTED",
  "DEVICE_PURGE_COMPLETED",
  "DEVICE_PURGE_STARTED",
  "DEVICE_RESTORED",
  "ENTITLEMENTS_REDUCED",
  "PAYMENT_FAILED",
  "REPORT_DOWNLOADED",
  "MOBILE_COMMAND_ACKED",
  "MOBILE_COMMAND_ISSUED",
  "POLICY_DEVICE_CONFIG_CHANGED",
  "POLICY_DEVICE_CREATED",
  "POLICY_DEVICE_DELETED",
  "POLICY_DEVICE_MDM_CHANGED",
  "POLICY_DEVICE_PLUGINS_CHANGED",
  "POLICY_DEVICE_PUSHED",
  "POLICY_DEVICE_SECURITY_CHANGED",
  "POLICY_DEVICE_UPDATED",
  "POLICY_TENANT_CONFIG_CHANGED",
  "POLICY_TENANT_CREATED",
  "POLICY_TENANT_MDM_CHANGED",
  "POLICY_TENANT_PLUGINS_CHANGED",
  "POLICY_TENANT_PUSHED",
  "POLICY_TENANT_SECURITY_CHANGED",
  "POLICY_TENANT_UPDATED",
  "REPORT_EMAILED",
  "REPORT_RUN",
  "SECURITY_DRIFT_DETECTED",
  "SECURITY_DRIFT_REMEDIATED",
  "SECURITY_DRIFT_REMEDIATION_FAILED",
  "SECURITY_DRIFT_REMEDIATION_REBOOTING",
  "SECURITY_POLICY_UNENFORCEABLE",
  "TENANT_MEMBER_DELETED",
  "TENANT_MEMBER_INVITED",
  "TENANT_MEMBER_INVITE_CANCELED",
  "TENANT_MEMBER_ROLE_ASSIGNED",
  "TENANT_ROLE_CREATED",
  "TENANT_ROLE_DELETED",
  "TENANT_ROLE_PERMISSIONS_CHANGED",
  "TRIAL_EXTENDED",
  "cert_expired",
  "cert_issued",
  "cert_renew_activated",
  "cert_renew_issued",
  "cert_renew_requested",
  "cert_revoked",
  "facts_scp_rejected",
  "grpc_connect",
  "grpc_disconnect",
  "grpc_revoked_disconnect",
  "grpc_stream_error",
  "policy_ack_failed",
  "policy_ack_ok",
  "policy_hello_drift_detected",
  "sdp_self_service_install",
];

describe("catálogo de eventos de auditoría", () => {
  it("cubre TODOS los tipos que el backend puede escribir", () => {
    // Un tipo que falte no rompe la página: cae a "Other" con el token
    // crudo. Por eso hace falta el test — la degradación es invisible.
    const sinCatalogar = TIPOS_DEL_BACKEND.filter(
      (t) => getEventTypeMeta(t).category === "Other" && !ESPERADOS_EN_OTHER.has(t)
    );
    expect(sinCatalogar, `sin catalogar: ${sinCatalogar.join(", ")}`).toEqual([]);
  });

  it("ninguno se queda sin etiqueta legible", () => {
    for (const t of TIPOS_DEL_BACKEND) {
      const meta = getEventTypeMeta(t);
      expect(meta.label, t).toBeTruthy();
      // Si la etiqueta es el token en crudo, es que cayó al humanizador.
      expect(meta.label, t).not.toBe(t);
    }
  });

  it("cada categoría usada tiene color y sitio en el orden", () => {
    // Añadir una categoría son TRES sitios: el catálogo, CATEGORY_META y
    // CATEGORY_ORDER. Olvidar el tercero deja el grupo fuera del
    // desplegable sin que nada falle, que es como se pierde una familia
    // entera de filtros.
    const usadas = new Set(TIPOS_DEL_BACKEND.map((t) => getEventTypeMeta(t).category));
    for (const c of usadas) {
      expect(CATEGORY_ORDER, `${c} falta en CATEGORY_ORDER`).toContain(c);
      const meta = getEventTypeMeta(TIPOS_DEL_BACKEND.find((t) => getEventTypeMeta(t).category === c));
      expect(meta.color, `${c} sin color`).toBeTruthy();
      expect(meta.tint, `${c} sin tint`).toBeTruthy();
    }
  });

  it("un tipo desconocido sigue cayendo a Other sin romper nada", () => {
    // La permisividad del catálogo es deliberada: el endpoint de facets es
    // dinámico y un tipo nuevo tiene que aparecer aunque nadie lo haya
    // añadido aquí todavía.
    const meta = getEventTypeMeta("QUANTUM_KEY_ROTATED");
    expect(meta.category).toBe("Other");
    expect(meta.label).toBeTruthy();
    expect(meta.color).toBeTruthy();
  });

  it("agrupa los facets por categoría respetando el orden", () => {
    const grupos = groupFacetsByCategory([
      { value: "TRIAL_EXTENDED", count: 2 },
      { value: "TENANT_ROLE_CREATED", count: 1 },
      { value: "policy_ack_ok", count: 900 },
    ]);
    const nombres = grupos.map((g) => g.category);
    // Identity va antes que Policies, y Billing después: el orden lo fija
    // CATEGORY_ORDER, no el orden de llegada de los facets.
    expect(nombres.indexOf("Identity")).toBeLessThan(nombres.indexOf("Billing"));
    expect(nombres).toContain("Policies");
  });
});

// Los dos que viven en "Other" a conciencia: no son de ninguna familia y
// crear una categoría por cada uno llenaría el desplegable de grupos de
// un solo elemento.
// Sólo AI_GATEWAY_CALL: es una llamada que dispara el producto solo, y una
// categoría con un único miembro informa menos que el cajón de sastre.
// `sdp_self_service_install` salió de aquí el 2026-09-04 — tiene familia
// ("Software") y estar en Other era presentarlo como sin clasificar.
const ESPERADOS_EN_OTHER = new Set(["AI_GATEWAY_CALL"]);
