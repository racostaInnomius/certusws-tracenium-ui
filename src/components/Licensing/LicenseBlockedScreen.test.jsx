import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { acceptLicenseAdjustment } = vi.hoisted(() => ({
  acceptLicenseAdjustment: vi.fn(),
}));
vi.mock("../../api/licensing", () => ({ acceptLicenseAdjustment }));

import LicenseBlockedScreen from "./LicenseBlockedScreen";

// This project does not run vitest with `globals: true`, so RTL's
// auto-cleanup never registers.
afterEach(cleanup);

// Deliberately NO beforeEach resetting/clearing this mock. Doing either
// makes vitest report the rejections below as unhandled errors — the
// component catches them, the resulting UI is asserted, and the test
// still fails. Bisected down to the reset itself: clearing the mock
// detaches the bookkeeping vitest uses to consider a returned rejected
// promise handled. Every test sets its own implementation, and nothing
// here asserts on call counts, so the isolation costs nothing.

// The API layer rejects with Error objects carrying a `status`, so the
// fakes do too. Rejecting with a bare object makes vitest report the
// value as an unhandled error instead of letting the component's catch
// own it.
const rejectWith = ({ status, message }) =>
  acceptLicenseAdjustment.mockImplementation(() => {
    const err = new Error(message || `HTTP ${status}`);
    err.status = status;
    return Promise.reject(err);
  });

const state = {
  used: 57,
  maxDevices: 50,
  consoleBlocked: true,
  adjustment: {
    id: 7,
    fleetAtDetection: 57,
    previousMaxDevices: 50,
    proposedMaxDevices: 57,
    detectedAt: "2026-08-17T00:00:00Z",
    dueAt: "2026-08-19T00:00:00Z",
    status: "expired",
  },
};

describe("both doors out are present", () => {
  it("offers accepting the new count and going to device management", () => {
    // D6: a lock whose only key is behind the lock is a support ticket.
    render(<LicenseBlockedScreen state={state} />);
    expect(screen.getByRole("button", { name: /set my licenses to 57/i })).toBeEnabled();
    expect(screen.getByRole("button", { name: /manage devices/i })).toBeEnabled();
  });

  it("routes the second door to the device list", async () => {
    const onNavigate = vi.fn();
    render(<LicenseBlockedScreen state={state} onNavigate={onNavigate} />);
    await userEvent.click(screen.getByRole("button", { name: /manage devices/i }));
    expect(onNavigate).toHaveBeenCalledWith("assets");
  });

  it("says removing devices unlocks the console on its own", () => {
    // Otherwise an operator assumes they must come back and click accept,
    // which is the opposite of what we want them to learn.
    render(<LicenseBlockedScreen state={state} />);
    expect(screen.getByText(/unlocks as soon as you do/i)).toBeInTheDocument();
  });
});

describe("it does not overstate what happened", () => {
  it("says the endpoints are still managed", () => {
    // The console is paused; nothing was turned off on the devices. A
    // customer reading this must not think their fleet lost protection.
    render(<LicenseBlockedScreen state={state} />);
    expect(screen.getByText(/still managed and still reporting/i)).toBeInTheDocument();
  });

  it("does not claim a payment was or will be taken", () => {
    render(<LicenseBlockedScreen state={state} />);
    expect(screen.getByText(/no payment is taken here/i)).toBeInTheDocument();
  });
});

describe("accepting", () => {
  it("reports resolution to the shell so the console reopens", async () => {
    acceptLicenseAdjustment.mockResolvedValue({ ok: true, maxDevices: 57 });
    const onResolved = vi.fn();
    render(<LicenseBlockedScreen state={state} onResolved={onResolved} />);

    await userEvent.click(screen.getByRole("button", { name: /set my licenses to 57/i }));
    await waitFor(() => expect(onResolved).toHaveBeenCalled());
    expect(acceptLicenseAdjustment).toHaveBeenCalledWith(7);
  });

  it("treats an already-answered adjustment as success, not an error", async () => {
    // 409 means the other admin accepted, or devices were removed. Showing
    // a red error to someone whose problem is already solved is nonsense.
    rejectWith({ status: 409 });
    const onResolved = vi.fn();
    render(<LicenseBlockedScreen state={state} onResolved={onResolved} />);

    await userEvent.click(screen.getByRole("button", { name: /set my licenses/i }));
    await waitFor(() => expect(onResolved).toHaveBeenCalled());
  });

  it("explains a 403 instead of showing a generic failure", async () => {
    // The server is the single authority on who may change billing; the
    // UI does not duplicate that rule, it reports the refusal.
    rejectWith({ status: 403 });
    render(<LicenseBlockedScreen state={state} />);

    await userEvent.click(screen.getByRole("button", { name: /set my licenses/i }));
    expect(
      await screen.findByText(/requires an administrator or owner/i)
    ).toBeInTheDocument();
  });

  it("surfaces a real failure and leaves the operator able to retry", async () => {
    rejectWith({ status: 500, message: "boom" });
    const onResolved = vi.fn();
    render(<LicenseBlockedScreen state={state} />);

    await userEvent.click(screen.getByRole("button", { name: /set my licenses/i }));
    expect(await screen.findByText("boom")).toBeInTheDocument();
    expect(onResolved).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /set my licenses/i })).toBeEnabled();
  });
});
