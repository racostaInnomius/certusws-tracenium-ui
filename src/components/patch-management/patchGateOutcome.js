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
    // Lo que el agente no puede instalar (macOS en Apple silicon, ver
    // ownerAuth.js) no entra en «Install all»: el job acabaría pidiendo contraseña.
    if (it?.installBlockedReason) continue;
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
  // 1-oct-2026: si las puertas no se pudieron leer al crearlo, el backend lo
  // retiene en vez de despachar sin ventana ni snapshot. No es la ventana.
  if (status === "awaiting_window" && res?.gate?.reason === "held:gates_unavailable") {
    return {
      severity: "warning",
      held: true,
      message:
        "Held: the maintenance-window and snapshot checks could not be read. It is released automatically once they respond",
    };
  }
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

/**
 * Motivos de bloqueo que el backend devuelve como código. Los que no estén aquí
 * se leen cambiando `_` por espacios, como antes.
 *
 * `patch_install_in_flight:<jobId>` (1-oct-2026): el equipo ya tiene un
 * patch_install sin terminar — en cola, retenido o en el agente. Antes nada lo
 * impedía y un doble clic daba dos jobs, dos snapshots y un falso «failed».
 */
const BLOCK_REASON_TEXT = {
  patch_install_in_flight: "this device already has a patch install queued, held or running — cancel it from Jobs first",
  invalid_patch_id: "an update id has an unexpected format",
  no_patches_selected: "no updates were selected",
  owner_authorization_required: "macOS updates on Apple silicon must be installed on the Mac itself",
  // ADR-0038 F3: el catálogo de parches.
  patch_catalog_unavailable: "the patch catalog could not be read, so blocked updates could not be ruled out — try again",
};

export function blockReasonText(reason) {
  if (!reason) return "blocked by the patch gate";
  const [code, ...rest] = String(reason).split(":");
  // `patch_blocked:KB1,KB2` — los que pidió están bloqueados en el catálogo.
  if (code === "patch_blocked") {
    const ids = rest.join(":");
    return `${ids ? `${ids.split(",").join(", ")} ${ids.includes(",") ? "are" : "is"}` : "every selected update is"} blocked in the patch catalog`;
  }
  return BLOCK_REASON_TEXT[code] || String(reason).replace(/_/g, " ");
}

/** Un 409 de la puerta → motivo legible. `null` si el error es otro. */
export function describeBlockedError(err) {
  if (err?.status !== 409) return null;
  // Mismo contrato para el reinicio bajo demanda (`device_reboot_blocked`).
  if (err?.body?.error !== "patch_install_blocked" && err?.body?.error !== "device_reboot_blocked") return null;
  return `Not dispatched — ${blockReasonText(err?.body?.reason)}`;
}
