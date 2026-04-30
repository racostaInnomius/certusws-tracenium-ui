// src/pages/PluginControl.jsx
//
// Tenant-level plugin enablement, separated out from the Policies
// page so the UX maps cleanly to the operator's mental model:
//
//   "Plugin Control"  → which plugins are turned on for this tenant
//   "Policies"        → how the enabled plugins behave
//                       (collection intervals, runtime flags…)
//
// Future-proofing for monetization: when entitlements land (Phase 3),
// plugins not covered by the tenant's tier will render with a locked
// toggle and an upgrade hint. Today every plugin in the catalog is
// togglable for ADMIN/OWNER; non-privileged users see read-only state.
//
// Backend contract is unchanged: this page reads/writes the SAME
// `policy_json` blob the Policies page does, just touching the
// `plugins.enabled[]` and `modules` slice. On save we merge our slice
// into the loaded policy so configuration set elsewhere
// (compliance.intervalSeconds, patch.intervalSeconds, …) is preserved.
// If a plugin is turned OFF we drop the corresponding configuration
// block too — keeping disabled-plugin settings would be misleading
// dead state in the JSON.

import * as React from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  Paper,
  Snackbar,
  Stack,
  Switch,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import ExtensionOutlinedIcon from "@mui/icons-material/ExtensionOutlined";
import SaveOutlinedIcon from "@mui/icons-material/SaveOutlined";
import SendOutlinedIcon from "@mui/icons-material/SendOutlined";

import { useAuthContext } from "../auth/AuthContext";
import { getTenantPolicy, saveTenantPolicy, pushTenantPolicy } from "../api/policies";
import { getPluginCoverageSummary } from "../api/overview";
import {
  PLUGIN_CATALOG,
  getEnabledPluginSet,
  deriveModules,
} from "../constants/plugins";

import { BRAND } from "../theme/brand";
import PageHeader from "../components/common/PageHeader";
import BrandSnackbar from "../components/common/BrandSnackbar";
import SectionPaper from "../components/common/SectionPaper";

// Same envelope-unwrap pattern Policies.jsx uses — backend wraps the
// row as `{ ok, policy: { policy_version, policy_hash, policy_json } }`
// but historical / alternate shapes might bypass the wrapper. Treat the
// `.raw` content as the source of truth.
function extractPolicyContent(response) {
  if (!response || typeof response !== "object") return null;
  const row = response?.policy ?? response;
  if (!row || typeof row !== "object") return null;
  if ("policy_json" in row) return row.policy_json ?? null;
  if ("policyJson" in row) return row.policyJson ?? null;
  return row; // already unwrapped
}

// Pull the policy_version out of the same envelope. Used as the
// `expectedVersion` token for opt-locking on save (Phase 2.B).
function extractPolicyVersion(response) {
  if (!response || typeof response !== "object") return null;
  const row = response?.policy ?? response;
  if (!row || typeof row !== "object") return null;
  return (
    row.policy_version ??
    row.policyVersion ??
    null
  );
}

// Build the new full policy_json to PUT, given the loaded original and
// the user's desired plugin enablement. Preserves every key the loaded
// policy had EXCEPT the ones we own (plugins, modules) and the
// configuration blocks for plugins that are now disabled.
function buildPolicyForSave(loadedPolicy, enabledKeysArray) {
  const enabledSet = new Set(enabledKeysArray);
  const original = (loadedPolicy && typeof loadedPolicy === "object") ? loadedPolicy : {};

  // Start from a shallow clone so unknown-but-preserved keys (e.g.
  // future "agent" or "telemetry" sections) survive untouched.
  const next = { ...original };

  next.plugins = { enabled: enabledKeysArray };
  next.modules = deriveModules(enabledSet);

  // Drop config blocks owned by a now-disabled plugin. Doing this here
  // (instead of leaving stale blocks in the JSON) means the on-disk
  // policy stays a faithful reflection of what's actually enabled.
  // Operators can re-enable later and Policies will let them set a
  // fresh interval on top of the backend default.
  for (const p of PLUGIN_CATALOG) {
    if (p.impliesModule && !enabledSet.has(p.key)) {
      delete next[p.impliesModule];
    }
  }

  return next;
}

