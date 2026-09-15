// src/utils/printerFleet.js
//
// Lo que la pestaña Printers deriva de GET /dashboard/printers/fleet: avisos de
// cobertura, rebanadas de las donas y el filtro de la tabla. Puro, para
// probarlo sin DOM.
//
// ⚠️ La regla que manda aquí es la de siempre en este producto: ausencia no es
// cero. Medido en T111 el 2026-09-15, la lectura de impresoras de MÁQUINA salía
// vacía en los 39 Windows —servidores de impresión incluidos— y la pestaña, sin
// estos avisos, habría enseñado "8 colas" como si fuera el parque entero.

import { BRAND } from "../theme/brand";
import { CHART_NEUTRAL, CHART_SERIES_WIDE } from "../theme/chartPalette";

// Color FIJO por marca: con colores por posición, HP cambiaba de color cada vez
// que dejaba de ser la marca más grande y la dona parecía otra gráfica. Venía de
// PrintersByVendorPie, que no usaba nadie y se borró al traerlo aquí; con Zebra.
const VENDOR_COLORS = {
  HP: "#2F8F8A",
  Brother: "#113634",
  Epson: "#3DC2AE",
  Canon: "#1C5950",
  Xerox: "#05B0FA",
  Lexmark: "#277C6F",
  "Konica Minolta": "#013146",
  Ricoh: "#329F8F",
  Kyocera: "#3DC2C2",
  Zebra: "#536B82",
  Samsung: "#02A9CF",
  Dell: "#1D5956",
  OKI: "#5DE0FD",
  Toshiba: "#0284A2",
  Sharp: "#60CDBD",
  Panasonic: "#44DBE9",
};

export function vendorColor(vendor) {
  if (vendor === "Unknown") return CHART_NEUTRAL.unknown;
  return VENDOR_COLORS[vendor] || CHART_NEUTRAL.other;
}

const MACHINE_FAILURES = {
  empty_output: "empty output",
  timeout: "timed out",
  unavailable: "unavailable",
};

const plural = (n, one, many) => (n === 1 ? one : many);
const listNames = (names) =>
  names.length <= 3 ? names.join(", ") : `${names.slice(0, 3).join(", ")} and ${names.length - 3} more`;

/**
 * Avisos que acompañan a la lista, en orden de gravedad.
 * Cada uno: { key, severity: "warning" | "info", title, body }.
 */
export function coverageNotices(fleet) {
  if (!fleet) return [];
  const notices = [];
  const coverage = fleet.coverage;

  if (!coverage) {
    notices.push({
      key: "coverage-unknown",
      severity: "info",
      title: "Read coverage is not available yet.",
      body:
        "The server has not recorded how each device's printers were read, so a device missing from the list below may be one that could not be read rather than one without printers.",
    });
  } else {
    const machine = coverage.machineScope || {};
    const failed = Object.keys(MACHINE_FAILURES).reduce((sum, k) => sum + Number(machine[k] || 0), 0);
    if (failed > 0) {
      const reasons = Object.entries(MACHINE_FAILURES)
        .filter(([k]) => Number(machine[k] || 0) > 0)
        .map(([k, label]) => `${label} ×${machine[k]}`)
        .join(" · ");
      notices.push({
        key: "machine-read-failed",
        severity: "warning",
        title: `Printers installed on the device could not be read on ${failed} of ${coverage.declared} ${plural(coverage.declared, "device", "devices")} (${reasons}).`,
        body:
          "For those devices only the network printers mapped by signed-in users are listed. Local printers, and the queues a print server publishes with their model, location and address, are missing. The read is fixed in the next agent release; the list fills in as devices update.",
      });
    }

    const noUser = Number(coverage.userScope?.no_user_hive || 0);
    if (noUser > 0) {
      notices.push({
        key: "no-user-signed-in",
        severity: "info",
        title: `${noUser} ${plural(noUser, "device", "devices")} had nobody signed in at the last read.`,
        body: "Network printers are mapped per user, so theirs appear once someone signs in.",
      });
    }
  }

  const servers = Array.isArray(fleet.printServers) ? fleet.printServers : [];
  const silent = servers.filter((s) => s.agent === "no_queues").map((s) => s.server);
  if (silent.length > 0) {
    notices.push({
      key: "server-no-queues",
      severity: "warning",
      title: `${listNames(silent)} ${plural(silent.length, "is", "are")} enrolled but did not list ${plural(silent.length, "its", "their")} print queues.`,
      body:
        "Model, location and address of a shared queue come from the print server itself. They show here once the server reports its queues.",
    });
  }
  const outside = servers.filter((s) => s.agent === "not_in_fleet").map((s) => s.server);
  if (outside.length > 0) {
    notices.push({
      key: "server-not-enrolled",
      severity: "info",
      title: `${outside.length} print ${plural(outside.length, "server is", "servers are")} not enrolled: ${listNames(outside)}.`,
      body:
        "Their queues are known only from the devices connected to them. Enrolling the server adds each queue's model, location and address.",
    });
  }
  return notices;
}

