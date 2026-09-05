import { describe, it, expect } from "vitest";
import { describeLastBoot, STALE_BOOT_DAYS } from "../lastBoot";

const AHORA = Date.parse("2026-09-05T12:00:00.000Z");

describe("describeLastBoot", () => {
  it("responde la pregunta que trae a alguien a esta columna", () => {
    // "¿Cuánto lleva sin reiniciarse?", no "¿qué día fue?".
    const d = describeLastBoot("2026-08-31T12:00:00.000Z", AHORA);
    expect(d.label).toBe("5 days ago");
    expect(d.known).toBe(true);
  });

  it("singular y hoy", () => {
    expect(describeLastBoot("2026-09-04T12:00:00.000Z", AHORA).label).toBe("1 day ago");
    expect(describeLastBoot("2026-09-05T09:00:00.000Z", AHORA).label).toBe("today");
  });

  it("un adelanto de reloj se lee como hoy, no como días negativos", () => {
    expect(describeLastBoot("2026-09-05T12:03:00.000Z", AHORA).label).toBe("today");
  });

  it("marca los que llevan demasiado", () => {
    const d = describeLastBoot("2026-07-01T12:00:00.000Z", AHORA);
    expect(d.days).toBeGreaterThanOrEqual(STALE_BOOT_DAYS);
    expect(d.stale).toBe(true);
  });

  it("⚠️ sin dato NO es un equipo abandonado", () => {
    // Durante todo el despliegue la mayoría de la flota llega con null porque
    // su agente aún no manda el campo. Teñir eso de alarma haría que la
    // columna dijera lo contrario de la verdad.
    for (const raw of [null, undefined, "", "   ", "no soy una fecha", 12345]) {
      const d = describeLastBoot(raw, AHORA);
      expect(d.known).toBe(false);
      expect(d.stale).toBe(false);
      expect(d.label).toBe("—");
    }
  });

  it("la fecha exacta no se pierde: va al tooltip", () => {
    const d = describeLastBoot("2026-08-31T12:00:00.000Z", AHORA);
    expect(d.title).toContain("2026");
  });
});
