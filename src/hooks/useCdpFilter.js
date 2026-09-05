// src/hooks/useCdpFilter.js
//
// Un solo modelo de filtro para Crypto Discovery, en la URL.
//
// ── Por qué en la URL y no en un estado de página ────────────────────
//
// Análisis de madurez 2026-09: `flag` e `issuer` solo se podían fijar
// desde el Dashboard, y el drill-down PISABA la búsqueda que el usuario
// había escrito. Además `certFilter` sobrevivía al desmontaje de la
// pestaña y se reaplicaba al volver aunque el usuario hubiera borrado
// los chips. Todo eso era consecuencia de tener dos estados —el de la
// página y el de la pestaña— para el mismo filtro.
//
// Con el filtro en la query string: (1) hay UNA fuente de verdad que
// leen y escriben todos los paneles, (2) un drill-down FUNDE en vez de
// reemplazar, (3) recargar o compartir el enlace conserva la vista, y
// (4) el `?page=cdp` del AppShell y el resto de parámetros se respetan
// porque `updateSearchParams` solo toca las claves que se le pasan.
//
// Claves cortas a propósito: son visibles en la barra del navegador.

import * as React from "react";
import { readSearchParams, updateSearchParams } from "../utils/browserState";

/** Clave URL ← nombre interno. `tab` es índice numérico. */
export const CDP_URL_KEYS = {
  tab: "cdpTab",
  search: "q",
  status: "status",
  flag: "flag",
  issuer: "issuer",
  hasPrivateKey: "pk",
  hasFlags: "flagged",
  eku: "eku",
  includeRoots: "roots",
  // Fase 1: los filtros de navegación. Son los que hacen que un segmento
  // de la distribución, una fila de almacenes o un año de la línea de
  // tiempo lleven a SU lista.
  keyAlgorithm: "algo",
  keySizeBits: "bits",
  family: "family",
  source: "source",
  // Ámbito del almacén (machine / user / system-roots / network). La
  // faceta «Scope» lo escribía desde el primer día, pero la clave no
  // estaba aquí: el clic se perdía en silencio (revisión UI 2026-09-05).
  scope: "scope",
  storeName: "store",
  agentId: "device",
  notAfterFrom: "from",
  notAfterTo: "to",
  // Fase 1, pieza D: agrupación de la lista de inventario. Ausente =
  // por certificado; `devices` = por equipo.
  view: "view"
};

const BOOL_KEYS = new Set(["hasPrivateKey", "hasFlags", "includeRoots"]);

export function readCdpFilter() {
  const p = readSearchParams();
  const out = {};
  for (const [name, key] of Object.entries(CDP_URL_KEYS)) {
    const raw = p.get(key);
    if (raw == null || raw === "") continue;
    if (name === "tab") {
      const n = Number(raw);
      if (Number.isInteger(n) && n >= 0) out.tab = n;
    } else if (BOOL_KEYS.has(name)) {
      if (raw === "1" || raw === "true") out[name] = true;
    } else {
      out[name] = raw;
    }
  }
  return out;
}

function writeCdpFilter(filter) {
  const updates = {};
  for (const [name, key] of Object.entries(CDP_URL_KEYS)) {
    const v = filter[name];
    if (v == null || v === "" || v === false) updates[key] = "";
    else if (BOOL_KEYS.has(name)) updates[key] = "1";
    else updates[key] = String(v);
  }
  updateSearchParams(updates);
}

/**
 * Devuelve `[filter, patch, replace]`.
 *
 * `patch` FUNDE: `patch({ flag: "weak_sig" })` conserva la búsqueda.
 * `replace` sustituye todo salvo la pestaña. Un valor `null`/`""`/`false`
 * en `patch` borra esa clave.
 *
 * Los cambios se aplican con `history.replaceState` —no se apilan en el
 * historial: retroceder debe salir de la página, no deshacer un chip—
 * y se propagan a todos los suscriptores del mismo documento por un
 * evento propio, porque `replaceState` no dispara `popstate`.
 */
const EVENT = "cdp-filter-change";

export default function useCdpFilter() {
  const [filter, setFilter] = React.useState(readCdpFilter);

  React.useEffect(() => {
    const sync = () => setFilter(readCdpFilter());
    window.addEventListener(EVENT, sync);
    window.addEventListener("popstate", sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener("popstate", sync);
    };
  }, []);

  const commit = React.useCallback((next) => {
    writeCdpFilter(next);
    window.dispatchEvent(new Event(EVENT));
  }, []);

  const patch = React.useCallback(
    (delta) => commit({ ...readCdpFilter(), ...delta }),
    [commit]
  );

  const replace = React.useCallback(
    (next) => commit({ tab: readCdpFilter().tab, ...next }),
    [commit]
  );

  return [filter, patch, replace];
}
