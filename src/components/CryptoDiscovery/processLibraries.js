// src/components/CryptoDiscovery/processLibraries.js
//
// Ola 1.5 — cómo se LEE «qué librería criptográfica carga cada servicio».
// Puro, sin React, por la misma razón que `sshUserKeys.js`: la semántica
// que sigue no puede improvisarla un componente.
//
// ── Por qué esto existe ──────────────────────────────────────────────
//
// Hasta ahora la agilidad se medía por PAQUETES. Con eso, «qué actualizo
// para desbloquear la migración» se contesta con una lista de paquetes, y
// nadie reinicia «openssl»: se reinicia nginx. Peor, un paquete instalado
// no dice cuál de los 40 procesos de la máquina lo tiene cargado, así que
// el número ni siquiera acota el trabajo. Aquí el hecho es el que falta:
// qué binario tiene cargada qué librería, y en qué versión.
//
// ── ⚠️ La regla que no se puede romper ───────────────────────────────
//
// `versionSource` dice de dónde salió la versión, y `soname` NO es leerla.
// `libssl.so.3` es la misma soname para un OpenSSL 3.0.2 y para un 3.6.2,
// y el umbral de ML-KEM (3.5) está justo en medio. Una versión deducida de
// la soname puede estar a un lado o al otro, así que enseñarla igual que
// una leída del fichero convierte una conjetura en un dato — y alguien
// cerraría o abriría un ticket de migración con ella.

/** Las librerías que el backend acepta (`LIBRARIES` en su servicio). */
export const KNOWN_LIBRARIES = ["openssl", "libressl", "gnutls", "nss", "gcrypt", "schannel", "security-framework"];

/**
 * ⚠️ De dónde salió el número de versión, y cuánto se puede afirmar con él.
 *
 * `confirmed: false` NO es «está mal»: es «no se leyó del artefacto». La
 * distinción tiene que sobrevivir hasta el pixel, porque el umbral de
 * ML-KEM cae dentro del margen de error de la soname.
 */
export const VERSION_SOURCE = {
  file: {
    label: "read from the file",
    confirmed: true,
    hint: "The version string was read out of the library binary itself."
  },
  module: {
    label: "read from the module",
    confirmed: true,
    hint: "The loaded module reported its own version."
  },
  path: {
    label: "taken from the path",
    confirmed: false,
    hint: "Inferred from the directory the library sits in, not read from it. Packaging can put an upgraded library under an old path."
  },
  soname: {
    label: "inferred from the soname",
    confirmed: false,
    hint: "NOT read from the library — deduced from its file name. libssl.so.3 is the same soname for OpenSSL 3.0.2 and for 3.6.2, and the ML-KEM threshold (3.5) sits between them, so this number cannot decide whether this service can migrate."
  }
};

/**
 * El veredicto sobre una versión concreta.
 *
 * Tres estados distintos y ninguno se confunde con otro:
 *   `read`      → se leyó. Se puede razonar con ella.
 *   `inferred`  → se dedujo (soname, ruta). ⚠️ Puede estar al otro lado
 *                 del umbral.
 *   `unknown`   → no hay versión, o no se dice de dónde salió. No se
 *                 inventa una procedencia por defecto.
 */
export function versionConfidence(version, versionSource) {
  if (typeof version !== "string" || !version) {
    return {
      state: "unknown",
      confirmed: false,
      label: "version unknown",
      hint: "No version came back for this library. Nothing is claimed about whether it can negotiate ML-KEM."
    };
  }
  const meta = VERSION_SOURCE[versionSource];
  if (!meta) {
    return {
      state: "unknown",
      confirmed: false,
      label: "provenance unknown",
      // Sin `versionSource` no se puede saber si la versión se leyó o se
      // dedujo. Tratarla como leída sería elegir la respuesta cómoda.
      hint: "The collector did not say where this version came from, so it cannot be told apart from an inferred one. Treat it as unconfirmed."
    };
  }
  return { state: meta.confirmed ? "read" : "inferred", confirmed: meta.confirmed, label: meta.label, hint: meta.hint };
}

/** ¿Hay que avisar de que esta versión no se leyó? */
export function isVersionInferred(row) {
  return versionConfidence(row?.version, row?.versionSource).confirmed !== true;
}

/** Una fila del endpoint, normalizada. Un hueco se queda en `null`. */
export function readProcessLibrary(item) {
  const r = item && typeof item === "object" ? item : {};
  const str = (v) => (typeof v === "string" && v ? v : null);
  return {
    agentId: str(r.agentId),
    host: str(r.host),
    process: str(r.process),
    imagePath: str(r.imagePath),
    service: str(r.service),
    library: str(r.library),
    libraryPath: str(r.libraryPath),
    version: str(r.version),
    versionSource: str(r.versionSource),
    ports: Array.isArray(r.ports) ? r.ports.filter((p) => Number.isInteger(p)) : []
  };
}

/**
 * Cómo se nombra a quien carga la librería, y con qué certeza.
 *
 * El servicio es lo accionable (se reinicia `nginx.service`); el proceso y
 * la imagen son lo que hay cuando no existe un servicio. Cuál de los tres
 * se está enseñando se dice, porque «nginx» y «nginx.service» no son la
 * misma cosa a la hora de reiniciar.
 */
