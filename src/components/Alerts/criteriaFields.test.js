// src/components/Alerts/criteriaFields.test.js
//
// Los criterios editables de una regla. El caso que lo motiva: la plantilla
// sembró `max_hours_offline` y el handler leía `threshold_hours`, así que el
// valor configurado se ignoraba. Al leer se aceptan las dos; al escribir, una.

import { describe, it, expect } from "vitest";
import {
  criteriaFieldsFor,
  isCriteriaEditable,
  readCriteria,
  validateCriteria,
  buildCriteriaPayload,
  describeCriteria,
} from "./criteriaFields";

describe("readCriteria", () => {
  it("⭐ lee la clave heredada y la canónica", () => {
    expect(readCriteria("device_offline", { max_hours_offline: 6 }).threshold_hours).toBe(6);
    expect(readCriteria("device_offline", { threshold_hours: 8 }).threshold_hours).toBe(8);
    // Con las dos manda la canónica, como el backend.
    expect(readCriteria("device_offline", { threshold_hours: 8, max_hours_offline: 24 }).threshold_hours).toBe(8);
  });

  it("⚠️ la ausencia es el valor por defecto, no `false`", () => {
    // Enseñar «apagado» algo que el backend trata como encendido sería mentir.
    expect(readCriteria("device_offline", {}).include_disconnected).toBe(true);
    expect(readCriteria("device_offline", { include_disconnected: false }).include_disconnected).toBe(false);
  });

  it("un criterio con basura cae al valor por defecto", () => {
    expect(readCriteria("device_offline", { threshold_hours: "muchas" }).threshold_hours).toBe(24);
  });
});

describe("validateCriteria", () => {
  it("exige horas enteras dentro del rango", () => {
    expect(validateCriteria("device_offline", { threshold_hours: 24 }).ok).toBe(true);
    expect(validateCriteria("device_offline", { threshold_hours: 0 }).errors.threshold_hours).toMatch(/At least 1/);
    expect(validateCriteria("device_offline", { threshold_hours: 1.5 }).errors.threshold_hours).toMatch(/Whole hours/);
    expect(validateCriteria("device_offline", { threshold_hours: 9000 }).errors.threshold_hours).toMatch(/At most/);
    expect(validateCriteria("device_offline", { threshold_hours: "" }).ok).toBe(false);
  });
});

describe("buildCriteriaPayload", () => {
  it("⭐ escribe la canónica y retira la heredada", () => {
    expect(buildCriteriaPayload("device_offline", { threshold_hours: 6, include_disconnected: true }, { max_hours_offline: 24 })).toEqual({
      threshold_hours: 6,
      include_disconnected: true,
    });
  });

  it("⚠️ conserva lo que este editor no enseña", () => {
    // Una regla puede llevar claves puestas por API; guardar no las borra.
    const out = buildCriteriaPayload("device_offline", { threshold_hours: 12, include_disconnected: false }, { algo_futuro: "x" });
    expect(out).toEqual({ algo_futuro: "x", threshold_hours: 12, include_disconnected: false });
  });
});

describe("qué es editable", () => {
  it("device_offline lo es; una fuente sin campos declarados no", () => {
    expect(isCriteriaEditable("device_offline")).toBe(true);
    expect(criteriaFieldsFor("cdp_weak_crypto")).toEqual([]);
    expect(isCriteriaEditable("cdp_weak_crypto")).toBe(false);
    expect(describeCriteria("cdp_weak_crypto", {})).toBe("");
  });

  it("la tarjeta resume el criterio sin abrir el editor", () => {
    expect(describeCriteria("device_offline", { max_hours_offline: 6 })).toBe(
      "After 6h of silence · powered-off devices included"
    );
    expect(describeCriteria("device_offline", { include_disconnected: false })).toMatch(/only sessions still marked connected/);
  });
});
