import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { patchRecencyRole, formatRelativeTime, PatchChip, PatchLevelSection } from "./PatchLevel";

afterEach(cleanup);

const daysAgoIso = (d) => new Date(Date.now() - d * 86_400_000).toISOString();

describe("patchRecencyRole (SLA buckets)", () => {
  it("unknown/critical when there's no last-install date", () => {
    expect(patchRecencyRole(null)).toEqual({ role: "critical", label: "unknown" });
    expect(patchRecencyRole("garbage")).toEqual({ role: "critical", label: "unknown" });
  });
  it("green ≤30 days", () => {
    expect(patchRecencyRole(daysAgoIso(10)).role).toBe("positive");
  });
  it("amber 31..90 days", () => {
    expect(patchRecencyRole(daysAgoIso(60)).role).toBe("caution");
  });
  it("red >90 days", () => {
    expect(patchRecencyRole(daysAgoIso(120)).role).toBe("critical");
  });
});

describe("formatRelativeTime", () => {
  it("returns null for invalid/empty", () => {
    expect(formatRelativeTime(null)).toBeNull();
    expect(formatRelativeTime("nope")).toBeNull();
  });
  it("buckets past times with an 'ago' suffix", () => {
    const now = Date.now();
    expect(formatRelativeTime(new Date(now - 5 * 60_000).toISOString())).toBe("5m ago");
    expect(formatRelativeTime(new Date(now - 3 * 3_600_000).toISOString())).toBe("3h ago");
    expect(formatRelativeTime(new Date(now - 2 * 86_400_000).toISOString())).toBe("2d ago");
  });
});

describe("PatchChip (render smoke)", () => {
  it("renders an em-dash when there's no patch data", () => {
    render(<PatchChip patchSummary={null} />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });
  it("renders the installed count for a device with patches", () => {
    render(<PatchChip patchSummary={{ count: 7, lastInstalledAtUtc: daysAgoIso(5) }} />);
    expect(screen.getByText("7")).toBeInTheDocument();
  });
});

describe("PatchLevelSection (render smoke)", () => {
  // Regression: the Installed/Last patch/Last scan stat row is built with
  // MUI's Grid, which wasn't imported in this file — a device with any
  // patch data crashed the drawer in production with "ReferenceError:
  // Grid is not defined" (only surfaces once patchSummary has data, so
  // the no-data branch above never caught it).
  it("renders the stat grid for a device with patch data, without throwing", () => {
    render(
      <PatchLevelSection
        patchSummary={{ count: 12, lastInstalledAtUtc: daysAgoIso(5), lastScanUtc: daysAgoIso(1) }}
        recentPatches={[]}
      />
    );
    expect(screen.getByText("Installed")).toBeInTheDocument();
    expect(screen.getByText("12")).toBeInTheDocument();
    expect(screen.getByText("Last patch")).toBeInTheDocument();
    expect(screen.getByText("Last scan")).toBeInTheDocument();
  });

  it("renders the no-data fallback when there's no patch summary", () => {
    render(<PatchLevelSection patchSummary={null} recentPatches={[]} />);
    expect(screen.getByText("This device hasn't reported installed patches yet.")).toBeInTheDocument();
  });
});
