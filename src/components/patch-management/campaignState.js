// src/components/patch-management/campaignState.js
//
// Cómo se lee el estado de campaña que devuelve /campaign-status.
//
// Puro y sin MUI a propósito: aquí sólo se decide QUÉ dice cada estado y con
// qué tono, para poder probarlo sin montar la página.
//
// ⚠️ Los rótulos no son sinónimos sueltos, son la diferencia que el operador
// necesita: «esperando ventana» y «esperando snapshot» son dos motivos
// distintos de la misma espera, y «completado» no aparece por ningún lado
// porque no significa «parcheado» — hasta que el equipo vuelve del reinicio,
// el parche no está puesto.

/** tone → lo resuelve el componente con la paleta; aquí sólo la intención. */
export const CAMPAIGN_STATES = {
  patched: { label: "Patched", tone: "positive" },
  awaiting_reboot: { label: "Awaiting reboot", tone: "caution" },
  awaiting_window: { label: "Waiting for window", tone: "neutral" },
  awaiting_snapshot: { label: "Waiting for snapshot", tone: "neutral" },
  in_flight: { label: "In flight", tone: "neutral" },
  failed: { label: "Failed", tone: "critical" },
  timed_out: { label: "Timed out", tone: "critical" },
  cancelled: { label: "Cancelled", tone: "muted" },
  never_ran: { label: "Never patched", tone: "muted" },
  unknown: { label: "Unknown state", tone: "caution" },
};

export function campaignState(state) {
  return CAMPAIGN_STATES[state] || CAMPAIGN_STATES.unknown;
}

/**
 * Qué decir del snapshot de un equipo.
 *
 * `null` no es «no hay snapshot», es «este equipo no pasa por gateway»: sin
 * vCenter detrás no hay nada que fotografiar, y marcarlo como carencia sería
 * inventar un problema.
 */
export function snapshotState(snapshot) {
  if (!snapshot) return { label: "—", tone: "muted", title: "Sin gateway: no aplica" };
  if (snapshot.outcome === "rejected") {
    return {
      label: "Rejected",
      tone: "critical",
      // El detalle es lo que convierte «rechazado» en algo accionable: qué
      // datastore, cuánto libre, contra qué umbral.
      title: snapshot.reasonDetail || snapshot.reason || "El gateway rechazó el snapshot",
    };
  }
  if (snapshot.outcome === "failed") {
    return { label: "Failed", tone: "critical", title: snapshot.reasonDetail || snapshot.reason || "" };
  }
  if (snapshot.outcome === "pending") {
    return { label: "In progress", tone: "neutral", title: "Snapshot solicitado" };
  }
  if (snapshot.onDatastore) {
    return {
      label: "Held",
      tone: "caution",
      title: `Sigue en el datastore${snapshot.takenAt ? ` desde ${snapshot.takenAt}` : ""}`,
    };
  }
  if (snapshot.removedAt) {
    return { label: "Removed", tone: "positive", title: `Retirado el ${snapshot.removedAt}` };
  }
  return { label: snapshot.outcome || "—", tone: "muted", title: "" };
}

/** Orden de lectura de la tira: lo que exige acción primero. */
const STRIP_ORDER = [
  "failed",
  "timed_out",
  "awaiting_reboot",
  "awaiting_window",
  "awaiting_snapshot",
  "in_flight",
  "patched",
  "unknown",
  "cancelled",
];

/**
 * La tira de campaña: sólo los estados que existen, nunca una fila de ceros.
 *
 * ⚠️ `never_ran` se queda FUERA de los cubos y se devuelve aparte, porque no es
 * un resultado de la campaña sino su ausencia — y con 50 de 54 equipos ahí, un
 * chip más entre otros lo haría pasar por un estado cualquiera.
 */
export function campaignStrip(totals) {
  const byState = totals?.byState || {};
  const chips = STRIP_ORDER.filter((k) => Number(byState[k]) > 0).map((k) => ({
    key: k,
    value: Number(byState[k]),
    ...campaignState(k),
  }));
  return { chips, neverRan: Number(byState.never_ran) || 0 };
}

/** «2 de 54 equipos enrolados», que es la frase que faltaba. */
export function coverageLine(fleet, totals) {
  const enrolled = Number(fleet?.enrolled) || 0;
  const byState = totals?.byState || {};
  const withJob = enrolled - (Number(byState.never_ran) || 0);
  return { enrolled, withJob, reporting: Number(fleet?.reporting) || 0 };
}
