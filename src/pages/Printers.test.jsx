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
  summary: { queues: 2, physicalPrinters: 1, queuesWithoutAddress: 1, devicesWithPrinters: 3, printServers: 1, virtualQueues: 4 },
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
    expect(screen.getByText("4 virtual (PDF, XPS, OneNote…) not counted")).toBeTruthy();
    expect(screen.getByText("At least — 1 queue without a known address")).toBeTruthy();
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

  it("⚠️ ninguna cola con dirección: las físicas son 'Unknown', no 0", async () => {
    getPrinterFleet.mockResolvedValue({
      ...fleet,
      summary: { ...fleet.summary, physicalPrinters: 0, queuesWithoutAddress: 8 },
    });
    render(<Printers />);
    const kpi = (await screen.findByText("Physical printers")).closest(".MuiPaper-root");
    expect(within(kpi).getByText("Unknown")).toBeTruthy();
    expect(within(kpi).queryByText("0")).toBeNull();
    expect(within(kpi).getByText("None of the 8 queues reports a device address yet")).toBeTruthy();
  });

  it("mientras carga no afirma ceros", () => {
    getPrinterFleet.mockReturnValue(new Promise(() => {}));
    render(<Printers />);
    expect(screen.getAllByText("…").length).toBe(4);
  });
});
