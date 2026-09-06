// src/pages/AgentSettings.jsx
//
// Agent Settings — how the agent and its plugins behave, one section per
// plugin, for the tenant policy or for one device's override.
//
// Shape of the page (docs/AGENT_SETTINGS_ANALYSIS_2026-09.md, phase A):
//   * PolicyScopeBar   — WHAT is being edited: tenant, or one device.
//   * PluginNav        — WHERE: one entry per plugin + Agent, AI, Plugins
//                        (read-only, follows the plan), Advanced, and the
//                        two tools (Overrides, Policy rollout).
//   * the content      — the chosen section's cards, or a tool view.
//   * PolicyDiffDialog — every save shows the leaves that change first.
//
// Invariants this page keeps, in order of how expensive it was to learn them:
//   1. Save sends the agent-config slice ONLY (PATCH by domain, If-Match).
//      The raw editor's "Replace entire document" is the one whole-doc PUT.
//   2. Never save from a form that was not loaded: a failed GET disables
//      Save (tenant and device alike) — the optimistic lock is disarmed by
//      the same null that caused it.
//   3. Never save without the catalog: `plugins.enabled` is rebuilt from the
//      toggles, and an empty catalog once wrote `[amp]` over five plugins.
//   4. A device override is a WHOLE document (`device ?? tenant`). A new
//      override starts from the policy the device runs today, and is
//      written with the whole-doc PUT so security/MAM travel with it; an
//      existing override is patched by domain like the tenant.
//   5. Unsaved edits pause auto-refresh and guard the tab; the nav badges
//      say which section they are in.

import * as React from "react";
import Grid from "@mui/material/Grid";
import { Alert, AlertTitle, Box, Button, Chip, Typography } from "@mui/material";
import SaveOutlinedIcon from "@mui/icons-material/SaveOutlined";
import SendOutlinedIcon from "@mui/icons-material/SendOutlined";
import DeleteOutlineOutlinedIcon from "@mui/icons-material/DeleteOutlineOutlined";
import HubOutlinedIcon from "@mui/icons-material/HubOutlined";
import HourglassEmptyOutlinedIcon from "@mui/icons-material/HourglassEmptyOutlined";
import TuneOutlinedIcon from "@mui/icons-material/TuneOutlined";

import { useAuthContext } from "../auth/AuthContext";
import { useEffectiveTenantId } from "../hooks/useEffectiveTenantId";
import { useConfirm } from "../components/common/ConfirmDialog";
import { usePluginCatalog } from "../hooks/usePluginCatalog";
import RefreshControl, { useAutoRefresh } from "../components/common/RefreshControl";
import BrandSnackbar from "../components/common/BrandSnackbar";
import PageHeader from "../components/common/PageHeader";
import SectionPaper from "../components/common/SectionPaper";
import { BRAND, ICON, TEXT } from "../theme/brand";
import { formatDate } from "../utils/format";
import { getSearchParam, updateSearchParams } from "../utils/browserState";

import {
  deleteDevicePolicy,
  getDevicePolicy,
  getDevicePolicyStatus,
  getEffectivePolicy,
  getTenantPolicy,
  listTenantPolicyStatus,
  patchDevicePolicyDomain,
  patchTenantPolicyDomain,
  pushDevicePolicy,
  pushTenantPolicy,
  saveDevicePolicy,
  saveTenantPolicy,
} from "../api/policies";
import { listAllKnownDevices } from "../api/jobs";
import { getPluginCoverageSummary } from "../api/overview";
import { listGateways } from "../api/patchManagement";

import {
  extractPolicyEnvelope,
  formToPolicy,
  isEmptyPolicy,
  readFormFromPolicy,
} from "../components/Policies/policyTransforms";
import { DetailRow, formatJson, formatRelativeTime, renderAckChip } from "../components/Policies/policyDisplay";

import PluginNav from "../components/AgentSettings/PluginNav";
import PolicyScopeBar from "../components/AgentSettings/PolicyScopeBar";
import PolicySectionPanel from "../components/AgentSettings/PolicySectionPanel";
import PluginsView from "../components/AgentSettings/PluginsView";
import AdvancedJsonPanel from "../components/AgentSettings/AdvancedJsonPanel";
import OverridesView from "../components/AgentSettings/OverridesView";
import { overrideRows } from "../components/AgentSettings/overrides";
import PolicyRolloutView from "../components/AgentSettings/PolicyRolloutView";
import PolicyDiffDialog from "../components/AgentSettings/PolicyDiffDialog";
import { diffPolicies } from "../components/AgentSettings/policyDiff";
import { agentConfigSlice, composeFirstOverride, formProblems } from "../components/AgentSettings/formGuards";
import { buildSections, changesBySection, DEFAULT_SECTION, isKnownView, TOOL_VIEWS } from "../components/AgentSettings/sections";
import { summarizeRollout } from "../components/AgentSettings/rolloutModel";
import { useUnsavedChanges } from "../components/AgentSettings/useUnsavedChanges";

