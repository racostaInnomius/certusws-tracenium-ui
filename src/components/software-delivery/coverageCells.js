// src/components/software-delivery/coverageCells.js
//
// Qué se puede HACER con los equipos de una celda de la cobertura.
//
// ⚠️ ESTO ES DONDE SE DECIDE SI SE OFRECE UN BOTÓN QUE ROMPE COSAS, y por eso
// vive aparte y con pruebas. Los cinco estados de una fila NO llevan a la misma
// acción, aunque los cinco tengan una lista de equipos detrás:
//
//   · behind   → desplegar es actualizar. Es el caso que pidió el operador.
//   · missing  → desplegar es instalar. También accionable.
//   · unknown  → la versión instalada no se puede comparar («1.0», vacía). No
//                sabemos si hace falta, pero desplegar NORMALIZA, así que se
//                ofrece diciendo lo que no se sabe.
//   · current  → ya están en la versión publicada. Un despliegue aquí es un
//                no-op que gasta ancho de banda y llena el historial de
//                `already_installed`.
//   · ahead    → 🔴 LA FLOTA VA POR DELANTE DEL CATÁLOGO, que es lo NORMAL en
//                Chrome y Edge porque se auto-actualizan. Mandarles el paquete
//                publicado sería un DOWNGRADE de los navegadores de la casa,
//                hecho desde un botón que parecía de mantenimiento. No se
//                ofrece, y se dice por qué.

/** Cómo se lee cada celda y si se puede desplegar sobre ella. */
export const CELL_COPY = {
  behind: {
    label: "Behind the published version",
    deployable: true,
    action: "Update",
    help: "These devices have an older version than the one you published.",
  },
  missing: {
    label: "Not installed",
    deployable: true,
    action: "Install",
    help: "These devices could run this title and do not have it.",
  },
  unknown: {
    label: "Version not comparable",
    deployable: true,
    action: "Install",
    help: "The inventory reported a version this view cannot compare, so whether they need it is unknown. Deploying sets them to the published version.",
  },
  current: {
    label: "On the catalog version",
    deployable: false,
    help: "These devices already run the published version. Deploying again would install nothing.",
  },
  ahead: {
    label: "Ahead of the catalog",
    deployable: false,
    // El motivo NO es «no hace falta»: es que haría daño.
    help: "These devices run a newer version than the one you published — normal for browsers that update themselves. Deploying the catalog version would downgrade them.",
  },
};

export function cellCopy(state) {
  return CELL_COPY[state] ?? { label: String(state || "—"), deployable: false, help: "" };
}

// ── Lo que ya se hizo con este título en este equipo ──────────────────────
//
// 🔴 EL FALLO DE CAMPO QUE ESTO CIERRA (T111, 24-sep). El despliegue #52 mandó
// Edge 153.0.4234.48 a 8 equipos; 2 se quedaron en `pending` —ni lo habían
// recogido— y 20 horas después la cobertura los seguía enseñando «por detrás»
// con un botón que mandaba EL MISMO paquete otra vez. El segundo job se encola
// detrás del primero: al despertar, el equipo ejecuta el instalador dos veces.
//
// Y el bucle se cierra solo: el job no avanza ⇒ el equipo no reporta ⇒ el
// inventario no cambia ⇒ mañana vuelve a salir «por detrás». El operador puede
// repetirlo indefinidamente, y la pantalla no da ninguna pista para salir.
//
// ⚠️ NADA DE ESTO BLOQUEA EL ENVÍO. A veces se reenvía justo PORQUE el job se
// atascó. Lo que cambia es el camino por defecto: los dudosos salen de la
// selección, se dicen con su motivo, y reenviarlos es un botón aparte.

/** Desenlaces en los que el instalador llegó a dejar el equipo al día. */
const LANDED = new Set(["success", "already_installed", "reboot_required"]);

/** A partir de aquí, la lectura del inventario ya no es «de ahora mismo». */
export const STALE_AFTER_HOURS = 24;

const ms = (value) => {
  const t = value ? new Date(value).getTime() : NaN;
  return Number.isFinite(t) ? t : null;
};

/** Horas desde que el equipo reportó inventario, o null si no se sabe. */
export function inventoryAgeHours(device, now = Date.now()) {
  const seen = ms(device?.inventoryLastSeen);
  if (seen == null) return null;
  return Math.max(0, (now - seen) / 3600000);
}

/**
 * Qué hacer con este equipo, y por qué.
 *
 * ⚠️ «unconfirmed» NO es una corazonada: es una comparación de fechas. Si el
 * último install TERMINÓ DESPUÉS de la última lectura del inventario, esa
 * lectura no puede reflejarlo — el equipo probablemente ya tiene la versión y
 * lo que está viejo es el dato, no la máquina. Reenviar ahí sólo produce un
 * `already_installed`.
 */
export function deliveryStatus(device) {
  if (device?.openDeployment) {
    return { kind: "on_the_way", deployment: device.openDeployment };
  }
  const last = device?.lastInstall;
  const finished = ms(last?.finishedAt);
  const seen = ms(device?.inventoryLastSeen);
  // Con cualquiera de las dos fechas ausente no se concluye nada: se deja
  // accionable, que es el estado que el operador ya esperaba.
  if (last && LANDED.has(String(last.outcome)) && finished != null && seen != null && finished > seen) {
    return { kind: "unconfirmed", deployment: last };
  }
  return { kind: "actionable" };
}

/** Los tres grupos de una celda, en el orden en que se enseñan. */
export function splitCell(devices) {
  const rows = Array.isArray(devices) ? devices : [];
  const out = { actionable: [], onTheWay: [], unconfirmed: [] };
  for (const d of rows) {
    const status = deliveryStatus(d);
    if (status.kind === "on_the_way") out.onTheWay.push(d);
    else if (status.kind === "unconfirmed") out.unconfirmed.push(d);
    else out.actionable.push(d);
  }
  return out;
}

/**
 * Los equipos de la celda, agrupados por el paquete que se les mandaría.
 *
 * ⚠️ UN DESPLIEGUE ES DE UN PAQUETE. Una celda puede mezclar plataformas —los
 * Windows y los Mac que van por detrás están en la misma barra— y mandarlos
 * juntos no existe como operación. Se agrupan, y cada grupo es su propio envío,
 * igual que hace el flujo de desinstalar con sus objetivos.
 */
export function deployGroups(devices) {
  const rows = Array.isArray(devices) ? devices : [];
  const byPackage = new Map();
  for (const d of rows) {
    if (d?.packageId == null) continue;
    const key = Number(d.packageId);
    const group = byPackage.get(key) ?? {
      packageId: key,
      catalogVersion: d.catalogVersion ?? "",
      platform: d.platform ?? "",
      devices: [],
    };
    group.devices.push(d);
    byPackage.set(key, group);
  }
  // De más equipos a menos: el envío grande es el que el operador viene a hacer.
  return [...byPackage.values()].sort(
    (a, b) => b.devices.length - a.devices.length || a.packageId - b.packageId
  );
}

/** deviceId → hostname, para que la revisión del wizard no enseñe UUIDs. */
export function hostnamesOf(devices) {
  const map = {};
  for (const d of Array.isArray(devices) ? devices : []) {
    if (d?.agentId && d.hostname) map[String(d.agentId)] = String(d.hostname);
  }
  return map;
}
