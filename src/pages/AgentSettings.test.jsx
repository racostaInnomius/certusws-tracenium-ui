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

// Phase B: overrides are PATCHES. dev-2 changes only its CDP interval.
const DEV2_PATCH = { cdp: { intervalSeconds: 900 } };
const OVERRIDES = {
  ok: true,
  count: 1,
  items: [
    {
      device_id: "dev-2",
      policy_version: "1788500000000",
      policy_hash: "sha256:cafe",
      policy_json: DEV2_PATCH,
      updated_at: iso(0.5),
      csr_common_name: "SRV-OVERRIDE",
      last_seen_at: iso(0),
      is_connected: true,
      last_ack_status: 0,
      last_ack_at: iso(0.2),
      overridden_paths: ["cdp"],
      provenance: { cdp: { batchId: "b-1", groupId: 26 } },
    },
    {
      device_id: "dev-3",
      policy_version: "1788500000005",
      policy_hash: "sha256:babe",
      policy_json: { update: { intervalSeconds: 3600 } },
      updated_at: iso(0.3),
      csr_common_name: "DESKTOP-THREE",
      last_seen_at: iso(2),
      is_connected: false,
      last_ack_status: 0,
      last_ack_at: iso(3),
      desired_policy_version: `${TENANT_VERSION}-o1111aaaa`,
      last_ack_policy_version: OLD,
      overridden_paths: ["update"],
      provenance: {},
    },
  ],
};

// Phase C fixtures: one batch applied via a group, two saved versions, two groups.
const BATCHES = {
  ok: true,
  items: [
    { id: "b-1", tenant_id: "t-1", domain: "cdp", patch_json: DEV2_PATCH, group_id: 26, group_name: "SQL Servers", sync_membership: true, device_count: 1, live_device_count: 1, applied_by: "admin@t", applied_at: iso(1), last_sync_at: iso(0.1), revoked_at: null },
  ],
};
const OLD_VERSION = "1788000000000";
const HISTORY = {
  ok: true,
  items: [
    { id: 2, policy_version: TENANT_VERSION, policy_hash: "deadbeefdeadbeef", saved_at: iso(0.5), actor_subject: "a@t", reason: "domain:agent" },
    { id: 1, policy_version: OLD_VERSION, policy_hash: "0ld0ld0ld", saved_at: iso(2), actor_subject: null, reason: "seed" },
  ],
};
const GROUPS = { ok: true, items: [{ id: 26, name: "SQL Servers", kind: "dynamic", memberCount: 3 }, { id: 29, name: "Test Group - DP", kind: "static", memberCount: 4 }] };

