// src/pages/AgentSettings.test.jsx
//
// The page against real MSW handlers — what the old page never had. Each
// test pins one of the invariants listed at the top of AgentSettings.jsx:
// what a save sends (slice only, If-Match, plugins preserved), when a save
// is refused (no catalog, failed read), and what the tools show.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

import { server, http, HttpResponse, respond } from "../test/msw/server";
import { ConfirmProvider } from "../components/common/ConfirmDialog";
import { clearCachedFetch } from "../hooks/useCachedFetch";

const MOCK_AUTH = {
  tenantId: "t-1",
  tenantMember: { role: "ADMIN", isActive: true, tenantId: "t-1" },
  email: "admin@tracenium.test",
  bootstrap: { tenantId: "t-1" },
};

vi.mock("../auth/AuthContext", () => ({
  useAuthContext: () => ({ auth: MOCK_AUTH, loading: false, refreshAuth: vi.fn().mockResolvedValue(MOCK_AUTH) }),
  AuthProvider: ({ children }) => children,
}));

import AgentSettings from "./AgentSettings";

const CATALOG = [
  { key: "amp", label: "AMP", title: "Asset Management", required: true, tier_required: "starter" },
  { key: "scp", label: "SCP", title: "Security Compliance", impliesModule: "compliance", tier_required: "pro" },
  { key: "pmp", label: "PMP", title: "Patch Management", impliesModule: "patch", tier_required: "pro" },
  { key: "sdp", label: "SDP", title: "Software Delivery", tier_required: "pro" },
  { key: "cdp", label: "CDP", title: "Crypto Discovery", tier_required: "enterprise" },
  { key: "rcp", label: "RCP", title: "Remote Control", impliesModule: "remoteControl", tier_required: "enterprise" },
];

const TENANT_VERSION = "1788476532943";
const CURRENT = `${TENANT_VERSION}-rf2129992`;
const OLD = `${TENANT_VERSION}-r79ddcd28`;

const TENANT_POLICY = {
  ok: true,
  policy: {
    policy_version: TENANT_VERSION,
    policy_hash: "deadbeefdeadbeef",
    updated_at: "2026-09-05T10:00:00Z",
    policy_json: {
      plugins: { enabled: ["amp", "scp", "pmp", "rcp"] },
      modules: { compliance: true, patch: true, remoteControl: true },
      update: { intervalSeconds: 21600 },
      features: { selfUpdate: true },
      security: { mode: "audit" },
    },
  },
};

const NOW = Date.now();
const iso = (daysAgo) => new Date(NOW - daysAgo * 86400000).toISOString();

const STATUS = {
  ok: true,
  items: [
    { device_id: "dev-1", is_connected: true, desired_policy_source: "tenant", desired_policy_version: CURRENT, last_ack_policy_version: CURRENT, last_ack_status: 0, last_ack_at: iso(0.1), last_heartbeat: iso(0) },
    { device_id: "dev-2", is_connected: true, desired_policy_source: "device", desired_policy_version: "1788500000000", last_ack_policy_version: "1788500000000", last_ack_status: 0, last_ack_at: iso(0.2), last_heartbeat: iso(0) },
    { device_id: "dev-3", is_connected: false, desired_policy_source: "tenant", desired_policy_version: CURRENT, last_ack_policy_version: OLD, last_ack_status: 0, last_ack_at: iso(3), last_heartbeat: iso(2) },
    { device_id: "dev-4", is_connected: false, desired_policy_source: "tenant", desired_policy_version: CURRENT, last_ack_policy_version: "1770000000000", last_ack_status: 0, last_ack_at: iso(120), last_heartbeat: iso(120) },
  ],
};

const DEVICES = {
  ok: true,
  total: 4,
  items: [
    { deviceId: "dev-1", hostname: "LAPTOP-ONE", connected: true, agentVersion: "1.1.60" },
    { deviceId: "dev-2", hostname: "SRV-OVERRIDE", connected: true, agentVersion: "1.1.60" },
    { deviceId: "dev-3", hostname: "DESKTOP-THREE", connected: false, agentVersion: "1.1.59" },
    { deviceId: "dev-4", hostname: "GHOST-FOUR", connected: false, agentVersion: "1.1.13" },
  ],
};

