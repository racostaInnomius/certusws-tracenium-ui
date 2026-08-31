// src/hooks/useEffectiveTenantId.test.jsx
//
// The precedence here is the whole bug. `auth.tenantId` only exists when the
// request carried an `X-Tenant-Id` header; during vendor/MSP portfolio
// navigation the tenant lives in the MSP context instead. A page reading only
// `auth` sees nothing and concludes the tenant lacks the feature.

import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

let mockAuth = null;
let mockMsp = null;

vi.mock("../auth/AuthContext", () => ({
  useAuthContext: () => ({ auth: mockAuth }),
}));

vi.mock("../msp/MspContext", () => ({
  // `null` is what the real useMspOptional returns with no provider mounted.
  useMspOptional: () => mockMsp,
}));

const { useEffectiveTenantId } = await import("./useEffectiveTenantId");

function Probe() {
  const id = useEffectiveTenantId();
  return <div data-testid="out">{id === null ? "NULL" : `${typeof id}:${id}`}</div>;
}

function readTenantId() {
  render(<Probe />);
  return screen.getByTestId("out").textContent;
}

beforeEach(() => {
  mockAuth = null;
  mockMsp = null;
});
afterEach(cleanup);

describe("useEffectiveTenantId · the MSP scope wins", () => {
  // ⚠️ THE ORDER IS THE FIX. `enterTenant` refreshes auth fire-and-forget with
  // a swallowed catch, so auth can lag or never arrive. The MSP scope is also
  // what the X-Tenant-Id header uses, so following it keeps the page and its
  // data talking about the same tenant.
  it("prefers the selected tenant over a stale auth tenant", () => {
    mockAuth = { tenantId: "1" };
    mockMsp = { activeTenant: { id: "113", name: "Gtec" } };
    expect(readTenantId()).toBe("string:113");
  });

  // The exact production shape: portfolio navigation, auth carries nothing.
  it("resolves the tenant when auth has none at all", () => {
    mockAuth = {};
    mockMsp = { activeTenant: { id: "113", name: "Gtec" } };
    expect(readTenantId()).toBe("string:113");
  });

  it("falls back to auth when no tenant is selected in the portfolio", () => {
    mockAuth = { tenantId: "1" };
    mockMsp = { activeTenant: null };
    expect(readTenantId()).toBe("string:1");
  });
});

describe("useEffectiveTenantId · works without an MspProvider", () => {
  // Every page calls this, and the page tests mount pages standalone with only
  // AuthContext mocked. A throw here would force all of them to wrap in a
  // provider to test something unrelated to MSP.
  it("uses auth when the context is absent", () => {
    mockAuth = { tenantId: "1" };
    mockMsp = null;
    expect(readTenantId()).toBe("string:1");
  });

  it("returns null when neither source has anything", () => {
    mockAuth = null;
    mockMsp = null;
    expect(readTenantId()).toBe("NULL");
  });
});

describe("useEffectiveTenantId · normalisation", () => {
  // Ids arrive as numbers from some payloads and strings from others, and end
  // up in URL paths and cache keys where 1 and "1" must not be two tenants.
  it("returns a string even when the source is a number", () => {
    mockAuth = { tenantId: 1 };
    expect(readTenantId()).toBe("string:1");
  });

  // ⚠️ `""` is falsy but `" "` is NOT, so a whitespace id would sail through a
  // plain truthiness check and get pasted into a request path.
  it("treats blank ids as no tenant, whitespace included", () => {
    mockAuth = { tenantId: "   " };
    expect(readTenantId()).toBe("NULL");

    cleanup();
    mockAuth = { tenantId: "" };
    expect(readTenantId()).toBe("NULL");
  });

  it("does not mistake a blank MSP scope for a selection", () => {
    mockAuth = { tenantId: "1" };
    mockMsp = { activeTenant: { id: "  ", name: "broken" } };
    // Falls through to auth rather than querying tenant "  ".
    expect(readTenantId()).toBe("string:1");
  });

  // Tenant 0 does not exist today, but a numeric-zero id must not be silently
  // swallowed by a truthiness check if one ever does.
  it("keeps a zero id instead of dropping it", () => {
    mockAuth = { tenantId: 0 };
    expect(readTenantId()).toBe("string:0");
  });
});
