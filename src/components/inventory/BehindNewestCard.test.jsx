import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import BehindNewestCard from "./BehindNewestCard";

afterEach(cleanup);

const ROWS = [
  { label: "Microsoft Teams", deviceCount: 43, behind: 40, newest: "26246.1604.5133.838" },
  { label: "RingCentral", deviceCount: 30, behind: 20, newest: "26.3.3012" },
];

describe("BehindNewestCard", () => {
  it("⭐ dice cuántos de cuántos van atrás, y cuál es la más nueva", () => {
    render(<BehindNewestCard rows={ROWS} />);
    // Sin onSelect la fila no se anuncia como botón.
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByLabelText("RingCentral: 20 of 30 devices behind")).toBeInTheDocument();
    expect(screen.getByText("newest 26.3.3012")).toBeInTheDocument();
  });

  it("una fila filtra la tabla por esa app", () => {
    const onSelect = vi.fn();
    render(<BehindNewestCard rows={ROWS} onSelect={onSelect} />);
    fireEvent.click(screen.getByRole("button", { name: "Microsoft Teams: 40 of 43 devices behind" }));
    expect(onSelect).toHaveBeenCalledWith("Microsoft Teams");
  });

  it("sin nada atrás lo dice", () => {
    render(<BehindNewestCard rows={[]} />);
    expect(screen.getByText("Every app is on its newest version")).toBeInTheDocument();
  });
});
