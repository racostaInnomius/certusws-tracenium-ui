// La lista de horas del campo de marca que sustituye a `<input type="time">`.

import { describe, it, expect } from "vitest";
import { buildTimeOptions, formatTimeLabel, normalizeTime } from "./timeOptions";

describe("buildTimeOptions", () => {
  it("cada 15 minutos, de 00:00 a 23:45, con el valor en 24 h", () => {
    const o = buildTimeOptions({ locale: "en-US" });
    expect(o).toHaveLength(96);
    expect(o[0]).toEqual({ value: "00:00", label: "12:00 AM" });
    expect(o[88]).toEqual({ value: "22:00", label: "10:00 PM" });
    expect(o[95].value).toBe("23:45");
  });

  it("⭐ una hora ya guardada fuera de paso se conserva, en su sitio", () => {
    // Editar una ventana de las 22:10 no puede convertirla en 22:00 sin que
    // nadie lo pida.
    const o = buildTimeOptions({ extra: "22:10", locale: "en-US" });
    expect(o).toHaveLength(97);
    const i = o.findIndex((x) => x.value === "22:10");
    expect(o[i - 1].value).toBe("22:00");
    expect(o[i + 1].value).toBe("22:15");
  });

  it("una hora que ya está en la lista no se duplica", () => {
    expect(buildTimeOptions({ extra: "02:00" })).toHaveLength(96);
  });

  it("un paso inválido cae al de 15 minutos", () => {
    expect(buildTimeOptions({ stepMinutes: 0 })).toHaveLength(96);
    expect(buildTimeOptions({ stepMinutes: 30 })).toHaveLength(48);
  });
});

describe("formatTimeLabel", () => {
  it("sigue el formato del navegador, como el nativo", () => {
    expect(formatTimeLabel("22:00", "en-US")).toBe("10:00 PM");
    expect(formatTimeLabel("22:00", "en-GB")).toBe("22:00");
  });
  it("⚠️ no depende de la zona horaria de quien mira", () => {
    // Es una hora del día, no un instante: 22:00 es 22:00 en Madrid y en Texas.
    expect(formatTimeLabel("00:30", "en-GB")).toBe("00:30");
  });
});

describe("normalizeTime", () => {
  it("acepta «9:05» y rechaza lo que no es una hora", () => {
    expect(normalizeTime("9:05")).toBe("09:05");
    expect(normalizeTime("24:00")).toBe("");
    expect(normalizeTime("abc")).toBe("");
    expect(normalizeTime(undefined)).toBe("");
  });
});
