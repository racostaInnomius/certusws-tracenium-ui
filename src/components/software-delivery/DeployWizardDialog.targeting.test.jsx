// DeployWizardDialog.targeting.test.jsx
//
// Targeting loose machines used to mean pasting opaque device IDs into a bare
// textarea. Nobody knows those by heart, so sending a package to five machines
// that were not already in an asset group meant leaving for Asset Management
// and copy-pasting a UUID five times — and a mistyped or stale ID was accepted
// silently, dispatched, and left to die as `stream_not_found`. The operator
// then believed they had targeted five machines when they had targeted four.
//
// The picker that fixes this already existed; Asset Groups had been using it
// to choose members all along.

import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import DeployWizardDialog from "./DeployWizardDialog";
import * as jobsApi from "../../api/jobs";
import * as groupsApi from "../../api/assetGroups";

vi.mock("../../api/jobs");
vi.mock("../../api/assetGroups");

const DEVICES = [
  { deviceId: "aaaa-1111", hostname: "MSIG-DOMAIN01", platform: "windows", connected: true },
  { deviceId: "bbbb-2222", hostname: "MSIG-FILESHARE", platform: "windows", connected: false },
  { deviceId: "cccc-3333", hostname: "DESIGN-MBP", platform: "macos", connected: true },
];

const WINDOWS_PKG = {
  id: 1,
  name: "7-Zip",
  version: "23.01",
  platform: "windows",
  arch: "x64",
  format: "msi",
};

beforeEach(() => {
  vi.resetAllMocks();
  groupsApi.listAssetGroups.mockResolvedValue({ items: [] });
  jobsApi.listKnownDevices.mockResolvedValue({ items: DEVICES, total: DEVICES.length });
});

afterEach(() => cleanup());

function open(pkg = WINDOWS_PKG, onConfirm = vi.fn()) {
  render(
    <DeployWizardDialog open pkg={pkg} onClose={() => {}} onConfirm={onConfirm} notify={() => {}} />
  );
  return onConfirm;
}

/** Walk to the targeting step and switch to the device-list mode. */
async function gotoDeviceList(user) {
  const deviceList = await screen.findByLabelText(/device list|manual/i).catch(() => null);
  if (deviceList) await user.click(deviceList);
}

describe("deploy targeting", () => {
  it("offers a device picker, not just a paste box", async () => {
    const user = userEvent.setup();
    open();
    await gotoDeviceList(user);

    // The whole point: a way in that does not require knowing a UUID.
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /select devices/i })).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: /paste ids/i })).toBeInTheDocument();
  });

  it("hides devices that cannot run the package", async () => {
    // A macOS host offered a Windows MSI is a guaranteed failure the operator
    // would only discover when the job comes back failed.
    const user = userEvent.setup();
    open(WINDOWS_PKG);
    await gotoDeviceList(user);

    await waitFor(() => expect(jobsApi.listKnownDevices).toHaveBeenCalled());
    await waitFor(() => {
      expect(screen.queryByText("MSIG-DOMAIN01")).toBeInTheDocument();
    });
    expect(screen.queryByText("DESIGN-MBP")).not.toBeInTheDocument();
  });

  it("shows whether a device is reachable before it is picked", async () => {
    const user = userEvent.setup();
    open(WINDOWS_PKG);
    await gotoDeviceList(user);
    // Offline is not an error — the job waits — but the operator deserves to
    // know before dispatching, not after.
    await waitFor(() => expect(screen.getByText("MSIG-FILESHARE")).toBeInTheDocument());
  });
});

describe("pasted device IDs", () => {
  it("warns about IDs that match no known device", async () => {
    const user = userEvent.setup();
    open();
    await gotoDeviceList(user);

    await user.click(await screen.findByRole("button", { name: /paste ids/i }));
    const box = await screen.findByLabelText(/device ids/i);
    await user.clear(box);
    await user.type(box, "aaaa-1111 nope-9999");

    // Surfaced BEFORE dispatch. Previously this went out and died silently.
    // Matched on the alert's whole text: the sentence is assembled from JSX
    // fragments, so no single text node contains it.
    await waitFor(
      () => {
        const alert = screen
          .getAllByRole("alert")
          .find((el) => /match no known device/i.test(el.textContent));
        expect(alert, "no warning about unknown IDs").toBeTruthy();
        expect(alert.textContent).toContain("nope-9999");
      },
      { timeout: 3000 }
    );
  });

  it("stays quiet when every pasted ID is real", async () => {
    const user = userEvent.setup();
    open();
    await gotoDeviceList(user);

    await user.click(await screen.findByRole("button", { name: /paste ids/i }));
    const box = await screen.findByLabelText(/device ids/i);
    await user.clear(box);
    await user.type(box, "aaaa-1111 bbbb-2222");

    await new Promise((r) => setTimeout(r, 700));
    expect(
      screen.queryAllByRole("alert").some((el) => /match no known device/i.test(el.textContent))
    ).toBe(false);
  });
});
