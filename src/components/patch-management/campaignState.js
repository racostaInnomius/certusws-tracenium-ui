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

// ⭐ (16-sep) La columna se llama «Last patch job» y ya no dice «Patched».
// Decía «Patched» con sólo mirar el job, y en T1 había filas «Patched» con 11
// parches pendientes y «Reboot pending» al lado; y «Never patched» parecía una
// acusación cuando sólo significa que TRACENIUM no le mandó nada — el equipo
// puede estar al día por WSUS, Intune o el usuario. «¿Está al día?» lo contestan
// Status, Missing y Reboot, que salen del inventario. Esta columna cuenta el
// último envío de Tracenium, contrastado con el escaneo posterior.

/** tone → lo resuelve el componente con la paleta; aquí sólo la intención. */
export const CAMPAIGN_STATES = {
  installed: { label: "Installed", tone: "positive" },
  // Backend anterior a 67d27fd: se lee como «instalado» sin verificar.
  patched: { label: "Installed", tone: "positive" },
  not_applied: { label: "Not applied", tone: "critical" },
  verifying: { label: "Verifying", tone: "neutral" },
  awaiting_reboot: { label: "Restart needed", tone: "caution" },
  awaiting_window: { label: "Waiting for window", tone: "neutral" },
  awaiting_snapshot: { label: "Waiting for snapshot", tone: "neutral" },
  in_flight: { label: "Installing", tone: "neutral" },
  failed: { label: "Failed", tone: "critical" },
  timed_out: { label: "Timed out", tone: "critical" },
  cancelled: { label: "Cancelled", tone: "muted" },
  never_ran: { label: "No Tracenium job", tone: "muted" },
  unknown: { label: "Unknown state", tone: "caution" },
};

export function campaignState(state) {
  return CAMPAIGN_STATES[state] || CAMPAIGN_STATES.unknown;
}

/** «Sep 16». `null` si no hay fecha válida. */
export function shortDate(iso, locale = "en-US") {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(locale, { month: "short", day: "numeric" });
}

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

/**
 * La celda «Last patch job» de un equipo: `{label, tone, title, empty}`.
 * `empty: true` → no es un estado sino su ausencia; se pinta como «—».
 *
 * La fecha va EN el rótulo cuando el estado es un resultado: un «Timed out» del
 * 14-ago no es lo mismo que uno de hoy, y sin fecha parecían iguales.
 */
export function lastPatchJobCell(campaign) {
  if (!campaign) return { label: "—", tone: "muted", title: "", empty: true };
  const p = campaign.patch || null;
  const state = campaign.state;

  if (state === "never_ran" || !p) {
    return {
      label: "—",
      tone: "muted",
      empty: true,
      title: "No patch job sent from Tracenium — updates may be managed elsewhere (WSUS, Intune, the user)",
    };
  }

  const base = campaignState(state);
  const when = shortDate(p.finishedAt) || shortDate(p.startedAt);
  const dated = (label) => (when ? `${label} · ${when}` : label);
  const installedPart = Number.isInteger(p.installedCount) && p.installedCount > 0
    ? `${plural(p.installedCount, "update", "updates")} installed`
    : "Installed";
  const error = describePatchError(p.lastError);

  switch (state) {
    case "installed":
    case "patched": {
      const others = Number(p.othersPending) || 0;
      return {
        label: others > 0 ? `Installed · ${others} other${others === 1 ? "" : "s"} pending` : dated("Installed"),
        tone: "positive",
        title: [
          `${installedPart}${when ? ` on ${when}` : ""}`,
          p.verifiedAt ? `confirmed by the scan of ${shortDate(p.verifiedAt)}` : null,
          others > 0
            ? `${plural(others, "other update", "other updates")} still pending — not part of this job`
            : null,
        ]
          .filter(Boolean)
          .join(" · "),
      };
    }
    case "not_applied": {
      const still = Array.isArray(p.stillMissing) ? p.stillMissing : [];
      const of = Number.isInteger(p.requestedCount) ? ` · ${still.length} of ${p.requestedCount}` : "";
      return {
        label: `Not applied${of}`,
        tone: "critical",
        title: `The agent reported success${when ? ` on ${when}` : ""}, but the scan${
          p.verifiedAt ? ` of ${shortDate(p.verifiedAt)}` : ""
        } still lists: ${still.join(", ") || "the requested updates"}`,
      };
    }
    case "verifying":
      return {
        label: "Verifying",
        tone: "neutral",
        title: `${installedPart}${when ? ` on ${when}` : ""} — waiting for a scan to confirm it`,
      };
    case "awaiting_reboot":
      return {
        label: when ? `Restart needed · since ${when}` : "Restart needed",
        tone: "caution",
        title: `${installedPart}${when ? ` on ${when}` : ""}. The system needs a restart before the update takes effect.`,
      };
    case "awaiting_window":
      return { label: base.label, tone: base.tone, title: error || "Held until the maintenance window opens" };
    case "awaiting_snapshot":
      return { label: base.label, tone: base.tone, title: error || "Waiting for the pre-patch snapshot" };
    case "in_flight":
      return { label: base.label, tone: base.tone, title: error || "" };
    case "failed":
    case "timed_out":
    case "cancelled":
      return { label: dated(base.label), tone: base.tone, title: error || "" };
    default:
      return { label: base.label, tone: base.tone, title: error || "" };
  }
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
  "not_applied",
  "failed",
  "timed_out",
  "awaiting_reboot",
  "awaiting_window",
  "awaiting_snapshot",
  "in_flight",
  "verifying",
  "installed",
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
