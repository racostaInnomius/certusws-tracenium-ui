// Nombrar los equipos afectados por un CVE.
//
// El defecto: la tabla enseñaba «1» y el diálogo «on the 1 vulnerable
// device(s)». Ni uno ni otro decían a qué máquina ibas a desplegar.

import { describe, it, expect } from "vitest";
import { affectedDevicesCell, affectedDevicesSentence, deviceName, deviceNames } from "./affectedDevices";

const d = (hostname, agentId = "e09f6c8e-1111-2222-3333-444455556666") => ({ agentId, hostname });

describe("affectedDevicesSentence — el diálogo de Remediate", () => {
  it("⭐ con un equipo dice CUÁL, no «1 device(s)»", () => {
    expect(affectedDevicesSentence(1, [d("MSIG-TSPDC")])).toBe("on MSIG-TSPDC");
  });

  it("con varios los nombra a todos mientras quepan", () => {
    expect(affectedDevicesSentence(3, [d("A"), d("B"), d("C")])).toBe(
      "on all 3 vulnerable devices: A, B and C"
    );
  });

  it("⚠️ con más de los que caben en la muestra, el despliegue NO parece ir sólo a ésos", () => {
    // La muestra está topada en 10. Listar tres de 55 sin decirlo haría creer
    // que el resto se queda fuera.
    const muestra = Array.from({ length: 10 }, (_, i) => d(`HOST-${i + 1}`));
    const frase = affectedDevicesSentence(55, muestra);
    expect(frase).toBe(
      "on all 55 vulnerable devices, including HOST-1, HOST-2, HOST-3, HOST-4 and HOST-5"
    );
  });

  it("el diálogo es estrecho: no vuelca los diez de la muestra", () => {
    // Con 55 afectados, el alcance lo da el total; los nombres sólo sirven para
    // reconocer de qué parte de la flota se habla.
    const muestra = Array.from({ length: 10 }, (_, i) => d(`HOST-${i + 1}`));
    expect(affectedDevicesSentence(55, muestra).match(/HOST-/g)).toHaveLength(5);
    // Y con seis afectados y seis nombres, tampoco los suelta todos.
    const seis = Array.from({ length: 6 }, (_, i) => d(`H${i + 1}`));
    expect(affectedDevicesSentence(6, seis)).toContain("including");
  });

  it("⚠️ sin muestra devuelve null, para no afirmar lo que no sabe", () => {
    // Un backend anterior a este cambio no manda `sampleDevices`; quien llama
    // vuelve al texto de siempre en vez de inventarse nombres.
    expect(affectedDevicesSentence(4, undefined)).toBeNull();
    expect(affectedDevicesSentence(4, [])).toBeNull();
  });

  it("cero equipos se dice, no se calla", () => {
    expect(affectedDevicesSentence(0, [])).toBe("no device is vulnerable right now");
  });
});

describe("affectedDevicesCell — la columna", () => {
  it("⭐ con un solo equipo, el nombre ES el dato de la celda", () => {
    expect(affectedDevicesCell(1, [d("MSIG-TSPDC")])).toEqual({
      inline: "MSIG-TSPDC",
      full: "MSIG-TSPDC",
    });
  });

  it("con varios enseña el primero y cuántos faltan; el hover trae la lista", () => {
    const r = affectedDevicesCell(3, [d("A"), d("B"), d("C")]);
    expect(r.inline).toBe("A +2");
    expect(r.full).toBe("A, B and C");
  });

  it("⚠️ el tooltip no finge tener la lista completa cuando está topada", () => {
    const muestra = Array.from({ length: 10 }, (_, i) => d(`HOST-${i + 1}`));
    const r = affectedDevicesCell(55, muestra);
    expect(r.inline).toBe("HOST-1 +54");
    expect(r.full).toContain("and 45 more");
  });

  it("sin muestra la celda se queda con el chip de siempre", () => {
    expect(affectedDevicesCell(7, [])).toEqual({ inline: null, full: null });
    expect(affectedDevicesCell(0, [d("A")])).toEqual({ inline: null, full: null });
  });
});

describe("deviceName", () => {
  it("⚠️ un equipo sin host no desaparece: se nombra por su id acortado", () => {
    // Peor que un identificador feo es una lista que dice menos equipos de los
    // que hay.
    expect(deviceName({ agentId: "e09f6c8e-1111-2222", hostname: null })).toBe("e09f6c8e-111");
    expect(deviceName({ agentId: "e09f6c8e-1111-2222", hostname: "   " })).toBe("e09f6c8e-111");
  });

  it("prefiere el hostname y le quita los espacios", () => {
    expect(deviceName(d("  MSIG-WSUS  "))).toBe("MSIG-WSUS");
  });

  it("sin nada que mostrar, lo dice en palabras", () => {
    expect(deviceName({})).toBe("unnamed device");
    expect(deviceName(null)).toBe("unnamed device");
  });

  it("deviceNames aguanta una entrada que no es lista", () => {
    expect(deviceNames(null)).toEqual([]);
    expect(deviceNames([d("A"), d("B")])).toEqual(["A", "B"]);
  });
});
