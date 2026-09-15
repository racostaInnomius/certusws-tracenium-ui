// src/utils/printerFleet.test.js
//
// Cifras de T111 medidas el 2026-09-15: 37 Windows con la lectura de máquina
// vacía y usuario leído, 2 sin nadie conectado, y MSIG-WSUS —servidor de
// impresión CON agente— sin listar ni una cola.

import { describe, expect, it } from "vitest";
import {
  connectionSlices,
  coverageNotices,
  filterPrinters,
  serverSlices,
  vendorColor,
  vendorSlices,
} from "./printerFleet";

const T111 = {
  summary: { queues: 8, physicalPrinters: 0, queuesWithoutAddress: 8, devicesWithPrinters: 14, printServers: 2, virtualQueues: 0 },
  byVendor: [{ vendor: "Other", queues: 6 }, { vendor: "Zebra", queues: 2 }],
  byKind: { printServer: 8, localNetwork: 0, localDirect: 0 },
  printServers: [
    { server: "msig-wsus", queues: 6, users: 12, agent: "no_queues", agentId: "wsus", machineScope: "empty_output" },
    { server: "castico-pv", queues: 1, users: 1, agent: "no_queues", agentId: "pc3", machineScope: "empty_output" },
    { server: "10.100.17.20", queues: 1, users: 1, agent: "not_in_fleet", agentId: null, machineScope: null },
  ],
  printers: [
    { key: "q:msig-wsus\\casticoprintroom", name: "CasticoPrintroom", server: "msig-wsus", kind: "shared_queue", vendor: "Other", isNetwork: true },
    { key: "q:10.100.17.20\\zebra", name: "Zebra ZM400", server: "10.100.17.20", kind: "shared_queue", vendor: "Zebra", isNetwork: true },
    { key: "l:pc1:usb", name: "USB HP", server: null, kind: "local", vendor: "HP", isNetwork: false },
    { key: "l:mac:cups", name: "HP_LaserJet", server: null, kind: "local", vendor: "HP", isNetwork: true },
  ],
  coverage: {
    fleetDevices: 54,
    declared: 40,
    machineScope: { empty_output: 39, not_declared: 1 },
    userScope: { collected: 37, no_user_hive: 2, not_declared: 1 },
  },
};

describe("coverageNotices", () => {
  it("⭐ la lectura de máquina vacía se avisa con cuántos y por qué", () => {
    const n = coverageNotices(T111).find((x) => x.key === "machine-read-failed");
    expect(n.severity).toBe("warning");
    expect(n.title).toBe(
      "Printers installed on the device could not be read on 39 of 40 devices (empty output ×39)."
    );
  });

  it("⚠️ un servidor de impresión con agente que no listó colas se nombra", () => {
    const n = coverageNotices(T111).find((x) => x.key === "server-no-queues");
    expect(n.title).toBe("msig-wsus, castico-pv are enrolled but did not list their print queues.");
  });

  it("el servidor que no es de la flota, y los equipos sin nadie conectado", () => {
    const keys = coverageNotices(T111).map((x) => x.key);
    expect(keys).toEqual(["machine-read-failed", "no-user-signed-in", "server-no-queues", "server-not-enrolled"]);
    expect(coverageNotices(T111).find((x) => x.key === "server-not-enrolled").title).toBe(
      "1 print server is not enrolled: 10.100.17.20."
    );
  });

  it("⚠️ sin tabla de alcances NO se calla: se dice que la cobertura no se conoce", () => {
    expect(coverageNotices({ ...T111, coverage: null, printServers: [] }).map((x) => x.key)).toEqual(["coverage-unknown"]);
  });

  it("todo leído: ningún aviso", () => {
    const sano = {
      ...T111,
      printServers: [{ server: "msig-wsus", queues: 6, users: 12, agent: "reporting" }],
      coverage: { fleetDevices: 2, declared: 2, machineScope: { collected: 2 }, userScope: { collected: 2 } },
    };
    expect(coverageNotices(sano)).toEqual([]);
    expect(coverageNotices(null)).toEqual([]);
  });
});

describe("slices", () => {
  it("por servidor: top N, el resto agrupado y las no compartidas aparte", () => {
    const fleet = { ...T111, byKind: { printServer: 8, localNetwork: 1, localDirect: 1 } };
    expect(serverSlices(fleet, 2).map((s) => [s.label, s.value])).toEqual([
      ["msig-wsus", 6],
      ["castico-pv", 1],
      ["Other servers", 1],
      ["Not shared", 2],
    ]);
  });

  it("⚠️ la marca conserva su color aunque cambie de puesto", () => {
    expect(vendorSlices(T111).find((s) => s.key === "Zebra").color).toBe(vendorColor("Zebra"));
    expect(vendorColor("HP")).not.toBe(vendorColor("Other"));
  });

  it("por conexión suma las colas", () => {
    expect(connectionSlices(T111).reduce((a, s) => a + s.value, 0)).toBe(8);
  });
});

describe("filterPrinters", () => {
  it("filtra por servidor, marca y conexión", () => {
    expect(filterPrinters(T111.printers, { type: "server", key: "msig-wsus" }).map((p) => p.name)).toEqual(["CasticoPrintroom"]);
    expect(filterPrinters(T111.printers, { type: "server", key: "__local__" })).toHaveLength(2);
    expect(filterPrinters(T111.printers, { type: "vendor", key: "HP" })).toHaveLength(2);
    expect(filterPrinters(T111.printers, { type: "connection", key: "local_direct" }).map((p) => p.name)).toEqual(["USB HP"]);
    expect(filterPrinters(T111.printers, null)).toHaveLength(4);
  });
});
