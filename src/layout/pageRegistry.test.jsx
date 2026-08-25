import { describe, it, expect, vi } from "vitest";
import { PAGE_REGISTRY, renderPage } from "./pageRegistry";

// These tests treat the registry as a dispatch table: they assert the mapping
// and the prop wiring on the returned element, without mounting the lazy page
// modules (which would pull in the whole app).

describe("PAGE_REGISTRY", () => {
  it("exposes every sidebar route key", () => {
    const expected = [
      "assets",
      "configurations",
      "enrollment",
      "plugin-control",
      "billing",
      "tokens",
      "tenants",
      "tenant-members",
      "welcome",
      "agent-releases",
      "software-delivery",
      "jobs",
      "agent-settings",
      "security-baselines",
      "device-management",
      "policies", // legacy alias → AgentSettings
      "audit",
      "pki",
      "ad",
      "patch",
      "cdp",
      "remote-control",
      "alerts",
      "reports",
      "retention",
      "session-settings",
      "location-sites",
      "roles",
    ];
    for (const key of expected) {
      expect(PAGE_REGISTRY[key], `missing route: ${key}`).toBeTypeOf("function");
    }
    expect(Object.keys(PAGE_REGISTRY)).toHaveLength(expected.length);
  });

  it("maps the two tenant routes to the same page with different modes", () => {
    const global = PAGE_REGISTRY.tenants({});
    const tenant = PAGE_REGISTRY["tenant-members"]({});
    expect(global.props.mode).toBe("global");
    expect(tenant.props.mode).toBe("tenant");
    expect(global.type).toBe(tenant.type);
  });
});

describe("renderPage", () => {
  it("dispatches a known key to its registry entry", () => {
    const element = renderPage("jobs", {});
    expect(element.type).toBe(PAGE_REGISTRY.jobs({}).type);
  });

  it("falls back to Overview for an unknown key", () => {
    const unknown = renderPage("does-not-exist", {});
    const empty = renderPage(undefined, {});
    // Both fall through to the same default component.
    expect(unknown.type).toBe(empty.type);
    // ...and it is NOT any of the registered pages.
    expect(unknown.type).not.toBe(PAGE_REGISTRY.jobs({}).type);
  });

  it("wires onNavigate into the pages that take it", () => {
    const onNavigate = vi.fn();
    for (const key of ["configurations", "welcome", "software-delivery", "retention", "session-settings", "location-sites"]) {
      expect(renderPage(key, { onNavigate }).props.onNavigate, key).toBe(onNavigate);
    }
  });

  it("wires the assets empty-state callback and keeps the overlay suppressed", () => {
    const onAssetsEmptyStateChange = vi.fn();
    const el = renderPage("assets", { onAssetsEmptyStateChange });
    expect(el.props.onAssetsEmptyStateChange).toBe(onAssetsEmptyStateChange);
    expect(el.props.suppressEmptyStateOverlay).toBe(true);
  });

  it("tolerates a missing ctx", () => {
    expect(() => renderPage("jobs")).not.toThrow();
    expect(() => renderPage("configurations")).not.toThrow();
  });
});
