import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { DetailField, FieldGrid } from "./detailAtoms";

afterEach(cleanup);

describe("DetailField", () => {
  it("renders the label/value pair", () => {
    render(<DetailField label="Hostname" value="host-1" />);
    expect(screen.getByText("Hostname")).toBeInTheDocument();
    expect(screen.getByText("host-1")).toBeInTheDocument();
  });

  it("falls back to an em-dash for blank values", () => {
    render(<DetailField label="Serial" value={null} />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("uses a monospace face when mono is set", () => {
    render(<DetailField label="ID" value="abc123" mono />);
    expect(screen.getByText("abc123")).toHaveStyle({ fontFamily: "monospace" });
  });
});

describe("FieldGrid", () => {
  it("renders its children", () => {
    render(
      <FieldGrid>
        <DetailField label="A" value="1" />
        <DetailField label="B" value="2" />
      </FieldGrid>
    );
    expect(screen.getByText("A")).toBeInTheDocument();
    expect(screen.getByText("B")).toBeInTheDocument();
  });
});
