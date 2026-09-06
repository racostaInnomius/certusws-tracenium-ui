import { describe, it, expect } from "vitest";
import { buildSections, changesBySection, isKnownView, sectionForPath, SECTIONS, TOOL_VIEWS } from "./sections";

const CATALOG = [
  { key: "amp", label: "AMP", title: "Asset Management", required: true },
  { key: "scp", label: "SCP", title: "Security Compliance", impliesModule: "compliance" },
  { key: "rcp", label: "RCP", title: "Remote Control", impliesModule: "remoteControl" },
];

describe("buildSections", () => {
  it("enables core sections always and plugin sections by policy toggle or requirement", () => {
    const form = { plugins: { amp: true, scp: false, rcp: true } };
    const byId = Object.fromEntries(buildSections(CATALOG, form).map((s) => [s.id, s.enabled]));
    expect(byId).toMatchObject({ plugins: true, agent: true, ai: true, advanced: true, amp: true, scp: false, rcp: true });
    // pmp/sdp/cdp are not in this catalog → not enabled, but still listed
    expect(byId.pmp).toBe(false);
    expect(byId.cdp).toBe(false);
  });

  it("lists every section even before the catalog arrives", () => {
    const ids = buildSections([], null).map((s) => s.id);
    expect(ids).toEqual(SECTIONS.map((s) => s.id));
  });

  it("keeps the catalog entry on plugin sections", () => {
    const rcp = buildSections(CATALOG, { plugins: { rcp: true } }).find((s) => s.id === "rcp");
    expect(rcp.catalogEntry.title).toBe("Remote Control");
  });
});

describe("sectionForPath", () => {
  it("routes policy paths to their plugin section", () => {
    expect(sectionForPath("features.remoteShell")).toBe("rcp");
    expect(sectionForPath("rcp.file.roots")).toBe("rcp");
    expect(sectionForPath("features.selfUpdate")).toBe("agent");
    expect(sectionForPath("features.locationTracking")).toBe("agent");
    expect(sectionForPath("update.intervalSeconds")).toBe("agent");
    expect(sectionForPath("inventory.intervalSeconds")).toBe("amp");
    expect(sectionForPath("compliance.intervalSeconds")).toBe("scp");
    expect(sectionForPath("patch.intervalSeconds")).toBe("pmp");
    expect(sectionForPath("cdp.certFilePaths")).toBe("cdp");
    expect(sectionForPath("sdp.bandwidthLimitKbps")).toBe("sdp");
    expect(sectionForPath("ai.maxCallsPerDay")).toBe("ai");
    expect(sectionForPath("plugins.enabled")).toBe("plugins");
    expect(sectionForPath("modules.compliance")).toBe("plugins");
  });
  it("falls back to advanced for anything the form does not own", () => {
    expect(sectionForPath("security.firewall")).toBe("advanced");
    expect(sectionForPath("gateway.vcenter")).toBe("advanced");
  });
});

describe("changesBySection", () => {
  it("counts diff entries per section", () => {
    const counts = changesBySection([
      { path: "features.remoteShell" },
      { path: "rcp.file.roots" },
      { path: "cdp.intervalSeconds" },
      { path: "plugins.enabled" },
    ]);
    expect(counts).toEqual({ rcp: 2, cdp: 1, plugins: 1 });
  });
});

describe("views", () => {
  it("knows sections and tool views, and nothing else", () => {
    expect(isKnownView("rcp")).toBe(true);
    expect(isKnownView("rollout")).toBe(true);
    expect(isKnownView("overrides")).toBe(true);
    expect(isKnownView("nope")).toBe(false);
    expect(TOOL_VIEWS.map((t) => t.id)).toEqual(["overrides", "rollout"]);
  });
});
