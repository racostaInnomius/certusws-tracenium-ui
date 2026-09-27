// src/components/Compliance/AppliedFixesSection.test.jsx
//
// «Fixes applied from Tracenium»: ver qué cambió Tracenium en un equipo y
// deshacerlo. 27-sep: «necesitamos poder revertir un fix … en caso de que el
// equipo presente alguna afectación con otro servicio».

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup, within } from "@testing-library/react";

vi.mock("../../api/patchManagement", () => ({
  getAppliedFixes: vi.fn(),
  revertRemediationResult: vi.fn(),
}));
import { getAppliedFixes, revertRemediationResult } from "../../api/patchManagement";
import AppliedFixesSection, { showValue } from "./AppliedFixesSection";

const KEY = "HKLM\\SOFTWARE\\Policies\\Google\\Chrome:HistorySearchSettings";
const fix = (over = {}) => ({
  resultId: 501,
  remediationId: 90,
  checkId: "chrome.history",
  title: "History search must be disabled",
  handlerId: "windows.registry.set_value",
  outcome: "applied",
  appliedAt: "2026-09-25T10:00:00.000Z",
  appliedBy: "op@x",
  revertible: true,
  reason: null,
  kind: "generic",
  changes: [{ target: KEY, restore: null, fixValue: 2 }],
  warnings: [],
  requiresReboot: false,
  reverted: null,
  inFlight: null,
  lastCheck: null,
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  revertRemediationResult.mockResolvedValue({ ok: true, remediation: { id: 91 } });
});
afterEach(cleanup);

const open = async (props = {}) => {
  render(<AppliedFixesSection agentId="d1" canRevert onToast={vi.fn()} {...props} />);
  fireEvent.click(await screen.findByRole("button", { name: /Fixes applied from Tracenium/ }));
};

describe("AppliedFixesSection", () => {
  it("⭐ lista lo que Tracenium cambió, con quién y cuándo, y ofrece comprobar y revertir", async () => {
    getAppliedFixes.mockResolvedValue({ ok: true, items: [fix()] });
    await open();
    expect(screen.getByRole("button", { name: /Fixes applied from Tracenium \(1\)/ })).toBeInTheDocument();
    const row = screen.getByTestId("applied-fix-501");
    expect(within(row).getByText("History search must be disabled")).toBeInTheDocument();
    expect(within(row).getByText(/op@x · #90/)).toBeInTheDocument();
    expect(within(row).getByRole("button", { name: "Check device" })).toBeEnabled();
    expect(within(row).getByRole("button", { name: /Revert…/ })).toBeEnabled();
  });

  it("«Check device» manda la comprobación (dry_run), no el revert", async () => {
    getAppliedFixes.mockResolvedValue({ ok: true, items: [fix()] });
    await open();
    fireEvent.click(screen.getByRole("button", { name: "Check device" }));
    await waitFor(() => expect(revertRemediationResult).toHaveBeenCalledWith(501, "dry_run"));
  });

  it("⭐ «Revert…» confirma con lo que se restaura y lo que el fix puso, y avisa de la deriva", async () => {
    getAppliedFixes.mockResolvedValue({
      ok: true,
      items: [fix({ lastCheck: { remediationId: 92, outcome: "dryrun_would_apply", at: "2026-09-26T10:00:00Z", drift: [{ target: KEY, fixValue: 2, now: 3 }] } })],
    });
    await open();
    expect(screen.getByTestId("revert-drift")).toHaveTextContent(/fix set 2, now 3/);
    fireEvent.click(screen.getByRole("button", { name: /Revert…/ }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(KEY)).toBeInTheDocument();
    expect(within(dialog).getByText("not set")).toBeInTheDocument(); // restaura: no existía
    expect(within(dialog).getByText(/Someone changed this after the fix/)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Revert fix" }));
    await waitFor(() => expect(revertRemediationResult).toHaveBeenCalledWith(501, "apply"));
  });

  it("lo que no se puede revertir dice por qué y no ofrece botones", async () => {
    getAppliedFixes.mockResolvedValue({
      ok: true,
      items: [fix({ revertible: false, reason: "This device's agent does not support revert yet." })],
    });
    await open();
    expect(screen.getByText(/does not support revert yet/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Revert…/ })).toBeNull();
  });

  it("sin permiso para remediar se ve la lista pero no se puede revertir", async () => {
    getAppliedFixes.mockResolvedValue({ ok: true, items: [fix()] });
    render(<AppliedFixesSection agentId="d1" canRevert={false} />);
    fireEvent.click(await screen.findByRole("button", { name: /Fixes applied from Tracenium/ }));
    expect(screen.queryByRole("button", { name: "Check device" })).toBeNull();
  });

  it("un fix ya revertido lo dice y no se puede revertir otra vez", async () => {
    getAppliedFixes.mockResolvedValue({ ok: true, items: [fix({ reverted: { remediationId: 93, outcome: "applied", at: "2026-09-26T11:00:00Z", by: "op@x" } })] });
    await open();
    expect(screen.getByText(/^Reverted/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Revert…/ })).toBeNull();
  });

  it("⭐ cuando un revert en curso termina, la ficha se recarga (el hallazgo se reabre)", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const onChanged = vi.fn();
    getAppliedFixes
      .mockResolvedValueOnce({ ok: true, items: [fix({ inFlight: { remediationId: 94, mode: "apply" } })] })
      .mockResolvedValue({ ok: true, items: [fix({ reverted: { remediationId: 94, outcome: "applied", at: null, by: null } })] });
    render(<AppliedFixesSection agentId="d1" canRevert onChanged={onChanged} />);
    expect(await screen.findByText("Reverting…", {}, { timeout: 2000 }).catch(() => null)).toBeDefined();
    await vi.advanceTimersByTimeAsync(5100);
    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
    vi.useRealTimers();
  });

  it("showValue: null es «not set», listas y booleanos legibles", () => {
    expect(showValue(null)).toBe("not set");
    expect(showValue([])).toBe("(empty)");
    expect(showValue(["a", "b"])).toBe("a, b");
    expect(showValue(false)).toBe("off");
    expect(showValue(0)).toBe("0");
  });
});
