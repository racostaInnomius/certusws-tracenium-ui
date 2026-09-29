// src/components/patch-management/ownerAuth.js
//
// Actualizaciones que el agente NO puede instalar.
//
// 🔴 28-sep, JPR-MacBookPro (M3 Pro), job e4689371: «Install» de macOS 27.0.1
// lanzó `softwareupdate --install`, que pidió `Password:` y esperó una hora. En
// Apple silicon una actualización del sistema exige la autorización de un
// propietario del volumen (o MDM), aunque el agente corra como root. El backend
// las marca (`installBlockedReason`) y las deja fuera de la instalación de
// flota; aquí se dicen, en vez de ofrecerlas como cualquier otra.

export const OWNER_AUTH_REQUIRED = "owner_authorization_required";

export const OWNER_AUTH_CHIP = "Install on the Mac";

export const OWNER_AUTH_TOOLTIP =
  "On Apple silicon, a macOS update needs the Mac owner's password (or MDM). The agent can't give it, so it " +
  "can't install this update — the user installs it from System Settings → General → Software Update.";

/** ¿La puede instalar el agente? */
export function isAgentInstallable(item) {
  return !item?.installBlockedReason;
}

/**
 * Lo que la instalación de flota dejó fuera por esto: cuántas actualizaciones y
 * en cuántos Macs. Suma las apartadas de equipos que sí reciben job y los
 * equipos que no reciben ninguno porque sólo tenían ésas.
 */
export function ownerAuthLeftOut(res) {
  const macs = new Set();
  let updates = 0;
  for (const p of Array.isArray(res?.plan) ? res.plan : []) {
    const n = Array.isArray(p?.ownerAuthExcluded) ? p.ownerAuthExcluded.length : 0;
    if (n > 0) {
      updates += n;
      macs.add(String(p.agentId));
    }
  }
  for (const s of Array.isArray(res?.skipped) ? res.skipped : []) {
    if (s?.reason !== OWNER_AUTH_REQUIRED || macs.has(String(s.agentId))) continue;
    macs.add(String(s.agentId));
    // El backend no manda la lista de un equipo omitido entero: al menos una.
    updates += 1;
  }
  return { macs: macs.size, updates };
}

/** La frase del diálogo de flota, o null si no se dejó nada fuera. */
export function describeOwnerAuthLeftOut(leftOut) {
  if (!leftOut || leftOut.macs === 0) return null;
  const macs = `${leftOut.macs} Apple silicon Mac${leftOut.macs === 1 ? "" : "s"}`;
  return (
    `macOS updates on ${macs} are left out: the agent can't install them without the owner's password. ` +
    "Ask the user to install them from System Settings → General → Software Update."
  );
}

// ── Pedírsela al usuario, con fecha límite ───────────────────────────
//
// Lo que sí se puede hacer sin MDM: que la bandeja del Mac se lo recuerde al
// usuario hasta que la instale — la «acción para el usuario» `os.update`
// (job `user_action`, ADR-0036 D1). La bandeja la repite una vez al día, cada
// pocas horas en los 3 últimos días y cada hora pasada la fecha, y el agente
// la cierra cuando el escaneo ya no la lista.

/** El job que lleva las acciones para el usuario. */
export const USER_ACTION_JOB_TYPE = "user_action";

export const NUDGE_DEFAULT_DAYS = 7;
export const NUDGE_MAX_DAYS = 60;

export const NUDGE_CADENCE_TEXT =
  "The Mac's menu bar app reminds the user once a day, several times a day in the last 3 days and every hour " +
  "after the deadline, with a button that opens Software Update. The reminders stop once the update is installed.";

const pad = (n) => String(n).padStart(2, "0");
/** Una fecha local «YYYY-MM-DD» (lo que usa un <input type="date">). */
export function localDateString(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function nudgeDateBounds(now = new Date()) {
  const plus = (days) => new Date(now.getFullYear(), now.getMonth(), now.getDate() + days);
  return { min: localDateString(plus(1)), max: localDateString(plus(NUDGE_MAX_DAYS - 1)), def: localDateString(plus(NUDGE_DEFAULT_DAYS)) };
}

/**
 * El payload del job, o null si la fecha no vale. La fecha límite es a las
 * 18:00 hora local del operador de ese día: «antes del viernes» es el viernes
 * por la tarde, no a medianoche. `actionId` y la caducidad los pone el
 * servidor (job-types.ts, normalizeJobPayload).
 */
export function buildNudgePayload(item, dateString, now = new Date()) {
  const m = typeof dateString === "string" ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateString) : null;
  if (!m || !item?.hotfixId) return null;
  const deadline = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 18, 0, 0);
  if (Number.isNaN(deadline.getTime()) || deadline.getMonth() !== Number(m[2]) - 1) return null;
  const max = now.getTime() + NUDGE_MAX_DAYS * 24 * 3600 * 1000;
  if (deadline.getTime() <= now.getTime() || deadline.getTime() > max) return null;
  return {
    op: "request",
    kind: "os.update",
    params: { label: item.hotfixId, ...(item.title ? { title: item.title } : {}) },
    deadlineUtc: deadline.toISOString(),
  };
}
