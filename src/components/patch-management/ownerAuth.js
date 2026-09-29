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
