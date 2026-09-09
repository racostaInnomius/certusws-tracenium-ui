// src/components/patch-management/gateway/GatewayDialog.floors.test.jsx
//
// The datastore floors, end to end through the form.
//
// The one that matters is the `0` case. `Number(x) || default` — the idiom every
// other numeric field in this dialog uses — silently turns a deliberate 0 into
// the default, so "turn this floor off" would save as "10%" and the operator
// would never be told. That is the same class of bug as the one that created
// these fields: a value quietly rewritten between what was typed and what runs.

import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import GatewayDialog from "./GatewayDialog";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const GATEWAY = {
  id: 1,
  name: "MSIG-vCenter-Gateway",
  deviceId: "eb40471c-763e-4151-9285-c97ece893179",
  vcenterUrl: "https://10.130.130.3",
  vcenterPort: 443,
  tlsThumbprintSha256: "62a20ae2d752fc78934a1134f3b4ecc31914899a6b9cd8ce72279808e15c337d",
  credentialRef: "vcenter/default",
  scope: { folders: [] },
  snapshot: { quiesce: true, memory: false, retentionHours: 24, maxConcurrent: 5, perVmTimeoutSec: 900 },
};

const floorField = (label) => screen.getByLabelText(label);
const PCT = "Minimum datastore free (%)";
const GIB = "Minimum datastore free (GiB)";

describe("GatewayDialog — datastore floors", () => {
  it("offers the calibrated defaults on a new gateway, and explains them", async () => {
    render(<GatewayDialog open onClose={() => {}} onSave={vi.fn()} />);
    expect(floorField(PCT)).toHaveValue(10);
    expect(floorField(GIB)).toHaveValue(10);
    const note = await screen.findByTestId("capacity-floors-note");
    expect(note).toHaveTextContent("at least 10% of the datastore free");
    expect(note).toHaveTextContent("at least 10 GiB free");
  });

  it("shows what an existing gateway is actually configured with", () => {
    render(
      <GatewayDialog
        open
        onClose={() => {}}
        onSave={vi.fn()}
        gateway={{ ...GATEWAY, snapshot: { ...GATEWAY.snapshot, minFreePercent: 5, minFreeGiB: 200 } }}
      />
    );
    expect(floorField(PCT)).toHaveValue(5);
    expect(floorField(GIB)).toHaveValue(200);
  });

  it("falls back to the defaults for a gateway saved before these fields existed", () => {
    render(<GatewayDialog open onClose={() => {}} onSave={vi.fn()} gateway={GATEWAY} />);
    expect(floorField(PCT)).toHaveValue(10);
    expect(floorField(GIB)).toHaveValue(10);
  });

  it("⭐ saves a deliberate 0 as 0, not as the default", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<GatewayDialog open onClose={() => {}} onSave={onSave} gateway={GATEWAY} />);

    await user.clear(floorField(PCT));
    await user.type(floorField(PCT), "0");
    await user.clear(floorField(GIB));
    await user.type(floorField(GIB), "0");

    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave.mock.calls[0][0].snapshot).toMatchObject({ minFreePercent: 0, minFreeGiB: 0 });
  });

  it("⭐ warns, before saving, that zeroing both floors removes the check entirely", async () => {
    const user = userEvent.setup();
    render(<GatewayDialog open onClose={() => {}} onSave={vi.fn()} gateway={GATEWAY} />);

    await user.clear(floorField(PCT));
    await user.type(floorField(PCT), "0");
    await user.clear(floorField(GIB));
    await user.type(floorField(GIB), "0");

    const note = screen.getByTestId("capacity-floors-note");
    expect(note).toHaveTextContent("No capacity check");
    expect(note).toHaveTextContent("wedge the VM");
  });

  it("clamps a percentage above half the datastore on the way out", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<GatewayDialog open onClose={() => {}} onSave={onSave} gateway={GATEWAY} />);

    await user.clear(floorField(PCT));
    await user.type(floorField(PCT), "90");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave.mock.calls[0][0].snapshot.minFreePercent).toBe(50);
  });

  it("leaves the other snapshot settings alone", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<GatewayDialog open onClose={() => {}} onSave={onSave} gateway={GATEWAY} />);

    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave.mock.calls[0][0].snapshot).toMatchObject({
      quiesce: true,
      memory: false,
      retentionHours: 24,
      maxConcurrent: 5,
      perVmTimeoutSec: 900,
    });
  });
});
