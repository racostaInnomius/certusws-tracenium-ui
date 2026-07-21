import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import StatusChangeDialog from "./StatusChangeDialog";

afterEach(cleanup);

describe("StatusChangeDialog", () => {
  it("renders nothing when there's no target status", () => {
    const { container } = render(<StatusChangeDialog open targetStatus={null} onConfirm={() => {}} onCancel={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("non-terminal transition: Confirm is enabled without a note, payload note is null", () => {
    const onConfirm = vi.fn();
    render(<StatusChangeDialog open targetStatus="in_progress" onConfirm={onConfirm} onCancel={() => {}} />);
    const confirm = screen.getByRole("button", { name: /confirm/i });
    expect(confirm).toBeEnabled();
    fireEvent.click(confirm);
    expect(onConfirm).toHaveBeenCalledWith({ note: null });
  });

  it("terminal transition (risk_accepted): Confirm is disabled until a note is entered", () => {
    const onConfirm = vi.fn();
    render(<StatusChangeDialog open targetStatus="risk_accepted" onConfirm={onConfirm} onCancel={() => {}} />);
    const confirm = screen.getByRole("button", { name: /confirm/i });
    expect(confirm).toBeDisabled(); // note required

    fireEvent.change(screen.getByRole("textbox"), { target: { value: "  Mitigated via ACL  " } });
    expect(confirm).toBeEnabled();
    fireEvent.click(confirm);
    expect(onConfirm).toHaveBeenCalledWith({ note: "Mitigated via ACL" }); // trimmed
  });

  it("Cancel calls onCancel", () => {
    const onCancel = vi.fn();
    render(<StatusChangeDialog open targetStatus="in_progress" onConfirm={() => {}} onCancel={onCancel} />);
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
