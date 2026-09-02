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
    // Coverage mirrors prod: CIS is barely mapped (11 of 94), NIST is
    // mapped broadly (92 of 94).
    { framework: "cis_windows_11_v3.0", family: "CIS", shortName: "CIS Win11", mappedChecks: 11, catalogChecks: 94 },
    { framework: "nist_800_53_rev5", family: "NIST", shortName: "NIST 800-53", mappedChecks: 92, catalogChecks: 94 },
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
  // ADR-0011 Phase 3 — canManage now comes from this endpoint instead
  // of MOCK_AUTH's role directly; ADMIN holds security_compliance.
  respond("get", "/api/v1/tenants/1/roles/me/capabilities", { role: "ADMIN", permissions: ["security_compliance"] });
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
    expect(await screen.findByText("Tracking 2 of 12")).toBeInTheDocument();
    expect(screen.getByText("CIS Win11")).toBeInTheDocument();
    // Device table reads res.items[].hostname
    expect(screen.getByText("WS-ALPHA")).toBeInTheDocument();
    expect(screen.getByText("WS-BETA")).toBeInTheDocument();
    // Tabs present (Fase B)
    expect(screen.getByRole("tab", { name: /Fleet status/ })).toBeInTheDocument();
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

  // ── La tabla de equipos ya no se pinta entera ─────────────────────
  // Se renderizaban todas las filas. A 21 y 50 equipos no se nota; el
  // operador preguntó pensando en crecer, y tenía razón.
  it("paginates the device table instead of rendering every row", async () => {
    const many = Array.from({ length: 60 }, (_, i) => ({
      agentId: `dev-${i}`,
      hostname: `WS-${String(i).padStart(3, "0")}`,
      platform: "windows",
      agentVersion: "1.1.49",
      overallStatus: "fail",
      overallScore: 40 + i,
      overallScoreAdjusted: null,
      scoresByFramework: {},
      patchSummary: null,
      collectedAtUtc: "2026-09-01T00:00:00Z",
    }));
    respond("get", `${BASE}/summary`, SUMMARY);
    respond("get", `${BASE}/frameworks`, FRAMEWORKS);
    respond("get", `${BASE}/framework-summary`, FRAMEWORK_SUMMARY);
    respond("get", `${BASE}/devices`, { ok: true, framework: null, count: 60, items: many });
    respond("get", `${BASE}/settings`, SETTINGS);
    respond("get", "/api/v1/policies/tenants/1/policy", { ok: true, policy: { policy_version: 1, policy_hash: "h", policy_json: {} } });
    respond("get", "/api/v1/tenants/1/roles/me/capabilities", { role: "ADMIN", permissions: ["security_compliance"] });
    render(<ConfirmProvider><SecurityCompliance /></ConfirmProvider>);

    // Primera página: 25 filas. La 26ª existe en los datos y no en el DOM.
    await waitFor(() => expect(screen.getByText("WS-000")).toBeInTheDocument());
    expect(screen.getByText("WS-024")).toBeInTheDocument();
    expect(screen.queryByText("WS-025")).not.toBeInTheDocument();
    // El recuento sigue hablando del conjunto completo, no de la página.
    expect(screen.getByText(/60 of 60 devices/)).toBeInTheDocument();
  });

  it("says so when the backend truncated the device list", async () => {
    // Una lista incompleta presentada como completa es la clase de
    // mentira que hace que nadie se fíe del resto de la página.
    respond("get", `${BASE}/summary`, SUMMARY);
    respond("get", `${BASE}/frameworks`, FRAMEWORKS);
    respond("get", `${BASE}/framework-summary`, FRAMEWORK_SUMMARY);
    respond("get", `${BASE}/devices`, { ...DEVICES, truncated: true, rowCap: 2000 });
    respond("get", `${BASE}/settings`, SETTINGS);
    respond("get", "/api/v1/policies/tenants/1/policy", { ok: true, policy: { policy_version: 1, policy_hash: "h", policy_json: {} } });
    respond("get", "/api/v1/tenants/1/roles/me/capabilities", { role: "ADMIN", permissions: ["security_compliance"] });
    render(<ConfirmProvider><SecurityCompliance /></ConfirmProvider>);

    await waitFor(() =>
      expect(screen.getByText(/Showing the first 2000 devices/)).toBeInTheDocument()
    );
  });

  it("stays quiet about truncation when the list is complete", async () => {
    mountPage();
    await waitFor(() => expect(screen.getByText("WS-ALPHA")).toBeInTheDocument());
    expect(screen.queryByText(/Showing the first/)).not.toBeInTheDocument();
  });

  // ── Cobertura de mapeo por framework ──────────────────────────────
  // Elegir CIS Windows 11 da un score sobre 11 de 94 controles. Sin
  // decirlo, se lee como una postura CIS — y quien compara el catálogo
  // con el framework concluye que el catálogo viene recortado.
  it("flags a framework whose mapping covers little of the catalog", async () => {
    mountPage();
    await waitFor(() => expect(screen.getByText("CIS Win11")).toBeInTheDocument());

    expect(screen.getByText(/11 of 94 controls mapped — narrow coverage/)).toBeInTheDocument();
    // The broadly-mapped one states its coverage without the warning.
    expect(screen.getByText("92 of 94 controls mapped")).toBeInTheDocument();
  });

  it("says nothing about coverage when the backend does not report it", async () => {
    // An older backend omits the counts; a missing number must not turn
    // into a scary one.
    respond("get", `${BASE}/summary`, SUMMARY);
    respond("get", `${BASE}/frameworks`, {
      ...FRAMEWORKS,
      frameworks: [{ framework: "nist_800_53_rev5", family: "NIST", shortName: "NIST 800-53" }],
    });
    respond("get", `${BASE}/framework-summary`, FRAMEWORK_SUMMARY);
    respond("get", `${BASE}/devices`, DEVICES);
    respond("get", `${BASE}/settings`, SETTINGS);
    respond("get", "/api/v1/policies/tenants/1/policy", { ok: true, policy: { policy_version: 1, policy_hash: "h", policy_json: {} } });
    respond("get", "/api/v1/tenants/1/roles/me/capabilities", { role: "ADMIN", permissions: ["security_compliance"] });
    render(<ConfirmProvider><SecurityCompliance /></ConfirmProvider>);

    await waitFor(() => expect(screen.getByText("WS-ALPHA")).toBeInTheDocument());
    expect(screen.queryByText(/controls mapped/)).not.toBeInTheDocument();
  });
});
