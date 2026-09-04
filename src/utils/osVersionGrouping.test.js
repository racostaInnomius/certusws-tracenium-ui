// src/utils/osVersionGrouping.test.js
//
// El caso que originó esto son las filas reales del tenant 1: el backend
// agrupa por nombre comercial, así que macOS aparecía en TRES filas de primer
// nivel y sólo una de ellas estaba agrupada.

import { describe, it, expect } from "vitest";
import { groupOsVersionsByPlatform, searchTermForVersion } from "./osVersionGrouping";

/** Las filas tal como llegan del tenant 1. */
const filasReales = [
  { os_platform: "windows", os_version: "10.0.26200", host_count: "7", commercial_name: "Windows 11", version_label: "25H2", technical_version: "10.0.26200" },
  { os_platform: "macos", os_version: "26.6.2", host_count: "6", commercial_name: "macOS Tahoe", version_label: "Multiple Versions", technical_version: null,
    children: [
      { os_version: "26.6.2", host_count: "4", technical_version: "26.6.2" },
      { os_version: "26.3.1", host_count: "2", technical_version: "26.3.1" },
    ] },
  { os_platform: "ubuntu", os_version: "24.04.4 LTS", host_count: "2", commercial_name: "Ubuntu", version_label: "Multiple Versions" },
  { os_platform: "macos", os_version: "12.7.6", host_count: "1", commercial_name: "macOS Monterey", version_label: "12", technical_version: "12.7.6" },
  { os_platform: "macos", os_version: "15.6.1", host_count: "1", commercial_name: "macOS Sequoia", version_label: "15", technical_version: "15.6.1" },
  { os_platform: "windows_server", os_version: "10.0.20348", host_count: "1", commercial_name: "Windows Server 2022", version_label: "2022", technical_version: "10.0.20348" },
];

const opciones = {
  platformLabel: (p) => ({ macos: "macOS", windows: "Windows", windows_server: "Windows Server", ubuntu: "Ubuntu" }[p] || p),
  displayTitle: (r) => r.commercial_name || r.os_label || "Unknown",
};

describe("groupOsVersionsByPlatform", () => {
  it("⚠️ macOS deja de estar partido en tres filas de primer nivel", () => {
    const g = groupOsVersionsByPlatform(filasReales, opciones);
    const macos = g.find((x) => x.platform === "macos");
    expect(macos.value).toBe(8); // 6 + 1 + 1
    expect(macos.children.map((c) => c.label)).toEqual([
      "macOS Tahoe",
      "macOS Monterey",
      "macOS Sequoia",
    ]);
  });

  it("los grupos van del mayor al menor", () => {
    const g = groupOsVersionsByPlatform(filasReales, opciones);
    expect(g.map((x) => `${x.label}:${x.value}`)).toEqual([
      "macOS:8", "Windows:7", "Ubuntu:2", "Windows Server:1",
    ]);
  });

  it("⚠️ con una sola version NO ofrece un desplegable vacio", () => {
    // Un arreglo vacio en `children` sigue dibujando la flecha de expandir, y
    // abrirla para no encontrar nada es peor que no ofrecerla.
    const g = groupOsVersionsByPlatform(filasReales, opciones);
    const server = g.find((x) => x.platform === "windows_server");
    expect(server.children).toBeUndefined();
    expect(server.sub).toBe("Windows Server 2022");
  });

  it("resume los point releases en la linea de apoyo, sin un tercer nivel", () => {
    const g = groupOsVersionsByPlatform(filasReales, opciones);
    const tahoe = g.find((x) => x.platform === "macos").children[0];
    expect(tahoe.sub).toBe("2 point releases");
  });

  it("⚠️ agrupa por la plataforma CRUDA, no por la etiqueta mostrada", () => {
    // Si dos plataformas distintas comparten etiqueta, mezclarlas juntaria
    // cosas que el resto del sistema mantiene separadas.
    const g = groupOsVersionsByPlatform(
      [
        { os_platform: "windows", host_count: 3, commercial_name: "Windows 11" },
        { os_platform: "windows_server", host_count: 2, commercial_name: "Windows Server 2022" },
      ],
      { platformLabel: () => "Windows", displayTitle: (r) => r.commercial_name }
    );
    expect(g).toHaveLength(2);
  });

  it("descarta plataformas sin equipos en vez de dibujar un cero", () => {
    const g = groupOsVersionsByPlatform(
      [{ os_platform: "linux", host_count: 0, commercial_name: "Alguna" }],
      opciones
    );
    expect(g).toEqual([]);
  });

  it("no explota con entradas degeneradas", () => {
    expect(groupOsVersionsByPlatform(null)).toEqual([]);
    expect(groupOsVersionsByPlatform([])).toEqual([]);
    expect(groupOsVersionsByPlatform([{}])).toEqual([]);
  });
});

describe("searchTermForVersion", () => {
  it("⚠️ prefiere el numero tecnico, que es lo que la columna buscada contiene", () => {
    // El nombre comercial de dos point releases hermanas es identico, asi que
    // buscar por el no estrecharia nada.
    expect(searchTermForVersion({ technical_version: "15.6.1" }, "macOS Sequoia")).toBe("15.6.1");
  });

  it("cae al os_version y luego al titulo", () => {
    expect(searchTermForVersion({ os_version: "24.04.4 LTS" }, "Ubuntu")).toBe("24.04.4 LTS");
    expect(searchTermForVersion({}, "macOS Tahoe")).toBe("macOS Tahoe");
  });
});
