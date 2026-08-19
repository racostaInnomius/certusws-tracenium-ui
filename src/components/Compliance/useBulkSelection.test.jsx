// src/components/Compliance/useBulkSelection.test.jsx
//
// The bulk-selection hook (extracted from DeviceDrawerContent, Sprint 2
// item 6). Pins: Set semantics, reset on device switch, selectAll
// filters falsy ids, the bulk runner's "X/Y ok" toast shape (partial
// failure → warning), clear+refetch on success, and the no-op guard on
// an empty selection.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

const bulkFindingOp = vi.fn();
vi.mock("../../api/compliance", () => ({
  bulkFindingOp: (...a) => bulkFindingOp(...a),
}));

import { useBulkSelection } from "./useBulkSelection";

const findings = [{ id: 1 }, { id: 2 }, { id: null }, { id: 3 }];

function setup(resetKey = "dev-1") {
  const onToast = vi.fn();
  const onRequestRefetch = vi.fn();
  const hook = renderHook(
    ({ key }) => useBulkSelection({ findings, resetKey: key, onToast, onRequestRefetch }),
    { initialProps: { key: resetKey } }
  );
  return { ...hook, onToast, onRequestRefetch };
}

beforeEach(() => bulkFindingOp.mockReset());

describe("useBulkSelection — selection", () => {
  it("toggle adds/removes; selectAll skips falsy ids; clear empties", () => {
    const { result } = setup();
    act(() => result.current.toggleSelected(1));
    act(() => result.current.toggleSelected(2));
    expect([...result.current.selectedIds]).toEqual([1, 2]);
    act(() => result.current.toggleSelected(1));
    expect([...result.current.selectedIds]).toEqual([2]);
    act(() => result.current.selectAll());
    expect([...result.current.selectedIds].sort()).toEqual([1, 2, 3]);
    act(() => result.current.clearSelection());
    expect(result.current.selectedIds.size).toBe(0);
  });

  it("switching device (resetKey) clears the selection", () => {
    const { result, rerender } = setup("dev-1");
    act(() => result.current.selectAll());
    expect(result.current.selectedIds.size).toBe(3);
    rerender({ key: "dev-2" });
    expect(result.current.selectedIds.size).toBe(0);
  });
});

describe("useBulkSelection — bulk runners", () => {
  it("empty selection → no API call", async () => {
    const { result } = setup();
    await act(() => result.current.handleBulkRevoke());
    expect(bulkFindingOp).not.toHaveBeenCalled();
  });

  it("all ok → success toast 'label: n/n ok', clears selection, refetches", async () => {
    bulkFindingOp.mockResolvedValue({ ok: true, summary: { ok: 2, failed: 0, total: 2 } });
    const { result, onToast, onRequestRefetch } = setup();
    act(() => { result.current.toggleSelected(1); result.current.toggleSelected(2); });
    await act(() => result.current.handleBulkAck(null));
    expect(bulkFindingOp).toHaveBeenCalledWith({ op: "acknowledge", acknowledgedUntil: null, findingIds: [1, 2] });
    expect(onToast).toHaveBeenCalledWith({ severity: "success", message: "Acknowledged: 2/2 ok" });
    expect(result.current.selectedIds.size).toBe(0);
    expect(onRequestRefetch).toHaveBeenCalledTimes(1);
  });

  it("partial failure → warning toast naming the failed count", async () => {
    bulkFindingOp.mockResolvedValue({ ok: true, summary: { ok: 1, failed: 1, total: 2 } });
    const { result, onToast } = setup();
    act(() => { result.current.toggleSelected(1); result.current.toggleSelected(2); });
    await act(() => result.current.handleBulkRevoke());
    expect(onToast.mock.calls[0][0]).toEqual({
      severity: "warning",
      message: "Acknowledgement revoked: 1/2 ok, 1 failed (check audit log)",
    });
  });

  it("bulk change-status goes through the dialog and sends newStatus + note", async () => {
    bulkFindingOp.mockResolvedValue({ ok: true, summary: { ok: 1, failed: 0, total: 1 } });
    const { result } = setup();
    act(() => result.current.toggleSelected(3));
    act(() => result.current.handleBulkChangeStatus("wont_fix"));
    expect(result.current.bulkStatusDialog).toEqual({ targetStatus: "wont_fix" });
    await act(() => result.current.confirmBulkStatusChange({ note: "legacy box" }));
    expect(bulkFindingOp).toHaveBeenCalledWith({ op: "change_status", newStatus: "wont_fix", note: "legacy box", findingIds: [3] });
    expect(result.current.bulkStatusDialog).toBeNull();
  });
});
