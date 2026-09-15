// src/components/patch-management/deviceCardFilter.test.js

import { describe, it, expect } from "vitest";
import {
  applyDeviceCardFilter,
  toggleCardFilter,
  hasCriticalCounts,
  DEVICE_CARD_FILTERS,
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
