// src/components/Compliance/useFindingLifecycle.test.jsx
//
// The lifecycle hook (extracted from DeviceDrawerContent, Sprint 2 item
// 6). Pins the mutation wrapper contract: pending bracketing, success →
// toast + refetch, structured failure → warning toast (no refetch),
// thrown error → error toast, and the status-change dialog round trip.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

const api = {
  requestFindingException: vi.fn(),
  revokeFindingAcknowledgement: vi.fn(),
  updateFindingRemediationStatus: vi.fn(),
};
vi.mock("../../api/compliance", () => ({
  requestFindingException: (...a) => api.requestFindingException(...a),
  revokeFindingAcknowledgement: (...a) => api.revokeFindingAcknowledgement(...a),
  updateFindingRemediationStatus: (...a) => api.updateFindingRemediationStatus(...a),
}));

import { useFindingLifecycle } from "./useFindingLifecycle";

const finding = { id: 7, checkId: "x" };

function setup() {
  const onToast = vi.fn();
  const onRequestRefetch = vi.fn();
  const hook = renderHook(() => useFindingLifecycle({ onToast, onRequestRefetch }));
  return { ...hook, onToast, onRequestRefetch };
}

beforeEach(() => Object.values(api).forEach((f) => f.mockReset()));

describe("useFindingLifecycle", () => {
  it("exception request: opens the dialog, submit sends the request and says it awaits approval", async () => {
    api.requestFindingException.mockResolvedValue({ ok: true });
    const { result, onToast, onRequestRefetch } = setup();
    act(() => result.current.handleRequestException(finding));
    expect(result.current.exceptionDialog).toEqual({ finding });
    expect(api.requestFindingException).not.toHaveBeenCalled();

    await act(() => result.current.submitExceptionRequest({ kind: "risk_accepted", justification: "Legacy ERP until the Q4 migration", riskOwner: "admin@certusitm.com", expiresAt: "2027-01-01T00:00:00.000Z" }));
    expect(api.requestFindingException).toHaveBeenCalledWith(7, { kind: "risk_accepted", justification: "Legacy ERP until the Q4 migration", riskOwner: "admin@certusitm.com", expiresAt: "2027-01-01T00:00:00.000Z" });
    expect(result.current.exceptionDialog).toBeNull();
    expect(onToast.mock.calls[0][0]).toMatchObject({ severity: "success" });
    expect(onToast.mock.calls[0][0].message).toMatch(/Accept risk requested.*approves/);
    expect(onRequestRefetch).toHaveBeenCalledTimes(1);
    expect(result.current.pendingAction).toBeNull();
  });

  it("structured failure (ok:false) → warning with backend message, NO refetch", async () => {
    api.revokeFindingAcknowledgement.mockResolvedValue({ ok: false, message: "INVALID_TRANSITION" });
    const { result, onToast, onRequestRefetch } = setup();
    await act(() => result.current.handleRevoke(finding));
    expect(onToast).toHaveBeenCalledWith({ severity: "warning", message: "INVALID_TRANSITION" });
    expect(onRequestRefetch).not.toHaveBeenCalled();
  });

  it("thrown error → error toast, pending cleared", async () => {
    api.requestFindingException.mockRejectedValue(new Error("network down"));
    const { result, onToast } = setup();
    act(() => result.current.handleRequestException(finding));
    await act(() => result.current.submitExceptionRequest({ kind: "risk_accepted", justification: "Legacy ERP until the Q4 migration", riskOwner: "admin@certusitm.com", expiresAt: "2027-01-01T00:00:00.000Z" }));
    expect(onToast).toHaveBeenCalledWith({ severity: "error", message: "network down" });
    expect(result.current.pendingAction).toBeNull();
  });

  it("change status opens the dialog; confirm sends status+note and closes it", async () => {
    api.updateFindingRemediationStatus.mockResolvedValue({ ok: true });
    const { result, onToast } = setup();
    act(() => result.current.handleChangeStatus(finding, "remediated"));
    expect(result.current.statusDialog).toEqual({ finding, targetStatus: "remediated" });
    expect(api.updateFindingRemediationStatus).not.toHaveBeenCalled();

    await act(() => result.current.confirmStatusChange({ note: "patched via GPO" }));
    expect(api.updateFindingRemediationStatus).toHaveBeenCalledWith(7, { status: "remediated", note: "patched via GPO" });
    expect(result.current.statusDialog).toBeNull();
    expect(onToast.mock.calls[0][0].message).toMatch(/Status set to/);
  });

  it("confirm without an open dialog is a no-op", async () => {
    const { result } = setup();
    await act(() => result.current.confirmStatusChange({ note: "x" }));
    expect(api.updateFindingRemediationStatus).not.toHaveBeenCalled();
  });
});