const COVERAGE = { ok: true, total: 4, byPlugin: [{ plugin: "amp", count: 4 }, { plugin: "scp", count: 3 }] };

function mockBase({ catalog = CATALOG, policy = TENANT_POLICY, policyStatus = 200 } = {}) {
  respond("get", "/api/v1/policies/plugins/catalog", { ok: true, catalog, entitled: ["amp", "scp", "pmp", "sdp"] });
  respond("get", "/api/v1/policies/tenants/t-1/policy", policyStatus === 200 ? policy : { ok: false, message: "backend down" }, { status: policyStatus });
  respond("get", "/api/v1/policies/tenants/t-1/policy-status", STATUS);
  respond("get", "/api/v1/orchestrator/known-devices", DEVICES);
  respond("get", "/api/v1/dashboard/plugin-coverage", COVERAGE);
  respond("get", "/api/v1/patch-management/gateways", { ok: true, data: { gateways: [] } });
}

function renderPage(props = {}) {
  return render(
    <ConfirmProvider>
      <AgentSettings embedded {...props} />
    </ConfirmProvider>
  );
}

async function settled() {
  // The version line only renders once the tenant policy is in.
  await screen.findByText(new RegExp(`version ${TENANT_VERSION}`));
}

beforeEach(() => {
  // usePluginCatalog keeps an in-memory cache across renders — and across
  // tests, which would hand the "empty catalog" test the previous one's.
  clearCachedFetch();
  window.localStorage.clear();
  window.history.replaceState({}, "", "/");
});

afterEach(() => {
  cleanup();
  server.resetHandlers();
});

describe("navigation", () => {
  it("lists one entry per plugin, dims the ones not active in the policy, and lists the tools", async () => {
    mockBase();
    renderPage();
    await settled();
    const nav = screen.getByRole("navigation", { name: "Agent settings sections" });
    expect(within(nav).getByText("Asset Management")).toBeInTheDocument();
    expect(within(nav).getByText("Remote Control")).toBeInTheDocument();
    expect(within(nav).getByText("Policy rollout")).toBeInTheDocument();
    expect(within(nav).getByText("Overrides")).toBeInTheDocument();
    // cdp and sdp are not in plugins.enabled → dimmed, not hidden
    const cdp = within(nav).getByText("Crypto Discovery").closest("[role=button]");
    expect(cdp).toHaveAttribute("aria-disabled", "true");
  });

  it("opens the section from ?agentSection=", async () => {
    window.history.replaceState({}, "", "/?agentSection=scp");
    mockBase();
    renderPage();
    await settled();
    expect(screen.getByRole("heading", { name: "Security Compliance" })).toBeInTheDocument();
    expect(screen.getByLabelText("Evaluation interval (seconds)")).toBeInTheDocument();
  });

  it("shows the plan view read-only: no toggles, a status and a plan per plugin", async () => {
    mockBase();
    renderPage();
    await settled();
    fireEvent.click(screen.getByText("Plugins"));
    const table = await screen.findByRole("table", { name: "Plugins in this plan" });
    expect(within(table).queryByRole("checkbox")).toBeNull();
    // cdp: not enabled, not entitled
    const cdpRow = within(table).getByText("Crypto Discovery").closest("tr");
    expect(within(cdpRow).getByText("Not in plan")).toBeInTheDocument();
    expect(within(cdpRow).getByText("Enterprise")).toBeInTheDocument();
    // rcp: enabled but not entitled → flagged
    const rcpRow = within(table).getByText("Remote Control").closest("tr");
    expect(within(rcpRow).getByText("Active · not in plan")).toBeInTheDocument();
    // coverage column from the dashboard endpoint
    const scpRow = within(table).getByText("Security Compliance").closest("tr");
    expect(within(scpRow).getByText("3 / 4")).toBeInTheDocument();
  });
});

