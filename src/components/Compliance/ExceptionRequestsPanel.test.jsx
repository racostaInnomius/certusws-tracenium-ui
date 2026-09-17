// src/components/Compliance/ExceptionRequestsPanel.test.jsx
//
// P1-7 — the approvals panel offers each person only what the backend would
// accept: an owner/admin decides someone else's request, the requester can
// only withdraw their own, and a rejection needs a reason.

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

const api = {
  listExceptionRequests: vi.fn(),
  approveExceptionRequest: vi.fn(),
  rejectExceptionRequest: vi.fn(),
  cancelExceptionRequest: vi.fn(),
};
vi.mock("../../api/compliance", () => ({
  listExceptionRequests: (...a) => api.listExceptionRequests(...a),
  approveExceptionRequest: (...a) => api.approveExceptionRequest(...a),
  rejectExceptionRequest: (...a) => api.rejectExceptionRequest(...a),
  cancelExceptionRequest: (...a) => api.cancelExceptionRequest(...a),
}));

import ExceptionRequestsPanel from "./ExceptionRequestsPanel";

afterEach(() => {
  cleanup();
  Object.values(api).forEach((f) => f.mockReset());
});

const base = {
  agentId: "a1", checkId: "windows.smb.smbv1_disabled", title: "SMBv1 disabled", hostname: "MSIG-ERP", severity: "high",
  kind: "risk_accepted", justification: "Legacy ERP needs SMBv1 until the Q4 migration", riskOwner: "admin@certusitm.com",
  expiresAt: "2027-01-01T00:00:00.000Z", status: "pending", requestedBy: "admin@certusitm.com", requestedAt: "2026-09-17T00:00:00.000Z",
  decidedBy: null, decidedAt: null, decisionNote: null, closedAt: null, closedBy: null, closedReason: null,
};

describe("ExceptionRequestsPanel", () => {
  it("an approver sees Approve/Reject on someone else's request, and only Withdraw on their own", async () => {
    api.listExceptionRequests.mockResolvedValue({
      ok: true,
      viewer: { canDecide: true },
      items: [{ ...base, id: 1, mine: false }, { ...base, id: 2, mine: true }],
    });
    render(<ExceptionRequestsPanel />);
    const other = await screen.findByTestId("exception-request-1");
    expect(api.listExceptionRequests).toHaveBeenCalledWith({ status: "pending" });
    expect(within(other).getByRole("button", { name: "Approve" })).toBeInTheDocument();
    expect(within(other).getByRole("button", { name: "Reject" })).toBeInTheDocument();

    const mine = screen.getByTestId("exception-request-2");
    expect(within(mine).queryByRole("button", { name: "Approve" })).toBeNull();
    expect(within(mine).getByRole("button", { name: "Withdraw" })).toBeInTheDocument();
    expect(within(mine).getByText(/another owner or admin has to decide it/i)).toBeInTheDocument();
  });

  it("a member who cannot decide sees no decision buttons on others' requests", async () => {
    api.listExceptionRequests.mockResolvedValue({ ok: true, viewer: { canDecide: false }, items: [{ ...base, id: 3, mine: false }] });
    render(<ExceptionRequestsPanel />);
    const row = await screen.findByTestId("exception-request-3");
    expect(within(row).queryByRole("button")).toBeNull();
  });

  it("rejecting needs a reason; approving sends and reloads", async () => {
    api.listExceptionRequests.mockResolvedValue({ ok: true, viewer: { canDecide: true }, items: [{ ...base, id: 4, mine: false }] });
    api.rejectExceptionRequest.mockResolvedValue({ ok: true });
    api.approveExceptionRequest.mockResolvedValue({ ok: true });
    const onToast = vi.fn();
    render(<ExceptionRequestsPanel onToast={onToast} />);
    const row = await screen.findByTestId("exception-request-4");

    fireEvent.click(within(row).getByRole("button", { name: "Reject" }));
    const confirm = await screen.findByRole("button", { name: "Confirm" });
    expect(confirm).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/Reason/), { target: { value: "Patch it instead" } });
    fireEvent.click(confirm);
    await waitFor(() => expect(api.rejectExceptionRequest).toHaveBeenCalledWith(4, { note: "Patch it instead" }));
    await waitFor(() => expect(api.listExceptionRequests).toHaveBeenCalledTimes(2));

    // The rejection dialog's close transition keeps the page aria-hidden for a moment.
    const approve = await waitFor(() => within(screen.getByTestId("exception-request-4")).getByRole("button", { name: "Approve" }));
    fireEvent.click(approve);
    fireEvent.click(await screen.findByRole("button", { name: "Confirm" }));
    await waitFor(() => expect(api.approveExceptionRequest).toHaveBeenCalledWith(4, { note: null }));
    expect(onToast).toHaveBeenCalledWith({ severity: "success", message: "Exception request #4 approved." });
  });

  it("the All view shows decided requests with who approved them", async () => {
    api.listExceptionRequests.mockResolvedValue({ ok: true, viewer: { canDecide: true }, items: [] });
    render(<ExceptionRequestsPanel />);
    await screen.findByText(/No exception requests waiting/);
    api.listExceptionRequests.mockResolvedValue({
      ok: true,
      viewer: { canDecide: true },
      items: [{ ...base, id: 5, status: "approved", decidedBy: "owner@certusitm.com", decidedAt: "2026-09-18T00:00:00.000Z", mine: false }],
    });
    fireEvent.click(screen.getByRole("button", { name: "All" }));
    const row = await screen.findByTestId("exception-request-5");
    expect(api.listExceptionRequests).toHaveBeenLastCalledWith({ status: undefined });
    expect(within(row).getByText("Approved")).toBeInTheDocument();
    expect(within(row).getByText(/approved by owner@certusitm.com/)).toBeInTheDocument();
    expect(within(row).queryByRole("button")).toBeNull();
  });
});