// Compact coverage chip for "N of M devices reporting this plugin".
// Reads from /dashboard/plugin-coverage, same source the Overview
// strip uses. Intentionally NOT the source of truth for "is this
// plugin enabled" — that's the policy itself; coverage just answers
// "did the agents materialize the capability yet".
function CoverageChip({ pluginKey, coverage, total }) {
  const found = (coverage?.byPlugin || []).find(
    (r) => String(r.plugin).toLowerCase() === pluginKey
  );
  const count = Number(found?.count ?? 0);
  const denom = Number(total ?? 0);
  const label = denom > 0 ? `${count}/${denom} reporting` : "no devices yet";
  const color = denom === 0 ? BRAND.gray : count >= denom ? BRAND.alert.success : count > 0 ? BRAND.teal : BRAND.alert.warning;
  return (
    <Chip
      label={label}
      size="small"
      sx={{
        height: 20,
        fontSize: 11,
        fontWeight: 700,
        bgcolor: "transparent",
        color,
        border: `1px solid ${color}55`,
      }}
    />
  );
}

function PluginRow({ plugin, enabled, onToggle, readOnly, coverage, totalDevices }) {
  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 1.5,
        p: 1.5,
        border: `1px solid ${BRAND.border}`,
        borderRadius: 2,
        bgcolor: plugin.required ? BRAND.darkSoft : "#ffffff",
        flexWrap: "wrap",
      }}
    >
      <Box sx={{ minWidth: 0, flex: 1 }}>
        <Stack direction="row" alignItems="center" spacing={1} sx={{ flexWrap: "wrap", mb: 0.25 }}>
          <Typography sx={{ fontSize: 14, fontWeight: 700, color: BRAND.dark }}>
            {plugin.label} — {plugin.title}
          </Typography>
          {plugin.required ? (
            <Chip
              label="Required"
              size="small"
              sx={{
                height: 18,
                fontSize: 10,
                fontWeight: 800,
                bgcolor: BRAND.tealSoft,
                color: BRAND.tealText,
                border: `1px solid ${BRAND.teal}55`,
              }}
            />
          ) : null}
          <CoverageChip pluginKey={plugin.key} coverage={coverage} total={totalDevices} />
        </Stack>
        <Typography sx={{ fontSize: 12.5, color: "text.secondary" }}>
          {plugin.description}
        </Typography>
      </Box>
      <Switch
        checked={plugin.required ? true : enabled}
        onChange={(e) => onToggle(plugin.key, e.target.checked)}
        disabled={readOnly || plugin.required}
        sx={{
          "& .MuiSwitch-switchBase.Mui-checked": { color: BRAND.teal },
          "& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track": {
            backgroundColor: BRAND.teal,
          },
        }}
      />
    </Box>
  );
}

