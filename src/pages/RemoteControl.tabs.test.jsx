// src/pages/RemoteControl.tabs.test.jsx
//
// ⚠️ This file guards the only thing that makes the tabs worth building.
//
// The page used to fetch its four datasets at once, in a single
// Promise.allSettled under one cache key. Tabs laid on top of that would
// have been pure decoration: opening the page to run one command would
// still have downloaded the whole session history and the entire
// file-transfer log.
//
// The split is invisible — nothing on screen tells you whether the data was
// fetched — so it is exactly the kind of change that gets undone by a later
// "let's just load it all in the page and pass it down" refactor. These
// tests fail loudly when that happens.

import React from "react";
import { render, screen, waitFor, fireEvent, cleanup } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const getRemoteControlSummary = vi.fn();
const getConnectableDevices = vi.fn();
const getRemoteSessions = vi.fn();
const getAllFileTransfers = vi.fn();
const listAccessRequests = vi.fn();
const getAccessPolicy = vi.fn();

vi.mock("../api/remoteControl", () => ({
  getRemoteControlSummary: (...a) => getRemoteControlSummary(...a),
  getConnectableDevices: (...a) => getConnectableDevices(...a),
  getRemoteSessions: (...a) => getRemoteSessions(...a),
  getAllFileTransfers: (...a) => getAllFileTransfers(...a),
  listAccessRequests: (...a) => listAccessRequests(...a),
  getAccessPolicy: (...a) => getAccessPolicy(...a),
  setAccessPolicyCell: vi.fn(async () => ({ ok: true })),
  listPendingApprovals: vi.fn(async () => ({ items: [] })),
  decideApproval: vi.fn(async () => ({ ok: true })),
  startRemoteSession: vi.fn(),
  getSessionTranscript: vi.fn(),
  getSessionFileTransfers: vi.fn()
}));

import RemoteControl from "./RemoteControl";
import { clearCachedFetch } from "../hooks/useCachedFetch";

// The device shape is the one fetchConnectableDevices() returns.
// Four devices, one per case the table has to tell apart: online with some
// capabilities, online with all of them, offline, and no plugin at all.
const DEVICES = [
  {
    deviceId: "dev-online-shell",
    hostname: "SRV-DC01",
    platform: "windows",
    agentVersion: "1.1.57",
    online: true,
    rcpEnabled: true,
    capabilities: ["rcp", "rcp.shell", "rcp.file"]
  },
  {
    deviceId: "dev-online-all",
    hostname: "LPT-0417",
    platform: "macos",
    agentVersion: "1.1.57",
    online: true,
    rcpEnabled: true,
    capabilities: ["rcp", "rcp.shell", "rcp.file", "rcp.screen"]
  },
  {
    deviceId: "dev-offline",
    hostname: "SUC-CLO-009",
    platform: "linux",
    agentVersion: "1.1.35",
    online: false,
    rcpEnabled: true,
    capabilities: ["rcp", "rcp.shell"]
  },
  {
    deviceId: "dev-no-plugin",
    hostname: "OLD-BOX",
    platform: "linux",
    agentVersion: "1.1.20",
    online: true,
    rcpEnabled: false,
    capabilities: []
  }
];

afterEach(() => cleanup());

beforeEach(() => {
  vi.clearAllMocks();
  // useCachedFetch persists across renders within a file. Without this, the
  // second test would be served from the first test's cache and the loader
  // would never run — the assertions would pass for the wrong reason.
  clearCachedFetch();
  // The device counts are deliberately unreachable from the 4-device fixture
  // below, so any test that passes by counting locally instead of reading the
  // server's numbers shows up immediately.
  getRemoteControlSummary.mockResolvedValue({
    summary: {
      connectableDevices: 214,
      readyNow: 38,
      rcpCapable: 96,
      fleetTotal: 214,
      activeSessions: 2,
      sessionsLast7d: 31,
      avgDurationSec: 480,
      deniedByUser7d: 3
    }
  });
  getConnectableDevices.mockResolvedValue({ items: DEVICES });
  getRemoteSessions.mockResolvedValue({ items: [], total: 0 });
  getAllFileTransfers.mockResolvedValue({ items: [], total: 0 });
  listAccessRequests.mockResolvedValue({ items: [] });
  getAccessPolicy.mockResolvedValue({ items: [] });
});

