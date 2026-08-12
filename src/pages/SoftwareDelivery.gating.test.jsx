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

vi.mock("../auth/AuthContext", () => ({
  useAuthContext: () => ({
    auth: MOCK_AUTH,
    loading: false,
    refreshAuth: vi.fn().mockResolvedValue(MOCK_AUTH),
  }),
  AuthProvider: ({ children }) => children,
}));

import SoftwareDelivery from "./SoftwareDelivery";

afterEach(() => {
  cleanup();
  server.resetHandlers();
});

const DISABLED_BANNER = /plugin is disabled for this tenant/i;

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
  respond("get", /\/api\/v1\/policies\/tenants\/.*\/policy.*/, policyEnvelope(enabledPlugins));
  // Everything else the tabs fan out to — empty collections.
  respond("get", /\/api\/v1\/software-delivery.*/, { ok: true, items: [] });
  return render(<SoftwareDelivery onNavigate={vi.fn()} />);
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
