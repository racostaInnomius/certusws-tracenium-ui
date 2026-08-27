// src/pages/SecurityCompliance.msw.test.jsx
//
// Page-level test of Security Compliance against REAL response envelopes
// served by MSW (Sprint 2 item 5). Every other compliance test mocks the
// api/compliance module, so the page's reads of the envelope shapes
// (`res.summary`, `res.items`, `res.frameworks`, `res.settings.effective`,
// `packActive`…) were never exercised end-to-end — exactly the bug class
// that left useComplianceBands reading one level too shallow for a whole
// release. These handlers encode the backend's actual shapes
// (compliance.controller.ts); a refactor that re-flattens or re-nests
// fails here, not in production.

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { server, respond } from "../test/msw/server";
import { clearCachedFetch } from "../hooks/useCachedFetch";

const MOCK_AUTH = {
  tenantId: "1",
  tenantMember: { role: "ADMIN", isActive: true, tenantId: "1" },
  email: "op@tracenium.test",
  bootstrap: { tenantId: "1" },
};
vi.mock("../auth/AuthContext", () => ({
  useAuthContext: () => ({ auth: MOCK_AUTH, loading: false, refreshAuth: vi.fn() }),
  AuthProvider: ({ children }) => children,
}));
// Heavy children that own their own fetches and are covered by their own
// suites — stubbed so this test stays about the PAGE's wiring.
vi.mock("../components/Compliance/ComplianceTrendChart", () => ({ default: () => <div data-testid="trend" /> }));
vi.mock("../components/Compliance/MttrCard", () => ({ default: () => <div data-testid="mttr" /> }));
vi.mock("../components/Compliance/ComplianceCategoryBreakdown", () => ({ default: () => <div data-testid="categories" /> }));
vi.mock("./SecurityBaselines", () => ({ default: () => <div data-testid="baselines" /> }));
// Trae su propio fetch y tiene su propia suite.
vi.mock("../components/Compliance/WhatToFixFirst", () => ({ default: () => <div data-testid="fixfirst" /> }));

import SecurityCompliance from "./SecurityCompliance";
import { ConfirmProvider } from "../components/common/ConfirmDialog";

afterEach(() => {
  cleanup();
  server.resetHandlers();
  // useCachedFetch keeps `securityCompliance:all` in module memory — without
  // this the failure test would render test 1's cached data.
  clearCachedFetch();
});

const BASE = "/api/v1/security/compliance";

// ── Real envelopes (mirror compliance.controller.ts) ──────────────────
const SUMMARY = {
  ok: true,
  summary: {
    devicesReporting: 12,
    avgScore: 81.4,
    avgScoreAdjusted: 88.0,
    statusBreakdown: { compliant: 9, non_compliant: 3, unknown: 0 },
    openFindings: { total: 7, critical: 2, high: 3, medium: 1, low: 1, info: 0 },
  },
};
const FRAMEWORKS = {
  ok: true,
  frameworks: [
    { framework: "cis_windows_11_v3.0", family: "CIS", shortName: "CIS Win11" },
    { framework: "nist_800_53_rev5", family: "NIST", shortName: "NIST 800-53" },
  ],
  packActive: true,
  totalFrameworks: 12,
  activeFrameworks: ["cis_windows_11_v3.0", "nist_800_53_rev5"],
};
const FRAMEWORK_SUMMARY = {
  ok: true,
  packActive: true,
  items: [
    { framework: "cis_windows_11_v3.0", devicesReporting: 12, compliant: 9, nonCompliant: 3, unknown: 0, avgScore: 80 },
    { framework: "nist_800_53_rev5", devicesReporting: 12, compliant: 10, nonCompliant: 2, unknown: 0, avgScore: 84 },
  ],
};
const DEVICES = {
  ok: true,
  framework: null,
  count: 2,
  items: [
    { agentId: "dev-a", hostname: "WS-ALPHA", platform: "windows", agentVersion: "1.1.44", overallStatus: "fail", overallScore: 55, overallScoreAdjusted: 60, scoresByFramework: {}, patchSummary: null, collectedAtUtc: "2026-08-19T00:00:00Z" },
    { agentId: "dev-b", hostname: "WS-BETA", platform: "linux", agentVersion: "1.1.44", overallStatus: "pass", overallScore: 96, overallScoreAdjusted: 96, scoresByFramework: {}, patchSummary: null, collectedAtUtc: "2026-08-19T00:00:00Z" },
  ],
};
// settings envelope — the one that was mis-read for a release.
const SETTINGS = {
  ok: true,
  settings: {
    tenantId: "1",
    effective: { complianceMinChecks: 5, complianceBandGoodMin: 90, complianceBandWarningMin: 70, activeFrameworks: FRAMEWORKS.activeFrameworks },
    overrides: { complianceMinChecks: null, complianceBandGoodMin: 90, complianceBandWarningMin: 70, activeFrameworks: FRAMEWORKS.activeFrameworks },
    systemDefaults: { complianceMinChecks: 5, complianceBandGoodMin: 85, complianceBandWarningMin: 60 },
    updatedAt: null,
  },
};

