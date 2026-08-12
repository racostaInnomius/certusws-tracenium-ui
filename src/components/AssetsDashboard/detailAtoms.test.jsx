import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { DetailStatCard, DetailField, FieldGrid } from "./detailAtoms";

afterEach(cleanup);

describe("DetailStatCard", () => {
  it("renders title, value and optional helper", () => {
    render(<DetailStatCard title="CPU" value="Ryzen 7" helper="8 cores" icon={<span>i</span>} />);
    expect(screen.getByText("CPU")).toBeInTheDocument();
    expect(screen.getByText("Ryzen 7")).toBeInTheDocument();
    expect(screen.getByText("8 cores")).toBeInTheDocument();
  });

  it("falls back to an em-dash and omits the helper when absent", () => {
    render(<DetailStatCard title="RAM" value="" icon={<span>i</span>} />);
    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.queryByText("8 cores")).not.toBeInTheDocument();
  });
});

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
