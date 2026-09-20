// src/components/patch-management/ExtensionControlPanel.test.jsx
//
// Control de extensiones en Patch Management → Security configuration →
// Browsers: lo que las findings de SCP cuentan, y dónde se bloquea o aprueba.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

vi.mock("../../api/inventoryDashboard", () => ({
  getBrowserExtensions: vi.fn(),
  getExtensionRules: vi.fn(),
  putExtensionRule: vi.fn(),
  deleteExtensionRule: vi.fn(),
}));
import { deleteExtensionRule, getBrowserExtensions, getExtensionRules, putExtensionRule } from "../../api/inventoryDashboard";
import ExtensionControlPanel from "./ExtensionControlPanel";

const A = "a".repeat(32);
const B = "b".repeat(32);
const grabber = {
  browser: "chrome", extensionId: A, name: "Coupon Grabber", devices: 2, sources: ["sideloaded"],
  risk: { level: "critical", reasons: [{ code: "all_sites_control", level: "critical", label: "Can read and change data on all websites, and cookies lets it act on that" }] },
};
const pwd = { browser: "edge", extensionId: B, name: "Password Vault", devices: 9, sources: ["store"], risk: { level: "high", reasons: [{ code: "all_sites", level: "high", label: "Can read and change data on all websites" }] } };
const harmless = { browser: "chrome", extensionId: "c".repeat(32), name: "Dark Reader lite", devices: 4, sources: ["store"], risk: { level: "low", reasons: [] } };
const INVENTORY = { ok: true, available: true, extensions: [grabber, pwd, harmless] };

beforeEach(() => {
  getBrowserExtensions.mockResolvedValue(INVENTORY);
  getExtensionRules.mockResolvedValue({ ok: true, rules: [], windowsDevices: 5 });
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  window.history.replaceState({}, "", "/");
});

