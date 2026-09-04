// src/components/RemoteControl/StartSessionWizard.test.jsx
//
// ⚠️ The wizard shipped to production with a ReferenceError on step 2.
//
// The device hook is destructured as `{ devices: eligible }`, and step 2 read
// `devices.length` — a binding that does not exist in that scope. Every render
// of that step threw, the route ErrorBoundary replaced the whole Remote
// Control page, and the wizard never opened. It survived review, a full test
// run and a deploy because of one detail worth stating out loud:
//
//     {loading && devices.length === 0 ? ...}
//
// `&&` short-circuits. With `loading` false the dead identifier is never
// evaluated and the step renders fine. The crash needs the query to be IN
// FLIGHT — which in production it always is, because picking a method changes
// the capability filter and therefore the cache key.
//
// So these tests hold the device request open on purpose. A version of this
// file that lets the promise resolve first would pass against the broken code
// and prove nothing.

import React from "react";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const getConnectableDevices = vi.fn();

vi.mock("../../api/remoteControl", () => ({
  getConnectableDevices: (...a) => getConnectableDevices(...a)
}));

import { clearCachedFetch } from "../../hooks/useCachedFetch";
import StartSessionWizard from "./StartSessionWizard";

const DEVICES = [
  {
    deviceId: "dev-online-shell",
    hostname: "SRV-DC01",
    platform: "windows",
    agentVersion: "1.1.59",
    online: true,
    rcpEnabled: true,
    capabilities: ["rcp", "rcp.shell", "rcp.file"]
  },
  {
    deviceId: "dev-online-all",
    hostname: "LPT-0417",
    platform: "macos",
    agentVersion: "1.1.59",
    online: true,
    rcpEnabled: true,
    capabilities: ["rcp", "rcp.shell", "rcp.file", "rcp.screen"]
  }
];

afterEach(() => cleanup());

beforeEach(() => {
  vi.clearAllMocks();
  clearCachedFetch();
  getConnectableDevices.mockResolvedValue({ items: DEVICES, total: DEVICES.length });
});

/** Hold every device request open, so the component can be caught mid-flight. */
function parkRequests() {
  getConnectableDevices.mockImplementation(() => new Promise(() => {}));
}

function openAndPickShell() {
  render(<StartSessionWizard open onClose={vi.fn()} onConfirm={vi.fn()} />);
  // "Run commands" is the operator-facing label of the shell method; the
  // wizard deliberately never shows "rcp.shell" as the thing you click.
  fireEvent.click(screen.getByRole("button", { name: /Run commands/i }));
}

describe("StartSessionWizard · step 2", () => {
  it("⚠️ renders while the device query is still in flight", () => {
    parkRequests();

    // The regression. Against the broken version this throws a ReferenceError
    // out of the click, because the step re-renders with loading === true.
    expect(() => openAndPickShell()).not.toThrow();

    // The spinner is the branch that carried the bad identifier: it is what
    // step 2 shows when it has asked for devices and has none yet.
    expect(screen.getByRole("progressbar")).toBeTruthy();
  });

  it("asks the server for the chosen capability, not the whole fleet", async () => {
    openAndPickShell();

    // The point of picking the intent first: the list arrives filtered by the
    // server. An Array.filter over an unfiltered page would break at 1000
    // devices, which is why this assertion is on the request, not the DOM.
    await waitFor(() =>
      expect(getConnectableDevices).toHaveBeenCalledWith(
        expect.objectContaining({ capability: "rcp.shell", onlineOnly: "true" })
      )
    );
  });

  it("replaces the spinner with the devices once they arrive", async () => {
    openAndPickShell();

    await waitFor(() => expect(screen.getByText("SRV-DC01")).toBeTruthy());
    expect(screen.getByText("LPT-0417")).toBeTruthy();
    expect(screen.queryByRole("progressbar")).toBeNull();
  });

  it("advances to the access record when a device is picked", async () => {
    openAndPickShell();

    await waitFor(() => expect(screen.getByText("SRV-DC01")).toBeTruthy());
    fireEvent.click(screen.getByText("SRV-DC01"));

    // Step 3 is the ADR-0009 phase 1 record — reason and ticket. Reaching it
    // is what makes the wizard a way to start a session rather than a menu.
    await waitFor(() => expect(screen.getByText(/Reason and ticket/i)).toBeTruthy());
  });
});
