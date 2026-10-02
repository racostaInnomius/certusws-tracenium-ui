// src/components/Compliance/BaselinesPanel.test.jsx
//
// ADR-0037 F1 — la sección Baselines de la pestaña Remediation: lista con su
// alineación, crear uno, rellenarlo desde la flota y ver quién está fuera de
// línea. F1 sólo mide: la cabecera lo dice.

import * as React from "react";
import { afterEach, describe, it, expect, vi, beforeEach } from "vitest";
import { cleanup, render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { ConfirmProvider } from "../common/ConfirmDialog";

const api = vi.hoisted(() => ({
  listBaselines: vi.fn(),
  getBaselineAlignment: vi.fn(),
  getBaselineDetail: vi.fn(),
  getBaselineProposals: vi.fn(),
  createBaseline: vi.fn(),
  deleteBaseline: vi.fn(),
  addBaselineEntries: vi.fn(),
  removeBaselineEntry: vi.fn(),
}));
vi.mock("../../api/compliance", () => api);
vi.mock("../../api/assetGroups", () => ({ listAssetGroups: vi.fn(async () => ({ items: [{ id: 4, name: "PCI scope" }] })) }));

import BaselinesPanel, { scopeLabel } from "./BaselinesPanel";

const WIN = { id: "b1", name: "Windows workstations", scopeKind: "platform", platform: "windows", assetGroupId: null, assetGroupName: null, mode: "report", entryCount: 2 };
const ALIGN = {
  devicesInScope: 55, devicesAligned: 48, devicesUnmeasured: 2,
  byCheck: [{ checkId: "c.smb", deviations: 7, aligned: 48, excepted: 0 }, { checkId: "c.tls", deviations: 0, aligned: 55, excepted: 0 }],
  devices: [
    { deviceId: "d9", hostname: "MSIG-FIN-BERTHA", counts: { deviation: 2, aligned: 0, excepted: 0, not_applicable: 0, not_evaluated: 0 }, deviations: ["c.smb", "c.tls"], aligned: false },
    { deviceId: "d1", hostname: "PC-1", counts: { deviation: 0, aligned: 2, excepted: 0, not_applicable: 0, not_evaluated: 0 }, deviations: [], aligned: true },
  ],
};
const DETAIL = {
  baseline: WIN,
  entries: [
    { checkId: "c.smb", title: "SMB signing required", severity: "high", fixable: true, guard: null, catalogChanged: false, missing: false },
    { checkId: "c.tls", title: "TLS 1.0 disabled", severity: "medium", fixable: false, guard: "turns off …", catalogChanged: true, missing: false },
  ],
};

const mount = (props = {}) =>
  render(
    <ConfirmProvider>
      <BaselinesPanel canManage onToast={vi.fn()} {...props} />
    </ConfirmProvider>
  );

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  vi.clearAllMocks();
  api.listBaselines.mockResolvedValue({ baselines: [WIN] });
  api.getBaselineAlignment.mockResolvedValue({ alignment: ALIGN });
  api.getBaselineDetail.mockResolvedValue(DETAIL);
});

describe("BaselinesPanel", () => {
  it("dice que F1 sólo mide, y lista cada baseline con su alcance y su alineación", async () => {
    mount();
    expect(screen.getByText(/shows alignment only; applying it to new or drifted devices comes in a later release/)).toBeInTheDocument();
    expect(await screen.findByText("Windows workstations")).toBeInTheDocument();
    expect(screen.getByText("All Windows devices")).toBeInTheDocument();
    expect(await screen.findByText("48 of 55 aligned · 2 not measured yet")).toBeInTheDocument();
  });

  it("⭐ al abrirlo: quién está fuera de línea y por qué checks, y las marcas de cada check", async () => {
    mount();
    fireEvent.click(await screen.findByText("Windows workstations"));
    expect(await screen.findByText("1 device out of line")).toBeInTheDocument();
    expect(screen.getByText("MSIG-FIN-BERTHA")).toBeInTheDocument();
    expect(screen.getByText(/SMB signing required · TLS 1.0 disabled/)).toBeInTheDocument();
    expect(screen.getByText("Catalog changed")).toBeInTheDocument();
    expect(screen.getByText("Manual fix")).toBeInTheDocument();
  });

  it("⭐ proponer desde la flota: lista lo propuesto, todo marcado, y lo añade como `fleet`", async () => {
    api.getBaselineProposals.mockResolvedValue({
      scopeDevices: 55, minCoverage: 0.8, days: 90,
      proposals: [{ checkId: "c.cortana", title: "Cortana above lock disabled", severity: "medium", fixedDevices: 50, scopeDevices: 55, holdingDevices: 49 }],
    });
    api.addBaselineEntries.mockResolvedValue({ added: ["c.cortana"], alreadyIn: [], unknown: [] });
    mount();
    fireEvent.click(await screen.findByText("Windows workstations"));
    fireEvent.click(await screen.findByRole("button", { name: /Propose from fleet/ }));
    const dialog = await screen.findByRole("dialog");
    expect(await within(dialog).findByText("Cortana above lock disabled")).toBeInTheDocument();
    expect(within(dialog).getByText("50 of 55")).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Add 1 check" }));
    await waitFor(() => expect(api.addBaselineEntries).toHaveBeenCalledWith("b1", ["c.cortana"], "fleet"));
  });

  it("sin nada que proponer lo dice, con el umbral", async () => {
    api.getBaselineProposals.mockResolvedValue({ scopeDevices: 3, minCoverage: 0.8, days: 90, proposals: [] });
    mount();
    fireEvent.click(await screen.findByText("Windows workstations"));
    fireEvent.click(await screen.findByRole("button", { name: /Propose from fleet/ }));
    expect(await screen.findByText(/no fix reaches 80% of the 3 devices in scope/)).toBeInTheDocument();
  });

  it("crear un baseline de grupo manda el grupo elegido", async () => {
    api.createBaseline.mockResolvedValue({ baseline: { ...WIN, id: "b2", name: "PCI", scopeKind: "asset_group", assetGroupId: 4 } });
    mount();
    fireEvent.click(await screen.findByRole("button", { name: "New baseline" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Name"), { target: { value: "PCI" } });
    fireEvent.mouseDown(within(dialog).getByLabelText("Group"));
    fireEvent.click(await screen.findByRole("option", { name: "PCI scope" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Create baseline" }));
    await waitFor(() => expect(api.createBaseline).toHaveBeenCalledWith({ name: "PCI", scopeKind: "asset_group", assetGroupId: 4 }));
  });

  it("sin gestión: se ve, pero sin crear, proponer ni quitar", async () => {
    mount({ canManage: false });
    fireEvent.click(await screen.findByText("Windows workstations"));
    await screen.findByText("1 device out of line");
    expect(screen.queryByRole("button", { name: "New baseline" })).toBeNull();
    expect(screen.queryByRole("button", { name: /Propose from fleet/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Remove / })).toBeNull();
  });

  it("scopeLabel: grupo o plataforma", () => {
    expect(scopeLabel({ scopeKind: "asset_group", assetGroupName: "PCI scope" })).toBe("Group: PCI scope");
    expect(scopeLabel({ scopeKind: "platform", platform: "macos" })).toBe("All macOS devices");
  });
});
