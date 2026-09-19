// src/components/patch-management/affectedDevices.js
//
// Cómo se nombran los equipos afectados por un CVE. PURO — sin React.
//
// ⚠️ POR QUÉ (18-sep): en la pestaña Vulnerabilities ni la tabla ni el diálogo
// de «Remediate» decían a QUÉ equipos afectaba nada. La columna enseñaba un
// chip con «1» y el diálogo, «on the 1 vulnerable device(s)»: para saber a qué
// máquina ibas a desplegar había que salir de la pantalla. El backend ya
// calculaba una muestra, pero eran UUIDs y no la pintaba nadie.
//
// Ahora viaja `sampleDevices: [{ agentId, hostname }]`, y aquí se convierte en
// las frases que se leen. Dos reglas que no son negociables:
//
//   · La muestra está TOPADA (10 equipos). Nombrar tres de cincuenta y cinco y
//     callarlo haría creer que el despliegue va sólo a ésos. Por eso «including»
//     cuando hay más, y el recuento completo siempre delante.
//   · Un equipo sin `host` no desaparece: se nombra por su id acortado. Peor que
//     un identificador feo es una lista que dice menos equipos de los que hay.

/** Lo que se lee de un equipo: su nombre, o su id acortado si aún no tiene. */
export function deviceName(device) {
  const host = typeof device?.hostname === "string" ? device.hostname.trim() : "";
  if (host) return host;
  const id = String(device?.agentId ?? "").trim();
  return id ? id.slice(0, 12) : "unnamed device";
}

/** Los nombres de la muestra, en orden de llegada (el backend ya los ordena). */
export function deviceNames(sampleDevices) {
  return (Array.isArray(sampleDevices) ? sampleDevices : []).map(deviceName);
}

/** «A», «A and B», «A, B and C». */
function joinNames(names) {
  if (names.length === 0) return "";
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/**
 * Cuántos nombres caben en el diálogo, que es estrecho. Con 55 equipos
 * afectados, leer los diez de la muestra no ayuda a decidir: el alcance lo da
 * el total, y los nombres sólo sirven para reconocer de qué parte de la flota
 * se habla.
 */
const NOMBRES_EN_EL_DIALOGO = 5;

/**
 * La frase del diálogo de confirmación: a cuántos equipos va y a cuáles.
 *
 * `null` cuando no hay muestra —un backend anterior a este cambio, o una
 * respuesta sin el campo—, para que quien llama vuelva al texto de siempre en
 * vez de afirmar algo que no sabe.
 */
export function affectedDevicesSentence(count, sampleDevices) {
  const total = Number(count) || 0;
  const names = deviceNames(sampleDevices);
  if (total === 0) return "no device is vulnerable right now";
  if (names.length === 0) return null;

  if (total === 1) return `on ${names[0]}`;
  const mostrados = names.slice(0, NOMBRES_EN_EL_DIALOGO);
  if (names.length >= total && mostrados.length >= total) {
    return `on all ${total} vulnerable devices: ${joinNames(mostrados.slice(0, total))}`;
  }
  // Quedan fuera nombres: se dice el total y se aclara que la lista es un
  // ejemplo, no el alcance del despliegue.
  return `on all ${total} vulnerable devices, including ${joinNames(mostrados)}`;
}

/**
 * Lo que se enseña en la celda de la tabla: `{ inline, full }`.
 *
 * `inline` es corto porque la columna lo es; `full` es la lista entera para el
 * tooltip. Con un solo equipo, el nombre ES el dato — enseñar «1» y esconder
 * cuál detrás de un hover era justo el problema.
 */
export function affectedDevicesCell(count, sampleDevices) {
  const total = Number(count) || 0;
  const names = deviceNames(sampleDevices);
  if (total === 0 || names.length === 0) return { inline: null, full: null };

  const restantes = total - names.length;
  const inline = names.length === 1 && total === 1 ? names[0] : `${names[0]}${total > 1 ? ` +${total - 1}` : ""}`;
  const full =
    restantes > 0
      ? `${joinNames(names)} and ${restantes} more`
      : joinNames(names);
  return { inline, full };
}