function mockBase({ catalog = CATALOG, policy = TENANT_POLICY, policyStatus = 200 } = {}) {
  respond("get", "/api/v1/policies/plugins/catalog", { ok: true, catalog, entitled: ["amp", "scp", "pmp", "sdp"] });
  respond("get", "/api/v1/policies/tenants/t-1/policy", policyStatus === 200 ? policy : { ok: false, message: "backend down" }, { status: policyStatus });
  respond("get", "/api/v1/policies/tenants/t-1/policy-status", STATUS);
  respond("get", "/api/v1/orchestrator/known-devices", DEVICES);
  respond("get", "/api/v1/dashboard/plugin-coverage", COVERAGE);
  respond("get", "/api/v1/patch-management/gateways", { ok: true, data: { gateways: [] } });
  respond("get", "/api/v1/policies/tenants/t-1/policy/overrides", OVERRIDES);
  respond("get", "/api/v1/policies/tenants/t-1/policy/overrides/batches", BATCHES);
  respond("get", "/api/v1/policies/tenants/t-1/policy/history", HISTORY);
  respond("get", "/api/v1/asset-groups", GROUPS);
  respond("get", "/api/v1/cdp/probe-candidates", { ok: true, candidates: [] });
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
    // The plan comes from the catalog's entitlements: amp/scp/pmp/sdp → highest tier "pro".
    expect(within(nav).getByText("Plan · Professional")).toBeInTheDocument();
    expect(within(nav).getByText("plan")).toBeInTheDocument();
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
    expect(screen.getByLabelText("Evaluation interval")).toBeInTheDocument();
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
  it("shows the diff first, then PATCHes ONLY the touched domain with If-Match and no plugin block", async () => {
    mockBase();
    const patches = respond("patch", "/api/v1/policies/tenants/t-1/policy/domains/agent", { ok: true, policyVersion: "1788476540000" });
    renderPage();
    await settled();

    const save = screen.getByRole("button", { name: "Save Agent" });
    expect(save).toBeDisabled(); // nothing changed yet

    fireEvent.change(screen.getByLabelText("Update probe interval"), { target: { value: "7200" } });
    expect(await screen.findByText("1 unsaved change")).toBeInTheDocument();
    // the nav badge points at the section the change lives in
    expect(screen.getByLabelText("1 unsaved change in Agent")).toBeInTheDocument();

    fireEvent.click(save);
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("update.intervalSeconds")).toBeInTheDocument();
    expect(within(dialog).getByText("21600")).toBeInTheDocument();
    expect(within(dialog).getByText("7200")).toBeInTheDocument();
    expect(within(dialog).getByText(/Writes: Agent\./)).toBeInTheDocument();
    // no other leaf changed: the plugin block is not in the diff
    expect(within(dialog).queryByText(/plugins\.enabled/)).toBeNull();

    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(patches).toHaveLength(1));
    const call = patches[0];
    expect(call.headers["if-match"]).toBe(TENANT_VERSION);
    // The agent domain: update + the agent's own feature flags, nothing else.
    expect(call.body).toEqual({ update: { intervalSeconds: 7200 }, features: { selfUpdate: true } });
    expect(await screen.findByText("Agent saved")).toBeInTheDocument();
  });

  it("refuses to save while the plugin catalog is empty", async () => {
    mockBase({ catalog: [] });
    const patches = respond("patch", "/api/v1/policies/tenants/t-1/policy/domains/agent", { ok: true });
    renderPage();
    await settled();
    fireEvent.change(screen.getByLabelText("Update probe interval"), { target: { value: "7200" } });
    await screen.findByText("1 unsaved change");
    expect(screen.getByRole("button", { name: "Save Agent" })).toBeDisabled();
    expect(patches).toHaveLength(0);
  });

  it("refuses to save when the policy could not be read", async () => {
    mockBase({ policyStatus: 500 });
    renderPage();
    expect(await screen.findByText("Couldn't read the current policy")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Update probe interval"), { target: { value: "7200" } });
    await screen.findByText("1 unsaved change");
    expect(screen.getByRole("button", { name: "Save Agent" })).toBeDisabled();
  });

  it("blocks an out-of-range interval", async () => {
    mockBase();
    renderPage();
    await settled();
    fireEvent.change(screen.getByLabelText("Update probe interval"), { target: { value: "5" } });
    await screen.findByText("1 unsaved change");
    expect(screen.getByRole("button", { name: "Save Agent" })).toBeDisabled();
    expect(screen.getByText(/Update probe interval must be between/)).toBeInTheDocument();
  });

  it("surfaces a 409 as a warning and reloads", async () => {
    mockBase();
    respond("patch", "/api/v1/policies/tenants/t-1/policy/domains/agent", { ok: false, code: "STALE_POLICY" }, { status: 409 });
    renderPage();
    await settled();
    fireEvent.change(screen.getByLabelText("Update probe interval"), { target: { value: "7200" } });
    fireEvent.click(await screen.findByRole("button", { name: "Save Agent" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    expect(await screen.findByText(/modified by someone else/)).toBeInTheDocument();
  });
});

describe("saving two sections", () => {
  it("Discard puts the current section back without touching the other one", async () => {
    mockBase();
    renderPage();
    await settled();
    fireEvent.change(screen.getByLabelText("Update probe interval"), { target: { value: "7200" } });
    fireEvent.click(screen.getByText("Security Compliance"));
    fireEvent.change(await screen.findByLabelText("Evaluation interval"), { target: { value: "3600" } });
    await screen.findByText(/● 2 unsaved changes/);
    fireEvent.click(screen.getByRole("button", { name: "Discard" }));
    expect(await screen.findByText(/● 1 unsaved change/)).toBeInTheDocument();
    expect(screen.getByLabelText("Evaluation interval")).toHaveValue(null);
    expect(screen.getByLabelText("1 unsaved change in Agent")).toBeInTheDocument();
  });

  it("writes one PATCH per domain, chaining If-Match on the version each one returns", async () => {
    mockBase();
    const agentPatches = respond("patch", "/api/v1/policies/tenants/t-1/policy/domains/agent", { ok: true, policyVersion: "1788476540001" });
    const scpPatches = respond("patch", "/api/v1/policies/tenants/t-1/policy/domains/scp", { ok: true, policyVersion: "1788476540002" });
    renderPage();
    await settled();
    fireEvent.change(screen.getByLabelText("Update probe interval"), { target: { value: "7200" } });
    fireEvent.click(screen.getByText("Security Compliance"));
    fireEvent.change(await screen.findByLabelText("Evaluation interval"), { target: { value: "3600" } });
    expect(await screen.findByText(/2 unsaved changes in 2 sections/)).toBeInTheDocument();
    // The section button writes only its own domain…
    expect(screen.getByRole("button", { name: "Save Security Compliance" })).toBeEnabled();
    // …and "View diff · save all" writes every touched domain.
    fireEvent.click(screen.getByRole("button", { name: /View diff · save all/ }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/Writes: Agent, Security Compliance\./)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(scpPatches).toHaveLength(1));
    expect(agentPatches[0].headers["if-match"]).toBe(TENANT_VERSION);
    expect(scpPatches[0].headers["if-match"]).toBe("1788476540001");
    expect(scpPatches[0].body).toEqual({ compliance: { intervalSeconds: 3600 } });
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
    expect(screen.getByText(/of 3 active · 67 %/)).toBeInTheDocument();
    expect(screen.getByTestId("rollout-chart")).toBeInTheDocument();
    // Convergence since the tenant's last change (updated_at), with the current base named.
    expect(screen.getByTestId("convergence-chart")).toBeInTheDocument();
    // Agent version and source columns from the wireframe.
    expect(screen.getAllByText("1.1.60").length).toBeGreaterThan(0);
    expect(screen.getByText("Tenant + override")).toBeInTheDocument();
    // the excluded device is not in the default table
    expect(screen.queryByText("GHOST-FOUR")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Excluded" }));
    expect(await screen.findByText("GHOST-FOUR")).toBeInTheDocument();
  });

  it("rollout: resend to pending pushes each pending device", async () => {
    mockBase();
    // dev-2 pending: online, acked an older version than desired.
    server.use(
      http.get(`${import.meta.env.VITE_API_BASE}/api/v1/policies/tenants/t-1/policy-status`, () =>
        HttpResponse.json({ ok: true, items: STATUS.items.map((r) => (r.device_id === "dev-2" ? { ...r, desired_policy_source: "tenant", desired_policy_version: CURRENT, last_ack_policy_version: OLD } : r)) })
      )
    );
    const pushes = respond("post", "/api/v1/policies/devices/dev-2/policy/push", { ok: true, sent: true });
    renderPage();
    await settled();
    fireEvent.click(screen.getByText("Policy rollout"));
    const resend = await screen.findByRole("button", { name: /Resend to pending \(1\)/ });
    fireEvent.click(resend);
    await waitFor(() => expect(pushes).toHaveLength(1));
    expect(await screen.findByText(/Resent to 1 pending device · 1 delivered immediately/)).toBeInTheDocument();
  });

  it("overrides: one row per batch and per device with its own patch, the diff in a drawer, and reset all", async () => {
    mockBase();
    const resets = respond("post", "/api/v1/policies/tenants/t-1/policy/overrides/reset", { ok: true, reset: 2, sent: 1, batchId: "b-1" });
    renderPage();
    await settled();
    fireEvent.click(screen.getByText("Overrides"));
    // dev-2's patch came from the batch → it is the batch's row, not a device row.
    expect(await screen.findByText("SQL Servers")).toBeInTheDocument();
    expect(screen.getByText("(1 device)")).toBeInTheDocument();
    expect(screen.queryByText("SRV-OVERRIDE")).toBeNull();
    // dev-3 set its own → a device row with the section it touches.
    expect(screen.getByText("DESKTOP-THREE")).toBeInTheDocument();
    expect(screen.getAllByText("Agent").length).toBeGreaterThan(0);
    expect(screen.getByText(/2 overrides:/)).toBeInTheDocument();

    // The diff is the unit of reading: the drawer shows the tenant value struck through.
    const row = screen.getByText("DESKTOP-THREE").closest("[role=row]");
    fireEvent.click(within(row).getByRole("button", { name: "View diff" }));
    const drawer = await screen.findByTestId("override-drawer");
    expect(within(drawer).getByText("update.intervalSeconds")).toBeInTheDocument();
    expect(within(drawer).getByText(/21600 \(tenant\)/)).toBeInTheDocument();
    expect(within(drawer).getByText("3600")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Reset all to tenant policy/ }));
    const confirmDialog = await screen.findByRole("dialog");
    fireEvent.click(within(confirmDialog).getByRole("button", { name: /Reset 2 overrides/ }));
    await waitFor(() => expect(resets).toHaveLength(1));
    expect(await screen.findByText(/2 overrides reset · 1 delivered immediately/)).toBeInTheDocument();
  });

  it("overrides: the scope filter and the search narrow the list", async () => {
    mockBase();
    renderPage();
    await settled();
    fireEvent.click(screen.getByText("Overrides"));
    await screen.findByText("SQL Servers");
    fireEvent.click(screen.getByRole("button", { name: "Devices" }));
    expect(screen.queryByText("SQL Servers")).toBeNull();
    expect(screen.getByText("DESKTOP-THREE")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "All" }));
    fireEvent.change(screen.getByLabelText("Search overrides"), { target: { value: "sql" } });
    expect(screen.getByText("SQL Servers")).toBeInTheDocument();
    expect(screen.queryByText("DESKTOP-THREE")).toBeNull();
  });

  it("overrides: a batch row opens into its diff and can be revoked from there", async () => {
    mockBase();
    const revokes = respond("post", "/api/v1/policies/tenants/t-1/policy/overrides/batches/b-1/revoke", { ok: true, reverted: 1, sent: 1 });
    renderPage();
    await settled();
    fireEvent.click(screen.getByText("Overrides"));
    const row = (await screen.findByText("SQL Servers")).closest("[role=row]");
    expect(within(row).getByText("Group")).toBeInTheDocument();
    expect(within(row).getByText("Crypto Discovery")).toBeInTheDocument();
    expect(within(row).getByText("1 / 1")).toBeInTheDocument();
    fireEvent.click(within(row).getByRole("button", { name: "View diff" }));
    const drawer = await screen.findByTestId("override-drawer");
    expect(within(drawer).getByText("cdp.intervalSeconds")).toBeInTheDocument();
    expect(within(drawer).getByText(/follows the group's membership/)).toBeInTheDocument();

    fireEvent.click(within(drawer).getByRole("button", { name: "Revoke batch" }));
    const confirmDialog = await screen.findByRole("dialog");
    expect(within(confirmDialog).getByText(/via group SQL Servers/)).toBeInTheDocument();
    fireEvent.click(within(confirmDialog).getByRole("button", { name: "Revoke batch" }));
    await waitFor(() => expect(revokes).toHaveLength(1));
    expect(await screen.findByText(/Batch revoked · 1 device back on the tenant policy/)).toBeInTheDocument();
  });

  it("apply to a group: one section, only what differs, stamped with the group and kept in sync", async () => {
    mockBase();
    const applies = respond("post", "/api/v1/policies/tenants/t-1/policy/overrides/apply", { ok: true, batchId: "b-2", domain: "scp", targeted: 3, applied: 3, sent: 2, skipped: [] });
    renderPage();
    await settled();
    fireEvent.click(screen.getByText("Overrides"));
    fireEvent.click(await screen.findByRole("button", { name: /New override/ }));
    const dialog = await screen.findByRole("dialog");
    const apply = within(dialog).getByRole("button", { name: "Apply" });
    expect(apply).toBeDisabled(); // no target, nothing differs

    fireEvent.change(within(dialog).getByLabelText("Section"), { target: { value: "scp" } });
    fireEvent.change(within(dialog).getByLabelText("Group"), { target: { value: "26" } });
    fireEvent.click(within(dialog).getByLabelText(/Keep in sync/));
    expect(apply).toBeDisabled(); // still nothing differs from the tenant
    fireEvent.change(within(dialog).getByLabelText("Evaluation interval"), { target: { value: "3600" } });
    expect(await within(dialog).findByText("compliance.intervalSeconds")).toBeInTheDocument();
    expect(apply).toBeEnabled();

    fireEvent.click(apply);
    await waitFor(() => expect(applies).toHaveLength(1));
    expect(applies[0].body).toEqual({ groupId: 26, deviceIds: null, domain: "scp", patch: { compliance: { intervalSeconds: 3600 } }, syncMembership: true });
    expect(await screen.findByText(/Security Compliance applied to 3 of 3 devices \(SQL Servers\) · 2 delivered immediately/)).toBeInTheDocument();
  });

  it("history: review the diff of a saved version, then restore it with If-Match on the current one", async () => {
    mockBase();
    respond("get", "/api/v1/policies/tenants/t-1/policy/history/1", {
      ok: true,
      entry: { ...HISTORY.items[1], policy_json: { ...TENANT_POLICY.policy.policy_json, update: { intervalSeconds: 3600 } } },
    });
    const restores = respond("post", "/api/v1/policies/tenants/t-1/policy/history/1/restore", { ok: true, policyVersion: "1788476599999", restoredFrom: OLD_VERSION });
    renderPage();
    await settled();
    fireEvent.click(screen.getByText("Advanced"));
    const table = await screen.findByRole("table", { name: "Policy version history" });
    expect(within(table).getByText("current")).toBeInTheDocument();
    const oldRow = within(table).getByText(OLD_VERSION).closest("tr");
    fireEvent.click(within(oldRow).getByRole("button", { name: /Review and restore/ }));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(`Restore version ${OLD_VERSION}?`)).toBeInTheDocument();
    expect(within(dialog).getByText("update.intervalSeconds")).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Restore" }));
    await waitFor(() => expect(restores).toHaveLength(1));
    expect(restores[0].headers["if-match"]).toBe(TENANT_VERSION);
    expect(await screen.findByText(`Restored version ${OLD_VERSION}`)).toBeInTheDocument();
  });
});