export default function PluginControl() {
  const theme = useTheme();
  const isSmDown = useMediaQuery(theme.breakpoints.down("sm"));
  const { auth } = useAuthContext();

  const tenantId = auth?.tenantId;
  const tenantRole = String(auth?.tenantMember?.role || "");
  const isActiveMember = auth?.tenantMember?.isActive === true;
  // Plugin Control is admin-scope: even OWNER is allowed (they own the
  // tenant), but regular users see read-only state. This matches the
  // user's intent ("solo un ADMIN deberia poder hacerlo") — we treat
  // OWNER as a strict superset of ADMIN, which is the convention the
  // rest of the app already follows.
  const canManage = isActiveMember && (tenantRole === "ADMIN" || tenantRole === "OWNER");

  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [pushing, setPushing] = React.useState(false);
  const [loadedPolicy, setLoadedPolicy] = React.useState(null); // raw policy_json
  // Track the version we loaded the policy at so we can send it back as
  // the `If-Match` opt-lock token. If a Policies page user (or another
  // operator) writes between our load and our save, the backend returns
  // 409 STALE_POLICY and we silently reload + retry. Without this token
  // we'd be in last-writer-wins mode and could clobber the OTHER page's
  // edits with our stale view.
  const [loadedVersion, setLoadedVersion] = React.useState(null);
  const [draftEnabled, setDraftEnabled] = React.useState(() => new Set());
  const [coverage, setCoverage] = React.useState(null);
  const [snackbar, setSnackbar] = React.useState({ open: false, message: "", severity: "success" });

  const showSnack = React.useCallback((message, severity = "success") => {
    setSnackbar({ open: true, message, severity });
  }, []);

  const load = React.useCallback(async () => {
    if (!tenantId) return;
    try {
      setLoading(true);
      const [policyRes, coverageRes] = await Promise.all([
        getTenantPolicy(tenantId).catch(() => null),
        getPluginCoverageSummary().catch(() => ({ total: 0, byPlugin: [] })),
      ]);
      const policyJson = extractPolicyContent(policyRes) ?? {};
      const version = extractPolicyVersion(policyRes);
      setLoadedPolicy(policyJson);
      setLoadedVersion(version != null ? String(version) : null);
      setDraftEnabled(getEnabledPluginSet(policyJson));
      setCoverage(coverageRes || { total: 0, byPlugin: [] });
    } catch (e) {
      console.error("[plugin-control] load failed", e);
      showSnack("Failed to load plugin state", "error");
    } finally {
      setLoading(false);
    }
  }, [tenantId, showSnack]);

  React.useEffect(() => {
    load();
  }, [load]);

  // Track dirty state vs. the loaded policy. Saving is no-op if user
  // didn't actually change anything — we still allow Push (re-broadcast
  // current state to devices) which is a separate intent.
  const loadedEnabledSet = React.useMemo(
    () => getEnabledPluginSet(loadedPolicy || {}),
    [loadedPolicy]
  );
  const dirty = React.useMemo(() => {
    if (loadedEnabledSet.size !== draftEnabled.size) return true;
    for (const k of loadedEnabledSet) {
      if (!draftEnabled.has(k)) return true;
    }
    return false;
  }, [loadedEnabledSet, draftEnabled]);

  const handleToggle = (key, checked) => {
    setDraftEnabled((prev) => {
      const next = new Set(prev);
      if (checked) {
        next.add(key);
      } else {
        next.delete(key);
      }
      // Required plugins can't be turned off — re-add anything the
      // catalog flags as required, so an off-spec checked=false from a
      // bug elsewhere can't strip AMP.
      for (const p of PLUGIN_CATALOG) {
        if (p.required) next.add(p.key);
      }
      return next;
    });
  };

  const handleSave = async () => {
    if (!tenantId) return;
    try {
      setSaving(true);
      const enabledArray = PLUGIN_CATALOG
        .filter((p) => p.required || draftEnabled.has(p.key))
        .map((p) => p.key);
      const fullPolicy = buildPolicyForSave(loadedPolicy || {}, enabledArray);
      await saveTenantPolicy(tenantId, fullPolicy, {
        expectedVersion: loadedVersion,
      });
      showSnack("Plugin enablement saved");
      // Reload so the loaded baseline matches what's now persisted
      // and `dirty` resets.
      await load();
    } catch (e) {
      // 409 STALE_POLICY → someone else wrote between our load and our
      // save (e.g. Policies page changed an interval). The Plugin
      // Control draft only touched plugins, so reloading and silently
      // re-applying would discard their config edit if the user clicks
      // Save again without checking. Surface a non-blocking message
      // and reload so the user can decide.
      if (e?.status === 409) {
        console.warn("[plugin-control] save rejected: stale policy", e?.body);
        showSnack(
          "Policy was modified by someone else. Reloaded — review your changes and save again.",
          "warning"
        );
        await load();
      } else {
        console.error("[plugin-control] save failed", e);
        showSnack(`Save failed: ${e?.message || e}`, "error");
      }
    } finally {
      setSaving(false);
    }
  };

  const handlePush = async () => {
    if (!tenantId) return;
    try {
      setPushing(true);
      const res = await pushTenantPolicy(tenantId);
      const dispatched = res?.dispatched ?? res?.summary?.dispatched ?? 0;
      const cleared = res?.clearedOverrides ?? res?.summary?.clearedOverrides ?? 0;
      const detail =
        cleared > 0
          ? `Pushed to ${dispatched} device(s). Cleared ${cleared} device override(s).`
          : `Pushed to ${dispatched} device(s).`;
      showSnack(detail);
    } catch (e) {
      console.error("[plugin-control] push failed", e);
      showSnack(`Push failed: ${e?.message || e}`, "error");
    } finally {
      setPushing(false);
    }
  };

  const totalDevices = Number(coverage?.total ?? 0);

  return (
    <Box sx={{ pb: 4 }}>
      <PageHeader
        title="Plugin Control"
        subtitle="Enable plugins for the devices in this tenant. Configure their behavior in Policies."
        icon={<ExtensionOutlinedIcon />}
        actions={
          canManage ? (
            <Stack
              direction={{ xs: "column", sm: "row" }}
              spacing={1}
              sx={{ width: { xs: "100%", sm: "auto" } }}
            >
              <Button
                variant="contained"
                onClick={handleSave}
                disabled={!dirty || saving || loading}
                startIcon={<SaveOutlinedIcon />}
                fullWidth={isSmDown}
                sx={{
                  bgcolor: BRAND.teal,
                  "&:hover": { bgcolor: BRAND.tealHover },
                  textTransform: "none",
                  fontWeight: 700,
                }}
              >
                {saving ? "Saving…" : "Save changes"}
              </Button>
              <Button
                variant="outlined"
                onClick={handlePush}
                disabled={pushing || loading}
                startIcon={<SendOutlinedIcon />}
                fullWidth={isSmDown}
                sx={{
                  textTransform: "none",
                  fontWeight: 700,
                }}
              >
                {pushing ? "Pushing…" : "Push now"}
              </Button>
            </Stack>
          ) : null
        }
      />

      {!canManage ? (
        <Alert severity="info" variant="outlined" sx={{ mb: 2 }}>
          Plugin enablement is restricted to tenant admins. You can view current
          state but the toggles are read-only.
        </Alert>
      ) : null}

      {/* Helper card — concise reminder of WHERE plugin behavior is
          configured. Operators landing here for the first time should
          know that "more knobs" lives one page over. */}
      <Paper
        elevation={0}
        sx={{
          p: 1.5,
          mb: 2,
          borderRadius: 2,
          border: `1px solid ${BRAND.border}`,
          bgcolor: BRAND.surfaceMuted,
        }}
      >
        <Typography variant="body2" sx={{ color: BRAND.dark }}>
          <strong>How this works.</strong> Toggle a plugin to enable it across
          every device in this tenant; click <em>Save changes</em> to persist
          and <em>Push now</em> to broadcast to currently-online devices. Once
          a plugin is enabled, fine-tune its behavior (collection intervals,
          flags) under <strong>Policies</strong>.
        </Typography>
      </Paper>

      <SectionPaper variant="panel" sx={{ p: { xs: 1.5, sm: 2 } }}>
        <Stack spacing={1}>
          {PLUGIN_CATALOG.map((p) => (
            <PluginRow
              key={p.key}
              plugin={p}
              enabled={draftEnabled.has(p.key)}
              onToggle={handleToggle}
              readOnly={!canManage || loading}
              coverage={coverage}
              totalDevices={totalDevices}
            />
          ))}
        </Stack>
      </SectionPaper>

      <BrandSnackbar
        open={snackbar.open}
        severity={snackbar.severity}
        message={snackbar.message}
        onClose={() => setSnackbar((s) => ({ ...s, open: false }))}
      />
    </Box>
  );
}