export function holderOf(row) {
  if (row?.service) return { name: row.service, kind: "service" };
  if (row?.process) return { name: row.process, kind: "process" };
  if (row?.imagePath) return { name: row.imagePath, kind: "image" };
  return { name: "unknown", kind: "unknown" };
}

export const HOLDER_HINT = {
  service: "A managed service: this is the unit you restart after upgrading the library.",
  process: "A running process with no service behind it. Restarting it is whatever restarts that binary.",
  image: "Only the executable path came back — no service and no process name.",
  unknown: "The collector did not name what loads this library."
};

/**
 * Agrupa por equipo → servicio → librería, que es el orden en que se
 * decide: a qué máquina voy, qué reinicio, y qué le actualizo.
 *
 * Una fila sin `agentId` NO se mete en un cubo «unknown» junto a las
 * demás: se descarta y se cuenta aparte, porque agregarlas fabricaría un
 * equipo que no existe.
 */
export function groupProcessLibraries(items) {
  const rows = (Array.isArray(items) ? items : []).map(readProcessLibrary);
  const dropped = rows.filter((r) => !r.agentId || !r.library).length;

  const devices = new Map();
  for (const r of rows) {
    if (!r.agentId || !r.library) continue;
    if (!devices.has(r.agentId)) {
      devices.set(r.agentId, { agentId: r.agentId, host: r.host, label: r.host || r.agentId, holders: new Map() });
    }
    const dev = devices.get(r.agentId);
    // Sin host en una fila y con host en otra del mismo equipo, nos
    // quedamos con el que exista: el LEFT JOIN del backend lo deja en null
    // cuando el agente ya no está en la tabla `agent`.
    if (!dev.host && r.host) {
      dev.host = r.host;
      dev.label = r.host;
    }
    const holder = holderOf(r);
    // Clave por la imagen cuando la hay: dos procesos del mismo binario son
    // el mismo servicio, y el nombre puede repetirse entre binarios.
    const key = `${holder.kind}:${holder.name}:${r.imagePath ?? ""}`;
    if (!dev.holders.has(key)) {
      dev.holders.set(key, { key, name: holder.name, kind: holder.kind, imagePath: r.imagePath, ports: [], libraries: [] });
    }
    const h = dev.holders.get(key);
    for (const p of r.ports) if (!h.ports.includes(p)) h.ports.push(p);
    h.libraries.push({
      library: r.library,
      libraryPath: r.libraryPath,
      version: r.version,
      versionSource: r.versionSource,
      confidence: versionConfidence(r.version, r.versionSource)
    });
  }

  const out = [...devices.values()].map((d) => ({
    agentId: d.agentId,
    host: d.host,
    label: d.label,
    holders: [...d.holders.values()]
      .map((h) => ({
        ...h,
        ports: [...h.ports].sort((a, b) => a - b),
        libraries: [...h.libraries].sort((a, b) => a.library.localeCompare(b.library) || String(a.libraryPath).localeCompare(String(b.libraryPath))),
        inferred: h.libraries.some((l) => l.confidence.confirmed !== true)
      }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }));
  out.sort((a, b) => a.label.localeCompare(b.label));
  return { devices: out, dropped };
}

/** Los recuentos de la cabecera. Se cuentan filas reales, no estimaciones. */
export function summarizeProcessLibraries(grouped) {
  const devices = Array.isArray(grouped?.devices) ? grouped.devices : [];
  let services = 0;
  let loads = 0;
  let inferredLoads = 0;
  const libraries = new Set();
  for (const d of devices) {
    for (const h of d.holders) {
      services += 1;
      for (const l of h.libraries) {
        loads += 1;
        libraries.add(l.library);
        if (l.confidence.confirmed !== true) inferredLoads += 1;
      }
    }
  }
  return { devices: devices.length, services, loads, inferredLoads, libraries: [...libraries].sort() };
}

/** Filtro de la vista: por librería, por equipo y por texto libre. */
export function filterProcessLibraryDevices(devices, filter = {}) {
  const { library, onlyInferred, search } = filter;
  const q = String(search ?? "").trim().toLowerCase();
  return (Array.isArray(devices) ? devices : [])
    .map((d) => {
      const holders = d.holders.filter((h) => {
        const libs = library ? h.libraries.filter((l) => l.library === library) : h.libraries;
        if (libs.length === 0) return false;
        if (onlyInferred === true && !libs.some((l) => l.confidence.confirmed !== true)) return false;
        if (q) {
          const hay = [d.label, d.host, h.name, h.imagePath, ...libs.map((l) => `${l.library} ${l.version ?? ""} ${l.libraryPath ?? ""}`)]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      });
      // Al filtrar por librería, las cargas que no son de esa librería se
      // ocultan también DENTRO del servicio: dejarlas haría que el filtro
      // pareciese no aplicarse.
      return {
        ...d,
        holders: holders.map((h) => (library ? { ...h, libraries: h.libraries.filter((l) => l.library === library) } : h))
      };
    })
    .filter((d) => d.holders.length > 0);
}

/** `[443, 8443]` → `tcp/443, tcp/8443`; sin puertos, null (no «ninguno»). */
export function formatPorts(ports) {
  if (!Array.isArray(ports) || ports.length === 0) return null;
  return ports.map((p) => `tcp/${p}`).join(", ");
}
