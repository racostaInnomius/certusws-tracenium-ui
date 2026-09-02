// src/components/Compliance/FrameworkControlsPanel.test.jsx
//
// El panel que responde "¿qué controles SÍ cumplo?" — la pregunta que un
// auditor hace y que el resto de la página invierte.
//
// Lo que se fija aquí: que el titular cuente los cumplidos (es la frase
// que se lleva el auditor), que "Not assessed" no se disfrace de
// aprobado, que la evidencia viaje con el veredicto, y que un fallo se
// diga en vez de dejar un hueco que se lee como "no hay controles".

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";

const getFrameworkControls = vi.fn();
vi.mock("../../api/compliance", () => ({
  getFrameworkControls: (...args) => getFrameworkControls(...args),
}));

import FrameworkControlsPanel from "./FrameworkControlsPanel";

beforeEach(() => {
  getFrameworkControls.mockReset();
});
afterEach(cleanup);

// Forma real de prod (CIS Windows 11 en T111).
const CONTROLS = [
  {
    controlId: "18.9.12",
    controlTitle: "BitLocker Drive Encryption",
    controlLevel: "L2",
    checks: [{ checkId: "windows.bitlocker.system_drive_encrypted", title: "BitLocker", severity: "high" }],
    devicesPassing: 0,
    devicesFailing: 50,
    devicesNotAssessed: 0,
    status: "fail",
  },
  {
    controlId: "19.1.3.3",
    controlTitle: "Password protect the screen saver",
    controlLevel: "L1",
    checks: [{ checkId: "windows.screen_lock.screensaver_secure", title: "Screensaver", severity: "medium" }],
    devicesPassing: 0,
    devicesFailing: 0,
    devicesNotAssessed: 50,
    status: "not_assessed",
  },
  {
    controlId: "18.3.2",
    controlTitle: "Legacy cryptographic protocols and ciphers",
    controlLevel: "L1",
    checks: [
      { checkId: "windows.crypto.legacy_tls_disabled", title: "Legacy TLS", severity: "high" },
      { checkId: "windows.crypto.weak_ciphers_disabled", title: "Weak ciphers", severity: "high" },
    ],
    devicesPassing: 50,
    devicesFailing: 0,
    devicesNotAssessed: 0,
    status: "pass",
  },
];

const ok = (controls) => ({ ok: true, framework: "cis_windows_11_v3.0", controls });

describe("FrameworkControlsPanel", () => {
  it("leads with how many controls are met", async () => {
    getFrameworkControls.mockResolvedValue(ok(CONTROLS));
    render(<FrameworkControlsPanel framework="cis_windows_11_v3.0" />);

    // The sentence the auditor came for, before the table.
    expect(await screen.findByText(/1 of 3 controls met/)).toBeInTheDocument();
    expect(screen.getByText(/1 not met/)).toBeInTheDocument();
    expect(screen.getByText(/1 not assessed/)).toBeInTheDocument();
  });

  it("renders each control with its verdict and device counts", async () => {
    getFrameworkControls.mockResolvedValue(ok(CONTROLS));
    render(<FrameworkControlsPanel framework="cis_windows_11_v3.0" />);

    const met = (await screen.findByText("18.3.2")).closest("tr");
    expect(within(met).getByText("Met")).toBeInTheDocument();
    expect(within(met).getByText("Legacy cryptographic protocols and ciphers")).toBeInTheDocument();

    const failed = screen.getByText("18.9.12").closest("tr");
    expect(within(failed).getByText("Not met")).toBeInTheDocument();
    expect(within(failed).getByText("50")).toBeInTheDocument();
  });

  it("does not dress absent evidence up as a pass", async () => {
    getFrameworkControls.mockResolvedValue(ok(CONTROLS));
    render(<FrameworkControlsPanel framework="cis_windows_11_v3.0" />);

    const row = (await screen.findByText("19.1.3.3")).closest("tr");
    expect(within(row).getByText("Not assessed")).toBeInTheDocument();
    expect(within(row).queryByText("Met")).toBeNull();
  });

  it("shows the checks behind a verdict, so it can be argued with", async () => {
    getFrameworkControls.mockResolvedValue(ok(CONTROLS));
    render(<FrameworkControlsPanel framework="cis_windows_11_v3.0" />);

    const row = (await screen.findByText("18.3.2")).closest("tr");
    expect(
      within(row).getByText(/windows\.crypto\.legacy_tls_disabled · windows\.crypto\.weak_ciphers_disabled/)
    ).toBeInTheDocument();
  });

  it("hides a control level that says nothing", async () => {
    // CIS L1/L2 and STIG CAT I/II are meaningful; NIST "baseline" is noise.
    getFrameworkControls.mockResolvedValue(
      ok([{ ...CONTROLS[0], controlId: "SC-28", controlLevel: "baseline" }])
    );
    render(<FrameworkControlsPanel framework="nist_800_53_rev5" />);

    await screen.findByText("SC-28");
    expect(screen.queryByText("baseline")).toBeNull();
  });

  it("scopes the request to the asset group and reloads when it changes", async () => {
    getFrameworkControls.mockResolvedValue(ok(CONTROLS));
    const { rerender } = render(
      <FrameworkControlsPanel framework="cis_windows_11_v3.0" assetGroupId="4" />
    );
    await waitFor(() =>
      expect(getFrameworkControls).toHaveBeenCalledWith({
        framework: "cis_windows_11_v3.0",
        assetGroupId: "4",
      })
    );

    rerender(<FrameworkControlsPanel framework="cis_windows_11_v3.0" assetGroupId="9" />);
    await waitFor(() => expect(getFrameworkControls).toHaveBeenCalledTimes(2));
  });

  it("says a framework has no mappings rather than showing an empty table", async () => {
    getFrameworkControls.mockResolvedValue(ok([]));
    render(<FrameworkControlsPanel framework="stig_macos_14" />);
    expect(await screen.findByText(/No catalog checks are mapped to this framework yet/)).toBeInTheDocument();
  });

  it("surfaces a failure instead of leaving a silent gap", async () => {
    // A blank panel here reads as "this framework has no controls",
    // which is the opposite of what happened.
    getFrameworkControls.mockRejectedValue(new Error("boom controls"));
    render(<FrameworkControlsPanel framework="cis_windows_11_v3.0" />);
    expect(await screen.findByRole("alert")).toHaveTextContent("boom controls");
  });
});
