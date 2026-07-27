import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import {
  formatJson,
  formatRelativeTime,
  shortHash,
  renderAckChip,
  renderSourceChip,
  SummaryCard,
  DetailRow,
  JsonBlock,
} from "./policyDisplay";

afterEach(cleanup);

describe("formatJson", () => {
  it("pretty-prints with 2-space indent and defaults null to {}", () => {
    expect(formatJson({ a: 1 })).toBe('{\n  "a": 1\n}');
    expect(formatJson(null)).toBe("{}");
  });
});

describe("formatRelativeTime", () => {
  it("returns — for null/invalid", () => {
    expect(formatRelativeTime(null)).toBe("—");
    expect(formatRelativeTime("not-a-date")).toBe("—");
  });
  it("buckets recent timestamps", () => {
    const ago = (ms) => new Date(Date.now() - ms).toISOString();
    expect(formatRelativeTime(ago(10 * 1000))).toBe("Now");
    expect(formatRelativeTime(ago(5 * 60 * 1000))).toBe("5m ago");
    expect(formatRelativeTime(ago(2 * 60 * 60 * 1000))).toBe("2h ago");
    expect(formatRelativeTime(ago(3 * 24 * 60 * 60 * 1000))).toBe("3d ago");
  });
  it("rounds a future timestamp (clock skew) to Now", () => {
    expect(formatRelativeTime(new Date(Date.now() + 60_000).toISOString())).toBe("Now");
  });
});

describe("shortHash", () => {
  it("truncates long hashes and passes short ones through", () => {
    expect(shortHash("0123456789abcdef0123")).toBe("0123456789…0123");
    expect(shortHash("short")).toBe("short");
    expect(shortHash(null)).toBe("—");
  });
});

describe("renderAckChip", () => {
  it("status 0 → ACK OK", () => {
    render(renderAckChip(0));
    expect(screen.getByText("ACK OK")).toBeInTheDocument();
  });
  it("null → pending (reason text when provided)", () => {
    render(renderAckChip(null, "Waiting for device"));
    expect(screen.getByText("Waiting for device")).toBeInTheDocument();
  });
  it("non-zero status → ACK ERR <n>", () => {
    render(renderAckChip(42));
    expect(screen.getByText("ACK ERR 42")).toBeInTheDocument();
  });
});

describe("renderSourceChip", () => {
  it("device / tenant / fallback", () => {
    const { rerender } = render(<div>{renderSourceChip("device")}</div>);
    expect(screen.getByText("Device override")).toBeInTheDocument();
    rerender(<div>{renderSourceChip("tenant")}</div>);
    expect(screen.getByText("Tenant")).toBeInTheDocument();
    rerender(<div>{renderSourceChip("")}</div>);
    expect(screen.getByText("—")).toBeInTheDocument();
  });
});

describe("shared UI atoms", () => {
  it("SummaryCard renders title/value/hint", () => {
    render(<SummaryCard title="Devices" value="42" hint="active" icon={<span>i</span>} />);
    expect(screen.getByText("Devices")).toBeInTheDocument();
    expect(screen.getByText("42")).toBeInTheDocument();
    expect(screen.getByText("active")).toBeInTheDocument();
  });
  it("DetailRow renders label + value", () => {
    render(<DetailRow label="Hash" value="abc" mono />);
    expect(screen.getByText("Hash")).toBeInTheDocument();
    expect(screen.getByText("abc")).toBeInTheDocument();
  });
  it("JsonBlock renders the pretty-printed value", () => {
    render(<JsonBlock value={{ k: 1 }} />);
    expect(screen.getByText(/"k": 1/)).toBeInTheDocument();
  });
});
