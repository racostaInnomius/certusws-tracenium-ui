import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { patchRecencyRole, formatRelativeTime, patchLabel, PatchChip, PatchLevelSection } from "./PatchLevel";

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

// El historial de Windows Update trae `hotFixId: null` —el KB va dentro del
// título— y la fila pintaba sólo `id`: en prod, 9 de los 10 parches recientes
// de W11_JPR_LAB salían como «—» (recorrido del 25-sep).
describe("patchLabel", () => {
  it("usa el id cuando lo hay", () => {
    expect(patchLabel({ id: "KB5129195", title: "2026-09 Cumulative Update (KB5129195)" })).toBe("KB5129195");
  });
  it("sin id, saca el KB del título", () => {
    expect(
      patchLabel({ id: null, title: "Security Intelligence Update for Microsoft Defender Antivirus - KB2267602 (Version 1.459.271.0)" })
    ).toBe("KB2267602");
  });
  it("sin id ni KB, el título entero", () => {
    expect(patchLabel({ id: null, title: "Microsoft Edge Update" })).toBe("Microsoft Edge Update");
  });
  it("sin nada, la raya", () => {
    expect(patchLabel({ id: null, title: null })).toBe("—");
    expect(patchLabel(null)).toBe("—");
  });
});

describe("PatchLevelSection — parches recientes", () => {
  it("⭐ una actualización de Windows Update sin hotFixId enseña su KB, no «—»", () => {
    render(
      <PatchLevelSection
        patchSummary={{ count: 2, lastInstalledAtUtc: daysAgoIso(5), lastScanUtc: daysAgoIso(1) }}
        recentPatches={[
          { id: null, title: "Security Intelligence Update for Microsoft Defender Antivirus - KB2267602 (Version 1.459.271.0)", installedAtUtc: daysAgoIso(5), source: "Windows Update", raw: {} },
          { id: "KB5129195", title: null, installedAtUtc: daysAgoIso(9), source: null, raw: null },
        ]}
      />
    );
    expect(screen.getByText("KB2267602")).toBeInTheDocument();
    expect(screen.getByText("KB5129195")).toBeInTheDocument();
  });
});
