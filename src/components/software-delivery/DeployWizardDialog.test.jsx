// src/components/software-delivery/DeployWizardDialog.test.jsx
//
// Sprint 2 — two-step deploy wizard.
//
// The wizard loads asset groups over the network (listAssetGroups), so
// MSW intercepts /api/v1/asset-groups. Deploy itself is delegated to the
// parent via onConfirm, so we assert the body the wizard builds and the
// success/error notification path.
//
// Focus:
//   * XOR groupId / deviceIds (asset_group mode vs device_list mode)
//   * device-id textarea parsing (comma / semicolon / newline / space)
//   * platform-mismatch warning text on the Target step
//   * deploy → onConfirm resolves → parent closes; onConfirm rejects →
//     inline error notification via notify()

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import DeployWizardDialog from "./DeployWizardDialog";
import { respond } from "../../test/msw/server";

afterEach(cleanup);

const setupUser = () => userEvent.setup({ delay: null });

const PKG = {
  id: "p1",
  name: "7zip",
  version: "23.01",
  platform: "windows",
  arch: "x64",
  format: "msi",
  sha256: "a".repeat(64),
  sizeBytes: 1_500_000,
  requiresReboot: false,
  detectionRule: { type: "registry_uninstall" },
};

const GROUPS = [
  { id: 10, name: "Lab Windows", kind: "static", memberCount: 12 },
  { id: 20, name: "Dynamic All", kind: "dynamic", memberCount: 300 },
];

function renderWizard({ groups = GROUPS, onConfirm = vi.fn() } = {}) {
  respond("get", "/api/v1/asset-groups", { ok: true, items: groups });
  const notify = vi.fn();
  render(
    <DeployWizardDialog
      open
      pkg={PKG}
      onClose={vi.fn()}
      onConfirm={onConfirm}
      notify={notify}
    />
  );
  return { onConfirm, notify };
}

describe("DeployWizardDialog — target step (XOR groupId / deviceIds)", () => {
  it("asset_group mode: Next stays disabled until a group is picked", async () => {
    const user = setupUser();
    renderWizard();

    // Wait for the async group load to finish (options become available).
    const next = screen.getByRole("button", { name: /Next/i });
    expect(next).toBeDisabled();

    await user.click(await screen.findByRole("combobox", { name: /Asset group/i }));
    await user.click(await screen.findByRole("option", { name: /Lab Windows/i }));

    expect(screen.getByRole("button", { name: /Next/i })).toBeEnabled();
  });

  it("device_list mode: Next enables only once at least one id is parsed", async () => {
    const user = setupUser();
    renderWizard();

    await user.click(screen.getByRole("radio", { name: /Manual device list/i }));
    const next = screen.getByRole("button", { name: /Next/i });
    expect(next).toBeDisabled();

    await user.type(screen.getByRole("textbox", { name: /Device IDs/i }), "agent-001");
    expect(screen.getByRole("button", { name: /Next/i })).toBeEnabled();
  });

  it("builds { assetGroupId } (number) when firing in asset_group mode", async () => {
    const user = setupUser();
    const onConfirm = vi.fn().mockResolvedValue({});
    renderWizard({ onConfirm });

    await user.click(await screen.findByRole("combobox", { name: /Asset group/i }));
    await user.click(await screen.findByRole("option", { name: /Lab Windows/i }));
    await user.click(screen.getByRole("button", { name: /Next/i }));
    await user.click(screen.getByRole("button", { name: /Deploy/i }));

    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1));
    expect(onConfirm.mock.calls[0][0]).toEqual({ mode: "install", assetGroupId: 10 });
  });

  it("builds { deviceIds } (no groupId) when firing in device_list mode", async () => {
    const user = setupUser();
    const onConfirm = vi.fn().mockResolvedValue({});
    renderWizard({ onConfirm });

    await user.click(screen.getByRole("radio", { name: /Manual device list/i }));
    await user.type(
      screen.getByRole("textbox", { name: /Device IDs/i }),
      "agent-001, agent-002"
    );
    await user.click(screen.getByRole("button", { name: /Next/i }));
    await user.click(screen.getByRole("button", { name: /Deploy/i }));

    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1));
    const body = onConfirm.mock.calls[0][0];
    expect(body.mode).toBe("install");
    expect(body.deviceIds).toEqual(["agent-001", "agent-002"]);
    expect(body).not.toHaveProperty("assetGroupId"); // XOR — never both
  });
});

