import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import BulkFindingToolbar from "./BulkFindingToolbar";

afterEach(cleanup);

describe("BulkFindingToolbar", () => {
  it("empty selection: shows the select-all prompt and no action buttons", () => {
    render(
      <BulkFindingToolbar
        totalCount={12}
        selectedCount={0}
        onSelectAll={() => {}}
        onClear={() => {}}
        onOpenMenu={() => {}}
        pending={false}
      />
    );
    expect(screen.getByText("Select all (12 findings)")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /actions/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /clear/i })).not.toBeInTheDocument();
    // The lead checkbox is unchecked when nothing is selected.
    expect(screen.getByRole("checkbox")).not.toBeChecked();
  });

  it("checkbox toggles select-all when nothing is selected", () => {
    const onSelectAll = vi.fn();
    const onClear = vi.fn();
    render(
      <BulkFindingToolbar
        totalCount={12}
        selectedCount={0}
        onSelectAll={onSelectAll}
        onClear={onClear}
        onOpenMenu={() => {}}
        pending={false}
      />
    );
    fireEvent.click(screen.getByRole("checkbox"));
    expect(onSelectAll).toHaveBeenCalledTimes(1);
    expect(onClear).not.toHaveBeenCalled();
  });

  it("partial selection: indeterminate checkbox, count label, Clear + Actions wired", () => {
    const onClear = vi.fn();
    const onOpenMenu = vi.fn();
    render(
      <BulkFindingToolbar
        totalCount={12}
        selectedCount={3}
        onSelectAll={() => {}}
        onClear={onClear}
        onOpenMenu={onOpenMenu}
        pending={false}
      />
    );
    expect(screen.getByText("3 of 12 selected")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /clear/i }));
    expect(onClear).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: /actions/i }));
    expect(onOpenMenu).toHaveBeenCalledTimes(1);

    // With a selection, clicking the lead checkbox clears rather than selects-all.
    fireEvent.click(screen.getByRole("checkbox"));
    expect(onClear).toHaveBeenCalledTimes(2);
  });

  it("full selection: checkbox is checked (not indeterminate)", () => {
    render(
      <BulkFindingToolbar
        totalCount={5}
        selectedCount={5}
        onSelectAll={() => {}}
        onClear={() => {}}
        onOpenMenu={() => {}}
        pending={false}
      />
    );
    expect(screen.getByRole("checkbox")).toBeChecked();
    expect(screen.getByText("5 of 5 selected")).toBeInTheDocument();
  });

  it("pending disables the action controls", () => {
    render(
      <BulkFindingToolbar
        totalCount={12}
        selectedCount={3}
        onSelectAll={() => {}}
        onClear={() => {}}
        onOpenMenu={() => {}}
        pending
      />
    );
    expect(screen.getByRole("button", { name: /actions/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /clear/i })).toBeDisabled();
    expect(screen.getByRole("checkbox")).toBeDisabled();
  });
});
