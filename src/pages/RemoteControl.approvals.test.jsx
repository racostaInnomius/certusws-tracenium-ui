// src/pages/RemoteControl.approvals.test.jsx
//
// ADR-0009 phase 2 — the approval queue and the policy matrix.
//
// ⚠️ Why this file exists: the page smoke test mounts RemoteControl and
// checks it doesn't blow up, but the queue returns `null` when nothing is
// pending and the matrix now lives in a tab that isn't the default one — so
// the smoke test renders NONE of this. Without these tests, two components
// that govern granting root would be covered by the build alone.
//
// It couldn't be tested against a real backend (the UI needs an OIDC session
// and there's no stack up here), so it tests what can be tested: that they
// render the right thing and that the actions call the API with the right
// arguments.

import React from "react";
import { render, screen, waitFor, fireEvent, cleanup } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const listPendingApprovals = vi.fn();
const decideApproval = vi.fn();
const getAccessPolicy = vi.fn();
const setAccessPolicyCell = vi.fn();

vi.mock("../api/remoteControl", () => ({
  listPendingApprovals: (...a) => listPendingApprovals(...a),
  decideApproval: (...a) => decideApproval(...a),
  getAccessPolicy: (...a) => getAccessPolicy(...a),
  setAccessPolicyCell: (...a) => setAccessPolicyCell(...a),
  // The whole module is mocked, so everything the page imports has to be
  // returned even if these tests don't use it.
  getRemoteControlSummary: vi.fn(async () => ({})),
  getConnectableDevices: vi.fn(async () => ({ items: [] })),
  getRemoteSessions: vi.fn(async () => ({ items: [] })),
  getAllFileTransfers: vi.fn(async () => ({ items: [] })),
  startRemoteSession: vi.fn(),
  getSessionTranscript: vi.fn(),
  getSessionFileTransfers: vi.fn(),
  listAccessRequests: vi.fn(async () => ({ items: [] }))
}));

import { ApprovalQueue } from "./RemoteControl";
import AccessPolicyMatrix from "../components/common/AccessPolicyMatrix";

const pending = {
  requestId: "req-abc-123",
  deviceId: "SRV-DC01",
  operatorUserId: "operator@customer.com",
  capability: "rcp.shell",
  reason: "User cannot sign in after the update",
  ticketRef: "TCK-4821",
  createdAt: "2026-09-01T10:00:00Z",
  expiresAt: "2026-09-01T11:00:00Z"
};

// Without this one test's DOM stacks on top of the next and `findByRole`
// finds two "Approve" buttons — the project doesn't configure auto-cleanup.
afterEach(() => cleanup());

beforeEach(() => {
  vi.clearAllMocks();
  listPendingApprovals.mockResolvedValue({ items: [] });
  getAccessPolicy.mockResolvedValue({ items: [] });
  decideApproval.mockResolvedValue({ ok: true });
  setAccessPolicyCell.mockResolvedValue({ ok: true });
});

describe("ApprovalQueue", () => {
  it("renders nothing when there is nothing pending", async () => {
    const { container } = render(<ApprovalQueue refreshNonce={0} notify={vi.fn()} />);
    await waitFor(() => expect(listPendingApprovals).toHaveBeenCalled());
    // A permanently empty panel on the most-used screen turns invisible
    // within a week, and then it fails to warn on the day there is something.
    expect(container.firstChild).toBeNull();
  });

  it("⚠️ shows the WHOLE record, not just an identifier", async () => {
    // Approving is granting root to another person for a window of time.
    // Whoever approves without seeing who, to which device, why and under
    // which ticket isn't approving: they're signing.
    listPendingApprovals.mockResolvedValue({ items: [pending] });
    render(<ApprovalQueue refreshNonce={0} notify={vi.fn()} />);

    await screen.findByText(/operator@customer\.com/);
    expect(screen.getByText(/SRV-DC01/)).toBeTruthy();
    expect(screen.getByText(/rcp\.shell/)).toBeTruthy();
    expect(screen.getByText(/cannot sign in/)).toBeTruthy();
    expect(screen.getByText(/TCK-4821/)).toBeTruthy();
  });

  it("approving calls the API with approve=true", async () => {
    listPendingApprovals.mockResolvedValue({ items: [pending] });
    const notify = vi.fn();
    render(<ApprovalQueue refreshNonce={0} notify={notify} />);

    fireEvent.click(await screen.findByRole("button", { name: /Approve/ }));

    await waitFor(() => expect(decideApproval).toHaveBeenCalledWith("req-abc-123", true));
    await waitFor(() => expect(notify).toHaveBeenCalledWith("success", expect.any(String)));
  });

  it("denying calls the API with approve=false", async () => {
    listPendingApprovals.mockResolvedValue({ items: [pending] });
    render(<ApprovalQueue refreshNonce={0} notify={vi.fn()} />);

    fireEvent.click(await screen.findByRole("button", { name: /Deny/ }));

    await waitFor(() => expect(decideApproval).toHaveBeenCalledWith("req-abc-123", false));
  });

  it("⚠️ a 409 from the backend is shown, not swallowed", async () => {
    // The backend answers 409 when the STATE doesn't allow the decision:
    // already resolved, expired, or it's the approver's own request.
    // Swallowing that message would leave the approver pressing a button
    // that apparently does nothing.
    listPendingApprovals.mockResolvedValue({ items: [pending] });
    decideApproval.mockResolvedValue({
      ok: false,
      message: "an operator cannot approve their own access request"
    });
    const notify = vi.fn();
    render(<ApprovalQueue refreshNonce={0} notify={notify} />);

    fireEvent.click(await screen.findByRole("button", { name: /Approve/ }));

    await waitFor(() =>
      expect(notify).toHaveBeenCalledWith("error", expect.stringMatching(/own access request/))
    );
  });
});