describe("ExtensionControlPanel", () => {
  it("to review = critical/high or outside a store, without a rule; low-risk store extensions are not listed", async () => {
    render(<ExtensionControlPanel canManage />);
    expect(await screen.findByText("To review (2)")).toBeInTheDocument();
    expect(screen.getByText("Coupon Grabber")).toBeInTheDocument();
    expect(screen.getByText("Password Vault")).toBeInTheDocument();
    expect(screen.queryByText("Dark Reader lite")).not.toBeInTheDocument();
  });

  it("approve says it accepts the risk in Security Compliance and sends an allow rule; the extension moves to Rules", async () => {
    putExtensionRule.mockResolvedValue({ ok: true });
    const notify = vi.fn();
    render(<ExtensionControlPanel canManage notify={notify} />);
    const row = within(await screen.findByTestId(`extension-edge-${B}`));
    fireEvent.click(row.getByRole("button", { name: "Approve" }));
    expect(screen.getByText(/Security Compliance stops counting it on every device/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Reason (kept in the audit log)"), { target: { value: "corporate vault" } });
    getExtensionRules.mockResolvedValue({ ok: true, windowsDevices: 5, rules: [{ browser: "edge", extensionId: B, action: "allow", name: "Password Vault", status: { applied: 0, pending: 5, failed: 0 } }] });
    fireEvent.click(screen.getByRole("button", { name: "Approve extension" }));
    await waitFor(() => expect(putExtensionRule).toHaveBeenCalledWith({ browser: "edge", extensionId: B, action: "allow", name: "Password Vault", reason: "corporate vault" }));
    expect(await screen.findByText("To review (1)")).toBeInTheDocument();
    expect(screen.getByText("Rules (1)")).toBeInTheDocument();
    expect(screen.getByText("Approved")).toBeInTheDocument();
    expect(screen.getByText(/Applied on 0 of 5 Windows devices · 5 pending/)).toBeInTheDocument();
  });

  it("block asks first; a failed save keeps the dialog and reports the server message", async () => {
    putExtensionRule.mockRejectedValue(Object.assign(new Error("x"), { body: { message: 'Plugin "pmp" is not included' } }));
    const notify = vi.fn();
    render(<ExtensionControlPanel canManage notify={notify} />);
    const row = within(await screen.findByTestId(`extension-chrome-${A}`));
    fireEvent.click(row.getByRole("button", { name: "Block" }));
    fireEvent.click(screen.getByRole("button", { name: "Block extension" }));
    await waitFor(() => expect(notify).toHaveBeenCalledWith("error", expect.stringMatching(/pmp/)));
    expect(screen.getByRole("button", { name: "Block extension" })).toBeInTheDocument();
  });

  it("a rule for an extension no longer installed still shows, and can be removed", async () => {
    getExtensionRules.mockResolvedValue({ ok: true, windowsDevices: 5, rules: [{ browser: "chrome", extensionId: "d".repeat(32), action: "block", name: "Old toolbar", status: { applied: 5, pending: 0, failed: 0 } }] });
    deleteExtensionRule.mockResolvedValue({ ok: true });
    render(<ExtensionControlPanel canManage notify={() => {}} />);
    expect(await screen.findByText("Old toolbar")).toBeInTheDocument();
    expect(screen.getByText("Not installed on any device right now.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Remove rule" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Remove rule" }));
    await waitFor(() => expect(deleteExtensionRule).toHaveBeenCalledWith("chrome", "d".repeat(32)));
  });

  it("'block all other extensions' warns when nothing is approved yet", async () => {
    render(<ExtensionControlPanel canManage notify={() => {}} />);
    await screen.findByText("To review (2)");
    fireEvent.click(screen.getAllByRole("button", { name: "Block all other extensions" })[1]);
    expect(screen.getByText(/0 extensions are approved for Edge right now — approve the ones people need first/)).toBeInTheDocument();
  });

  it("without the capability: no buttons, the reason instead; Firefox says rules are Chrome/Edge", async () => {
    getBrowserExtensions.mockResolvedValue({ ...INVENTORY, extensions: [grabber, { ...grabber, browser: "firefox", extensionId: "x@y", name: "FF risky" }] });
    render(<ExtensionControlPanel />);
    await screen.findByText("To review (2)");
    expect(screen.queryByRole("button", { name: "Block" })).not.toBeInTheDocument();
    expect(screen.getAllByText(/needs the Security Compliance capability/).length).toBeGreaterThan(0);
    expect(screen.getByText("Rules are available for Chrome and Edge on Windows.")).toBeInTheDocument();
  });

  it("⭐ una aprobación vencida vuelve a To review, con su fecha, y se renueva desde ahí", async () => {
    // Seis meses después, la aprobación deja de valer: Security Compliance la
    // cuenta otra vez, así que la extensión es trabajo pendiente — pero los
    // equipos la siguen permitiendo y la UI lo dice.
    const expired = {
      browser: "edge", extensionId: B, action: "allow", name: "Password Vault",
      expiresAt: "2026-03-20T10:00:00Z", expired: true, status: { applied: 5, pending: 0, failed: 0 },
    };
    getExtensionRules.mockResolvedValue({ ok: true, windowsDevices: 5, rules: [expired] });
    putExtensionRule.mockResolvedValue({ ok: true });
    render(<ExtensionControlPanel canManage notify={() => {}} />);

    expect(await screen.findByText("To review (2)")).toBeInTheDocument();
    expect(screen.getByText("Rules (0)")).toBeInTheDocument();
    const row = within(screen.getByTestId(`extension-edge-${B}`));
    expect(row.getByText("Approval expired")).toBeInTheDocument();
    expect(row.getByText(/Approval expired on .* devices still allow it/)).toBeInTheDocument();

    fireEvent.click(row.getByRole("button", { name: "Renew approval" }));
    expect(screen.getByText(/The approval lasts six months/)).toBeInTheDocument();
    getExtensionRules.mockResolvedValue({ ok: true, windowsDevices: 5, rules: [{ ...expired, expired: false, expiresAt: "2027-03-20T10:00:00Z" }] });
    fireEvent.click(screen.getByRole("button", { name: "Renew approval" }));
    await waitFor(() => expect(putExtensionRule).toHaveBeenCalledWith(expect.objectContaining({ browser: "edge", extensionId: B, action: "allow" })));

    expect(await screen.findByText("Rules (1)")).toBeInTheDocument();
    expect(screen.getByText("To review (1)")).toBeInTheDocument();
    expect(screen.getByText(/Approval expires on .* Approving again renews it/)).toBeInTheDocument();
  });

  it("una aprobación vigente se queda en Rules, sin botón de renovar", async () => {
    getExtensionRules.mockResolvedValue({
      ok: true, windowsDevices: 5,
      rules: [{ browser: "edge", extensionId: B, action: "allow", name: "Password Vault", expiresAt: "2027-03-20T10:00:00Z", expired: false, status: { applied: 5, pending: 0, failed: 0 } }],
    });
    render(<ExtensionControlPanel canManage notify={() => {}} />);
    expect(await screen.findByText("Rules (1)")).toBeInTheDocument();
    expect(screen.getByText("To review (1)")).toBeInTheDocument();
    expect(screen.getByText("Approved")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Renew approval" })).not.toBeInTheDocument();
  });

  it("deep link ?extension=browser|id (from a finding or an alert) filters and highlights it", async () => {
    window.history.replaceState({}, "", `/?page=patch&pmTab=browsers&extension=edge|${B}`);
    render(<ExtensionControlPanel canManage />);
    expect(await screen.findByText("Password Vault")).toBeInTheDocument();
    expect(screen.queryByText("Coupon Grabber")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Search extensions to control")).toHaveValue(B);
  });
});
