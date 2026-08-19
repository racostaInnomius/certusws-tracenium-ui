// src/components/common/CompositionBars.test.jsx
//
// Coverage for the row/card click-routing logic added alongside
// onItemClick (2026-08-17) — the Dashboard's "OS versions" card needs
// per-row navigation (click "macOS Tahoe" → Hardware Inventory filtered
// to just that OS) while keeping the existing whole-card click and the
// expand-arrow-for-children behavior intact.

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import CompositionBars from "./CompositionBars";

afterEach(cleanup);

const items = [
  { id: "macos-tahoe", label: "macOS Tahoe", value: 6 },
  { id: "windows-11", label: "Windows 11", value: 6 },
];

const itemsWithChildren = [
  {
    id: "macos-tahoe",
    label: "macOS Tahoe",
    value: 6,
    children: [
      { id: "v260", label: "Version 26.0", value: 4, raw: { technical_version: "26.0" } },
      { id: "v261", label: "Version 26.1", value: 2, raw: { technical_version: "26.1" } },
    ],
  },
];

describe("CompositionBars — row vs card click routing", () => {
  it("calls onItemClick with the clicked row and does not also fire the card onClick", () => {
    const onItemClick = vi.fn();
    const onClick = vi.fn();
    render(
      <CompositionBars title="OS versions" items={items} onClick={onClick} onItemClick={onItemClick} />
    );

    fireEvent.click(screen.getByText("macOS Tahoe"));

    expect(onItemClick).toHaveBeenCalledTimes(1);
    expect(onItemClick.mock.calls[0][0]).toMatchObject({ label: "macOS Tahoe" });
    expect(onClick).not.toHaveBeenCalled();
  });

  it("clicking the card outside any row still fires the whole-card onClick", () => {
    const onItemClick = vi.fn();
    const onClick = vi.fn();
    render(
      <CompositionBars title="OS versions" items={items} onClick={onClick} onItemClick={onItemClick} />
    );

    fireEvent.click(screen.getByText("OS versions"));

    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onItemClick).not.toHaveBeenCalled();
  });

  it("with onItemClick set, clicking a row with children navigates instead of expanding", () => {
    const onItemClick = vi.fn();
    render(<CompositionBars title="OS versions" items={itemsWithChildren} onItemClick={onItemClick} />);

    fireEvent.click(screen.getByText("macOS Tahoe"));

    expect(onItemClick).toHaveBeenCalledTimes(1);
    // The children stay collapsed — the row click navigated, it didn't expand.
    expect(screen.queryByText("Version 26.0")).not.toBeInTheDocument();
  });

  it("the expand arrow still toggles children without calling onItemClick", () => {
    const onItemClick = vi.fn();
    render(<CompositionBars title="OS versions" items={itemsWithChildren} onItemClick={onItemClick} />);

    fireEvent.click(screen.getByRole("button", { name: /show grouped versions/i }));

    expect(onItemClick).not.toHaveBeenCalled();
    expect(screen.getByText("Version 26.0")).toBeInTheDocument();
  });

  it("without onItemClick, a childless card falls back to the pre-existing behavior: row click bubbles to the card", () => {
    const onClick = vi.fn();
    render(<CompositionBars title="OS versions" items={items} onClick={onClick} />);

    fireEvent.click(screen.getByText("macOS Tahoe"));

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("regression: card onClick is always invoked with zero arguments, never the raw click event", () => {
    // Bug found 2026-08-17: onClick was bound directly as the DOM
    // handler, so a click bubbling up from something with no handler
    // of its own (e.g. a child row before it got its own onItemClick
    // support) handed the SyntheticEvent to onClick as its first
    // argument. Consumers that treat that argument as a search string
    // (AssetsDashboard's OS versions card) rendered it as the literal
    // text "[object Object]".
    const onClick = vi.fn();
    render(<CompositionBars title="OS versions" items={items} onClick={onClick} />);

    fireEvent.click(screen.getByText("OS versions"));

    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onClick.mock.calls[0]).toEqual([]);
  });

  it("clicking a child (point-version) row calls onItemClick with that child, not the parent, and does not bubble to the card", () => {
    const onItemClick = vi.fn();
    const onClick = vi.fn();
    render(
      <CompositionBars
        title="OS versions"
        items={itemsWithChildren}
        onClick={onClick}
        onItemClick={onItemClick}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /show grouped versions/i }));
    fireEvent.click(screen.getByText("Version 26.1"));

    expect(onItemClick).toHaveBeenCalledTimes(1);
    expect(onItemClick.mock.calls[0][0]).toMatchObject({ raw: { technical_version: "26.1" } });
    expect(onClick).not.toHaveBeenCalled();
  });

  it("regression: without a totalValue prop, the total chip and row percentages use the calculated sum, not 0", () => {
    // Bug found 2026-08-18: `totalValue` defaults to `null`, and
    // `Number(null)` is `0` — which IS finite, so the old check
    // `Number.isFinite(Number(totalValue))` treated "prop not passed" the
    // same as "caller wants a hardcoded 0 total". Every consumer that
    // doesn't pass totalValue (most of them — AssetsDashboard's "OS
    // versions" card, HardwareInventory's "Top manufacturers" etc.)
    // rendered "0 hosts" and 0% on every row no matter the real counts.
    render(<CompositionBars title="OS versions" items={items} totalLabel="hosts" />);

    expect(screen.getByText("12 hosts")).toBeInTheDocument();
    expect(screen.getAllByText("50%")).toHaveLength(2);
  });
});
