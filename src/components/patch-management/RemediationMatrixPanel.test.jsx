// src/components/patch-management/RemediationMatrixPanel.test.jsx
//
// Two columns that must never be merged: plumbing (a dry run read the state)
// and fix (an apply changed a verdict). And one distinction inside plumbing
// that the 14-Aug rows made necessary: an outcome WITHOUT state is not
// evidence, however good the outcome looks.

import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const getRemediationMatrix = vi.fn();
const validateRemediationMatrix = vi.fn();
vi.mock("../../api/patchManagement", () => ({
  getRemediationMatrix: (...a) => getRemediationMatrix(...a),
  validateRemediationMatrix: (...a) => validateRemediationMatrix(...a),
}));

import RemediationMatrixPanel, { describeDryRun } from "./RemediationMatrixPanel";

afterEach(cleanup);
beforeEach(() => {
  getRemediationMatrix.mockReset();
  validateRemediationMatrix.mockReset();
});

const row = (over = {}) => ({
  capability: "shares", platform: "windows",
  handlerId: "windows.shares.no_everyone_full_control",
  support: "remediable", viaCampaign: true, viaPolicy: false,
  verifiedAt: null, verifiedVia: null, verifiedNote: null,
  validatedAnywhere: false,
  evidence: { dryRun: null, apply: null },
  ...over,
});

describe("describeDryRun — the plumbing column in words", () => {
  it("never run", () => {
    expect(describeDryRun({ dryRun: null }, false).label).toMatch(/Never run/);
  });

  it("verified elsewhere when another tenant ran it", () => {
    expect(describeDryRun({ dryRun: null }, true).label).toMatch(/elsewhere/);
  });

  it("a dry run with state reads as OK", () => {
    const d = describeDryRun({ dryRun: { verified: true, outcome: "dryrun_would_apply", hasState: true, at: "2026-09-02T10:00:00Z", deviceId: "x" } }, false);
    expect(d.tone).toBe("ok");
    expect(d.label).toMatch(/would apply/);
  });

  it("⭐ an ack without state is a warning, not a pass", () => {
    // The 14-Aug shape: outcome inferred from an exit code, nothing read.
    const d = describeDryRun({ dryRun: { verified: false, outcome: "dryrun_would_apply", hasState: false, at: "2026-08-14T16:46:00Z", deviceId: "x" } }, false);
    expect(d.tone).toBe("warn");
    expect(d.label).toMatch(/without state/i);
  });

  it("a failed dry run is an error with its outcome", () => {
    const d = describeDryRun({ dryRun: { verified: false, outcome: "rejected", hasState: true, at: "2026-09-02T10:00:00Z", deviceId: "x" } }, false);
    expect(d.tone).toBe("error");
    expect(d.label).toBe("rejected");
  });
});

describe("the panel", () => {
  it("renders one row per handler with both columns", async () => {
    getRemediationMatrix.mockResolvedValue({
      rows: [
        row(),
        row({ handlerId: "macos.firewall.enabled", capability: "firewall", platform: "macos", viaPolicy: true, verifiedAt: "2026-08-26", verifiedVia: "enforcer", verifiedNote: "3 Macs" }),
      ],
    });
    render(<RemediationMatrixPanel devices={[]} />);

    expect(await screen.findByText("windows.shares.no_everyone_full_control")).toBeInTheDocument();
    expect(screen.getByText("Verified 2026-08-26")).toBeInTheDocument();
    expect(screen.getAllByText(/Never run/).length).toBeGreaterThan(0);
  });

  it("hides the launcher from members who cannot manage", async () => {
    getRemediationMatrix.mockResolvedValue({ rows: [row()] });
    render(<RemediationMatrixPanel canManage={false} devices={[]} />);
    await screen.findByText("windows.shares.no_everyone_full_control");

    expect(screen.queryByRole("button", { name: /Run dry-run validation/ })).not.toBeInTheDocument();
  });

  it("⭐ sends only the platforms with a picked device", async () => {
    getRemediationMatrix.mockResolvedValue({ rows: [row()] });
    validateRemediationMatrix.mockResolvedValue({ launched: [{ handlerId: "x", remediationId: 1 }], failed: [], skipped: [] });
    const devices = [
      { deviceId: "win-1", hostname: "RAV-LAB-HI", platform: "windows" },
      { deviceId: "lnx-1", hostname: "SRVOC", platform: "linux" },
    ];
    const user = userEvent.setup();
    render(<RemediationMatrixPanel canManage devices={devices} />);
    await screen.findByText("windows.shares.no_everyone_full_control");

    const button = screen.getByRole("button", { name: /Run dry-run validation/ });
    expect(button).toBeDisabled();

    await user.click(screen.getByLabelText("Windows"));
    await user.click(await screen.findByRole("option", { name: "RAV-LAB-HI" }));
    await user.click(button);

    await waitFor(() => expect(validateRemediationMatrix).toHaveBeenCalled());
    expect(validateRemediationMatrix).toHaveBeenCalledWith({ windows: "win-1" });
  });

  it("shows why a handler could not be launched", async () => {
    getRemediationMatrix.mockResolvedValue({ rows: [row()] });
    validateRemediationMatrix.mockResolvedValue({
      launched: [], skipped: [],
      failed: [{ handlerId: "linux.firewall.enabled", error: "no such catalog row" }],
    });
    const user = userEvent.setup();
    render(<RemediationMatrixPanel canManage devices={[{ deviceId: "lnx-1", hostname: "SRVOC", platform: "linux" }]} />);
    await screen.findByText("windows.shares.no_everyone_full_control");

    await user.click(screen.getByLabelText("Linux"));
    await user.click(await screen.findByRole("option", { name: "SRVOC" }));
    await user.click(screen.getByRole("button", { name: /Run dry-run validation/ }));

    expect(await screen.findByText(/no such catalog row/)).toBeInTheDocument();
  });
});
