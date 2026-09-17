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

  it("a note is optional and sent trimmed (accepting risk is an exception request, not this dialog)", () => {
    const onConfirm = vi.fn();
    render(<StatusChangeDialog open targetStatus="remediated" onConfirm={onConfirm} onCancel={() => {}} />);
    const confirm = screen.getByRole("button", { name: /confirm/i });
    expect(confirm).toBeEnabled();

    fireEvent.change(screen.getByRole("textbox"), { target: { value: "  Patched via GPO  " } });
    fireEvent.click(confirm);
    expect(onConfirm).toHaveBeenCalledWith({ note: "Patched via GPO" });
  });

  it("Cancel calls onCancel", () => {
    const onCancel = vi.fn();
    render(<StatusChangeDialog open targetStatus="in_progress" onConfirm={() => {}} onCancel={onCancel} />);
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
