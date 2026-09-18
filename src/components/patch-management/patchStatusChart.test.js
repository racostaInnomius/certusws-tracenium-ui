// src/components/patch-management/patchStatusChart.test.js

import { describe, it, expect } from "vitest";
import { patchStatusChartData } from "./patchStatusChart";

describe("patchStatusChartData", () => {
  it("⭐ cuenta la misma columna Status que la tabla, y ordena por gravedad de lectura", () => {
    const d = patchStatusChartData({ healthy: 30, updates_available: 18, reboot_required: 4, error: 3 });
    expect(d.reporting).toBe(55);
    expect(d.patched).toBe(30);
    expect(d.patchedPct).toBe(54);
    expect(d.segments.map((s) => s.key)).toEqual(["healthy", "updates_available", "reboot_required", "error"]);
  });

  it("🔴 «parcheado» es SÓLO healthy: un escaneo fallido llega con 0 pendientes y parecería limpio", () => {
    const d = patchStatusChartData({ error: 4, inventory_only: 2, idle: 1, scan_pending: 1, healthy: 0 });
    expect(d.patched).toBe(0);
    expect(d.patchedPct).toBe(0);
    expect(d.notKnown).toBe(8);
  });

  it("un reinicio pendiente no cuenta como parcheado, y se ve aparte", () => {
    const d = patchStatusChartData({ healthy: 1, reboot_required: 1 });
    expect(d.patchedPct).toBe(50);
    expect(d.notKnown).toBe(0);
  });

  it("no pinta bandas en cero: una leyenda de ceros es ruido", () => {
    const d = patchStatusChartData({ healthy: 2, updates_available: 0, error: 0 });
    expect(d.segments.map((s) => s.key)).toEqual(["healthy"]);
  });

  it("⚠️ 99,6% no se redondea a 100%", () => {
    const d = patchStatusChartData({ healthy: 249, updates_available: 1 });
    expect(d.patchedPct).toBe(99);
  });

  it("sin nadie reportando no hay chart que pintar", () => {
    expect(patchStatusChartData({})).toMatchObject({ segments: [], reporting: 0, patchedPct: 0 });
    expect(patchStatusChartData(null)).toMatchObject({ segments: [], reporting: 0 });
    expect(patchStatusChartData(undefined).segments).toEqual([]);
  });
});
