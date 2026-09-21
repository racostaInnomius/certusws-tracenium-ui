// src/components/software-delivery/uninstallPlanning.js
//
// Lo que el flujo de desinstalar decide sin pintar nada: cómo explicar un
// equipo bloqueado y en cuántos despliegues se parte el envío.
//
// ⚠️ Puro y aparte porque las dos cosas se equivocan SIN DAR ERROR:
//
//   · El motivo. Hasta el 21-sep «protegido» sólo podía ser el agente y
//     «origen no soportado» sólo podía ser «no es Windows». Ahora un
//     protegido puede ser Safari o `openssh-server`, y decir «dejaría al
//     equipo sin agente» de ellos es falso. El backend manda el detalle, pero
//     en español; la pantalla está en inglés, así que el texto se elige aquí
//     mirando también el ORIGEN de la fila.
//
//   · El reparto. Un despliegue es de UN tipo de equipo (el agente rechaza un
//     snapshot de otra plataforma; deb y rpm son gestores distintos). Mandar
//     20 Windows y 3 Macs juntos lo rechaza el backend entero.

/** Orden estable de envío y etiquetas para la pantalla. */
export const TARGET_ORDER = ["windows", "macos", "deb", "rpm"];

export const TARGET_LABEL = {
  windows: "Windows",
  macos: "macOS",
  deb: "Linux (deb)",
  rpm: "Linux (rpm)",
};

const UNSUPPORTED_BY_SOURCE = {
  pkgutil:
    "macOS installer receipt: removing it only deletes the files the receipt lists, and many installers leave services and extensions outside it.",
  homebrew: "Homebrew has to run as the user who owns the installation, not as the agent.",
  snap: "Snap packages cannot be uninstalled from here yet.",
  flatpak: "Flatpak packages cannot be uninstalled from here yet.",
  "ms-store": "Microsoft Store apps are installed per user and cannot be uninstalled from here yet.",
};

/**
 * Por qué no se va a tocar este equipo, en una frase que el operador pueda
 * accionar. Un motivo que no conocemos se enseña crudo: esconder uno
 * desconocido tras «no se puede» es peor que enseñarlo feo.
 */
export function describeBlocked(plan, app) {
  if (!plan || plan.ok) return "";
  const source = String(app?.source || "");
  const identity = String(app?.packageFamilyName || "");

  switch (plan.reason) {
    case "protected":
      // El agente primero, por nombre O identidad: es la misma regla que el
      // servidor aplica antes que ninguna otra.
      if (/tracenium/i.test(String(app?.name || "")) || /tracenium/i.test(identity)) {
        return "Protected: uninstalling it would leave the device without an agent.";
      }
      if (source === "macos-app-bundle") return "Protected: an Apple app that is part of macOS.";
      if (source === "dpkg" || source === "rpm") {
        return "Protected: removing it would leave the server without remote administration.";
      }
      return "Protected: uninstalling it would leave the device without an agent.";
    case "unsupported_source":
      return UNSUPPORTED_BY_SOURCE[source] || `Unsupported source (${source || "unknown"}).`;
    case "unsupported_location":
      return "Not in /Applications — only apps installed for the whole Mac can be removed.";
    case "per_user_install":
      return "Installed for a single user, not for the device — the agent cannot remove it on that person's behalf.";
    case "no_identity":
      return source === "macos-app-bundle"
        ? "The app has no bundle id in the inventory, so there is no exact way to find it."
        : source === "dpkg" || source === "rpm"
          ? "The inventory has no package name for it."
          : "No uninstall command was recorded.";
    case "name_not_expressible":
      return "The name contains % or _ and there is no ProductCode to identify it by.";
    default:
      return plan.detail || plan.reason || "Blocked.";
  }
}

/**
 * Los accionables, partidos en un envío por tipo de equipo.
 *
 * ⚠️ Una fila sin `target` es de un backend anterior al 21-sep, que sólo
 * sabía Windows: se manda como antes, SIN tipo, en un único envío. Inventarle
 * uno aquí sería decidir en la UI algo que el servidor no dijo.
 */
export function batchesByTarget(actionable) {
  const rows = Array.isArray(actionable) ? actionable : [];
  const byTarget = new Map();
  for (const r of rows) {
    const t = r?.plan?.target || null;
    if (!byTarget.has(t)) byTarget.set(t, []);
    byTarget.get(t).push(r.deviceId);
  }
  // Los tipos conocidos en su orden; uno que no conozcamos, detrás; el envío
  // sin tipo (backend viejo), el último.
  const rank = (t) => {
    if (t === null) return TARGET_ORDER.length + 1;
    const i = TARGET_ORDER.indexOf(t);
    return i === -1 ? TARGET_ORDER.length : i;
  };
  return [...byTarget.entries()]
    .sort((a, b) => rank(a[0]) - rank(b[0]))
    .map(([target, deviceIds]) => ({ target, deviceIds }));
}

/** El cuerpo de cada envío. Sin tipo, exactamente lo de antes. */
export function uninstallRequestBody(appName, batch) {
  return batch.target
    ? { appName, deviceIds: batch.deviceIds, target: batch.target }
    : { appName, deviceIds: batch.deviceIds };
}
