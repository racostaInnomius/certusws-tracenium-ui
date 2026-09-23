// src/components/CryptoDiscovery/certEndpoints.js
//
// Ola 1.2 — cómo se LEE un extremo TLS (`certificate.endpoints[]` del
// detalle). Puro, sin React, por la misma razón que los otros dos: la
// semántica no puede improvisarla un componente.
//
// ── ⚠️ Las dos reglas que no se pueden romper ────────────────────────
//
// 1. `sni: null` NO es un dato que falte. Es lo que el servidor devuelve
//    cuando NO se le pide un nombre: el certificado por defecto de esa IP,
//    que suele ser justo el que nadie recuerda haber configurado. Pintarlo
//    como «desconocido» borraría el hallazgo; pintarlo como «sin datos»
//    invitaría a ir a buscar un dato que ya está.
//
//    Con una excepción que hay que separar: un extremo `listener` (el
//    propio equipo mirándose a sí mismo) nunca puede tener SNI — no hay
//    ClientHello. Ahí no es «sirve sin SNI», es «no aplica».
//
// 2. `sweepRange` no es decoración: es el rango que ENCONTRÓ ese extremo.
//    Que esté relleno significa que nadie dio de alta ese host y aun así
//    contestó TLS. Es el dato que convierte «tengo un certificado más» en
//    «tengo un servicio que no sabía que existía».

/** Los dos únicos `source` que el backend escribe (CHECK en la tabla). */
export const ENDPOINT_SOURCE = {
  listener: {
    label: "Local listener",
    hint: "The agent found this on the device itself, listening on that port. No network probe involved."
  },
  probe: {
    label: "Network probe",
    hint: "Reached over the network from a probing agent, not from the machine that serves it."
  }
};

export function endpointSourceLabel(source) {
  return ENDPOINT_SOURCE[source]?.label ?? source ?? "Unknown source";
}

/**
 * ⚠️ Qué se le pidió al servidor, y qué significa que no se le pidiera nada.
 *
 *   `named`          → se envió ese hostname en el ClientHello y esto es lo
 *                      que contestó.
 *   `default`        → NO se envió ninguno. Esto es lo que sirve la IP
 *                      desnuda. Un hecho medido, no un hueco.
 *   `not-applicable` → un listener local. No hay handshake que lleve SNI.
 *
 * Ninguno es un error, y por eso ninguno va en rojo.
 */
export function sniState(endpoint) {
  const e = endpoint || {};
  if (typeof e.sni === "string" && e.sni) {
    return {
      state: "named",
      label: e.sni,
      hint: "This hostname was sent in the handshake, and this is the certificate that came back for it."
    };
  }
  if (e.source === "listener") {
    return {
      state: "not-applicable",
      label: "n/a — local listener",
      hint: "A listener seen from the device itself has no ClientHello and therefore no SNI. Nothing is missing."
    };
  }
  return {
    state: "default",
    label: "no SNI — the bare IP",
    // Esta frase es el punto entero de distinguir los tres estados.
    hint: "No hostname was sent, and this is what the address answered with: the server's default certificate. That is a measured fact, not missing data — and it is usually the certificate nobody remembers configuring."
  };
}

/**
 * Cómo llegó a verse este extremo.
 *
 * `sweepRange` relleno = lo encontró un barrido, y se nombra el rango.
 * El backend hace COALESCE al reescribir, así que el rango sobrevive
 * aunque después alguien dé el host de alta como objetivo con nombre: sigue
 * siendo cierto que así fue como apareció.
 */
export function discoveryState(endpoint) {
  const e = endpoint || {};
  if (typeof e.sweepRange === "string" && e.sweepRange) {
    return {
      state: "sweep",
      label: `swept ${e.sweepRange}`,
      hint: `Found by sweeping ${e.sweepRange}. Nobody listed this host — it answered TLS on an address inside a configured range.`
    };
  }
  if (e.source === "listener") {
    return { state: "listener", label: "on the device", hint: "Seen on the device itself, not reached over the network." };
  }
  return {
    state: "named",
    label: "named target",
    hint: "Someone wrote this target down in the probe list. It was already on the map."
  };
}

/**
 * ⚠️ `kemHybrid` es de TRES estados y `null` es «no se determinó».
 *
 * Nunca «no». Un handshake que no se pudo leer no es un handshake clásico:
 * decirlo así apuntaría a migrar algo que quizá ya migró, o al revés.
 */
export function kemState(endpoint) {
  const v = endpoint?.kemHybrid;
  if (v === true) return { state: "hybrid", label: "hybrid ML-KEM", tone: "good", hint: "This handshake negotiated a post-quantum hybrid key exchange." };
  if (v === false) return { state: "classical", label: "classical KEX", tone: "warn", hint: "This handshake negotiated a classical key exchange only." };
  return {
    state: "unknown",
    label: "KEX not determined",
    tone: "neutral",
    hint: "The key exchange for this endpoint was not determined. Unknown — not «classical»."
  };
}

/** Un extremo del cable, normalizado. Un hueco se queda en `null`. */
export function readEndpoint(item) {
  const e = item && typeof item === "object" ? item : {};
  const str = (v) => (typeof v === "string" && v ? v : null);
  return {
    agentId: str(e.agentId),
    source: str(e.source),
    targetHost: str(e.targetHost),
    port: Number.isFinite(Number(e.port)) ? Number(e.port) : null,
    sni: str(e.sni),
    sweepRange: str(e.sweepRange),
    protocol: str(e.protocol),
    cipher: str(e.cipher),
    kexGroup: str(e.kexGroup),
    kemHybrid: typeof e.kemHybrid === "boolean" ? e.kemHybrid : null,
    lastSeen: e.lastSeen ?? null
  };
}

/**
 * Dónde se sirve, en el orden en que se lee: primero lo que apareció solo
 * (un barrido), luego lo que alguien dio de alta, y al final el propio
 * equipo. Lo inesperado arriba.
 */
export function readEndpoints(items) {
  const rank = { sweep: 0, named: 1, listener: 2 };
  return (Array.isArray(items) ? items : [])
    .map(readEndpoint)
    .map((e) => ({ ...e, sni: sniState(e), discovery: discoveryState(e), kem: kemState(e), rawSni: e.sni }))
    .sort(
      (a, b) =>
        rank[a.discovery.state] - rank[b.discovery.state] ||
        String(a.targetHost ?? "").localeCompare(String(b.targetHost ?? "")) ||
        (a.port ?? 0) - (b.port ?? 0)
    );
}

/** `targetHost:port`, o sólo el puerto si el extremo es local. */
export function endpointAddress(endpoint) {
  const port = endpoint?.port == null ? "?" : endpoint.port;
  return endpoint?.targetHost ? `${endpoint.targetHost}:${port}` : `tcp/${port}`;
}

/** Los recuentos de la cabecera de la sección. */
export function summarizeEndpoints(endpoints) {
  const list = Array.isArray(endpoints) ? endpoints : [];
  return {
    total: list.length,
    swept: list.filter((e) => e.discovery.state === "sweep").length,
    defaultSni: list.filter((e) => e.sni.state === "default").length
  };
}
