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
  getComplianceCatalog: vi.fn(),
  updateBaseline: vi.fn(),
  getBaselinePending: vi.fn(),
  approveBaselinePending: vi.fn(),
  dismissBaselinePending: vi.fn(),
}));
vi.mock("../../api/compliance", () => api);
vi.mock("../../api/assetGroups", () => ({ listAssetGroups: vi.fn(async () => ({ items: [{ id: 4, name: "PCI scope" }] })) }));

import BaselinesPanel, { scopeLabel, pickableChecks, approveSummary } from "./BaselinesPanel";

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
  it("dice qué hace cada modo (sin prometer «auto»), y lista cada baseline con su alcance y su alineación", async () => {
    mount();
    expect(screen.getByText(/In\s+Approve mode, a device that falls out of line/)).toBeInTheDocument();
    expect(screen.queryByText(/later release/)).not.toBeInTheDocument();
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
      proposals: [{ checkId: "c.cortana", title: "Cortana above lock disabled", severity: "medium", fixedDevices: 50, scopeDevices: 55, measuredDevices: 30, holdingDevices: 29 }],
    });
    api.addBaselineEntries.mockResolvedValue({ added: ["c.cortana"], alreadyIn: [], unknown: [] });
    mount();
    fireEvent.click(await screen.findByText("Windows workstations"));
    fireEvent.click(await screen.findByRole("button", { name: /Propose from fleet/ }));
    const dialog = await screen.findByRole("dialog");
    expect(await within(dialog).findByText("Cortana above lock disabled")).toBeInTheDocument();
    expect(within(dialog).getByText("50 of 55")).toBeInTheDocument();
    // «Still passing» entre los re-medidos, no entre todos los arreglados.
    expect(within(dialog).getByText("29 of 30")).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Add 1 check" }));
    await waitFor(() => expect(api.addBaselineEntries).toHaveBeenCalledWith("b1", ["c.cortana"], "fleet"));
  });

  it("⭐ añadir a mano: busca en el catálogo, sólo de su plataforma y sin lo que ya está, y lo añade como `manual`", async () => {
    api.getComplianceCatalog.mockResolvedValue({
      ok: true,
      checks: [
        { checkId: "c.smb", title: "SMB signing required", platform: "windows", severity: "high" }, // ya en el baseline
        { checkId: "w.lsa", title: "LSA protection enabled", platform: "windows", severity: "high" },
        { checkId: "x.browser", title: "Browser updates enabled", platform: "cross", severity: "medium" },
        { checkId: "m.fv", title: "FileVault enabled", platform: "macos", severity: "critical" },
      ],
    });
    api.addBaselineEntries.mockResolvedValue({ added: ["w.lsa"], alreadyIn: [], unknown: [] });
    mount();
    fireEvent.click(await screen.findByText("Windows workstations"));
    fireEvent.click(await screen.findByRole("button", { name: /Add checks/ }));
    const dialog = await screen.findByRole("dialog");
    expect(await within(dialog).findByText("LSA protection enabled")).toBeInTheDocument();
    expect(within(dialog).getByText("Browser updates enabled")).toBeInTheDocument();
    expect(within(dialog).queryByText("FileVault enabled")).toBeNull(); // otra plataforma
    expect(within(dialog).queryByText("SMB signing required")).toBeNull(); // ya está
    fireEvent.change(within(dialog).getByLabelText("Search checks"), { target: { value: "lsa" } });
    expect(within(dialog).queryByText("Browser updates enabled")).toBeNull();
    fireEvent.click(within(dialog).getByText("LSA protection enabled"));
    fireEvent.click(within(dialog).getByRole("button", { name: "Add 1 check" }));
    await waitFor(() => expect(api.addBaselineEntries).toHaveBeenCalledWith("b1", ["w.lsa"], "manual"));
  });

  it("pickableChecks: un baseline de grupo ofrece todas las plataformas", () => {
    const cat = [{ checkId: "a", platform: "windows" }, { checkId: "b", platform: "macos" }, { checkId: "c", platform: "cross" }];
    expect(pickableChecks(cat, { platform: null }).map((c) => c.checkId)).toEqual(["a", "b", "c"]);
    expect(pickableChecks(cat, { platform: "macos", existing: new Set(["c"]) }).map((c) => c.checkId)).toEqual(["b"]);
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

  describe("modo y cola de aprobación (F2)", () => {
    const APPROVE = { ...WIN, mode: "approve" };
    const ITEMS = [
      { id: 11, deviceId: "d20", hostname: "PC-NEW-01", checkId: "c.smb", title: "SMB signing required", severity: "high", reason: "new_device", status: "pending", detectedAt: "2026-10-02T08:00:00Z", note: null, remediationId: null },
      { id: 12, deviceId: "d9", hostname: "MSIG-FIN-BERTHA", checkId: "c.smb", title: "SMB signing required", severity: "high", reason: "drift", status: "pending", detectedAt: "2026-10-01T08:00:00Z", note: null, remediationId: null },
      { id: 9, deviceId: "d3", hostname: "PC-3", checkId: "c.smb", title: "SMB signing required", severity: "high", reason: "existing", status: "approved", detectedAt: "2026-09-30T08:00:00Z", note: null, remediationId: 901 },
    ];

    it("⭐ cambiar a Approve manda PATCH { mode } y recarga; un 403 PMP_REQUIRED se dice con el motivo del backend", async () => {
      const onToast = vi.fn();
      api.updateBaseline.mockResolvedValueOnce({ baseline: APPROVE });
      mount({ onToast });
      fireEvent.click(await screen.findByText("Windows workstations"));
      expect(screen.getByText("Shows who is out of line. Nothing is fixed from here.")).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Approve" }));
      await waitFor(() => expect(api.updateBaseline).toHaveBeenCalledWith("b1", { mode: "approve" }));
      await waitFor(() => expect(api.listBaselines).toHaveBeenCalledTimes(2));

      api.updateBaseline.mockRejectedValueOnce({ body: { error: "PMP_REQUIRED", message: "Queuing fixes for approval needs Patch Management, which is not enabled for this tenant." } });
      fireEvent.click(screen.getByRole("button", { name: "Approve" }));
      await waitFor(() =>
        expect(onToast).toHaveBeenCalledWith({ severity: "error", message: "Queuing fixes for approval needs Patch Management, which is not enabled for this tenant." })
      );
    });

    it("⭐ en Approve: la cola con motivo por fila; «Approve all» confirma y manda todo (ids null)", async () => {
      const onToast = vi.fn();
      api.listBaselines.mockResolvedValue({ baselines: [APPROVE] });
      api.getBaselinePending.mockResolvedValue({ mode: "approve", items: ITEMS });
      api.approveBaselinePending.mockResolvedValue({ approved: 2, launched: [{ checkId: "c.smb", remediationId: 950, devices: 2 }], failed: [] });
      mount({ onToast });
      fireEvent.click(await screen.findByText("Windows workstations"));
      expect(await screen.findByText("Waiting for approval: 2 fixes on 2 devices")).toBeInTheDocument();
      expect(screen.getByText("New device")).toBeInTheDocument();
      expect(screen.getByText("Drifted")).toBeInTheDocument();
      expect(screen.getByText("Approved · fix #901")).toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: "Approve all" }));
      const dialog = await screen.findByRole("dialog");
      expect(within(dialog).getByText(/simulates each fix first/)).toBeInTheDocument();
      fireEvent.click(within(dialog).getByRole("button", { name: "Approve" }));
      await waitFor(() => expect(api.approveBaselinePending).toHaveBeenCalledWith("b1", null));
      await waitFor(() => expect(onToast).toHaveBeenCalledWith(expect.objectContaining({ severity: "success" })));
    });

    it("seleccionar filas aprueba o descarta SÓLO esas; descartar lleva la nota", async () => {
      api.listBaselines.mockResolvedValue({ baselines: [APPROVE] });
      api.getBaselinePending.mockResolvedValue({ mode: "approve", items: ITEMS });
      api.dismissBaselinePending.mockResolvedValue({ dismissed: 1 });
      mount();
      fireEvent.click(await screen.findByText("Windows workstations"));
      fireEvent.click(await screen.findByRole("checkbox", { name: "Select SMB signing required on PC-NEW-01" }));
      expect(screen.getByRole("button", { name: "Approve 1" })).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Dismiss 1" }));
      const dialog = await screen.findByRole("dialog");
      fireEvent.change(within(dialog).getByLabelText("Why (optional)"), { target: { value: "kiosk" } });
      fireEvent.click(within(dialog).getByRole("button", { name: "Dismiss" }));
      await waitFor(() => expect(api.dismissBaselinePending).toHaveBeenCalledWith("b1", [11], "kiosk"));
    });

    it("approveSummary: lo enviado y lo que no salió, con su motivo", () => {
      expect(approveSummary({ launched: [{ checkId: "a", remediationId: 1, devices: 3 }], failed: [] })).toEqual({
        severity: "success",
        message: "Sent 1 fix to 3 devices: each is simulated first and applied only where it would change something.",
      });
      expect(approveSummary({ launched: [], failed: [{ checkId: "a", error: "PATCH_REMEDIATION_EXCEPTED", message: "approved exception" }] })).toEqual({
        severity: "error",
        message: "1 not sent: approved exception",
      });
    });
  });
});
