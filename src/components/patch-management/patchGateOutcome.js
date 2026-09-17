// src/components/patch-management/patchGateOutcome.js
//
// Qué decirle al operador cuando despacha un patch_install por una ruta que
// ahora pasa por las puertas (ventana de mantenimiento + snapshot previo).
//
// ⚠️ POR QUÉ IMPORTA EL MENSAJE
// El 15-sep «Install selected» del panel lateral mandó dos KBs a MSIG-DOMAIN, un
// controlador de dominio, a las 10:03 de un martes: fuera de ventana y sin
// snapshot. El backend ya retiene esos jobs (09f7527), pero una UI que siguiera
// diciendo «Queued» sería el mismo engaño al revés: el operador creería que el
// parche va saliendo cuando está esperando a las 22:00, y lo relanzaría.
//
// Puro: sin MUI ni API, para poder probarlo.

/** «Tue 22:00» en la hora local del navegador. `null` si no hay fecha válida. */
export function formatOpensAt(iso, locale = "en-US") {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const day = d.toLocaleDateString(locale, { weekday: "short" });
  const time = d.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  return `${day} ${time}`;
}

/** Los KBs pendientes del equipo, sin repetir y sin vacíos. */
export function pendingKbIds(items) {
  const out = [];
  const seen = new Set();
  for (const it of Array.isArray(items) ? items : []) {
    const id = it && typeof it.hotfixId === "string" ? it.hotfixId.trim() : "";
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

/**
 * La respuesta de crear UN patch_install por equipo → mensaje.
 * `{status, gate: {status, opensAt}}` del backend.
 */
export function describeGateOutcome(res) {
  const status = res?.gate?.status || (res?.status === "queued" ? "pending" : res?.status);
  if (status === "awaiting_window") {
    const when = formatOpensAt(res?.gate?.opensAt);
    return {
      severity: "info",
      held: true,
      message: when
        ? `Held until the maintenance window opens (${when})`
        : "Held until the next maintenance window opens",
    };
  }
  if (status === "awaiting_snapshot") {
    return {
      severity: "info",
      held: true,
      message: "Waiting for a pre-patch snapshot before installing",
    };
  }
  return { severity: "success", held: false, message: "Queued — installing now" };
}

/** Un 409 de la puerta → motivo legible. `null` si el error es otro. */
export function describeBlockedError(err) {
  if (err?.status !== 409) return null;
  // Mismo contrato para el reinicio bajo demanda (`device_reboot_blocked`).
  if (err?.body?.error !== "patch_install_blocked" && err?.body?.error !== "device_reboot_blocked") return null;
  const reason = err?.body?.reason ? String(err.body.reason).replace(/_/g, " ") : "blocked by the patch gate";
  return `Not dispatched — ${reason}`;
}

/**
 * Un lote (por equipos o por grupo) → resumen. Acepta `{jobs, blocked}` o
 * `{created: {jobs, blocked}}`. `null` si la respuesta no trae estados de puerta
 * (otros tipos de job), para que el llamador use su mensaje de siempre.
 */
export function summarizeGatedBatch(res) {
  const src = res?.created && Array.isArray(res.created.jobs) ? res.created : res;
  const jobs = Array.isArray(src?.jobs) ? src.jobs : null;
  const blocked = Array.isArray(src?.blocked) ? src.blocked : null;
  if (!jobs || !blocked) return null;
  if (!jobs.some((j) => j && typeof j.status === "string") && blocked.length === 0) return null;

  const count = (s) => jobs.filter((j) => j?.status === s).length;
  const parts = [];
  const queued = count("pending");
  const window = count("awaiting_window");
  const snapshot = count("awaiting_snapshot");
  if (queued) parts.push(`${queued} queued`);
  if (window) parts.push(`${window} held until the maintenance window`);
  if (snapshot) parts.push(`${snapshot} waiting for a snapshot`);
  if (blocked.length) parts.push(`${blocked.length} blocked`);
  return {
    severity: blocked.length ? "warning" : window || snapshot ? "info" : "success",
    message: `Patch install: ${parts.join(" · ") || "nothing dispatched"}`,
  };
}
