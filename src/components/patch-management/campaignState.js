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
 * El `lastError` del job de parche, legible para el operador.
 *
 * ⚠️ Las puertas del backend escriben CÓDIGOS en `last_error`, no frases: sin
 * esto el chip «Waiting for window» enseñaba `held:maintenance_window_closed`
 * en el tooltip. Sólo se traducen los códigos de las puertas (ventana +
 * snapshot); cualquier otro texto —el mensaje real del agente, p. ej.— pasa
 * tal cual, porque reescribirlo escondería el diagnóstico.
 */
export const PATCH_ERROR_TEXT = {
  "held:maintenance_window_closed":
    "Held back at delivery: the maintenance window had closed. It goes out when the next window opens.",
  maintenance_window_closed_after_snapshot:
    "Not installed: the maintenance window closed after the pre-patch snapshot was taken. Dispatch again to patch with a fresh snapshot in the next window.",
  "deferred:window_check_unavailable": "Maintenance windows could not be read — delivery will be retried.",
  snapshot_no_response:
    "Not installed: the Infrastructure Gateway did not answer the pre-patch snapshot request in time.",
};

export function describePatchError(lastError) {
  if (!lastError) return null;
  return PATCH_ERROR_TEXT[lastError] || lastError;
}

/**
 * Qué decir del snapshot de un equipo.
 *
 * `applies` sale de `snapshotApplies` del backend, calculado con la misma regla
 * que la puerta del parche (VM + un gateway que no sea él mismo). Tres casos
 * sin snapshot que NO son lo mismo:
 *
 *   applies === false → «N/A»: un PC, un portátil, el propio gateway. No hay
 *                       nada que fotografiar; marcarlo como carencia sería
 *                       inventar un problema.
 *   applies === true  → «None yet»: le corresponde y todavía no se ha tomado
 *                       ninguno (no ha habido un parche con puerta).
 *   otro (null/undef) → «—»: no se sabe, o el backend no lo dice todavía.
 *
 * Si hay snapshot, manda el snapshot, diga lo que diga `applies`.
 */
export function snapshotState(snapshot, applies) {
  if (!snapshot) {
    if (applies === false) {
      return {
        label: "N/A",
        tone: "muted",
        title: "Not a VM behind an Infrastructure Gateway — no pre-patch snapshot is taken",
      };
    }
    if (applies === true) {
      return {
        label: "None yet",
        tone: "muted",
        title: "Eligible for a pre-patch snapshot; none taken yet",
      };
    }
    return { label: "—", tone: "muted", title: "" };
  }
  if (snapshot.outcome === "rejected") {
    return {
      label: "Rejected",
      tone: "critical",
      // El detalle es lo que convierte «rechazado» en algo accionable: qué
      // datastore, cuánto libre, contra qué umbral.
      title: snapshot.reasonDetail || snapshot.reason || "The gateway rejected the snapshot",
    };
  }
  if (snapshot.outcome === "failed") {
    return { label: "Failed", tone: "critical", title: snapshot.reasonDetail || snapshot.reason || "" };
  }
  if (snapshot.outcome === "pending") {
    return { label: "In progress", tone: "neutral", title: "Snapshot requested" };
  }
  if (snapshot.onDatastore) {
    return {
      label: "Held",
      tone: "caution",
      title: `Still on the datastore${snapshot.takenAt ? ` since ${snapshot.takenAt}` : ""}`,
    };
  }
  if (snapshot.removedAt) {
    return { label: "Removed", tone: "positive", title: `Removed on ${snapshot.removedAt}` };
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
