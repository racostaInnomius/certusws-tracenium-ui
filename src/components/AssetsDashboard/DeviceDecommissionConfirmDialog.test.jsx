import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import DeviceDecommissionConfirmDialog from "./DeviceDecommissionConfirmDialog";

afterEach(cleanup);

const device = { hostname: "host-1", agentId: "agent-1" };

function renderDialog(props = {}) {
  return render(
    <DeviceDecommissionConfirmDialog
      open
      device={device}
      confirmationText=""
      reason=""
      onConfirmationTextChange={() => {}}
      onReasonChange={() => {}}
      onClose={() => {}}
      onConfirm={() => {}}
      {...props}
    />
  );
}

describe("DeviceDecommissionConfirmDialog", () => {
  it("renders the device identity", () => {
    renderDialog();
    expect(screen.getByText("host-1")).toBeInTheDocument();
    expect(screen.getByText("agent-1")).toBeInTheDocument();
  });

  it("keeps Delete disabled until the confirmation text matches the hostname", () => {
    renderDialog({ confirmationText: "" });
    expect(screen.getByRole("button", { name: /Delete permanently/i })).toBeDisabled();
    cleanup();
    renderDialog({ confirmationText: "host-1" });
    expect(screen.getByRole("button", { name: /Delete permanently/i })).toBeEnabled();
  });

  it("shows a mismatch state until the text matches exactly", () => {
    renderDialog({ confirmationText: "host-" });
    expect(screen.getByText(/prevents accidental permanent/i)).toBeInTheDocument();
    cleanup();
    renderDialog({ confirmationText: "host-1" });
    expect(screen.getByText("Confirmation matched.")).toBeInTheDocument();
  });

  it("wires confirmation-text and reason change handlers", () => {
    const onConfirmationTextChange = vi.fn();
    const onReasonChange = vi.fn();
    renderDialog({ onConfirmationTextChange, onReasonChange });
    fireEvent.change(screen.getByLabelText(/Type host-1 to confirm/i), { target: { value: "h" } });
    expect(onConfirmationTextChange).toHaveBeenCalledWith("h");
    fireEvent.change(screen.getByLabelText(/Reason/i), { target: { value: "retired" } });
    expect(onReasonChange).toHaveBeenCalledWith("retired");
  });

  it("fires onConfirm only when enabled", () => {
    const onConfirm = vi.fn();
    renderDialog({ confirmationText: "host-1", onConfirm });
    fireEvent.click(screen.getByRole("button", { name: /Delete permanently/i }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("shows the queueing state and disables inputs while submitting", () => {
    renderDialog({ confirmationText: "host-1", submitting: true });
    expect(screen.getByRole("button", { name: /Queueing/i })).toBeDisabled();
    expect(screen.getByLabelText(/Type host-1 to confirm/i)).toBeDisabled();
  });
});
