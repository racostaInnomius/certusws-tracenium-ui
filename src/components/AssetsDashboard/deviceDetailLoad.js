// src/components/AssetsDashboard/deviceDetailLoad.js
//
// Cómo carga la ficha de un equipo y qué dice cuando algo no llega.
//
// ⚠️ EL CASO (prod, 30-sep). Todas las entradas a la ficha —filas de Hardware
// Inventory, Patch Management, el Overview, las alertas— llegan con
// `?device=<id>` y nada más. La cabecera caía en el id mientras cargaba el
// detalle, y SE QUEDABA en el id si esa petición fallaba (un arranque en frío
// del API pasa del corte de 15 s del cliente): UUID por título, UUID en el
// campo «Hostname» y un aviso que no decía qué faltaba ni dejaba reintentar.
// El inventario de hardware SÍ había llegado, con el nombre dentro.

/** Lo que cada petición de la ficha aporta, en palabras del operador. */
export const DETAIL_PART_LABEL = {
  profile: "device details",
  hardware: "hardware inventory",
  software: "installed software",
  printers: "printers",
};

/**
 * El nombre del equipo, de la primera fuente que lo tenga: el detalle, lo que
 * trajo quien abrió la ficha, la fila de la tabla, el inventario de hardware.
 *
 * `null` cuando ninguna lo sabe — la cabecera dice entonces «Loading device…»
 * o «Unknown device», nunca el id: el id ya va en su propia línea debajo, y
 * repetido como nombre parece un equipo sin nombre, que no es lo que pasa.
 */
export function resolveDeviceName({ profile = null, selectedHost = null, hostRow = null, hardware = null } = {}) {
  const id = String(profile?.agentId || selectedHost?.agent_id || selectedHost?.agentId || "").trim();
  for (const candidate of [profile?.hostname, selectedHost?.hostname, hostRow?.hostname, hardware?.hostname]) {
    const name = String(candidate ?? "").trim();
    if (name && name !== id) return name;
  }
  return null;
}

/** El detalle respondió que ese equipo no existe (en este cliente). */
export function isNotFound(err) {
  return Number(err?.status) === 404;
}

/**
 * Una petición con UN reintento si el fallo es pasajero (timeout, red, 5xx).
 * Un 404 o un 403 no se reintentan: la respuesta no va a cambiar.
 */
export async function loadWithOneRetry(load, { isTemporary, delayMs = 1500, sleep } = {}) {
  try {
    return await load();
  } catch (err) {
    if (!isTemporary?.(err)) throw err;
    await (sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms))))(delayMs);
    return load();
  }
}

/** «Could not load device details and hardware inventory.» */
export function describeDetailFailures(parts) {
  const labels = [...new Set(parts ?? [])].map((p) => DETAIL_PART_LABEL[p] ?? p);
  if (labels.length === 0) return "";
  const list = labels.length === 1 ? labels[0] : `${labels.slice(0, -1).join(", ")} and ${labels[labels.length - 1]}`;
  return `Could not load ${list}.`;
}
