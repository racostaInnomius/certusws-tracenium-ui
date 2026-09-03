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
const getDeviceFacets = vi.fn();
const getSessionDetail = vi.fn();
const getSessionFileTransfers = vi.fn();

vi.mock("../api/remoteControl", () => ({
  getRemoteControlSummary: (...a) => getRemoteControlSummary(...a),
  getConnectableDevices: (...a) => getConnectableDevices(...a),
  getDeviceFacets: (...a) => getDeviceFacets(...a),
  getRemoteSessions: (...a) => getRemoteSessions(...a),
  getAllFileTransfers: (...a) => getAllFileTransfers(...a),
  listAccessRequests: (...a) => listAccessRequests(...a),
  getAccessPolicy: (...a) => getAccessPolicy(...a),
  setAccessPolicyCell: vi.fn(async () => ({ ok: true })),
  listPendingApprovals: vi.fn(async () => ({ items: [] })),
  decideApproval: vi.fn(async () => ({ ok: true })),
  startRemoteSession: vi.fn(),
  getSessionTranscript: vi.fn(),
  getSessionDetail: (...a) => getSessionDetail(...a),
  getSessionFileTransfers: (...a) => getSessionFileTransfers(...a)
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
  // total > items so the pager has a second page to move to, and so the KPI
  // fallback correctly reads the list as INCOMPLETE.
  getConnectableDevices.mockResolvedValue({ items: DEVICES, total: 96, page: 1, pageSize: 25 });
  getDeviceFacets.mockResolvedValue({ groups: [], platforms: [] });
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

describe("the history tabs page and filter server-side", () => {
  it("⚠️ asks for a PAGE of sessions, not the newest 50 and stop", async () => {
    // The endpoint used to accept only `limit`, so past the newest 200 rows
    // the audit trail did not exist for this page — and nothing said so. An
    // audit trail that silently truncates is worse than a missing one,
    // because it looks complete.
    render(<RemoteControl />);
    fireEvent.click(screen.getByRole("tab", { name: /Sessions/ }));

    await waitFor(() => expect(getRemoteSessions).toHaveBeenCalled());

    expect(getRemoteSessions.mock.calls[0][0]).toMatchObject({ page: 1, pageSize: 25 });
  });

  it("a session filter reaches the query instead of the browser", async () => {
    getRemoteSessions.mockResolvedValue({ items: [], total: 1240, page: 1, pageSize: 25 });
    render(<RemoteControl />);
    fireEvent.click(screen.getByRole("tab", { name: /Sessions/ }));
    await waitFor(() => expect(getRemoteSessions).toHaveBeenCalled());

    fireEvent.mouseDown(screen.getByText("Any status"));
    fireEvent.click(await screen.findByRole("option", { name: "Failed" }));

    await waitFor(() =>
      expect(getRemoteSessions.mock.calls.at(-1)[0]).toMatchObject({ status: "failed" })
    );
  });

  it("⚠️ the pager reports the server's total, not the rows on screen", async () => {
    // 25 rows out of 1240. Counting what arrived would say "1–25 of 25" and
    // hide 1215 sessions behind a pager that looks finished.
    getRemoteSessions.mockResolvedValue({
      items: [],
      total: 1240,
      page: 1,
      pageSize: 25
    });
    render(<RemoteControl />);
    fireEvent.click(screen.getByRole("tab", { name: /Sessions/ }));

    expect(await screen.findByText(/of 1240 sessions/)).toBeTruthy();
  });

  it("⚠️ the transfer log names the machine, not just the file", async () => {
    // "agent.log was downloaded" is not an audit record; "agent.log was
    // downloaded from SRV-DC01" is. A transfer hangs off its session, so the
    // device was a join away and the table simply never asked for it.
    getAllFileTransfers.mockResolvedValue({
      items: [
        {
          id: 1,
          transferId: "x-1",
          sessionId: "sess-1",
          direction: "download",
          remotePath: "C:\\temp\\agent.log",
          filename: "agent.log",
          sizeBytes: 2048,
          transferredBytes: 2048,
          status: "completed",
          startedAt: "2026-09-01T10:00:00Z",
          endedAt: "2026-09-01T10:00:05Z",
          deviceId: "dev-1",
          hostname: "SRV-DC01"
        }
      ],
      total: 1,
      page: 1,
      pageSize: 25
    });
    render(<RemoteControl />);
    fireEvent.click(screen.getByRole("tab", { name: /File transfers/ }));

    expect(await screen.findByText("SRV-DC01")).toBeTruthy();
  });

  it("falls back to the identifier for a device with no inventory", async () => {
    getAllFileTransfers.mockResolvedValue({
      items: [
        {
          id: 1,
          transferId: "x-1",
          sessionId: "sess-1",
          direction: "upload",
          remotePath: "/tmp/fix.sh",
          filename: "fix.sh",
          sizeBytes: 100,
          transferredBytes: 100,
          status: "completed",
          startedAt: "2026-09-01T10:00:00Z",
          endedAt: null,
          deviceId: "dev-never-reported",
          hostname: null
        }
      ],
      total: 1,
      page: 1,
      pageSize: 25
    });
    render(<RemoteControl />);
    fireEvent.click(screen.getByRole("tab", { name: /File transfers/ }));

    expect(await screen.findByText("dev-never-reported")).toBeTruthy();
  });

  it("transfers page too", async () => {
    getAllFileTransfers.mockResolvedValue({ items: [], total: 300, page: 1, pageSize: 25 });
    render(<RemoteControl />);
    fireEvent.click(screen.getByRole("tab", { name: /File transfers/ }));

    await waitFor(() =>
      expect(getAllFileTransfers.mock.calls[0][0]).toMatchObject({ page: 1, pageSize: 25 })
    );
    expect(await screen.findByText(/of 300 transfers/)).toBeTruthy();
  });
});

describe("the session detail drawer", () => {
  const SESSION = {
    sessionId: "sess-1",
    deviceId: "dev-1",
    hostname: "SRV-DC01",
    operator: "alice@certusitm",
    startedAt: "2026-09-01T10:00:00Z",
    endedAt: "2026-09-01T10:10:00Z",
    durationSec: 600,
    type: "shell",
    status: "completed",
    hasTranscript: true,
    hasRecording: false,
    consentRequired: false,
    consentOutcome: null
  };

  beforeEach(() => {
    getRemoteSessions.mockResolvedValue({
      items: [SESSION],
      total: 1,
      page: 1,
      pageSize: 25
    });
  });

  async function openDrawer() {
    render(<RemoteControl />);
    fireEvent.click(screen.getByRole("tab", { name: /Sessions/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Detail" }));
  }

  it("⚠️ puts the access record in front of the technical fields", async () => {
    // "Was this access legitimate?" used to mean holding a session id in your
    // head and scanning three separate lists for it.
    getSessionDetail.mockResolvedValue({
      ok: true,
      session: {
        ...SESSION,
        closeReason: null,
        accessRecord: {
          requestId: "req-1",
          reason: "User cannot sign in after the update",
          ticketRef: "TCK-4821",
          status: "consumed",
          approvalSource: "ungated",
          approverUserId: null,
          decidedAt: null,
          createdAt: "2026-09-01T09:59:00Z"
        }
      }
    });
    getSessionFileTransfers.mockResolvedValue({ items: [], total: 0 });

    await openDrawer();

    expect(await screen.findByText(/cannot sign in after the update/)).toBeTruthy();
    expect(screen.getByText("TCK-4821")).toBeTruthy();
  });

  it("explains a missing record instead of showing a blank", async () => {
    // Sessions from before ADR-0009 phase 1 have none and were deliberately
    // not backfilled. Rendering an empty box would read as a broken view.
    getSessionDetail.mockResolvedValue({
      ok: true,
      session: { ...SESSION, closeReason: null, accessRecord: null }
    });
    getSessionFileTransfers.mockResolvedValue({ items: [], total: 0 });

    await openDrawer();

    expect(await screen.findByText(/No record for this session/)).toBeTruthy();
  });

  it("lists the files that moved during the session", async () => {
    getSessionDetail.mockResolvedValue({
      ok: true,
      session: { ...SESSION, type: "file", closeReason: null, accessRecord: null }
    });
    getSessionFileTransfers.mockResolvedValue({
      items: [
        {
          id: 1,
          transferId: "x-1",
          direction: "download",
          remotePath: "C:\\temp\\agent.log",
          filename: "agent.log",
          sizeBytes: 2048,
          status: "completed"
        }
      ],
      total: 1
    });

    await openDrawer();

    expect(await screen.findByText("agent.log")).toBeTruthy();
    expect(screen.getByText("2.0 KB")).toBeTruthy();
  });

  it("⚠️ still shows the record when the transfers fail to load", async () => {
    // Two independent requests. Promise.all would lose the access record to
    // whichever of the two failed — and the record is the half that matters.
    getSessionDetail.mockResolvedValue({
      ok: true,
      session: {
        ...SESSION,
        closeReason: null,
        accessRecord: {
          requestId: "req-1",
          reason: "Investigating the failed update",
          ticketRef: "TCK-9",
          status: "consumed",
          approvalSource: "ungated",
          approverUserId: null,
          decidedAt: null,
          createdAt: null
        }
      }
    });
    getSessionFileTransfers.mockRejectedValue(new Error("boom"));

    await openDrawer();

    expect(await screen.findByText(/Investigating the failed update/)).toBeTruthy();
  });

  it("surfaces why a session died when the reason isn't about consent", async () => {
    getSessionDetail.mockResolvedValue({
      ok: true,
      session: {
        ...SESSION,
        status: "failed",
        closeReason: "handshake_timeout",
        accessRecord: null
      }
    });
    getSessionFileTransfers.mockResolvedValue({ items: [], total: 0 });

    await openDrawer();

    expect(await screen.findByText("handshake_timeout")).toBeTruthy();
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

  it("⚠️ falls back to counting locally against a backend a version behind", async () => {
    // The portal and the API deploy separately. An older backend ignores the
    // paging parameters and returns the WHOLE fleet with no `total` — which
    // is a list the browser can legitimately count. Without this the new
    // bundle would render "—" over a table full of devices.
    getRemoteControlSummary.mockResolvedValue({
      summary: { connectableDevices: 214, activeSessions: 0, sessionsLast7d: 0 }
    });
    getConnectableDevices.mockResolvedValue({ items: DEVICES });
    render(<RemoteControl />);

    await screen.findByText("Ready now");
    // Derived from the fixture: 3 devices advertise a capability, 2 online.
    expect(screen.getByText(/4 devices in the fleet/)).toBeTruthy();
    expect(screen.getByText(/\/ 3/)).toBeTruthy();
  });

  it("⚠️ shows nothing rather than counting a PAGE and calling it the fleet", async () => {
    // A new backend that pages but whose /summary failed. Counting the 4 rows
    // on screen would report a fleet of 4 against one of 214 — the same class
    // of lie the whole phase exists to remove, just smaller.
    getRemoteControlSummary.mockResolvedValue({ summary: { activeSessions: 0 } });
    render(<RemoteControl />);

    await screen.findByText("Ready now");
    expect(screen.getByText(/fleet totals unavailable/)).toBeTruthy();
    // No invented total, and no count of the 4 rows on screen either.
    expect(screen.queryByText(/devices in the fleet/)).toBeNull();
    expect(screen.queryByText(/\/ 3/)).toBeNull();
  });
});

describe("the device table", () => {
  it("⚠️ asks the SERVER to filter, instead of downloading the fleet", async () => {
    // This is the phase-3 contract. The previous version pulled every device
    // and ran Array.filter in the browser, which is what stops working at a
    // thousand machines.
    render(<RemoteControl />);

    await waitFor(() => expect(getConnectableDevices).toHaveBeenCalled());

    const params = getConnectableDevices.mock.calls[0][0];
    expect(params).toMatchObject({
      page: 1,
      pageSize: 25,
      rcpOnly: "true",
      onlineOnly: "true"
    });
  });

  it("counts the hidden devices from the fleet totals, not from the rows", async () => {
    // With a paged list the rows on screen cannot answer "how many devices
    // have no remote control" — 214 in the fleet minus 96 capable is 118,
    // and none of that is visible in the 4 rows the page holds.
    render(<RemoteControl />);
    expect(await screen.findByText(/Show the 118 without remote control/)).toBeTruthy();
  });

  it("writes macOS the way Apple writes it", async () => {
    // CSS `text-transform: capitalize` over the raw platform rendered
    // "macos" as "Macos".
    render(<RemoteControl />);
    expect(await screen.findByText("macOS")).toBeTruthy();
    expect(screen.queryByText("Macos")).toBeNull();
  });

  it("one click re-asks the server without the remote-control filter", async () => {
    render(<RemoteControl />);
    await screen.findByText(/Show the 118 without remote control/);

    fireEvent.click(screen.getByText(/Show the 118 without remote control/));

    await waitFor(() => {
      const last = getConnectableDevices.mock.calls.at(-1)[0];
      expect(last.rcpOnly).toBeUndefined();
    });
  });

  it("⚠️ a filter change goes back to page 1", async () => {
    // Staying on page 4 after narrowing to two results shows an empty table,
    // which reads as "nothing matched" when something did.
    render(<RemoteControl />);
    await screen.findByText("SRV-DC01");

    fireEvent.click(screen.getByRole("button", { name: /Next page/ }));
    await waitFor(() => expect(getConnectableDevices.mock.calls.at(-1)[0].page).toBe(2));

    fireEvent.click(screen.getByText(/Online only/));

    await waitFor(() => expect(getConnectableDevices.mock.calls.at(-1)[0].page).toBe(1));
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