describe("DeployWizardDialog — device-id textarea parsing", () => {
  // The wizard splits on /[\s,;\n]+/. Verify all separators collapse and
  // blanks are dropped, by reading the count in the helper text.
  it("splits on comma / semicolon / newline / whitespace and dedups blanks", async () => {
    const user = setupUser();
    renderWizard();

    await user.click(screen.getByRole("radio", { name: /Manual device list/i }));
    const ta = screen.getByRole("textbox", { name: /Device IDs/i });
    // Mixed separators + leading/trailing/double blanks.
    await user.type(ta, "  a1, a2;a3{Enter}a4   a5 , ");

    // Helper text reports the parsed count.
    expect(await screen.findByText(/5 device\(s\)/i)).toBeInTheDocument();
  });

  it("renders parsed device chips on the Review step", async () => {
    const user = setupUser();
    renderWizard();

    await user.click(screen.getByRole("radio", { name: /Manual device list/i }));
    await user.type(
      screen.getByRole("textbox", { name: /Device IDs/i }),
      "agent-001;agent-002"
    );
    await user.click(screen.getByRole("button", { name: /Next/i }));

    expect(screen.getByText("agent-001")).toBeInTheDocument();
    expect(screen.getByText("agent-002")).toBeInTheDocument();
    expect(screen.getByText(/Device list \(2\)/i)).toBeInTheDocument();
  });
});

describe("DeployWizardDialog — platform-mismatch warning", () => {
  it("shows the platform_mismatch note when an asset group is selected", async () => {
    const user = setupUser();
    renderWizard();

    await user.click(await screen.findByRole("combobox", { name: /Asset group/i }));
    await user.click(await screen.findByRole("option", { name: /Lab Windows/i }));

    // The info alert references the package platform/arch and the
    // per-device rejection reason.
    expect(
      screen.getByText(/platform_mismatch/i)
    ).toBeInTheDocument();
    expect(screen.getByText(/windows\/x64/i)).toBeInTheDocument();
  });
});

describe("DeployWizardDialog — deploy result surfacing", () => {
  it("error path: onConfirm rejects → notify('error', message), stays on wizard", async () => {
    const user = setupUser();
    const err = Object.assign(new Error("boom"), {
      body: { message: "Per-device cap exceeded" },
    });
    const onConfirm = vi.fn().mockRejectedValue(err);
    const { notify } = renderWizard({ onConfirm });

    await user.click(await screen.findByRole("combobox", { name: /Asset group/i }));
    await user.click(await screen.findByRole("option", { name: /Lab Windows/i }));
    await user.click(screen.getByRole("button", { name: /Next/i }));
    await user.click(screen.getByRole("button", { name: /Deploy/i }));

    await waitFor(() =>
      expect(notify).toHaveBeenCalledWith("error", "Per-device cap exceeded")
    );
    // Deploy button re-enables so operator can retry (submitting reset).
    expect(screen.getByRole("button", { name: /Deploy/i })).toBeEnabled();
  });

  it("group-load failure notifies error and leaves an empty catalog", async () => {
    // 500 on the asset-groups load → catch → notify('error', ...).
    respond("get", "/api/v1/asset-groups", { ok: false, message: "db down" }, { status: 500 });
    const notify = vi.fn();
    render(
      <DeployWizardDialog
        open
        pkg={PKG}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
        notify={notify}
      />
    );

    await waitFor(() => expect(notify).toHaveBeenCalledWith("error", expect.any(String)));
    // Helper text tells the operator no groups are available.
    expect(
      screen.getByText(/No asset groups available/i)
    ).toBeInTheDocument();
  });
});