describe("lazy loading per tab", () => {
  it("⚠️ opening the page does NOT fetch history or transfers", async () => {
    render(<RemoteControl />);

    await waitFor(() => expect(getConnectableDevices).toHaveBeenCalled());

    // This is the whole point of the refactor. If either of these fires on
    // mount, the tabs are decoration again.
    expect(getRemoteSessions).not.toHaveBeenCalled();
    expect(getAllFileTransfers).not.toHaveBeenCalled();
    expect(listAccessRequests).not.toHaveBeenCalled();
  });

  it("history is fetched when — and only when — its tab is opened", async () => {
    render(<RemoteControl />);
    await waitFor(() => expect(getConnectableDevices).toHaveBeenCalled());

    fireEvent.click(screen.getByRole("tab", { name: /Sessions/ }));

    await waitFor(() => expect(getRemoteSessions).toHaveBeenCalled());
    expect(getAllFileTransfers).not.toHaveBeenCalled();
  });

  it("file transfers are fetched when their tab is opened", async () => {
    render(<RemoteControl />);
    await waitFor(() => expect(getConnectableDevices).toHaveBeenCalled());

    fireEvent.click(screen.getByRole("tab", { name: /File transfers/ }));

    await waitFor(() => expect(getAllFileTransfers).toHaveBeenCalled());
  });

  it("the access record is only read from the Access tab", async () => {
    render(<RemoteControl />);
    await waitFor(() => expect(getConnectableDevices).toHaveBeenCalled());

    fireEvent.click(screen.getByRole("tab", { name: /Access/ }));

    await waitFor(() => expect(listAccessRequests).toHaveBeenCalled());
    await waitFor(() => expect(getAccessPolicy).toHaveBeenCalled());
  });
});

describe("the KPI strip", () => {
  it("⚠️ reads the server's three numbers instead of the legacy field", async () => {
    // connectableDevices counts EVERY active enrolment with no capability
    // filter, and the old card labelled that 214 "with rcp enabled". The
    // fleet size is still worth showing — as the fleet size, in the subtitle
    // — while the headline is what can actually be worked on right now.
    render(<RemoteControl />);

    await screen.findByText("Ready now");
    expect(screen.getByText("38")).toBeTruthy();
    expect(screen.getByText(/\/ 96/)).toBeTruthy();
    expect(screen.getByText(/214 devices in the fleet/)).toBeTruthy();
  });

  it("shows how many sessions the endpoint user refused", async () => {
    // ADR-0012's number. It appeared on no screen at all before this.
    render(<RemoteControl />);
    expect(await screen.findByText(/3 refused by the user/)).toBeTruthy();
  });

  it("stays silent about refusals when there are none", async () => {
    // With consent switched off this is always zero, and a permanent
    // "0 refused" reads as reassurance about a question nobody asked.
    getRemoteControlSummary.mockResolvedValue({
      summary: { readyNow: 1, rcpCapable: 1, fleetTotal: 1, sessionsLast7d: 4, deniedByUser7d: 0 }
    });
    render(<RemoteControl />);

    await screen.findByText("Last 7 days");
    expect(screen.queryByText(/refused by the user/)).toBeNull();
  });

  it("⚠️ falls back to counting locally when the backend is a version behind", async () => {
    // The portal and the API deploy separately. Without the fallback the new
    // bundle renders "0 / 0 · 0 devices" over a table full of devices — a
    // fresh lie in place of the one being removed.
    getRemoteControlSummary.mockResolvedValue({
      summary: { connectableDevices: 214, activeSessions: 0, sessionsLast7d: 0 }
    });
    render(<RemoteControl />);

    await screen.findByText("Ready now");
    // Derived from the fixture: 3 devices advertise a capability, 2 online.
    expect(screen.getByText(/4 devices in the fleet/)).toBeTruthy();
    expect(screen.getByText(/\/ 3/)).toBeTruthy();
  });
});

describe("the device table", () => {
  it("hides devices whose agent offers no remote control, and says how many", async () => {
    render(<RemoteControl />);

    await screen.findByText("SRV-DC01");
    expect(screen.queryByText("OLD-BOX")).toBeNull();
    // ⚠️ The arithmetic has to add up. Two filters ship on — "online only"
    // and "without remote control" — so of the 4 fixtures, 2 show, 1 is
    // offline and 1 has no plugin. A footer that only counted one of the two
    // reasons said "2 shown · 1 hidden" out of 4, which is the "where is my
    // device?" the counter exists to prevent.
    expect(screen.getByText(/2 of 4 devices shown · 2 hidden by the filters above/)).toBeTruthy();
  });

  it("writes macOS the way Apple writes it", async () => {
    // CSS `text-transform: capitalize` over the raw platform rendered
    // "macos" as "Macos".
    render(<RemoteControl />);
    expect(await screen.findByText("macOS")).toBeTruthy();
    expect(screen.queryByText("Macos")).toBeNull();
  });

  it("one click brings the hidden ones back", async () => {
    render(<RemoteControl />);
    await screen.findByText("SRV-DC01");

    fireEvent.click(screen.getByText(/Show the 1 without remote control/));

    expect(await screen.findByText("OLD-BOX")).toBeTruthy();
  });

  it("names the actions instead of showing three bare icons", async () => {
    render(<RemoteControl />);
    await screen.findByText("SRV-DC01");

    expect(screen.getByRole("button", { name: /Console on SRV-DC01/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Files on SRV-DC01/ })).toBeTruthy();
    // Advertises rcp.shell and rcp.file but not rcp.screen — the button is
    // there and disabled, rather than absent.
    expect(screen.getByRole("button", { name: /Screen on SRV-DC01/ })).toBeDisabled();
  });
});