const LOCAL_KEY = "__local__";

/** Colas por servidor; las locales en una rebanada propia para que sumen el total. */
export function serverSlices(fleet, max = 5) {
  const servers = Array.isArray(fleet?.printServers) ? fleet.printServers : [];
  const top = servers.slice(0, max);
  const rest = servers.slice(max).reduce((sum, s) => sum + Number(s.queues || 0), 0);
  const local = Number(fleet?.byKind?.localNetwork || 0) + Number(fleet?.byKind?.localDirect || 0);
  return [
    ...top.map((s, i) => ({
      key: s.server,
      label: s.server,
      value: Number(s.queues || 0),
      color: CHART_SERIES_WIDE[i % CHART_SERIES_WIDE.length],
    })),
    ...(rest > 0 ? [{ key: "__other__", label: "Other servers", value: rest, color: CHART_NEUTRAL.other }] : []),
    ...(local > 0 ? [{ key: LOCAL_KEY, label: "Not shared", value: local, color: BRAND.dark }] : []),
  ];
}

export function vendorSlices(fleet) {
  return (Array.isArray(fleet?.byVendor) ? fleet.byVendor : []).map((v) => ({
    key: v.vendor,
    label: v.vendor,
    value: Number(v.queues || 0),
    color: vendorColor(v.vendor),
  }));
}

export function connectionSlices(fleet) {
  const k = fleet?.byKind || {};
  return [
    { key: "shared_queue", label: "Print server", value: Number(k.printServer || 0), color: BRAND.teal },
    { key: "local_network", label: "Network", value: Number(k.localNetwork || 0), color: BRAND.tealText },
    { key: "local_direct", label: "Direct", value: Number(k.localDirect || 0), color: BRAND.dark },
  ];
}

/** Filtro de la tabla desde una rebanada: { type: "server"|"vendor"|"connection", key, label }. */
export function filterPrinters(printers, filter) {
  const list = Array.isArray(printers) ? printers : [];
  if (!filter) return list;
  if (filter.type === "vendor") return list.filter((p) => p.vendor === filter.key);
  if (filter.type === "connection") {
    if (filter.key === "shared_queue") return list.filter((p) => p.kind === "shared_queue");
    if (filter.key === "local_network") return list.filter((p) => p.kind === "local" && p.isNetwork);
    if (filter.key === "local_direct") return list.filter((p) => p.kind === "local" && !p.isNetwork);
  }
  if (filter.type === "server") {
    if (filter.key === LOCAL_KEY) return list.filter((p) => p.kind === "local");
    if (filter.key === "__other__") return list; // no se filtra por "el resto"
    return list.filter((p) => p.server === filter.key);
  }
  return list;
}

export const SOURCE_LABELS = {
  print_server: "Print server",
  user_connection: "User connection",
  local_spooler: "Local",
  cups: "CUPS",
};