describe("device scope", () => {
  const OVERRIDE = {
    ok: true,
    policy: { policy_version: "1788500000000", policy_hash: "cafe", policy_json: DEV2_PATCH },
  };
  // What the device runs: the tenant policy with the patch applied.
  const EFFECTIVE = {
    ok: true,
    policy: {
      source: "device",
      policy_version: `${TENANT_VERSION}-oa68724db`,
      overriddenPaths: ["cdp"],
      policy_json: { ...TENANT_POLICY.policy.policy_json, cdp: DEV2_PATCH.cdp },
    },
  };
  const DEV_STATUS = { ok: true, status: STATUS.items[1] };

  it("opens a device from ?agentDevice=, shows the override marks, and patches ONLY what differs from the tenant", async () => {
    window.history.replaceState({}, "", "/?agentDevice=dev-2");
    mockBase();
    respond("get", "/api/v1/policies/devices/dev-2/policy", OVERRIDE);
    respond("get", "/api/v1/policies/devices/dev-2/effective-policy", EFFECTIVE);
    respond("get", "/api/v1/policies/devices/dev-2/policy-status", DEV_STATUS);
    const patches = respond("patch", "/api/v1/policies/devices/dev-2/policy/domains/agent", { ok: true, policyVersion: "1788500000001" });
    renderPage();
    expect((await screen.findAllByText(/SRV-OVERRIDE/)).length).toBeGreaterThan(0);
    expect(await screen.findByText("override 1788500000000 · 1 path")).toBeInTheDocument();
    // The nav marks the section the patch touches.
    const nav = screen.getByRole("navigation", { name: "Agent settings sections" });
    expect(within(nav).getByText("override")).toBeInTheDocument();

    // Every row says where its value comes from; the edited one flips to Override.
    expect(screen.getAllByText("Inherits · Tenant").length).toBeGreaterThan(0);
    fireEvent.change(screen.getByLabelText("Update probe interval"), { target: { value: "7200" } });
    expect(await screen.findByText("Override")).toBeInTheDocument();
    fireEvent.click(await screen.findByRole("button", { name: "Save override · Agent" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/only what differs from the tenant/)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Update override" }));
    await waitFor(() => expect(patches).toHaveLength(1));
    expect(patches[0].headers["if-match"]).toBe("1788500000000");
    // selfUpdate equals the tenant's → not in the patch. Only the deviation travels.
    expect(patches[0].body).toEqual({ update: { intervalSeconds: 7200 } });
  });

  it("creates a first override with If-None-Match: * and only the deviation — never a whole document", async () => {
    window.history.replaceState({}, "", "/?agentDevice=dev-1");
    mockBase();
    server.use(http.get(`${import.meta.env.VITE_API_BASE}/api/v1/policies/devices/dev-1/policy`, () => HttpResponse.json({ ok: false, code: "NOT_FOUND" }, { status: 404 })));
    respond("get", "/api/v1/policies/devices/dev-1/effective-policy", { ok: true, policy: { source: "tenant", policy_version: CURRENT, overriddenPaths: [], policy_json: TENANT_POLICY.policy.policy_json } });
    respond("get", "/api/v1/policies/devices/dev-1/policy-status", { ok: true, status: STATUS.items[0] });
    const patches = respond("patch", "/api/v1/policies/devices/dev-1/policy/domains/agent", { ok: true, policyVersion: "1788500000009" });
    renderPage();
    expect(await screen.findByText("no override · follows the tenant policy")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Update probe interval"), { target: { value: "7200" } });
    fireEvent.click(await screen.findByRole("button", { name: "Create override · Agent" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("update.intervalSeconds")).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Create override" }));
    await waitFor(() => expect(patches).toHaveLength(1));
    expect(patches[0].headers["if-match"]).toBeUndefined();
    expect(patches[0].headers["if-none-match"]).toBe("*");
    expect(patches[0].body).toEqual({ update: { intervalSeconds: 7200 } });
  });

  it("resets one section to the tenant with an empty slice for that domain", async () => {
    window.history.replaceState({}, "", "/?agentDevice=dev-2&agentSection=cdp");
    mockBase();
    respond("get", "/api/v1/policies/devices/dev-2/policy", OVERRIDE);
    respond("get", "/api/v1/policies/devices/dev-2/effective-policy", EFFECTIVE);
    respond("get", "/api/v1/policies/devices/dev-2/policy-status", DEV_STATUS);
    const patches = respond("patch", "/api/v1/policies/devices/dev-2/policy/domains/cdp", { ok: true, deleted: true });
    renderPage();
    const reset = await screen.findByRole("button", { name: "Back to tenant · Crypto Discovery" });
    fireEvent.click(reset);
    const confirmDialog = await screen.findByRole("dialog");
    fireEvent.click(within(confirmDialog).getByRole("button", { name: "Reset section" }));
    await waitFor(() => expect(patches).toHaveLength(1));
    expect(patches[0].headers["if-match"]).toBe("1788500000000");
    expect(patches[0].body).toEqual({});
  });

  it("refuses to save when the override could not be read", async () => {
    window.history.replaceState({}, "", "/?agentDevice=dev-2");
    mockBase();
    respond("get", "/api/v1/policies/devices/dev-2/policy", { ok: false, message: "backend down" }, { status: 500 });
    respond("get", "/api/v1/policies/devices/dev-2/effective-policy", EFFECTIVE);
    respond("get", "/api/v1/policies/devices/dev-2/policy-status", DEV_STATUS);
    renderPage();
    expect(await screen.findByText("Couldn't read the current policy")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Update probe interval"), { target: { value: "7200" } });
    await screen.findByText("1 unsaved change");
    expect(screen.getByRole("button", { name: /Save override · Agent|Create override · Agent/ })).toBeDisabled();
  });
});
