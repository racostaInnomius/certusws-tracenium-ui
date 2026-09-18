// src/components/patch-management/deviceCardFilter.test.js

import { describe, it, expect } from "vitest";
import {
  applyDeviceCardFilter,
  toggleCardFilter,
  hasCriticalCounts,
  DEVICE_CARD_FILTERS,
  cardFilterForStatus,
  statusOfCardFilter,
  deviceFilterLabel,
} from "./deviceCardFilter";

const DEVICES = [
  { agentId: "a", overallStatus: "healthy", missingCount: 0, criticalCount: 0 },
  { agentId: "b", overallStatus: "updates_available", missingCount: 3, criticalCount: 1 },
  { agentId: "c", overallStatus: "reboot_required", missingCount: 1, criticalCount: 0 },
  { agentId: "d", overallStatus: "updates_available", missingCount: 2, criticalCount: 2 },
];
const ids = (list) => list.map((d) => d.agentId);

describe("applyDeviceCardFilter", () => {
  it("sin filtro devuelve la flota entera", () => {
    expect(ids(applyDeviceCardFilter(DEVICES, null))).toEqual(["a", "b", "c", "d"]);
  });

  it("missing: equipos con AL MENOS un parche pendiente", () => {
    expect(ids(applyDeviceCardFilter(DEVICES, "missing"))).toEqual(["b", "c", "d"]);
  });

  it("critical: equipos con al menos un crítico/importante", () => {
    expect(ids(applyDeviceCardFilter(DEVICES, "critical"))).toEqual(["b", "d"]);
  });

  it("reboot y healthy filtran por overall_status, el mismo campo que cuenta la tarjeta", () => {
    expect(ids(applyDeviceCardFilter(DEVICES, "reboot"))).toEqual(["c"]);
    expect(ids(applyDeviceCardFilter(DEVICES, "healthy"))).toEqual(["a"]);
  });

  it("un filtro desconocido no vacía la tabla", () => {
    expect(applyDeviceCardFilter(DEVICES, "inventado")).toHaveLength(4);
  });
});

describe("toggleCardFilter", () => {
  it("pulsar la activa la apaga; otra la sustituye", () => {
    expect(toggleCardFilter(null, "missing")).toBe("missing");
    expect(toggleCardFilter("missing", "missing")).toBeNull();
    expect(toggleCardFilter("missing", "healthy")).toBe("healthy");
  });
});

describe("⚠️ tarjetas que cuentan parches, filtros que enseñan equipos", () => {
  it("el rótulo del filtro dice «Devices with…», no repite el título de la tarjeta", () => {
    // «Total missing: 31» sobre 18 filas sin explicación se leería como un error.
    expect(DEVICE_CARD_FILTERS.missing.label).toMatch(/^Devices with/);
    expect(DEVICE_CARD_FILTERS.critical.label).toMatch(/^Devices with/);
  });

  it("contra un backend sin criticalCount, esa tarjeta no debe filtrar", () => {
    expect(hasCriticalCounts([{ agentId: "x", missingCount: 2 }])).toBe(false);
    expect(hasCriticalCounts(DEVICES)).toBe(true);
    expect(hasCriticalCounts([])).toBe(false);
  });
});

// ── El donut de estado del SO filtra la tabla con el MISMO filtro ──────────
//
// Una sola dimensión a propósito: si el chart tuviera su propio filtro, la
// tabla podría estar filtrada por dos cosas y el chip contradecir al otro.
describe("filtro por estado (donut de OS patch status)", () => {
  const devices = [
    { hostname: "a", overallStatus: "healthy", missingCount: 0 },
    { hostname: "b", overallStatus: "updates_available", missingCount: 3 },
    { hostname: "c", overallStatus: "error", missingCount: 0 },
    { hostname: "d", overallStatus: "reboot_required", missingCount: 0 },
  ];

  it("⭐ las bandas que YA tienen tarjeta reutilizan su tecla, para que quede marcada", () => {
    expect(cardFilterForStatus("healthy")).toBe("healthy");
    expect(cardFilterForStatus("reboot_required")).toBe("reboot");
    expect(cardFilterForStatus("error")).toBe("status:error");
    expect(cardFilterForStatus("")).toBeNull();
  });

  it("filtra por el estado exacto de la columna Status", () => {
    expect(applyDeviceCardFilter(devices, "status:error").map((d) => d.hostname)).toEqual(["c"]);
    expect(applyDeviceCardFilter(devices, "status:updates_available").map((d) => d.hostname)).toEqual(["b"]);
    // Y las teclas compartidas siguen filtrando como siempre.
    expect(applyDeviceCardFilter(devices, "healthy").map((d) => d.hostname)).toEqual(["a"]);
    expect(applyDeviceCardFilter(devices, "reboot").map((d) => d.hostname)).toEqual(["d"]);
  });

  it("ida y vuelta: de tecla a estado", () => {
    expect(statusOfCardFilter("status:error")).toBe("error");
    expect(statusOfCardFilter("healthy")).toBe("healthy");
    expect(statusOfCardFilter("reboot")).toBe("reboot_required");
    expect(statusOfCardFilter("missing")).toBeNull();
    expect(statusOfCardFilter(null)).toBeNull();
  });

  it("⚠️ el chip dice el estado con la palabra de la tabla, no la clave interna", () => {
    const label = (s) => ({ error: "Scan failed", updates_available: "Updates avail." })[s] || s;
    expect(deviceFilterLabel("status:error", label)).toBe("Status: Scan failed");
    expect(deviceFilterLabel("status:updates_available", label)).toBe("Status: Updates avail.");
    // Una tecla de tarjeta conserva su propio rótulo.
    expect(deviceFilterLabel("reboot", label)).toBe("Reboot pending");
    expect(deviceFilterLabel(null)).toBe("");
  });

  it("un estado desconocido no vacía la tabla en silencio: filtra por él y ya", () => {
    expect(applyDeviceCardFilter(devices, "status:nuevo_estado")).toEqual([]);
  });
});