const SECTION_PARAM = "agentSection";
const DEVICE_PARAM = "agentDevice";
const TOOL_IDS = new Set(TOOL_VIEWS.map((t) => t.id));

function normalizeDevices(items) {
  return (Array.isArray(items) ? items : [])
    .map((d) => ({
      deviceId: String(d?.deviceId || "").trim(),
      hostname: String(d?.hostname || "").trim() || String(d?.deviceId || "").trim(),
      connected: d?.connected === true,
      agentVersion: d?.agentVersion ?? null,
    }))
    .filter((d) => d.deviceId);
}

/**
 * `embedded` — rendered inside Settings: no PageHeader (the host has one),
 * no outer padding. `onNavigate(pageKey)` opens another page of the app —
 * the plugin pages the sections link to, and Billing from Plugins.
 */
export default function AgentSettings({ embedded = false, onNavigate = null }) {
  const { auth } = useAuthContext();
  const confirm = useConfirm();
  const { catalog, entitled, loading: catalogLoading } = usePluginCatalog();
  const catalogReady = !catalogLoading && Array.isArray(catalog) && catalog.length > 0;

  // ⚠️ NOT `auth?.tenantId` — see useEffectiveTenantId.
  const tenantId = useEffectiveTenantId();
  const tenantRole = String(auth?.tenantMember?.role || "");
  const isActiveMember = auth?.tenantMember?.isActive === true;
  const canManage = isActiveMember && (tenantRole === "ADMIN" || tenantRole === "OWNER");

  // ── Navigation state (URL-backed) ─────────────────────────────────────
  const [view, setViewState] = React.useState(() => {
    const fromUrl = getSearchParam(SECTION_PARAM, "");
    return isKnownView(fromUrl) ? fromUrl : DEFAULT_SECTION;
  });
  const [selectedDeviceId, setSelectedDeviceId] = React.useState(() => getSearchParam(DEVICE_PARAM, ""));
  const [scope, setScope] = React.useState(() => (getSearchParam(DEVICE_PARAM, "") ? "device" : "tenant"));

  const setView = React.useCallback((id) => {
    if (!isKnownView(id)) return;
    setViewState(id);
    updateSearchParams({ [SECTION_PARAM]: id === DEFAULT_SECTION ? "" : id });
  }, []);

  // ── Shared data ───────────────────────────────────────────────────────
  const [devices, setDevices] = React.useState([]);
  const [gateways, setGateways] = React.useState([]);
  const [coverage, setCoverage] = React.useState(null);
  const [loadedAt, setLoadedAt] = React.useState(() => Date.now());
  const [snackbar, setSnackbar] = React.useState({ open: false, message: "", severity: "success" });
  const showSnack = React.useCallback((message, severity = "success") => setSnackbar({ open: true, message, severity }), []);

  // ── Tenant policy ─────────────────────────────────────────────────────
  const [tenantPolicy, setTenantPolicy] = React.useState(null);
  const [tenantForm, setTenantForm] = React.useState(() => readFormFromPolicy({}, []));
  const [tenantBaseline, setTenantBaseline] = React.useState(() => readFormFromPolicy({}, []));
  const [tenantJsonDraft, setTenantJsonDraft] = React.useState("{}");
  const [tenantJsonError, setTenantJsonError] = React.useState(null);
  const [tenantStatus, setTenantStatus] = React.useState([]);
  const [tenantLoading, setTenantLoading] = React.useState(true);
  const [tenantLoadError, setTenantLoadError] = React.useState(null);
  const [tenantSaving, setTenantSaving] = React.useState(false);
  const [tenantPushing, setTenantPushing] = React.useState(false);

  // ── Device override ───────────────────────────────────────────────────
  const [devicePolicy, setDevicePolicy] = React.useState(null);
  const [deviceForm, setDeviceForm] = React.useState(() => readFormFromPolicy({}, []));
  const [deviceBaseline, setDeviceBaseline] = React.useState(() => readFormFromPolicy({}, []));
  const [deviceJsonDraft, setDeviceJsonDraft] = React.useState("{}");
  const [deviceJsonError, setDeviceJsonError] = React.useState(null);
  const [effective, setEffective] = React.useState(null);
  const [deviceStatus, setDeviceStatus] = React.useState(null);
  const [deviceLoading, setDeviceLoading] = React.useState(false);
  const [deviceLoadError, setDeviceLoadError] = React.useState(null);
  const [deviceSaving, setDeviceSaving] = React.useState(false);
  const [devicePushing, setDevicePushing] = React.useState(false);
  const [deviceDeleting, setDeviceDeleting] = React.useState(false);
  const [devicePolling, setDevicePolling] = React.useState(false);

  const [diffDialog, setDiffDialog] = React.useState({ open: false, entries: [] });

  // ── Loading ───────────────────────────────────────────────────────────
  const loadTenant = React.useCallback(async () => {
    if (!canManage || !tenantId) return;
    try {
      setTenantLoading(true);
      const [policyRes, statusRes, devicesRes, coverageRes] = await Promise.all([
        getTenantPolicy(tenantId).then(
          (r) => { setTenantLoadError(null); return r; },
          (err) => { setTenantLoadError(err?.message || "Could not load the tenant policy."); return null; }
        ),
        listTenantPolicyStatus(tenantId).catch(() => ({ items: [] })),
        listAllKnownDevices().catch(() => ({ items: [] })),
        getPluginCoverageSummary().catch(() => null),
      ]);
      const policy = extractPolicyEnvelope(policyRes).raw ?? {};
      const form = readFormFromPolicy(policy, catalog);
      setTenantPolicy(policyRes ?? null);
      setTenantForm(form);
      setTenantBaseline(form);
      setTenantJsonDraft(formatJson(policy));
      setTenantJsonError(null);
      setTenantStatus(Array.isArray(statusRes?.items) ? statusRes.items : []);
      setDevices(normalizeDevices(devicesRes?.items));
      setCoverage(coverageRes && typeof coverageRes === "object" ? coverageRes : null);
      setLoadedAt(Date.now());
    } catch (e) {
      console.error(e);
      showSnack("Failed to load tenant policy", "error");
    } finally {
      setTenantLoading(false);
    }
    // `catalog` is a dependency ON PURPOSE: the form's toggles are derived
    // from it and it can land after the first load (cold cache).
  }, [canManage, tenantId, showSnack, catalog]);

  const loadDevice = React.useCallback(async (deviceId) => {
    if (!canManage || !deviceId) {
      setDevicePolicy(null);
      setEffective(null);
      setDeviceStatus(null);
      setDeviceLoadError(null);
      return;
    }
    try {
      setDeviceLoading(true);
      let loadError = null;
      const [overrideRes, effectiveRes, statusRes] = await Promise.all([
        // 404 = no override, a normal state. Anything else is a failed read,
        // and a failed read must not become a save (invariant 2).
        getDevicePolicy(deviceId).catch((err) => {
          if (err?.status === 404) return null;
          loadError = err?.message || "Could not load the device override.";
          return null;
        }),
        getEffectivePolicy(deviceId).catch((err) => {
          loadError = loadError || err?.message || "Could not load the effective policy.";
          return null;
        }),
        getDevicePolicyStatus(deviceId).catch(() => null),
      ]);
      const overridePolicy = extractPolicyEnvelope(overrideRes).raw;
      const eff = effectiveRes?.policy ?? effectiveRes ?? null;
      const effectiveJson = eff?.policy_json ?? eff?.policyJson ?? eff?.policy ?? null;
      // A new override starts from what the device runs today (invariant 4).
      const seed = !isEmptyPolicy(overridePolicy) ? overridePolicy : effectiveJson && typeof effectiveJson === "object" ? effectiveJson : {};
      const form = readFormFromPolicy(seed, catalog);
      setDevicePolicy(overrideRes ?? null);
      setDeviceForm(form);
      setDeviceBaseline(form);
      setDeviceJsonDraft(formatJson(seed));
      setDeviceJsonError(null);
      setEffective(eff);
      setDeviceStatus(statusRes?.status ?? statusRes ?? null);
      setDeviceLoadError(loadError);
    } catch (e) {
      console.error(e);
      setDeviceLoadError(e?.message || "Could not load the device override.");
    } finally {
      setDeviceLoading(false);
    }
  }, [canManage, catalog]);

  React.useEffect(() => { loadTenant(); }, [loadTenant]);
  React.useEffect(() => { loadDevice(selectedDeviceId); }, [selectedDeviceId, loadDevice]);
  React.useEffect(() => {
    listGateways()
      .then((res) => res?.ok && setGateways(res.data?.gateways ?? []))
      .catch(() => { /* informational only */ });
  }, []);

  // ── Derived ───────────────────────────────────────────────────────────
  const isDevice = scope === "device";
  const form = isDevice ? deviceForm : tenantForm;
  const setForm = isDevice ? setDeviceForm : setTenantForm;
  const baseline = isDevice ? deviceBaseline : tenantBaseline;
  const jsonDraft = isDevice ? deviceJsonDraft : tenantJsonDraft;
  const jsonError = isDevice ? deviceJsonError : tenantJsonError;
  const loadError = isDevice ? deviceLoadError : tenantLoadError;
  const saving = isDevice ? deviceSaving : tenantSaving;

  const diff = React.useMemo(
    () => diffPolicies(agentConfigSlice(baseline, catalog, formToPolicy), agentConfigSlice(form, catalog, formToPolicy)),
    [baseline, form, catalog]
  );
  const dirty = diff.length > 0;
  const dirtyRef = React.useRef(false);
  dirtyRef.current = dirty;
  useUnsavedChanges(dirty);
  const changes = React.useMemo(() => changesBySection(diff), [diff]);
  const problems = React.useMemo(() => formProblems(form), [form]);
  const sections = React.useMemo(() => buildSections(catalog, form), [catalog, form]);
  const activeSection = sections.find((s) => s.id === view) || null;
  const deviceMap = React.useMemo(() => new Map(devices.map((d) => [d.deviceId, d])), [devices]);
  const selectedDevice = selectedDeviceId ? deviceMap.get(selectedDeviceId) || { deviceId: selectedDeviceId, hostname: selectedDeviceId } : null;
  const gatewayForSelected = React.useMemo(() => gateways.find((g) => g.deviceId === selectedDeviceId) || null, [gateways, selectedDeviceId]);
  const rollout = React.useMemo(() => summarizeRollout(tenantStatus, { now: loadedAt }), [tenantStatus, loadedAt]);
  const overrideCount = React.useMemo(() => overrideRows(tenantStatus).length, [tenantStatus]);

  const tenantEnv = extractPolicyEnvelope(tenantPolicy);
  const deviceEnv = extractPolicyEnvelope(devicePolicy);
  const hasOverride = !isEmptyPolicy(deviceEnv.raw);
  const effectiveView = effective
    ? { source: effective.source, version: effective.policy_version ?? effective.policyVersion, json: effective.policy_json ?? effective.policyJson ?? effective.policy ?? {} }
    : null;

  // Auto-refresh never overwrites an edit in progress (invariant 5).
  const refreshAll = React.useCallback(() => {
    if (dirtyRef.current) return;
    loadTenant();
    if (selectedDeviceId) loadDevice(selectedDeviceId);
  }, [loadTenant, loadDevice, selectedDeviceId]);
  const [refreshSeconds, setRefreshSeconds] = useAutoRefresh(refreshAll, "policiesAutoRefresh");

  const manualRefresh = async () => {
    if (dirtyRef.current) {
      const ok = await confirm({ title: "Discard unsaved changes?", body: "Reloading replaces the form with what the server has.", confirmText: "Discard and reload", danger: true });
      if (!ok) return;
      dirtyRef.current = false;
    }
    loadTenant();
    if (selectedDeviceId) loadDevice(selectedDeviceId);
  };

  const discardIfDirty = async (what) => {
    if (!dirtyRef.current) return true;
    return confirm({ title: "Discard unsaved changes?", body: `${what} drops the edits you have not saved.`, confirmText: "Discard", danger: true });
  };

  // ── Navigation handlers ───────────────────────────────────────────────
  const handleScopeChange = async (next) => {
    if (next === scope) return;
    if (!(await discardIfDirty("Switching scope"))) return;
    if (scope === "device") { setDeviceForm(deviceBaseline); setDeviceJsonError(null); } else { setTenantForm(tenantBaseline); setTenantJsonError(null); }
    setScope(next);
    if (TOOL_IDS.has(view)) setView(DEFAULT_SECTION);
    if (next === "tenant") updateSearchParams({ [DEVICE_PARAM]: "" });
    else if (selectedDeviceId) updateSearchParams({ [DEVICE_PARAM]: selectedDeviceId });
  };

  const handlePickDevice = async (deviceId) => {
    if (!deviceId || deviceId === selectedDeviceId) return;
    if (!(await discardIfDirty("Changing device"))) return;
    setSelectedDeviceId(deviceId);
    updateSearchParams({ [DEVICE_PARAM]: deviceId });
  };

  const openDeviceFromTool = async (deviceId) => {
    if (!(await discardIfDirty("Opening another device"))) return;
    setScope("device");
    setSelectedDeviceId(deviceId);
    updateSearchParams({ [DEVICE_PARAM]: deviceId });
    setView(DEFAULT_SECTION);
  };

  const handleJsonChange = (value) => {
    const setDraft = isDevice ? setDeviceJsonDraft : setTenantJsonDraft;
    const setError = isDevice ? setDeviceJsonError : setTenantJsonError;
    setDraft(value);
    try {
      const parsed = JSON.parse(value);
      setError(null);
      setForm(readFormFromPolicy(parsed, catalog));
    } catch (err) {
      setError(String(err?.message || err));
    }
  };

  // ── Save ──────────────────────────────────────────────────────────────
  const saveBlockedReason = () => {
    if (loadError) return "The current policy could not be read — reload before saving.";
    if (jsonError) return "Fix JSON errors before saving.";
    if (!catalogReady) return "The plugin catalog has not loaded yet — reload before saving.";
    if (problems.length > 0) return problems[0].message;
    if (isDevice && !selectedDeviceId) return "Choose a device first.";
    return null;
  };

  const openSaveDialog = () => {
    const reason = saveBlockedReason();
    if (reason) { showSnack(reason, "error"); return; }
    setDiffDialog({ open: true, entries: diff });
  };

  const confirmSave = async () => {
    const reason = saveBlockedReason();
    if (reason) { showSnack(reason, "error"); setDiffDialog({ open: false, entries: [] }); return; }
    const setSaving = isDevice ? setDeviceSaving : setTenantSaving;
    try {
      setSaving(true);
      const slice = agentConfigSlice(form, catalog, formToPolicy);
      if (!isDevice) {
        await patchTenantPolicyDomain(tenantId, "agent-config", slice, { expectedVersion: tenantEnv.version });
        showSnack("Agent settings saved", "success");
        setDiffDialog({ open: false, entries: [] });
        await loadTenant();
      } else if (hasOverride) {
        await patchDevicePolicyDomain(selectedDeviceId, "agent-config", slice, { expectedVersion: deviceEnv.version });
        showSnack("Device override updated", "success");
        setDiffDialog({ open: false, entries: [] });
        await loadDevice(selectedDeviceId);
      } else {
        // First override: the whole document — the effective policy verbatim
        // with the agent-config keys replaced — so the device keeps its
        // security/MAM/gateway blocks exactly as it runs them (invariant 4).
        await saveDevicePolicy(selectedDeviceId, composeFirstOverride(effectiveView?.json, slice), {});
        showSnack("Device override created", "success");
        setDiffDialog({ open: false, entries: [] });
        await Promise.all([loadDevice(selectedDeviceId), loadTenant()]);
      }
    } catch (e) {
      setDiffDialog({ open: false, entries: [] });
      if (e?.status === 409) {
        console.warn("[agent-settings] save rejected: stale policy", e?.body);
        showSnack("The policy was modified by someone else. Reloaded — review your changes and save again.", "warning");
        if (isDevice) await loadDevice(selectedDeviceId); else await loadTenant();
      } else {
        console.error(e);
        showSnack(e?.message ? `Failed to save: ${e.message}` : "Failed to save agent settings", "error");
      }
    } finally {
      setSaving(false);
    }
  };

  // Raw-JSON escape hatch: replaces the ENTIRE tenant document.
  const handleReplaceDocument = async () => {
    if (isDevice) return;
    if (tenantLoadError) { showSnack("The current policy could not be read — reload before saving.", "error"); return; }
    let parsed;
    try { parsed = JSON.parse(tenantJsonDraft); } catch { showSnack("Fix JSON errors before saving", "error"); return; }
    const ok = await confirm({
      title: "Replace the entire policy document?",
      body: "This overwrites ALL policy domains — including the Security Baselines and Device Management blocks, which are normally edited on their own pages.",
      confirmText: "Replace document",
      danger: true,
    });
    if (!ok) return;
    try {
      setTenantSaving(true);
      await saveTenantPolicy(tenantId, parsed, { expectedVersion: tenantEnv.version });
      showSnack("Policy document replaced", "success");
      await loadTenant();
    } catch (e) {
      if (e?.status === 409) {
        showSnack("The policy was modified by someone else. Reloaded — review your changes and save again.", "warning");
        await loadTenant();
      } else {
        console.error(e);
        showSnack("Failed to replace the policy document", "error");
      }
    } finally {
      setTenantSaving(false);
    }
  };

  // ── Push / delete ─────────────────────────────────────────────────────
  const handlePushTenant = async () => {
    if (!canManage || !tenantId) return;
    const ok = await confirm({
      title: "Push tenant policy to every device?",
      body:
        "Broadcasts the saved tenant policy to every device." +
        (overrideCount > 0
          ? `\n\n⚠️ ${overrideCount} device override${overrideCount === 1 ? "" : "s"} will be RESET — those devices will receive the tenant policy instead.`
          : "\n\nNo device override exists, so nothing is reset."),
      confirmText: overrideCount > 0 ? `Push and reset ${overrideCount} override${overrideCount === 1 ? "" : "s"}` : "Push to all devices",
      danger: true,
    });
    if (!ok) return;
    try {
      setTenantPushing(true);
      const res = await pushTenantPolicy(tenantId);
      const parts = [`${res?.targeted ?? 0} targeted`, `${res?.sent ?? 0} delivered immediately`];
      const cleared = res?.clearedOverrides ?? 0;
      if (cleared > 0) parts.push(`${cleared} override${cleared === 1 ? "" : "s"} reset`);
      showSnack(`Tenant policy push: ${parts.join(" · ")}`, "success");
      await loadTenant();
      if (selectedDeviceId) await loadDevice(selectedDeviceId);
    } catch (e) {
      console.error(e);
      showSnack("Failed to push tenant policy", "error");
    } finally {
      setTenantPushing(false);
    }
  };

  const selectedDeviceIdRef = React.useRef(selectedDeviceId);
  React.useEffect(() => { selectedDeviceIdRef.current = selectedDeviceId; }, [selectedDeviceId]);

  // Poll the device's status every 3 s for up to 30 s after a push, until
  // `last_ack_at` advances. Abandoned silently if the operator moves on.
  const pollForDeviceAck = React.useCallback(async (deviceId, priorAckAt) => {
    const started = Date.now();
    setDevicePolling(true);
    try {
      while (Date.now() - started < 30_000) {
        await new Promise((r) => setTimeout(r, 3_000));
        if (selectedDeviceIdRef.current !== deviceId) return;
        const res = await getDevicePolicyStatus(deviceId).catch(() => null);
        if (selectedDeviceIdRef.current !== deviceId) return;
        const status = res?.status ?? res ?? null;
        if (status) {
          setDeviceStatus(status);
          const nextAckAt = status.last_ack_at ?? null;
          if (nextAckAt && nextAckAt !== priorAckAt) {
            if (status.last_ack_status === 0) showSnack("Agent acknowledged the policy (ACK OK)", "success");
            else showSnack(`Agent rejected the policy (ACK ${status.last_ack_status}${status.last_ack_message ? ": " + status.last_ack_message : ""})`, "warning");
            return;
          }
        }
      }
      if (selectedDeviceIdRef.current === deviceId) showSnack("No ACK from the agent in 30 s — the device may be offline", "warning");
    } finally {
      setDevicePolling(false);
    }
  }, [showSnack]);

  const handlePushDevice = async () => {
    if (!canManage || !selectedDeviceId) return;
    const priorAckAt = deviceStatus?.last_ack_at ?? null;
    try {
      setDevicePushing(true);
      await pushDevicePolicy(selectedDeviceId);
      showSnack("Policy dispatched to the device", "success");
      await loadDevice(selectedDeviceId);
      pollForDeviceAck(selectedDeviceId, priorAckAt);
    } catch (e) {
      console.error(e);
      showSnack("Failed to push the device policy", "error");
    } finally {
      setDevicePushing(false);
    }
  };

  const handleDeleteDevice = async () => {
    if (!canManage || !selectedDeviceId) return;
    const ok = await confirm({
      title: "Remove this device's override?",
      body: "The device goes back to the tenant policy on its next sync.",
      confirmText: "Remove override",
      danger: true,
    });
    if (!ok) return;
    try {
      setDeviceDeleting(true);
      await deleteDevicePolicy(selectedDeviceId);
      showSnack("Device override removed", "success");
      await Promise.all([loadDevice(selectedDeviceId), loadTenant()]);
    } catch (e) {
      console.error(e);
      showSnack("Failed to remove the override", "error");
    } finally {
      setDeviceDeleting(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────
  if (!canManage) {
    return (
      <Box sx={{ px: { xs: 2, sm: 0.5 }, py: { xs: 2, sm: 0.5 } }}>
        <Alert severity="warning" sx={{ borderRadius: 3 }}>
          Policy management is restricted to active tenant admins and owners.
        </Alert>
      </Box>
    );
  }

  const isTool = TOOL_IDS.has(view);
  const editing = !isTool && view !== "plugins";
  const saveDisabled = saving || !dirty || !catalogReady || Boolean(loadError) || Boolean(jsonError) || problems.length > 0 || (isDevice && !selectedDeviceId);

  const scopeVersionText = isDevice
    ? hasOverride
      ? `override ${deviceEnv.version ?? "—"}`
      : selectedDeviceId
        ? "no override · follows the tenant policy"
        : ""
    : tenantEnv.version
      ? `version ${tenantEnv.version}${tenantEnv.updatedAt ? ` · ${formatRelativeTime(tenantEnv.updatedAt)}` : ""}`
      : "";
  const scopeRolloutText = !isDevice && rollout.active > 0 ? `${rollout.inSync} of ${rollout.active} active devices in sync` : "";

  const refreshControl = (
    <RefreshControl refreshSeconds={refreshSeconds} onRefreshSecondsChange={setRefreshSeconds} onRefresh={manualRefresh} loading={tenantLoading} />
  );

  let content = null;
  if (view === "plugins") {
    content = (
      <PluginsView
        catalog={catalog}
        form={form}
        entitled={entitled}
        coverage={coverage}
        onOpenSection={(key) => setView(key)}
        onNavigate={onNavigate}
      />
    );
  } else if (view === "overrides") {
    content = (
      <OverridesView statusRows={tenantStatus} deviceMap={deviceMap} loading={tenantLoading} onEdit={openDeviceFromTool} onPushAll={handlePushTenant} pushing={tenantPushing} />
    );
  } else if (view === "rollout") {
    content = <PolicyRolloutView statusRows={tenantStatus} deviceMap={deviceMap} loading={tenantLoading} onOpenDevice={openDeviceFromTool} now={loadedAt} />;
  } else if (isDevice && !selectedDeviceId) {
    content = (
      <Alert severity="info">Choose a device in the bar above to inspect or edit its override.</Alert>
    );
  } else if (view === "advanced") {
    content = (
      <AdvancedJsonPanel
        scope={scope}
        jsonDraft={jsonDraft}
        jsonError={jsonError}
        onJsonChange={handleJsonChange}
        onReplaceDocument={isDevice ? null : handleReplaceDocument}
        replaceDisabled={tenantSaving || Boolean(tenantLoadError)}
        effective={effectiveView}
      />
    );
  } else {
    content = (
      <PolicySectionPanel section={activeSection} form={form} onChange={setForm} catalog={catalog} onNavigate={onNavigate} onOpenPlugins={() => setView("plugins")} />
    );
  }

  return (
    <Box sx={embedded ? { minWidth: 0 } : { px: { xs: 2, sm: 0.5 }, py: { xs: 2, sm: 0.5 }, minWidth: 0 }}>
      {embedded ? (
        <Box sx={{ display: "flex", justifyContent: "flex-end", mb: 1.5 }}>{refreshControl}</Box>
      ) : (
        <PageHeader
          title="Agent Settings"
          subtitle="How the agent and its plugins behave, per plugin, for the tenant or for one device."
          icon={<TuneOutlinedIcon />}
          actions={refreshControl}
        />
      )}

      <PolicyScopeBar
        scope={scope}
        onScopeChange={handleScopeChange}
        device={isDevice ? selectedDevice : null}
        onPickDevice={handlePickDevice}
        versionText={scopeVersionText}
        rolloutText={scopeRolloutText}
        onOpenRollout={!isDevice ? () => setView("rollout") : null}
        dirtyCount={diff.length}
      />

      <Grid container spacing={2} sx={{ mt: 1.5 }}>
        <Grid size={{ xs: 12, md: 3 }}>
          <SectionPaper variant="panel" sx={{ p: 1, minWidth: 0 }}>
            <PluginNav sections={sections} tools={TOOL_VIEWS} active={view} onSelect={setView} changes={changes} />
          </SectionPaper>
        </Grid>

        <Grid size={{ xs: 12, md: 9 }}>
          <SectionPaper variant="panel" sx={{ minWidth: 0 }}>
            {isDevice && gatewayForSelected && editing ? (
              <Alert severity="info" icon={<HubOutlinedIcon />} sx={{ mb: 2 }}>
                This device is the <strong>Infrastructure Gateway</strong> “{gatewayForSelected.name}”. Its <code>gateway</code> policy block is managed from{" "}
                <strong>Patch Management → Virtual infrastructure</strong>; a change here is replaced the next time the gateway is saved.
              </Alert>
            ) : null}

            {content}

            {editing && loadError ? (
              <Alert
                severity="error"
                sx={{ mt: 2.5 }}
                action={
                  <Button color="inherit" size="small" onClick={() => (isDevice ? loadDevice(selectedDeviceId) : loadTenant())}>
                    Retry
                  </Button>
                }
              >
                <AlertTitle>Couldn&apos;t read the current policy</AlertTitle>
                {loadError} — the form shows default values, not the real configuration. Saving is disabled so it cannot be overwritten.
              </Alert>
            ) : null}

            {editing && problems.length > 0 ? (
              <Alert severity="warning" sx={{ mt: 2 }}>
                {problems.map((p) => (
                  <div key={`${p.section}-${p.message}`}>{p.message}</div>
                ))}
              </Alert>
            ) : null}

            {editing && (!isDevice || selectedDeviceId) ? (
              <Box sx={{ mt: 2.5, display: "flex", gap: 1, flexWrap: "wrap", alignItems: "center" }}>
                <Button
                  variant="contained"
                  startIcon={<SaveOutlinedIcon />}
                  onClick={openSaveDialog}
                  disabled={saveDisabled}
                  sx={{ bgcolor: BRAND.teal, color: BRAND.surface, fontWeight: 700, textTransform: "none", "&:hover": { bgcolor: BRAND.tealHover } }}
                >
                  {saving ? "Saving…" : isDevice ? (hasOverride ? "Review and update override…" : "Review and create override…") : "Review and save…"}
                </Button>
                {!isDevice ? (
                  <Button
                    variant="outlined"
                    startIcon={<SendOutlinedIcon />}
                    onClick={handlePushTenant}
                    disabled={tenantPushing}
                    sx={{ textTransform: "none", fontWeight: 700, borderColor: BRAND.teal, color: BRAND.teal, "&:hover": { borderColor: BRAND.tealHover, bgcolor: BRAND.tealSoft } }}
                  >
                    {tenantPushing ? "Pushing…" : overrideCount > 0 ? `Push to all (resets ${overrideCount})` : "Push to all"}
                  </Button>
                ) : (
                  <>
                    <Button
                      variant="outlined"
                      startIcon={<SendOutlinedIcon />}
                      onClick={handlePushDevice}
                      disabled={devicePushing || deviceLoading}
                      sx={{ textTransform: "none", fontWeight: 700, borderColor: BRAND.teal, color: BRAND.teal, "&:hover": { borderColor: BRAND.tealHover, bgcolor: BRAND.tealSoft } }}
                    >
                      {devicePushing ? "Pushing…" : "Push to device"}
                    </Button>
                    <Button
                      variant="outlined"
                      color="error"
                      startIcon={<DeleteOutlineOutlinedIcon />}
                      onClick={handleDeleteDevice}
                      disabled={deviceDeleting || !hasOverride || deviceLoading}
                      sx={{ textTransform: "none", fontWeight: 700 }}
                    >
                      {deviceDeleting ? "Removing…" : "Remove override"}
                    </Button>
                  </>
                )}
                {!dirty && !saving ? (
                  <Typography sx={{ fontSize: TEXT.sm, color: BRAND.gray, ml: 0.5 }}>No unsaved changes</Typography>
                ) : null}
              </Box>
            ) : null}

            {isDevice && selectedDeviceId && editing ? (
              <Box sx={{ mt: 3, pt: 2, borderTop: `1px solid ${BRAND.border}` }}>
                <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1, flexWrap: "wrap" }}>
                  <Typography sx={{ fontSize: TEXT.base, fontWeight: 800, color: BRAND.dark }}>Sync status</Typography>
                  {devicePolling ? (
                    <Chip
                      label="Waiting for ACK…"
                      size="small"
                      icon={<HourglassEmptyOutlinedIcon sx={{ fontSize: ICON.sm }} />}
                      sx={{ bgcolor: BRAND.cyanSoft, color: BRAND.tealText, fontWeight: 700, "& .MuiChip-icon": { color: BRAND.tealText } }}
                    />
                  ) : null}
                  {deviceStatus ? renderAckChip(deviceStatus.last_ack_status, null) : null}
                </Box>
                {deviceStatus ? (
                  <Box sx={{ display: "grid", gap: 0.5, gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" } }}>
                    <DetailRow label="Desired" value={deviceStatus.desired_policy_version || "—"} mono />
                    <DetailRow label="Source" value={deviceStatus.desired_policy_source || "—"} />
                    <DetailRow label="Last sent" value={deviceStatus.last_sent_policy_version || "—"} mono />
                    <DetailRow label="Sent at" value={formatDate(deviceStatus.last_sent_at)} />
                    <DetailRow label="ACK version" value={deviceStatus.last_ack_policy_version || "—"} mono />
                    <DetailRow label="ACK at" value={formatDate(deviceStatus.last_ack_at)} />
                    <DetailRow label="Message" value={deviceStatus.last_ack_message || "—"} />
                  </Box>
                ) : (
                  <Typography variant="body2" color="text.secondary">No sync activity recorded yet for this device.</Typography>
                )}
              </Box>
            ) : null}
          </SectionPaper>
        </Grid>
      </Grid>

      <PolicyDiffDialog
        open={diffDialog.open}
        entries={diffDialog.entries}
        onClose={() => setDiffDialog({ open: false, entries: [] })}
        onConfirm={confirmSave}
        busy={saving}
        title={isDevice ? (hasOverride ? "Review override changes" : "Review the new override") : "Review tenant policy changes"}
        confirmText={isDevice ? (hasOverride ? "Update override" : "Create override") : "Save"}
        scopeLabel={isDevice ? selectedDevice?.hostname || selectedDeviceId : "Tenant policy"}
      />

      <BrandSnackbar
        open={snackbar.open}
        severity={snackbar.severity}
        message={snackbar.message}
        onClose={() => setSnackbar((prev) => ({ ...prev, open: false }))}
      />
    </Box>
  );
}
