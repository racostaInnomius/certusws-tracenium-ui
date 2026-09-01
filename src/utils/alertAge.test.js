import { describe, it, expect } from "vitest";
import { formatOpenFor, STALE_AFTER_DAYS } from "./alertAge";

// La hora se inyecta en todas las pruebas: un test de duraciones que
// dependa del reloj real falla solo, tarde y en el CI de otro.
const NOW = Date.parse("2026-09-01T12:00:00.000Z");
const hace = (ms) => new Date(NOW - ms).toISOString();
const H = 3600_000;
const D = 24 * H;

describe("ausencia de edad", () => {
  it("sin firstSeenAt devuelve null, no cero", () => {
    // Es la diferencia entre "el tick aún no la ha visto" y "lleva 0
    // minutos abierta". Pintar "0m" en la primera sería inventarse un
    // dato que no tenemos.
    for (const v of [null, undefined, ""]) {
      expect(formatOpenFor(v, NOW)).toBeNull();
    }
  });

  it("una fecha ilegible también es ausencia", () => {
    expect(formatOpenFor("no es una fecha", NOW)).toBeNull();
    expect(formatOpenFor("2026-13-45", NOW)).toBeNull();
  });
});

describe("escala", () => {
  it("recorre minutos, horas, días, meses y años", () => {
    const casos = [
      [30_000, "just now"],
      [5 * 60_000, "5m"],
      [59 * 60_000, "59m"],
      [H, "1h"],
      [23 * H, "23h"],
      [D, "1d"],
      [29 * D, "29d"],
      [45 * D, "1mo"],
      [400 * D, "1y"]
    ];
    for (const [ms, esperado] of casos) {
      expect(formatOpenFor(hace(ms), NOW).text, `${ms}ms`).toBe(esperado);
    }
  });

  it("trunca en vez de redondear", () => {
    // Redondear haría que algo abierto hace 23h y media dijera "1d", y
    // la edad de una alerta es un dato que la gente compara con su
    // propio recuerdo de cuándo pasó algo. Pasarse hacia arriba la hace
    // parecer más vieja de lo que es.
    expect(formatOpenFor(hace(23.6 * H), NOW).text).toBe("23h");
    expect(formatOpenFor(hace(1.9 * D), NOW).text).toBe("1d");
  });

  it("un reloj adelantado no pinta edades negativas", () => {
    const futuro = new Date(NOW + 3 * H).toISOString();
    expect(formatOpenFor(futuro, NOW)).toEqual({ text: "just now", days: 0, stale: false });
  });
});

describe("el umbral de abandono", () => {
  it(`marca stale a partir de ${STALE_AFTER_DAYS} días`, () => {
    expect(formatOpenFor(hace((STALE_AFTER_DAYS - 1) * D), NOW).stale).toBe(false);
    expect(formatOpenFor(hace(STALE_AFTER_DAYS * D), NOW).stale).toBe(true);
    expect(formatOpenFor(hace(30 * D), NOW).stale).toBe(true);
  });

  it("el caso que motivó todo esto: tres semanas abierta", () => {
    const r = formatOpenFor(hace(21 * D), NOW);
    expect(r.text).toBe("21d");
    expect(r.stale).toBe(true);
    expect(r.days).toBe(21);
  });
});
