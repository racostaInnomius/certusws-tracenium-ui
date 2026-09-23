// src/components/CryptoDiscovery/processLibraries.test.js
//
// Ola 1.5 — la semántica de «qué carga cada servicio», fijada donde vive.
//
// ⭐ El test que importa es `versionConfidence`: `versionSource: "soname"`
// significa que la versión NO se leyó del artefacto, se dedujo de su nombre
// de fichero. `libssl.so.3` es la misma soname para un OpenSSL 3.0.2 y para
// un 3.6.2, y el umbral de ML-KEM (3.5) está entre los dos — así que esa
// versión no puede decidir si el servicio migra, y enseñarla como si se
// hubiera leído convertiría una conjetura en un dato.

import { describe, expect, it } from "vitest";
import {
  filterProcessLibraryDevices,
  formatPorts,
  groupProcessLibraries,
  holderOf,
  isVersionInferred,
  readProcessLibrary,
  summarizeProcessLibraries,
  versionConfidence
} from "./processLibraries";

const row = (over = {}) => ({
  agentId: "a1",
  host: "web-prod-01",
  process: "nginx",
  imagePath: "/usr/sbin/nginx",
  service: "nginx.service",
  library: "openssl",
  libraryPath: "/usr/lib/x86_64-linux-gnu/libssl.so.3",
  version: "3.0.2",
  versionSource: "file",
  ports: [443],
  ...over
});

describe("⭐ a version deduced from the soname is not a version that was read", () => {
  it("soname is flagged as inferred, and says why it cannot settle the threshold", () => {
    const c = versionConfidence("3.0.2", "soname");
    expect(c.state).toBe("inferred");
    expect(c.confirmed).toBe(false);
    // La explicación tiene que nombrar el problema concreto, no decir
    // «aproximado»: el umbral cae DENTRO del margen de error.
    expect(c.hint).toMatch(/NOT read from the library/i);
    expect(c.hint).toMatch(/libssl\.so\.3/);
    expect(c.hint).toMatch(/3\.0\.2 and for 3\.6\.2/);
    expect(c.hint).toMatch(/3\.5/);
  });

  it("read from the file or the module IS confirmed", () => {
    expect(versionConfidence("3.5.1", "file").confirmed).toBe(true);
    expect(versionConfidence("3.5.1", "file").state).toBe("read");
    expect(versionConfidence("3.5.1", "module").confirmed).toBe(true);
  });

  it("taken from the path is inferred too — packaging moves libraries under old paths", () => {
    expect(versionConfidence("3.0.2", "path").confirmed).toBe(false);
    expect(versionConfidence("3.0.2", "path").state).toBe("inferred");
  });

  it("⭐ no versionSource is «unconfirmed», never «read»", () => {
    // El backend manda null cuando el agente no lo dijo. Tratarlo como
    // leído sería elegir la respuesta cómoda sobre un dato ausente.
    const c = versionConfidence("3.0.2", null);
    expect(c.confirmed).toBe(false);
    expect(c.state).toBe("unknown");
    expect(c.hint).toMatch(/did not say where this version came from/i);
  });

  it("no version at all claims nothing about ML-KEM", () => {
    const c = versionConfidence(null, "file");
    expect(c.state).toBe("unknown");
    expect(c.confirmed).toBe(false);
    expect(c.hint).toMatch(/Nothing is claimed/i);
  });

  it("isVersionInferred is the single gate the view uses", () => {
    expect(isVersionInferred(row({ versionSource: "soname" }))).toBe(true);
    expect(isVersionInferred(row({ versionSource: "path" }))).toBe(true);
    expect(isVersionInferred(row({ versionSource: null }))).toBe(true);
    expect(isVersionInferred(row({ versionSource: "file" }))).toBe(false);
  });
});

describe("reading a row", () => {
  it("keeps every field and never fills a hole with a default", () => {
    const r = readProcessLibrary({ agentId: "a1", library: "gnutls", libraryPath: "/l.so" });
    expect(r.host).toBe(null);
    expect(r.service).toBe(null);
    expect(r.version).toBe(null);
    expect(r.versionSource).toBe(null);
    expect(r.ports).toEqual([]);
  });

  it("names the holder by service, then process, then image — and says which", () => {
    expect(holderOf(row())).toEqual({ name: "nginx.service", kind: "service" });
    expect(holderOf(row({ service: null }))).toEqual({ name: "nginx", kind: "process" });
    expect(holderOf(row({ service: null, process: null }))).toEqual({ name: "/usr/sbin/nginx", kind: "image" });
    expect(holderOf({})).toEqual({ name: "unknown", kind: "unknown" });
  });
});

