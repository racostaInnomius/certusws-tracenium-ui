// src/pages/Printers.test.jsx
//
// La pestaña con la forma de T111 (2026-09-15): colas de MSIG-WSUS vistas desde
// varios equipos, la lectura de máquina vacía y un servidor sin listar colas.

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";

vi.mock("../api/inventoryDashboard", () => ({ getPrinterFleet: vi.fn() }));
vi.mock("../hooks/useCachedFetch", () => ({
  useCachedFetch: (_k, fn) => {
    const [data, setData] = React.useState(null);
    React.useEffect(() => {
      fn().then(setData);
    }, []);
    return { data, loading: !data, refetch: () => {} };
  },
}));

import * as React from "react";
import { getPrinterFleet } from "../api/inventoryDashboard";
import Printers from "./Printers";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const fleet = {
  summary: { queues: 5, physicalPrinters: 2, printersWithoutAddress: 1, devicesWithPrinters: 3, printServers: 1, virtualQueues: 4, wsdQueues: 3, sessionQueues: 1 },
  byVendor: [{ vendor: "HP", queues: 1 }, { vendor: "Zebra", queues: 1 }],
  byKind: { printServer: 1, localNetwork: 0, localDirect: 1 },
  printServers: [{ server: "msig-wsus", queues: 1, users: 2, agent: "no_queues", agentId: "wsus", machineScope: "empty_output" }],
  printers: [
    {
      key: "q:msig-wsus\\casticoprintroom", name: "CasticoPrintroom", server: "msig-wsus", share: "CasticoPrintroom",
      kind: "shared_queue", publishedBy: null, model: null, vendor: "HP", location: null, comments: null,
      hostAddress: null, port: null, isNetwork: true, status: null,
      users: [
        { agentId: "pc1", hostname: "MSIGFINANJJ", isDefault: true },
        { agentId: "pc2", hostname: "MsigFinan5", isDefault: false },
      ],
      sources: ["user_connection"], lastSeenAtUtc: "2026-09-15T00:00:00.000Z",
    },
    {
      key: "l:pc3:zebra", name: "Zebra ZM400", server: null, share: null, kind: "local", publishedBy: null,
      model: "ZDesigner ZM400 200 dpi (ZPL)", vendor: "Zebra", location: "Shipping", comments: null,
      hostAddress: "10.20.11.39", port: "USB001", isNetwork: false, status: "online",
      users: [{ agentId: "pc3", hostname: "CasticoShipp3", isDefault: false }],
      sources: ["local_spooler"], lastSeenAtUtc: "2026-09-15T00:00:00.000Z",
    },
  ],
  coverage: { fleetDevices: 54, declared: 40, machineScope: { empty_output: 39, collected: 1 }, userScope: { collected: 40 } },
};

describe("Printers tab", () => {
  it("⭐ cifras, avisos de cobertura y la cola con sus usuarios", async () => {
    getPrinterFleet.mockResolvedValue(fleet);
    render(<Printers />);

    expect(await screen.findByText(/could not be read on 39 of 40 devices/)).toBeTruthy();
    expect(screen.getByText(/msig-wsus is enrolled but did not list its print queues/)).toBeTruthy();
    // La cifra es la impresora; las colas y lo excluido, el detalle.
    expect(screen.getByText("From 5 print queues · 1 without a network address")).toBeTruthy();
    expect(screen.getByText("4 virtual · 3 auto-discovered (WSD) · 1 Remote Desktop")).toBeTruthy();
    expect(screen.getByText("of 54 in the fleet")).toBeTruthy();

    expect(await screen.findByText("CasticoPrintroom")).toBeTruthy();
    expect(screen.getByText("\\\\msig-wsus")).toBeTruthy();
    expect(screen.getByText("MSIGFINANJJ")).toBeTruthy();
    // Sin modelo reportado se dice, no se deja en blanco.
    expect(screen.getAllByText("Not reported").length).toBeGreaterThan(0);
  });

  it("una rebanada filtra la tabla y lo dice con un chip que se quita", async () => {
    getPrinterFleet.mockResolvedValue(fleet);
    render(<Printers />);
    await screen.findByText("CasticoPrintroom");

    fireEvent.click(screen.getByText("Zebra 1"));
    expect(await screen.findByText("Zebra · 1")).toBeTruthy();
    expect(screen.queryByText("CasticoPrintroom")).toBeNull();
    expect(screen.getByText("Zebra ZM400")).toBeTruthy();

    const chip = screen.getByText("Zebra · 1").closest(".MuiChip-root");
    fireEvent.click(within(chip).getByTestId("CancelIcon"));
    expect(await screen.findByText("CasticoPrintroom")).toBeTruthy();
  });

  it("⭐ una impresora dice con qué otros nombres aparece y si la dirección es del nombre del puerto", async () => {
    getPrinterFleet.mockResolvedValue({
      ...fleet,
      printers: [{
        ...fleet.printers[1],
        key: "l:ricoh", name: "RICOH IM C2500 PCL 6", aliases: ["RICOH IM C2500 PCL 6 UPSTAIRS", "RICOH IM C2500 PCL 6  UPSTAIRS", "RICOH C2500 3F"],
        hostAddress: "10.100.17.91", addresses: ["10.100.17.91"], addressSource: "declared",
      }],
    });
    render(<Printers />);
    await screen.findByText("10.100.17.91");
    // Contra el contenido de la celda: el nombre real lleva dos espacios
    // ("PCL 6  UPSTAIRS", tal cual en T111) y el matcher de texto los colapsa.
    const cell = [...document.querySelectorAll('[role="gridcell"][data-field="name"]')][0];
    expect(cell.textContent).toContain("Also as: RICOH IM C2500 PCL 6 UPSTAIRS, RICOH IM C2500 PCL 6  UPSTAIRS +1");
    expect(screen.getByText("10.100.17.91")).toBeTruthy();
    expect(screen.getByText("from port name")).toBeTruthy();
  });

  it("⭐ ADR-0023: procedencia de AD, impresoras sólo en AD y la marca de pool", async () => {
    getPrinterFleet.mockResolvedValue({
      ...fleet,
      summary: { ...fleet.summary, adQueues: 21, adOnlyPrinters: 12 },
      activeDirectory: {
        state: "current", domain: "corp.local", readAt: new Date(Date.now() - 3 * 3_600_000).toISOString(),
        readBy: "MSIG-WSUS", queues: 21, lastAttempt: null,
      },
      printers: [{
        ...fleet.printers[0], key: "q:msig-wsus\\pool", name: "Pool Finanzas", pooled: true, deviceCount: 2, users: [],
        sources: ["active_directory"], addresses: ["10.100.25.20"], hostAddress: "10.100.25.20", addressSource: "declared",
      }],
    });
    render(<Printers />);
    expect(await screen.findByText("21 queues published in Active Directory · corp.local · read 3h ago by MSIG-WSUS")).toBeTruthy();
    expect(screen.getByText("From 5 print queues · 1 without a network address · 12 only in Active Directory")).toBeTruthy();
    expect(await screen.findByText("Pool · 2 printers")).toBeTruthy();
    expect(screen.getByText("Active Directory")).toBeTruthy();
    expect(screen.getByText("No connected devices")).toBeTruthy();
  });

  it("mientras carga no afirma ceros", () => {
    getPrinterFleet.mockReturnValue(new Promise(() => {}));
    render(<Printers />);
    expect(screen.getAllByText("…").length).toBe(4);
  });
});
