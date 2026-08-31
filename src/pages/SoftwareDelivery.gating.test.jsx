// src/pages/SoftwareDelivery.gating.test.jsx
//
// Regression net for the SDP plugin-entitlement gate.
//
// The bug this locks down: GET /policies/tenants/:id/policy answers a
// WRAPPED row — `{ ok, policy: { policy_version, policy_hash, policy_json } }`.
// The page used to read `res.policy_json` directly, which is undefined on
// that shape, so getEnabledPluginSet saw an empty policy and the page
// rendered "Software Delivery plugin is disabled for this tenant" (and hid
// every write control, including Distribution's "Add site" / "Designate DP")
// for tenants that DID have sdp enabled.
//
// These tests assert the gate against the REAL response envelope, so a
// future refactor that re-flattens the unwrap fails here instead of in
// production.

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";

import { server, respond } from "../test/msw/server";

const MOCK_AUTH = {
  tenantId: "1",
  tenantMember: { role: "ADMIN", isActive: true, tenantId: "1" },
  email: "op@tracenium.test",
  bootstrap: { tenantId: "1" },
};

// El tenant seleccionado en la cartera MSP. Los tests lo mueven para
// ejercitar la navegación de portfolio, donde `auth` NO trae el tenant.
let mockActiveTenant = null;
vi.mock("../msp/MspContext", () => ({
  useMspOptional: () => ({ activeTenant: mockActiveTenant }),
}));

let mockAuth = MOCK_AUTH;
vi.mock("../auth/AuthContext", () => ({
  useAuthContext: () => ({
    auth: mockAuth,
    loading: false,
    refreshAuth: vi.fn().mockResolvedValue(MOCK_AUTH),
  }),
  AuthProvider: ({ children }) => children,
}));

import SoftwareDelivery from "./SoftwareDelivery";

afterEach(() => {
  mockAuth = MOCK_AUTH;
  mockActiveTenant = null;
  cleanup();
  server.resetHandlers();
});

const DISABLED_BANNER = /isn't active for this tenant/i;

/** The exact envelope the backend returns (policies.controller.ts). */
function policyEnvelope(enabledPlugins) {
  return {
    ok: true,
    policy: {
      policy_version: 3,
      policy_hash: "abc123",
      policy_json: { plugins: { enabled: enabledPlugins } },
    },
  };
}

function mountWithPolicy(enabledPlugins) {
  respond("get", /\/api\/v1\/plugins\/catalog.*/, {
    ok: true,
    catalog: [
      { key: "amp", required: true },
      { key: "sdp", required: false },
    ],
  });
  const policyCalls = respond(
    "get",
    /\/api\/v1\/policies\/tenants\/.*\/policy.*/,
    policyEnvelope(enabledPlugins)
  );
  // Everything else the tabs fan out to — empty collections.
  respond("get", /\/api\/v1\/software-delivery.*/, { ok: true, items: [] });
  // `policyCalls` is what lets a test assert WHICH tenant was asked about —
  // the production bug was that no policy request happened at all.
  return { ...render(<SoftwareDelivery />), policyCalls };
}

describe("SoftwareDelivery — plugin entitlement gate", () => {
  it("treats sdp as ENABLED when the wrapped policy envelope lists it", async () => {
    mountWithPolicy(["amp", "scp", "pmp", "sdp", "cdp", "rcp"]);

    // The gate resolves asynchronously; wait for the page to settle, then
    // assert the false-negative banner never appears.
    await waitFor(() => {
      expect(screen.getByRole("tab", { name: /Distribution/i })).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(screen.queryByText(DISABLED_BANNER)).not.toBeInTheDocument();
    });
  });

  it("still shows the disabled banner when sdp is genuinely absent", async () => {
    mountWithPolicy(["amp", "scp", "pmp"]);

    await waitFor(() => {
      expect(screen.getByText(DISABLED_BANNER)).toBeInTheDocument();
    });
  });
});

describe("SoftwareDelivery — the tenant during portfolio navigation", () => {
  // ⚠️ THE PRODUCTION BUG, AND IT IS NOT ABOUT THE POLICY AT ALL.
  //
  // `auth.tenantId` is filled by /api/bootstrap only when the request carried
  // an `X-Tenant-Id` header. While the operator navigates the vendor/MSP
  // portfolio the selected tenant lives in the MSP context and auth has
  // nothing — measured against production: no header → tenantId absent and
  // tenantMember null.
  //
  // The page read `auth?.tenantId`, found nothing, and returned from its effect
  // WITHOUT REQUESTING THE POLICY AT ALL (confirmed in the network log: zero
  // calls to /policies/tenants/*/policy). No request means no error, so the
  // "isn't active" banner rendered for a tenant whose policy had sdp enabled
  // and whose subscription was active.
  it("reads the tenant from the MSP scope when auth does not carry it", async () => {
    mockAuth = { tenantMember: { role: "ADMIN", isActive: true }, email: "op@tracenium.test" };
    mockActiveTenant = { id: "113", name: "Gtec" };

    const { policyCalls } = mountWithPolicy(["amp", "scp", "pmp", "sdp", "cdp", "rcp"]);

    // ⚠️ ASSERTS THE REQUEST, NOT THE ABSENCE OF A BANNER.
    //
    // The first version of this test waited for the Distribution tab and
    // checked that the "isn't active" banner was gone. Both pass with the bug
    // reintroduced: reads stay open so the tabs render either way, and with no
    // tenant the page shows a DIFFERENT banner ("No tenant selected") that the
    // regex never matched. Reverting the page to `auth?.tenantId` failed
    // nothing. What the bug actually did was make zero policy requests, so
    // that is what to measure.
    await waitFor(() => expect(policyCalls).toHaveLength(1));
    expect(policyCalls[0].pathname).toContain("/tenants/113/policy");
  });

  // ⚠️ "We don't know which tenant" must never be reported as "this tenant is
  // not entitled". Conflating them is what sent this investigation into
  // subscriptions and policy rows that were correct the whole time.
  it("says no tenant is selected rather than blaming the plugin", async () => {
    mockAuth = { tenantMember: { role: "ADMIN", isActive: true } };
    mockActiveTenant = null;

    mountWithPolicy(["amp", "scp", "pmp", "sdp"]);

    expect(await screen.findByText(/no tenant selected/i)).toBeInTheDocument();
    expect(screen.queryByText(DISABLED_BANNER)).not.toBeInTheDocument();
  });
});