describe("grouping: device → service → library", () => {
  const items = [
    row(),
    row({ library: "gnutls", libraryPath: "/usr/lib/libgnutls.so.30", version: "3.7.1", versionSource: "soname" }),
    row({ agentId: "a2", host: "db-01", service: "postgresql.service", process: "postgres", imagePath: "/usr/lib/postgresql/bin/postgres", ports: [5432] })
  ];

  it("one block per device, one row per service, its libraries inside", () => {
    const g = groupProcessLibraries(items);
    expect(g.devices).toHaveLength(2);
    // Ordenado por nombre visible: db-01 antes que web-prod-01.
    expect(g.devices.map((d) => d.label)).toEqual(["db-01", "web-prod-01"]);
    const web = g.devices.find((d) => d.label === "web-prod-01");
    expect(web.holders).toHaveLength(1);
    expect(web.holders[0].name).toBe("nginx.service");
    // Las dos librerías del MISMO servicio van juntas: es un reinicio, no dos.
    expect(web.holders[0].libraries.map((l) => l.library)).toEqual(["gnutls", "openssl"]);
    expect(web.holders[0].ports).toEqual([443]);
  });

  it("a service is flagged when ANY of its libraries has a version that was not read", () => {
    const g = groupProcessLibraries(items);
    expect(g.devices.find((d) => d.label === "web-prod-01").holders[0].inferred).toBe(true);
    expect(g.devices.find((d) => d.label === "db-01").holders[0].inferred).toBe(false);
  });

  it("two processes of the same image are one service, not two", () => {
    const g = groupProcessLibraries([row(), row({ ports: [8443] })]);
    expect(g.devices[0].holders).toHaveLength(1);
    // Y sus puertos se suman, ordenados: es el mismo servicio escuchando en dos.
    expect(g.devices[0].holders[0].ports).toEqual([443, 8443]);
  });

  it("⭐ rows with no device are dropped and counted, never bucketed together", () => {
    // Un cubo «unknown» compartido inventaría un equipo que no existe, y
    // el recuento de equipos de arriba se iría en uno.
    const g = groupProcessLibraries([row(), { library: "openssl", libraryPath: "/l.so" }, row({ agentId: "a3", library: null })]);
    expect(g.devices).toHaveLength(1);
    expect(g.dropped).toBe(2);
  });

  it("a device whose hostname is missing falls back to the agent id, and keeps a host found on another row", () => {
    const g = groupProcessLibraries([row({ host: null }), row({ host: null, service: "other.service" })]);
    expect(g.devices[0].label).toBe("a1");
    expect(g.devices[0].host).toBe(null);
    const g2 = groupProcessLibraries([row({ host: null }), row({ service: "other.service" })]);
    expect(g2.devices[0].label).toBe("web-prod-01");
  });

  it("garbage in is an empty grouping, not a crash", () => {
    expect(groupProcessLibraries(null).devices).toEqual([]);
    expect(groupProcessLibraries(undefined).dropped).toBe(0);
  });
});

describe("the counters", () => {
  it("counts devices, services, loads and how many versions were not read", () => {
    const s = summarizeProcessLibraries(
      groupProcessLibraries([
        row(),
        row({ library: "gnutls", libraryPath: "/g.so", versionSource: "soname" }),
        row({ agentId: "a2", host: "db-01", service: "postgresql.service", versionSource: null })
      ])
    );
    expect(s.devices).toBe(2);
    expect(s.services).toBe(2);
    expect(s.loads).toBe(3);
    // La soname y la procedencia ausente cuentan las dos: ninguna se leyó.
    expect(s.inferredLoads).toBe(2);
    expect(s.libraries).toEqual(["gnutls", "openssl"]);
  });
});

describe("filters", () => {
  const grouped = groupProcessLibraries([
    row(),
    row({ library: "gnutls", libraryPath: "/g.so", versionSource: "soname" }),
    row({ agentId: "a2", host: "db-01", service: "postgresql.service", versionSource: "file", libraryPath: "/opt/pgsql/lib/libssl.so.3" })
  ]);

  it("by library, hiding the other loads inside the service too", () => {
    const out = filterProcessLibraryDevices(grouped.devices, { library: "gnutls" });
    expect(out).toHaveLength(1);
    expect(out[0].label).toBe("web-prod-01");
    // Si openssl siguiera dentro del servicio, el filtro parecería no aplicarse.
    expect(out[0].holders[0].libraries.map((l) => l.library)).toEqual(["gnutls"]);
  });

  it("«only versions not read» keeps just the services carrying one", () => {
    const out = filterProcessLibraryDevices(grouped.devices, { onlyInferred: true });
    expect(out).toHaveLength(1);
    expect(out[0].label).toBe("web-prod-01");
  });

  it("free text matches the host, the service and the library path", () => {
    expect(filterProcessLibraryDevices(grouped.devices, { search: "db-01" })).toHaveLength(1);
    expect(filterProcessLibraryDevices(grouped.devices, { search: "POSTGRESQL" })).toHaveLength(1);
    // La ruta discrimina aunque las dos librerías se llamen igual: es
    // exactamente el caso en que hace falta (el mismo libssl en dos sitios).
    expect(filterProcessLibraryDevices(grouped.devices, { search: "/opt/pgsql" })).toHaveLength(1);
    expect(filterProcessLibraryDevices(grouped.devices, { search: "libssl" })).toHaveLength(2);
    expect(filterProcessLibraryDevices(grouped.devices, {})).toHaveLength(2);
  });
});

describe("ports", () => {
  it("are named with their protocol, and nothing is not «none»", () => {
    expect(formatPorts([443, 8443])).toBe("tcp/443, tcp/8443");
    expect(formatPorts([])).toBe(null);
    expect(formatPorts(null)).toBe(null);
  });
});