describe("AccessPolicyMatrix", () => {
  // It used to be a dialog behind a header button; it now lives in the
  // Access tab. The old "doesn't query while closed" test is gone with the
  // dialog — that guarantee is now structural, provided by TabPanel mounting
  // only the active panel, and RemoteControl.tabs.test.jsx covers it.
  //
  // ⚠️ It is also now SHARED and FILTERED. ADR-0009 phase 2 keeps one matrix
  // for every privileged capability, so the endpoint returns rcp.* and cdp.*
  // together — and rendering all of it put Crypto Discovery's settings inside
  // Remote Control. Each host passes the prefix it owns.
  const matrix = [
    { capability: "rcp.shell", deviceClass: "server", requiresApproval: false, jitMinutes: 60 },
    { capability: "rcp.shell", deviceClass: "endpoint", requiresApproval: false, jitMinutes: 60 },
    {
      capability: "cdp.anchor.distrust",
      deviceClass: "server",
      requiresApproval: false,
      jitMinutes: 60
    }
  ];

  /** The panel ships collapsed — open it before asserting on its rows. */
  async function expand() {
    fireEvent.click(await screen.findByRole("button", { name: /Expand access policy/ }));
  }

  it("⚠️ ships collapsed, so a visit cannot toggle a gate by accident", async () => {
    // The tab is opened to READ the access record. Leaving a row of one-click
    // toggles under the cursor — each of which changes who can reach a
    // machine without a second person agreeing, saved on the first click and
    // with no confirmation — made every read a chance to write.
    getAccessPolicy.mockResolvedValue({ items: matrix });
    render(<AccessPolicyMatrix prefix="rcp." title="Policy" description="" notify={vi.fn()} />);

    await screen.findByRole("button", { name: /Expand access policy/ });
    expect(screen.queryByRole("button", { name: /No approval/ })).toBeNull();
  });

  it("still says how many gates are on while collapsed", async () => {
    // Collapsing is about preventing accidental edits, not about hiding the
    // state — an administrator has to be able to see it without opening.
    getAccessPolicy.mockResolvedValue({
      items: [
        { capability: "rcp.shell", deviceClass: "server", requiresApproval: true, jitMinutes: 60 },
        { capability: "rcp.shell", deviceClass: "endpoint", requiresApproval: false, jitMinutes: 60 }
      ]
    });
    render(<AccessPolicyMatrix prefix="rcp." title="Policy" description="" notify={vi.fn()} />);

    expect(await screen.findByText("1 of 2 require approval")).toBeTruthy();
  });

  it("⚠️ shows only the capabilities of the plugin that hosts it", async () => {
    // The bug this closes: cdp.anchor.distrust and cdp.cert.install rendered
    // under Remote Control, where they read as somebody else's settings.
    getAccessPolicy.mockResolvedValue({ items: matrix });
    render(<AccessPolicyMatrix prefix="rcp." title="Policy" description="" notify={vi.fn()} />);
    await expand();

    await screen.findByText("rcp.shell");
    expect(screen.queryByText("cdp.anchor.distrust")).toBeNull();
    expect(screen.getAllByText(/Servers|Endpoints/).length).toBeGreaterThan(1);
  });

  it("and the CDP host gets the other half of the same response", async () => {
    getAccessPolicy.mockResolvedValue({ items: matrix });
    render(<AccessPolicyMatrix prefix="cdp." title="Policy" description="" notify={vi.fn()} />);
    await expand();

    await screen.findByText("cdp.anchor.distrust");
    expect(screen.queryByText("rcp.shell")).toBeNull();
  });

  it("tells a plugin with no rows apart from a matrix that failed to load", async () => {
    // Different causes, different fixes. One message for both would send
    // whoever reads it looking in the wrong place.
    getAccessPolicy.mockResolvedValue({ items: matrix });
    render(<AccessPolicyMatrix prefix="sdp." title="Policy" description="" notify={vi.fn()} />);
    await expand();

    expect(await screen.findByText(/No capability of this plugin/)).toBeTruthy();
  });

  it("toggling one cell saves ONLY that cell", async () => {
    // One per request rather than the whole matrix: a bulk save from a
    // screen holding stale data would silently switch off whatever another
    // administrator had just switched on.
    getAccessPolicy.mockResolvedValue({ items: matrix });
    render(<AccessPolicyMatrix prefix="rcp." title="Policy" description="" notify={vi.fn()} />);
    await expand();

    const buttons = await screen.findAllByRole("button", { name: /No approval/ });
    fireEvent.click(buttons[0]);

    await waitFor(() => expect(setAccessPolicyCell).toHaveBeenCalledTimes(1));
    expect(setAccessPolicyCell).toHaveBeenCalledWith(
      expect.objectContaining({
        capability: "rcp.shell",
        deviceClass: "server",
        requiresApproval: true
      })
    );
  });

  it("explains the empty matrix instead of leaving a hole", async () => {
    // With no policy loaded the screen would be blank and the administrator
    // wouldn't know whether it's a failure or there is simply nothing.
    getAccessPolicy.mockResolvedValue({ items: [] });
    render(<AccessPolicyMatrix prefix="rcp." title="Policy" description="" notify={vi.fn()} />);
    await expand();
    expect(await screen.findByText(/No policy loaded/)).toBeTruthy();
  });
});