function mountPage({ settings = SETTINGS } = {}) {
  respond("get", `${BASE}/summary`, SUMMARY);
  respond("get", `${BASE}/frameworks`, FRAMEWORKS);
  respond("get", `${BASE}/framework-summary`, FRAMEWORK_SUMMARY);
  respond("get", `${BASE}/devices`, DEVICES);
  respond("get", `${BASE}/settings`, settings);
  // Fase C policy read for the baseline bridge — minimal valid envelope.
  respond("get", "/api/v1/policies/tenants/1/policy", { ok: true, policy: { policy_version: 1, policy_hash: "h", policy_json: {} } });
  return render(<ConfirmProvider><SecurityCompliance /></ConfirmProvider>);
}

describe("SecurityCompliance — real envelopes over MSW", () => {
  it("renders hero KPIs, framework table, device table and the pack chip from the real shapes", async () => {
    mountPage();
    // Hero reads res.summary.*
    // Titular único (sustituye a los cuatro KPIs): el score, su banda EN
    // PALABRAS y el contexto en una línea. Con las bandas 90/70 del tenant,
    // 81 cae en "needs attention" — que es justo lo que un `81%` a secas no
    // le decía a nadie.
    expect(await screen.findByText("81%")).toBeInTheDocument();
    expect(await screen.findByText("Needs attention")).toBeInTheDocument();
    expect(await screen.findByText(/9 of 12 devices/)).toBeInTheDocument();
    // Framework table reads res.items[] and the pack chip reads packActive/totalFrameworks
    expect(await screen.findByText("Pack: 2 of 12")).toBeInTheDocument();
    expect(screen.getByText("CIS Win11")).toBeInTheDocument();
    // Device table reads res.items[].hostname
    expect(screen.getByText("WS-ALPHA")).toBeInTheDocument();
    expect(screen.getByText("WS-BETA")).toBeInTheDocument();
    // Tabs present (Fase B)
    expect(screen.getByRole("tab", { name: /Posture/ })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Baselines/ })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Catalog/ })).toBeInTheDocument();
  });

  it("bands come from res.settings.effective (the envelope that was mis-read for a release)", async () => {
    mountPage();
    await waitFor(() => expect(screen.getByText("WS-ALPHA")).toBeInTheDocument());
    // With tenant bands 90/70, a 96 is 'good' and a 55 is 'critical'. We
    // assert via the score-band FILTER (same thresholds feed it) rather
    // than colour: select "Good" and only WS-BETA (96) should remain —
    // under the DEFAULT 85/60 scale the result would be identical, so
    // also check the band caption in the select reflects 90/70.
    const bandSelect = screen.getByLabelText("Score band");
    expect(bandSelect).toBeInTheDocument();
    // MUI Select: open it and read the option captions (which are
    // built from bands.goodMin / warningMin).
    const { fireEvent } = await import("@testing-library/react");
    fireEvent.mouseDown(within(bandSelect.closest(".MuiFormControl-root")).getByRole("combobox"));
    const listbox = await screen.findByRole("listbox");
    expect(within(listbox).getByText(/Good \(≥90\)/)).toBeInTheDocument();
    expect(within(listbox).getByText(/Warning \(70–89\)/)).toBeInTheDocument();
  });

  it("a failed section is reported by name instead of rendering an empty table", async () => {
    respond("get", `${BASE}/summary`, SUMMARY);
    respond("get", `${BASE}/frameworks`, FRAMEWORKS);
    respond("get", `${BASE}/framework-summary`, { error: "boom" }, { status: 500 });
    respond("get", `${BASE}/devices`, DEVICES);
    respond("get", `${BASE}/settings`, SETTINGS);
    respond("get", "/api/v1/policies/tenants/1/policy", { ok: true, policy: { policy_version: 1, policy_hash: "h", policy_json: {} } });
    render(<ConfirmProvider><SecurityCompliance /></ConfirmProvider>);
    await waitFor(() => expect(screen.getByText(/Some sections failed to load/)).toBeInTheDocument());
    expect(screen.getByText(/framework summary/)).toBeInTheDocument();
    // …and the rest still rendered.
    expect(screen.getByText("WS-ALPHA")).toBeInTheDocument();
  });
});