describe("saving the tenant policy", () => {
  it("shows the diff first, then PATCHes the agent-config slice with If-Match and the plugin list intact", async () => {
    mockBase();
    const patches = respond("patch", "/api/v1/policies/tenants/t-1/policy/domains/agent-config", { ok: true });
    renderPage();
    await settled();

    const save = screen.getByRole("button", { name: /Review and save/ });
    expect(save).toBeDisabled(); // nothing changed yet

    fireEvent.change(screen.getByLabelText("Update probe interval (seconds)"), { target: { value: "7200" } });
    expect(await screen.findByText("1 unsaved change")).toBeInTheDocument();
    // the nav badge points at the section the change lives in
    expect(screen.getByLabelText("1 unsaved change in Agent")).toBeInTheDocument();

    fireEvent.click(save);
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("update.intervalSeconds")).toBeInTheDocument();
    expect(within(dialog).getByText("21600")).toBeInTheDocument();
    expect(within(dialog).getByText("7200")).toBeInTheDocument();
    // no other leaf changed: the plugin block is not in the diff
    expect(within(dialog).queryByText(/plugins\.enabled/)).toBeNull();

    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(patches).toHaveLength(1));
    const call = patches[0];
    expect(call.headers["if-match"]).toBe(TENANT_VERSION);
    expect(call.body.update.intervalSeconds).toBe(7200);
    expect(call.body.plugins.enabled).toEqual(expect.arrayContaining(["amp", "scp", "pmp", "rcp"]));
    expect(call.body.security).toBeUndefined();
    expect(call.body.mam).toBeUndefined();
    expect(await screen.findByText("Agent settings saved")).toBeInTheDocument();
  });

  it("refuses to save while the plugin catalog is empty", async () => {
    mockBase({ catalog: [] });
    const patches = respond("patch", "/api/v1/policies/tenants/t-1/policy/domains/agent-config", { ok: true });
    renderPage();
    await settled();
    fireEvent.change(screen.getByLabelText("Update probe interval (seconds)"), { target: { value: "7200" } });
    await screen.findByText("1 unsaved change");
    expect(screen.getByRole("button", { name: /Review and save/ })).toBeDisabled();
    expect(patches).toHaveLength(0);
  });

  it("refuses to save when the policy could not be read", async () => {
    mockBase({ policyStatus: 500 });
    renderPage();
    expect(await screen.findByText("Couldn't read the current policy")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Update probe interval (seconds)"), { target: { value: "7200" } });
    await screen.findByText("1 unsaved change");
    expect(screen.getByRole("button", { name: /Review and save/ })).toBeDisabled();
  });

  it("blocks an out-of-range interval", async () => {
    mockBase();
    renderPage();
    await settled();
    fireEvent.change(screen.getByLabelText("Update probe interval (seconds)"), { target: { value: "5" } });
    await screen.findByText("1 unsaved change");
    expect(screen.getByRole("button", { name: /Review and save/ })).toBeDisabled();
    expect(screen.getByText(/Update probe interval must be between/)).toBeInTheDocument();
  });

  it("surfaces a 409 as a warning and reloads", async () => {
    mockBase();
    respond("patch", "/api/v1/policies/tenants/t-1/policy/domains/agent-config", { ok: false, code: "STALE_POLICY" }, { status: 409 });
    renderPage();
    await settled();
    fireEvent.change(screen.getByLabelText("Update probe interval (seconds)"), { target: { value: "7200" } });
    fireEvent.click(await screen.findByRole("button", { name: /Review and save/ }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    expect(await screen.findByText(/modified by someone else/)).toBeInTheDocument();
  });
});

describe("tools", () => {
  it("rollout: counts the active fleet, keeps the stale device apart, and charts the versions", async () => {
    mockBase();
    renderPage();
    await settled();
    fireEvent.click(screen.getByText("Policy rollout"));
    expect(await screen.findByRole("heading", { name: "Policy rollout" })).toBeInTheDocument();
    expect(screen.getByText(/\(1 excluded\)/)).toBeInTheDocument();
    // dev-1 and dev-2 in sync, dev-3 offline-behind; dev-4 excluded
    expect(screen.getByText("of 3 active")).toBeInTheDocument();
    expect(screen.getByTestId("rollout-chart")).toBeInTheDocument();
    // the excluded device is not in the default table
    expect(screen.queryByText("GHOST-FOUR")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Excluded" }));
    expect(await screen.findByText("GHOST-FOUR")).toBeInTheDocument();
  });

  it("overrides: lists only devices whose desired policy is their own", async () => {
    mockBase();
    renderPage();
    await settled();
    fireEvent.click(screen.getByText("Overrides"));
    expect(await screen.findByText("SRV-OVERRIDE")).toBeInTheDocument();
    expect(screen.queryByText("LAPTOP-ONE")).toBeNull();
    expect(screen.getByText(/1 device runs a policy of its own/)).toBeInTheDocument();
  });
});

describe("device scope", () => {
  const OVERRIDE = {
    ok: true,
    policy: {
      policy_version: "1788500000000",
      policy_hash: "cafe",
      policy_json: { plugins: { enabled: ["amp", "scp"] }, update: { intervalSeconds: 3600 }, security: { mode: "audit" } },
    },
  };
  const EFFECTIVE = { ok: true, policy: { source: "device", policy_version: "1788500000000", policy_json: OVERRIDE.policy.policy_json } };
  const DEV_STATUS = { ok: true, status: STATUS.items[1] };

  it("opens a device from ?agentDevice= and patches its override by domain with If-Match", async () => {
    window.history.replaceState({}, "", "/?agentDevice=dev-2");
    mockBase();
    respond("get", "/api/v1/policies/devices/dev-2/policy", OVERRIDE);
    respond("get", "/api/v1/policies/devices/dev-2/effective-policy", EFFECTIVE);
    respond("get", "/api/v1/policies/devices/dev-2/policy-status", DEV_STATUS);
    const patches = respond("patch", "/api/v1/policies/devices/dev-2/policy/domains/agent-config", { ok: true });
    renderPage();
    expect(await screen.findByText(/SRV-OVERRIDE/)).toBeInTheDocument();
    expect(await screen.findByText("override 1788500000000")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Update probe interval (seconds)"), { target: { value: "7200" } });
    fireEvent.click(await screen.findByRole("button", { name: /Review and update override/ }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Update override" }));
    await waitFor(() => expect(patches).toHaveLength(1));
    expect(patches[0].headers["if-match"]).toBe("1788500000000");
    expect(patches[0].body.update.intervalSeconds).toBe(7200);
    expect(patches[0].body.plugins.enabled).toEqual(expect.arrayContaining(["amp", "scp"]));
  });

  it("creates a first override from the effective policy with the whole document, so security travels with it", async () => {
    window.history.replaceState({}, "", "/?agentDevice=dev-1");
    mockBase();
    server.use(http.get(`${import.meta.env.VITE_API_BASE}/api/v1/policies/devices/dev-1/policy`, () => HttpResponse.json({ ok: false, code: "NOT_FOUND" }, { status: 404 })));
    respond("get", "/api/v1/policies/devices/dev-1/effective-policy", { ok: true, policy: { source: "tenant", policy_version: CURRENT, policy_json: TENANT_POLICY.policy.policy_json } });
    respond("get", "/api/v1/policies/devices/dev-1/policy-status", { ok: true, status: STATUS.items[0] });
    const puts = respond("put", "/api/v1/policies/devices/dev-1/policy", { ok: true });
    renderPage();
    expect(await screen.findByText("no override · follows the tenant policy")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Update probe interval (seconds)"), { target: { value: "7200" } });
    fireEvent.click(await screen.findByRole("button", { name: /Review and create override/ }));
    const dialog = await screen.findByRole("dialog");
    // only the edited leaf differs from what the device runs today
    expect(within(dialog).getByText("update.intervalSeconds")).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Create override" }));
    await waitFor(() => expect(puts).toHaveLength(1));
    expect(puts[0].headers["if-match"]).toBeUndefined();
    expect(puts[0].body.plugins.enabled).toEqual(expect.arrayContaining(["amp", "scp", "pmp", "rcp"]));
    expect(puts[0].body.security).toEqual({ mode: "audit" });
    expect(puts[0].body.update.intervalSeconds).toBe(7200);
  });

  it("refuses to save when the override could not be read", async () => {
    window.history.replaceState({}, "", "/?agentDevice=dev-2");
    mockBase();
    respond("get", "/api/v1/policies/devices/dev-2/policy", { ok: false, message: "backend down" }, { status: 500 });
    respond("get", "/api/v1/policies/devices/dev-2/effective-policy", EFFECTIVE);
    respond("get", "/api/v1/policies/devices/dev-2/policy-status", DEV_STATUS);
    renderPage();
    expect(await screen.findByText("Couldn't read the current policy")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Update probe interval (seconds)"), { target: { value: "7200" } });
    await screen.findByText("1 unsaved change");
    expect(screen.getByRole("button", { name: /Review and/ })).toBeDisabled();
  });
});
