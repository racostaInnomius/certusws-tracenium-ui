import * as React from "react";
import Grid from "@mui/material/Grid";
import { listGateways } from "../api/patchManagement";
import HubOutlinedIcon from "@mui/icons-material/HubOutlined";
import {
  Alert,
  AlertTitle,
  Box,
  Button,
  Chip,
  Collapse,
  Divider,
  MenuItem,
  Paper,
  Tab,
  Tabs,
  TextField,
  Tooltip,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import { DataGrid } from "@mui/x-data-grid";

import RefreshControl, { useAutoRefresh } from "../components/common/RefreshControl";
import BrandSnackbar from "../components/common/BrandSnackbar";
import SaveOutlinedIcon from "@mui/icons-material/SaveOutlined";
import SendOutlinedIcon from "@mui/icons-material/SendOutlined";
import DeleteOutlineOutlinedIcon from "@mui/icons-material/DeleteOutlineOutlined";
import ExpandMoreOutlinedIcon from "@mui/icons-material/ExpandMoreOutlined";
import ExpandLessOutlinedIcon from "@mui/icons-material/ExpandLessOutlined";
import CodeOutlinedIcon from "@mui/icons-material/CodeOutlined";
import AssignmentOutlinedIcon from "@mui/icons-material/AssignmentOutlined";
import CheckCircleOutlineOutlinedIcon from "@mui/icons-material/CheckCircleOutlineOutlined";
import HourglassEmptyOutlinedIcon from "@mui/icons-material/HourglassEmptyOutlined";
import ErrorOutlineOutlinedIcon from "@mui/icons-material/ErrorOutlineOutlined";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import TuneOutlinedIcon from "@mui/icons-material/TuneOutlined";
import AccountTreeOutlinedIcon from "@mui/icons-material/AccountTreeOutlined";

import { useAuthContext } from "../auth/AuthContext";
import { useConfirm } from "../components/common/ConfirmDialog";
import {
  deleteDevicePolicy,
  getDevicePolicy,
  getDevicePolicyStatus,
  getEffectivePolicy,
  getTenantPolicy,
  listTenantPolicyStatus,
  patchTenantPolicyDomain,
  pushDevicePolicy,
  pushTenantPolicy,
  saveDevicePolicy,
  saveTenantPolicy,
} from "../api/policies";
import { listKnownDevices } from "../api/jobs";
import { getPluginCoverageSummary } from "../api/overview";
import PluginCoverageStrip from "../components/Overview/PluginCoverageStrip";
import OnlineDot from "../components/common/OnlineDot";

import { BRAND, DATAGRID_SX, ICON, TEXT } from "../theme/brand";
import PageHeader from "../components/common/PageHeader";
import SectionPaper from "../components/common/SectionPaper";
import { usePluginCatalog } from "../hooks/usePluginCatalog";
import { formatDate } from "../utils/format";
import {
  INVENTORY_INTERVAL_MIN,
  INVENTORY_INTERVAL_MAX,
  COMPLIANCE_INTERVAL_MIN,
  COMPLIANCE_INTERVAL_MAX,
  PATCH_INTERVAL_MIN,
  PATCH_INTERVAL_MAX,
  UPDATE_INTERVAL_MIN,
  UPDATE_INTERVAL_MAX,
  readFormFromPolicy,
  formToPolicy,
  isEmptyPolicy,
  extractPolicyEnvelope,
} from "../components/Policies/policyTransforms";
import {
  formatJson,
  formatRelativeTime,
  shortHash,
  renderAckChip,
  renderSourceChip,
  SummaryCard,
  DetailRow,
  JsonBlock,
} from "../components/Policies/policyDisplay";
import CryptoDiscoverySection from "../components/Policies/CryptoDiscoverySection";
import { AiIntelligenceSection, SoftwareDeliverySection } from "../components/Policies/AiSdpSections";
import FeaturesSection from "../components/Policies/FeaturesSection";
import IntervalScheduleCard from "../components/Policies/IntervalScheduleCard";

// The plugin catalog now lives in the BACKEND
// (modules/policies/plugin-catalog.ts) and is fetched via the
// usePluginCatalog hook. Pure helpers `readFormFromPolicy()` and
// `formToPolicy()` take the catalog as a second argument so they
// stay testable and don't import any module-level constants.
//
// The shape returned matches what the legacy constants/plugins.js
// PLUGIN_CATALOG exported — same key/label/title/description/required/
// impliesModule fields — so the rest of this file's logic is unchanged.

// Interval bounds — mirror the server-side validator
// (modules/policies/policies.service.ts) AND the agent's
// policy-runtime.ts. The agent silently reverts out-of-range values
// to its hardcoded default, so we clamp here too to fail fast at
// authoring time instead of letting the operator save a number that
// the agent will quietly ignore.
//
// Sprint 1 of Policy v2 added inventory + update bounds — they were
// previously hardcoded on the agent and not editable from the UI at
// all.


// ── PolicyForm — collection intervals + collapsible advanced JSON.
//
// Plugin enable/disable used to live here as a row of switches. It
// moved to the new Plugin Control page so this surface is now strictly
// about HOW enabled plugins behave, not WHICH plugins are on. The form
// still tracks `form.plugins` internally because the conditional
// schedule panels (Compliance / Patch) check it to decide whether to
// render — that state is populated read-only from the loaded policy by
// `readFormFromPolicy()` and only mutates if the operator drops into
// the advanced JSON editor (power-user mode).

function PolicyForm({ form, onChange, jsonDraft, setJsonDraft, jsonError, setJsonError, readOnly = false, onSaveRawJson = null }) {
  const [advancedOpen, setAdvancedOpen] = React.useState(false);

  // Hook is cheap to re-call — useCachedFetch returns the in-memory
  // cached catalog without a new network request. This avoids prop-
  // drilling `catalog` through TenantTab/DeviceTab into PolicyForm.
  const { catalog } = usePluginCatalog();

  const handleJsonChange = (e) => {
    const value = e.target.value;
    setJsonDraft(value);
    try {
      const parsed = JSON.parse(value);
      setJsonError(null);
      onChange(readFormFromPolicy(parsed, catalog));
    } catch (err) {
      setJsonError(String(err?.message || err));
    }
  };

  // Build a quick reference list of which plugins are enabled in the
  // currently-loaded policy. We render it as a chip strip at the top of
  // the form so the operator can see at a glance what configuration
  // panels apply ("compliance shows because SCP is on") without having
  // to bounce to Plugin Control to check.
  const enabledPluginsSummary = catalog.filter(
    (p) => p.required || Boolean(form.plugins?.[p.key])
  );

  return (
    <Box>
      <Box
        sx={{
          mb: 2,
          p: 1.5,
          border: `1px solid ${BRAND.border}`,
          borderRadius: 2,
          bgcolor: BRAND.surfaceMuted,
        }}
      >
        <Typography
          variant="overline"
          sx={{ color: BRAND.dark, fontWeight: 800, letterSpacing: 1.2 }}
        >
          Currently enabled plugins
        </Typography>
        <Box sx={{ mt: 0.5, display: "flex", flexWrap: "wrap", gap: 0.75 }}>
          {enabledPluginsSummary.length === 0 ? (
            <Typography variant="caption" sx={{ color: BRAND.gray }}>
              No plugins enabled.
            </Typography>
          ) : (
            enabledPluginsSummary.map((p) => (
              <Chip
                key={p.key}
                label={`${p.label} · ${p.title}`}
                size="small"
                sx={{
                  bgcolor: BRAND.tealSoft,
                  color: BRAND.tealText,
                  fontWeight: 700,
                  border: `1px solid ${BRAND.teal}55`,
                }}
              />
            ))
          )}
        </Box>
        <Typography variant="caption" sx={{ color: BRAND.gray, mt: 0.75, display: "block" }}>
          Toggle plugins on or off in <strong>Plugin Control</strong>. The settings
          below apply to plugins that are currently enabled.
        </Typography>
      </Box>

      {/* Collection-interval cards — inventory (always, AMP is required),
          compliance/patch (gated by their implying plugin), and the agent
          update probe. Deduped into IntervalScheduleCard. */}
      <IntervalScheduleCard
        form={form}
        onChange={onChange}
        readOnly={readOnly}
        formKey="inventory"
        title="Inventory schedule (AMP)"
        label="Asset collection interval (seconds)"
        min={INVENTORY_INTERVAL_MIN}
        max={INVENTORY_INTERVAL_MAX}
        step={60}
        bgcolor={BRAND.surfaceMuted}
        helperText="Blank = use backend default (6h / 21600s). Range 60–86400."
      />

      {catalog.some((p) => p.impliesModule === "compliance" && form.plugins[p.key]) ? (
        <IntervalScheduleCard
          form={form}
          onChange={onChange}
          readOnly={readOnly}
          formKey="compliance"
          title="Compliance schedule"
          label="Collection interval (seconds)"
          min={COMPLIANCE_INTERVAL_MIN}
          max={COMPLIANCE_INTERVAL_MAX}
          step={60}
          bgcolor={BRAND.tealSoft}
          titleColor={BRAND.tealText}
          helperText="Blank = use backend default (8h / 28800s). Range 300–86400."
        />
      ) : null}

      {catalog.some((p) => p.impliesModule === "patch" && form.plugins[p.key]) ? (
        <IntervalScheduleCard
          form={form}
          onChange={onChange}
          readOnly={readOnly}
          formKey="patch"
          title="Patch schedule"
          label="Patch scan interval (seconds)"
          min={PATCH_INTERVAL_MIN}
          max={PATCH_INTERVAL_MAX}
          step={300}
          bgcolor={BRAND.cyanSoft}
          helperText="Blank = use backend default (24h / 86400s). Range 300–604800."
        />
      ) : null}

      {/* Update schedule — install path gated separately by features.selfUpdate. */}
      <IntervalScheduleCard
        form={form}
        onChange={onChange}
        readOnly={readOnly}
        formKey="update"
        title="Agent update schedule"
        label="Update probe interval (seconds)"
        min={UPDATE_INTERVAL_MIN}
        max={UPDATE_INTERVAL_MAX}
        step={300}
        bgcolor={BRAND.surfaceMuted}
        helperText="Blank = use backend default (6h / 21600s). Set higher to slow down auto-update; disable entirely via Self-update toggle below."
      />

      <FeaturesSection form={form} onChange={onChange} readOnly={readOnly} catalog={catalog} />

      <AiIntelligenceSection form={form} onChange={onChange} readOnly={readOnly} />

      <SoftwareDeliverySection form={form} onChange={onChange} readOnly={readOnly} />

      {/* MAM moved to Device Management; the security baseline moved to
          Security Baselines. This page is strictly agent/plugin behavior.
          The raw JSON editor below still shows those blocks (it edits the
          WHOLE document) — but the form-level save can't touch them. */}

      {/* CDP is opt-in and its only settings are meaningless with the
          plugin off, so the section follows the plugin toggle rather
          than sitting there inert. */}
      {form.plugins?.cdp ? (
        <CryptoDiscoverySection form={form} onChange={onChange} readOnly={readOnly} />
      ) : null}

      <Box sx={{ mt: 2 }}>
        <Button
          size="small"
          onClick={() => setAdvancedOpen((v) => !v)}
          startIcon={<CodeOutlinedIcon />}
          endIcon={advancedOpen ? <ExpandLessOutlinedIcon /> : <ExpandMoreOutlinedIcon />}
          sx={{ textTransform: "none", color: BRAND.dark, fontWeight: 600 }}
        >
          {advancedOpen ? "Hide JSON editor" : "Advanced: edit raw JSON"}
        </Button>
        <Collapse in={advancedOpen} unmountOnExit>
          <TextField
            multiline
            minRows={10}
            fullWidth
            value={jsonDraft}
            onChange={handleJsonChange}
            disabled={readOnly}
            error={Boolean(jsonError)}
            helperText={
              jsonError ||
              (onSaveRawJson
                ? "Edits the WHOLE policy document, including the Security Baselines and Device Management blocks. Use the button below to save it."
                : "Preserves unknown keys. Saved value replaces the policy on the server.")
            }
            sx={{
              mt: 1,
              "& .MuiInputBase-root": {
                fontFamily: "monospace",
                fontSize: TEXT.sm,
                bgcolor: BRAND.surface,
              },
            }}
          />
          {onSaveRawJson ? (
            <Button
              size="small"
              variant="outlined"
              color="warning"
              onClick={onSaveRawJson}
              disabled={readOnly || Boolean(jsonError)}
              startIcon={<SaveOutlinedIcon />}
              sx={{ mt: 1, textTransform: "none", fontWeight: 700 }}
            >
              Save raw JSON (replaces entire document)
            </Button>
          ) : null}
        </Collapse>
      </Box>
    </Box>
  );
}

// ── Main component ───────────────────────────────────────────────────────

/**
 * `embedded` — rendered as a section inside the Settings page rather than
 * as a standalone route. Suppresses this page's own PageHeader (Settings
 * already supplies one; two stacked headers read as a bug) and drops the
 * outer padding, since the host tab panel provides it. The RefreshControl
 * still renders, just inline — it's a control, not chrome.
 */
export default function AgentSettings({ embedded = false }) {
  const theme = useTheme();
  const isSmDown = useMediaQuery(theme.breakpoints.down("sm"));
  const { auth } = useAuthContext();
  const confirm = useConfirm();

  // Plugin catalog is fetched from the backend (single source of truth).
  // While it's loading the array is empty — form initializers gracefully
  // produce empty `plugins.{}` maps, and an effect below re-runs
  // readFormFromPolicy() once the catalog arrives. Save buttons disable
  // while loading so we never PUT a partial enabled list.
  const {
    catalog: pluginCatalog,
  } = usePluginCatalog();

  const tenantId = auth?.tenantId;
  const tenantRole = String(auth?.tenantMember?.role || "");
  const isActiveMember = auth?.tenantMember?.isActive === true;
  const canManage = isActiveMember && (tenantRole === "ADMIN" || tenantRole === "OWNER");

  const [tab, setTab] = React.useState("tenant");

  // Shared
  const [devices, setDevices] = React.useState([]); // [{deviceId, hostname, connected, agentVersion}]
  const [snackbar, setSnackbar] = React.useState({ open: false, message: "", severity: "success" });

  // Tenant state
  const [tenantPolicy, setTenantPolicy] = React.useState(null);
  const [tenantForm, setTenantForm] = React.useState(() => readFormFromPolicy({}, []));
  const [tenantJsonDraft, setTenantJsonDraft] = React.useState("{}");
  const [tenantJsonError, setTenantJsonError] = React.useState(null);
  const [tenantStatus, setTenantStatus] = React.useState([]);
  const [tenantLoading, setTenantLoading] = React.useState(true);
  const [tenantSaving, setTenantSaving] = React.useState(false);
  // "No pude leer la política" NO es lo mismo que "todavía no hay
  // política", aunque ambas dejaban `tenantPolicy` en null. Esa confusión
  // no solo pintaba el formulario con defaults sin avisar: además
  // desarmaba el candado optimista, porque `extractPolicyEnvelope(null)`
  // devuelve version=null y eso significa "no mandes If-Match". Un 500
  // pasajero en el GET más un click en Guardar reemplazaban la política
  // real del tenant por los defaults del formulario, y de ahí a todos los
  // agentes. El candado protege contra otro escritor, nunca protegió
  // contra una lectura fallida.
  const [tenantLoadError, setTenantLoadError] = React.useState(null);
  const [tenantPushing, setTenantPushing] = React.useState(false);
  // Plugin coverage real-state — distinto de policy ack: lee de
  // agent_payload->agent->capabilities (último facts publish del agent),
  // representando el runtime efectivo no la promesa contractual del ack.
  // Operadores necesitan esto en la página Policies para distinguir
  // "device confirmó la policy" vs "plugin realmente corriendo".
  const [pluginCoverageResult, setPluginCoverageResult] = React.useState(null);

  // Device state
  const [selectedDeviceId, setSelectedDeviceId] = React.useState("");
  // Infrastructure Gateway registrations (ADR-0001). READ-ONLY here: this page
  // edits the device policy, but the `gateway` block inside it is OWNED by the
  // Patch Management registration. Someone finding that block here without
  // explanation would reasonably hand-edit it — and their change would be
  // silently replaced the next time the gateway is saved.
  const [gateways, setGateways] = React.useState([]);
  const [devicePolicy, setDevicePolicy] = React.useState(null); // raw override or null
  const [deviceForm, setDeviceForm] = React.useState(() => readFormFromPolicy({}, []));
  const [deviceJsonDraft, setDeviceJsonDraft] = React.useState("{}");
  const [deviceJsonError, setDeviceJsonError] = React.useState(null);
  const [effective, setEffective] = React.useState(null);
  const [deviceStatus, setDeviceStatus] = React.useState(null);
  const [deviceLoading, setDeviceLoading] = React.useState(false);
  const [deviceSaving, setDeviceSaving] = React.useState(false);
  const [devicePushing, setDevicePushing] = React.useState(false);
  const [deviceDeleting, setDeviceDeleting] = React.useState(false);

  const showSnack = React.useCallback((message, severity = "success") => {
    setSnackbar({ open: true, message, severity });
  }, []);

  // ── Load tenant policy + status + device list ──────────────────────────
  const loadTenant = React.useCallback(async () => {
    if (!canManage || !tenantId) return;
    try {
      setTenantLoading(true);
      // Plugin coverage usa allSettled porque PluginCoverageStrip lee
      // `result.status === "fulfilled"` y `result.value` — formato
      // estándar de Promise.allSettled. Se carga en paralelo con el
      // resto (no bloquea la página si está lento o falla).
      const [policyRes, statusRes, devicesRes, coverageSettled] = await Promise.all([
        // La política es la página. Su fallo tiene que llegar al operador
        // y, sobre todo, tiene que impedir el guardado.
        getTenantPolicy(tenantId).then(
          (r) => { setTenantLoadError(null); return r; },
          (err) => { setTenantLoadError(err?.message || "Could not load the tenant policy."); return null; }
        ),
        listTenantPolicyStatus(tenantId).catch(() => ({ items: [] })),
        listKnownDevices().catch(() => ({ items: [] })),
        Promise.allSettled([getPluginCoverageSummary()]).then((arr) => arr[0]),
      ]);
      setPluginCoverageResult(coverageSettled);

      // Normalize the response envelope once and feed the form+JSON
      // editor from the extracted policy content. Without this the form
      // was reading `.plugins` off the DB row (which has no such key)
      // and all plugin toggles rendered as off.
      const tenantEnv = extractPolicyEnvelope(policyRes);
      const policy = tenantEnv.raw ?? {};
      setTenantPolicy(policyRes ?? null);
      setTenantForm(readFormFromPolicy(policy, pluginCatalog));
      setTenantJsonDraft(formatJson(policy));
      setTenantJsonError(null);

      const statusItems = Array.isArray(statusRes?.items) ? statusRes.items : [];
      setTenantStatus(statusItems);

      const deviceItems = Array.isArray(devicesRes?.items) ? devicesRes.items : [];
      const normalized = deviceItems
        .map((d) => ({
          deviceId: String(d?.deviceId || "").trim(),
          hostname: String(d?.hostname || "").trim() || String(d?.deviceId || "").trim(),
          connected: d?.connected === true,
          agentVersion: d?.agentVersion ?? null,
        }))
        .filter((d) => d.deviceId);
      setDevices(normalized);
      setSelectedDeviceId((current) => {
        if (current && normalized.some((d) => d.deviceId === current)) return current;
        return normalized[0]?.deviceId || "";
      });
    } catch (e) {
      console.error(e);
      showSnack("Failed to load tenant policy", "error");
    } finally {
      setTenantLoading(false);
    }
  }, [canManage, tenantId, showSnack]);

  // ── Load device override + effective + status ──────────────────────────
  const loadDevice = React.useCallback(async (deviceId) => {
    if (!canManage || !deviceId) {
      setDevicePolicy(null);
      setEffective(null);
      setDeviceStatus(null);
      return;
    }
    try {
      setDeviceLoading(true);
      const [overrideRes, effectiveRes, statusRes] = await Promise.all([
        getDevicePolicy(deviceId).catch(() => null),
        getEffectivePolicy(deviceId).catch(() => null),
        getDevicePolicyStatus(deviceId).catch(() => null),
      ]);

      // See extractPolicyEnvelope for why we normalize: backend returns
      // `{ ok, policy: { policy_version, policy_hash, policy_json } }`
      // and directly passing that to readFormFromPolicy left the form
      // empty. The helper produces a `.raw` that is always the policy
      // content (modules/plugins/compliance) or null if no override.
      const overrideEnv = extractPolicyEnvelope(overrideRes);
      const overridePolicy = overrideEnv.raw;
      setDevicePolicy(overrideRes ?? null);
      setDeviceForm(readFormFromPolicy(overridePolicy || {}, pluginCatalog));
      setDeviceJsonDraft(formatJson(overridePolicy || {}));
      setDeviceJsonError(null);
      // Effective policy is wrapped as `{ ok, policy: {source, policyJson, ...} }`.
      // Unwrap to the inner object so downstream code can read
      // `effective.source`, `effective.policyJson`, `effective.policyVersion`
      // directly without worrying about the envelope.
      setEffective(effectiveRes?.policy ?? effectiveRes ?? null);
      // Same dance for status: `{ ok, status: {...} }`. Without this
      // unwrap `deviceStatus.last_ack_status` was always undefined and
      // the Sync panel chip stayed stuck on "Pending" regardless of
      // what the DB actually had.
      setDeviceStatus(statusRes?.status ?? statusRes ?? null);
    } catch (e) {
      console.error(e);
      showSnack("Failed to load device policy", "error");
    } finally {
      setDeviceLoading(false);
    }
  }, [canManage, showSnack]);

  React.useEffect(() => {
    loadTenant();
  }, [loadTenant]);

  React.useEffect(() => {
    listGateways()
      .then((res) => res?.ok && setGateways(res.data?.gateways ?? []))
      .catch(() => {
        // Not every tenant has a gateway; this banner is purely informational.
      });
  }, []);

  const gatewayForSelected = React.useMemo(
    () => gateways.find((g) => g.deviceId === selectedDeviceId) || null,
    [gateways, selectedDeviceId]
  );

  React.useEffect(() => {
    loadDevice(selectedDeviceId);
  }, [selectedDeviceId, loadDevice]);

  const refreshAll = React.useCallback(() => {
    loadTenant();
    if (selectedDeviceId) loadDevice(selectedDeviceId);
  }, [loadTenant, loadDevice, selectedDeviceId]);
  const [refreshSeconds, setRefreshSeconds] = useAutoRefresh(refreshAll, "policiesAutoRefresh");

  // ── Actions ────────────────────────────────────────────────────────────
  const handleSaveTenant = async () => {
    if (!canManage || !tenantId) return;
    // El guard que importa. Si la política no se leyó, el formulario
    // contiene defaults y `expectedVersion` sería null — o sea, un PATCH
    // sin If-Match que pisa lo que haya en el servidor. Rechazar aquí, y
    // no solo deshabilitar el botón, porque el botón se puede volver a
    // habilitar por cualquier re-render y esto no admite un "casi".
    if (tenantLoadError) {
      showSnack("The current policy could not be read — reload before saving.", "error");
      return;
    }
    if (tenantJsonError) {
      showSnack("Fix JSON errors before saving", "error");
      return;
    }
    try {
      setTenantSaving(true);
      // Domain-scoped save: this page owns the agent-config slice ONLY.
      // formToPolicy still rebuilds the whole document from the form
      // (including security/mam populated read-only at load), so we strip
      // the foreign domains before sending — the server preserves its
      // stored copies of those keys verbatim. This is what stops Agent
      // Settings from clobbering Security Baselines / Device Management,
      // the way the old whole-document PUT used to.
      const slice = formToPolicy(tenantForm, pluginCatalog);
      delete slice.security;
      delete slice.mam;
      delete slice.managedApp;
      // Opt-locking: send the version we loaded the policy at as
      // If-Match. If Plugin Control (or another operator) wrote in the
      // meantime, backend returns 409 and we surface a non-blocking
      // notice + reload so the user can re-apply on top of fresh state.
      const expectedVersion = extractPolicyEnvelope(tenantPolicy).version;
      await patchTenantPolicyDomain(tenantId, "agent-config", slice, { expectedVersion });
      showSnack("Agent settings saved", "success");
      await loadTenant();
    } catch (e) {
      if (e?.status === 409) {
        console.warn("[agent-settings] tenant save rejected: stale policy", e?.body);
        showSnack(
          "Policy was modified by someone else. Reloaded — review your changes and save again.",
          "warning"
        );
        await loadTenant();
      } else {
        console.error(e);
        showSnack("Failed to save agent settings", "error");
      }
    } finally {
      setTenantSaving(false);
    }
  };

  // Raw-JSON escape hatch: replaces the ENTIRE policy document (all
  // three domains) via the whole-doc PUT. Kept for power users; the
  // confirm dialog makes the blast radius explicit.
  const handleSaveTenantRawJson = async () => {
    if (!canManage || !tenantId) return;
    if (tenantJsonError) {
      showSnack("Fix JSON errors before saving", "error");
      return;
    }
    let parsed;
    try {
      parsed = JSON.parse(tenantJsonDraft);
    } catch {
      showSnack("Fix JSON errors before saving", "error");
      return;
    }
    // El guard que importa. Si la política no se leyó, el formulario
    // contiene defaults y `expectedVersion` sería null — o sea, un PATCH
    // sin If-Match que pisa lo que haya en el servidor. Rechazar aquí, y
    // no solo deshabilitar el botón, porque el botón se puede volver a
    // habilitar por cualquier re-render y esto no admite un "casi".
    if (tenantLoadError) {
      showSnack("The current policy could not be read — reload before saving.", "error");
      return;
    }

    const ok = await confirm({
      title: "Replace the entire policy document?",
      body:
        "Saving raw JSON overwrites ALL policy domains — including the " +
        "Security Baselines and Device Management (MAM) blocks, which are " +
        "normally edited on their own pages.",
      confirmText: "Replace document",
      danger: true,
    });
    if (!ok) return;
    try {
      setTenantSaving(true);
      const expectedVersion = extractPolicyEnvelope(tenantPolicy).version;
      await saveTenantPolicy(tenantId, parsed, { expectedVersion });
      showSnack("Policy document replaced", "success");
      await loadTenant();
    } catch (e) {
      if (e?.status === 409) {
        showSnack(
          "Policy was modified by someone else. Reloaded — review your changes and save again.",
          "warning"
        );
        await loadTenant();
      } else {
        console.error(e);
        showSnack("Failed to save policy document", "error");
      }
    } finally {
      setTenantSaving(false);
    }
  };

  const handlePushTenant = async () => {
    if (!canManage || !tenantId) return;
    const ok = await confirm({
      title: "Push tenant policy?",
      body:
        "This will broadcast the current tenant policy to every device.\n\n" +
        "Any pre-existing device-level overrides will be reset — devices with " +
        "custom policies will receive the tenant policy instead.",
      confirmText: "Push to all devices",
      danger: true,
    });
    if (!ok) return;
    try {
      setTenantPushing(true);
      const res = await pushTenantPolicy(tenantId);
      // Backend retorna: { targeted, connected, sent, failed, clearedOverrides }
      // Mostramos los counters útiles para el operador. El número de
      // devices entregados de inmediato (`sent`) puede ser menor que
      // `targeted` cuando hay devices conectados a una instancia gRPC
      // distinta de la REST que recibió el push — esos los cosecha la
      // heartbeat reconciliation en sus próximos heartbeats.
      const targeted = res?.targeted ?? 0;
      const sent = res?.sent ?? 0;
      const cleared = res?.clearedOverrides ?? 0;
      const parts = [`${targeted} targeted`, `${sent} delivered immediately`];
      if (cleared > 0) {
        parts.push(`${cleared} device override${cleared === 1 ? "" : "s"} reset`);
      }
      showSnack(`Tenant policy push: ${parts.join(" · ")}`, "success");
      await loadTenant();
    } catch (e) {
      console.error(e);
      showSnack("Failed to push tenant policy", "error");
    } finally {
      setTenantPushing(false);
    }
  };

  const handleSaveDevice = async () => {
    if (!canManage || !selectedDeviceId) return;
    if (deviceJsonError) {
      showSnack("Fix JSON errors before saving", "error");
      return;
    }
    try {
      setDeviceSaving(true);
      const policy = formToPolicy(deviceForm, pluginCatalog);
      // Same opt-locking rationale as tenant save above. `devicePolicy`
      // can be null when there's no override yet — extractPolicyEnvelope
      // returns version=null in that case, which becomes "no If-Match
      // header sent" (legacy last-writer-wins for first writes).
      const expectedVersion = extractPolicyEnvelope(devicePolicy).version;
      await saveDevicePolicy(selectedDeviceId, policy, { expectedVersion });
      showSnack("Device override saved", "success");
      await loadDevice(selectedDeviceId);
    } catch (e) {
      if (e?.status === 409) {
        console.warn("[policies] device save rejected: stale policy", e?.body);
        showSnack(
          "Device override was modified by someone else. Reloaded — review your changes and save again.",
          "warning"
        );
        await loadDevice(selectedDeviceId);
      } else {
        console.error(e);
        showSnack("Failed to save device override", "error");
      }
    } finally {
      setDeviceSaving(false);
    }
  };

  // Ref that always reflects the currently-selected device id. Used by
  // the post-push poll to detect when the user has navigated to a
  // different device mid-poll — in that case we simply stop updating
  // state so the new device's panel isn't contaminated with stale data
  // from the one we were polling.
  const selectedDeviceIdRef = React.useRef(selectedDeviceId);
  React.useEffect(() => {
    selectedDeviceIdRef.current = selectedDeviceId;
  }, [selectedDeviceId]);

  const [devicePolling, setDevicePolling] = React.useState(false);

  /**
   * Poll the device's policy-status endpoint every 3s for up to 30s,
   * stopping as soon as `last_ack_at` advances past the timestamp we
   * captured before the push. This replaces the old "one-shot refresh"
   * behavior that left the Sync panel showing a stale ACK whenever the
   * agent took more than a second to process the policy.
   *
   * Fire-and-forget: callers don't await; the UI re-renders on each
   * setDeviceStatus update. If the user switches to another device
   * before the poll finishes we abandon silently.
   */
  const pollForDeviceAck = React.useCallback(
    async (deviceId, priorAckAt) => {
      const started = Date.now();
      const MAX_MS = 30_000;
      const POLL_MS = 3_000;
      setDevicePolling(true);
      try {
        while (Date.now() - started < MAX_MS) {
          await new Promise((r) => setTimeout(r, POLL_MS));
          // User navigated away — don't touch state for a device that
          // isn't on screen anymore.
          if (selectedDeviceIdRef.current !== deviceId) return;

          const res = await getDevicePolicyStatus(deviceId).catch(() => null);
          // And check again — a slow request could have straddled a
          // device switch.
          if (selectedDeviceIdRef.current !== deviceId) return;

          if (res) {
            setDeviceStatus(res);
            const nextAckAt = res?.last_ack_at ?? null;
            if (nextAckAt && nextAckAt !== priorAckAt) {
              if (res.last_ack_status === 0) {
                showSnack("Agent acknowledged policy (ACK OK)", "success");
              } else {
                showSnack(
                  `Agent rejected policy (ACK ${res.last_ack_status}${
                    res.last_ack_message ? ": " + res.last_ack_message : ""
                  })`,
                  "warning"
                );
              }
              return;
            }
          }
        }
        // Timed out. Don't swallow — surface so the operator knows the
        // agent hasn't reported back. Common causes: device offline,
        // gRPC bridge down on the agent, or the agent is mid-restart.
        if (selectedDeviceIdRef.current === deviceId) {
          showSnack(
            "No ACK from agent in 30s — device may be offline or disconnected from gRPC",
            "warning"
          );
        }
      } finally {
        setDevicePolling(false);
      }
    },
    [showSnack]
  );

  const handlePushDevice = async () => {
    if (!canManage || !selectedDeviceId) return;
    // Snapshot the current ACK timestamp before we push. The poll uses
    // this as the "prior" baseline so it can tell a fresh ACK apart
    // from the previous one still displayed on screen.
    const priorAckAt = deviceStatus?.last_ack_at ?? null;
    try {
      setDevicePushing(true);
      await pushDevicePolicy(selectedDeviceId);
      showSnack("Policy dispatched to device", "success");
      await loadDevice(selectedDeviceId);
      // Fire-and-forget. The push button releases immediately; the poll
      // runs in the background and updates the Sync panel as it gets
      // fresh status payloads.
      pollForDeviceAck(selectedDeviceId, priorAckAt);
    } catch (e) {
      console.error(e);
      showSnack("Failed to push device policy", "error");
    } finally {
      setDevicePushing(false);
    }
  };

  const handleDeleteDevice = async () => {
    if (!canManage || !selectedDeviceId) return;
    const ok = await confirm({
      title: "Remove device override?",
      body: "The device will fall back to the tenant-level policy on its next sync.",
      confirmText: "Remove override",
      danger: true,
    });
    if (!ok) return;
    try {
      setDeviceDeleting(true);
      await deleteDevicePolicy(selectedDeviceId);
      showSnack("Device override removed", "success");
      await loadDevice(selectedDeviceId);
    } catch (e) {
      console.error(e);
      showSnack("Failed to remove device override", "error");
    } finally {
      setDeviceDeleting(false);
    }
  };

  const handleSwitchToDevice = (deviceId) => {
    setSelectedDeviceId(deviceId);
    setTab("device");
  };

  // ── Derived summary ────────────────────────────────────────────────────
  const deviceMap = React.useMemo(
    () => new Map(devices.map((d) => [d.deviceId, d])),
    [devices]
  );

  const summary = React.useMemo(() => {
    const total = tenantStatus.length;
    const acked = tenantStatus.filter((s) => s.last_ack_status === 0).length;
    const pending = tenantStatus.filter(
      (s) => s.last_ack_status == null && s.last_sent_policy_version
    ).length;
    const errors = tenantStatus.filter(
      (s) => s.last_ack_status != null && s.last_ack_status !== 0
    ).length;
    return { total, acked, pending, errors };
  }, [tenantStatus]);

  // Unified envelope extraction — the backend wraps DB rows as
  // `{ ok, policy: { policy_version, policy_hash, policy_json, updated_at } }`
  // and we want the UI to read version/hash/updatedAt regardless of
  // which shape layer we landed in.
  const tenantEnv = extractPolicyEnvelope(tenantPolicy);
  const tenantVersion = tenantEnv.version ?? "—";
  const tenantHash = tenantEnv.hash;
  const tenantUpdatedAt = tenantEnv.updatedAt;

  const deviceEnv = extractPolicyEnvelope(devicePolicy);
  const deviceVersion = deviceEnv.version;
  const deviceHash = deviceEnv.hash;
  const deviceUpdatedAt = deviceEnv.updatedAt;

  // Effective policy comes from /devices/:id/effective-policy which
  // does its own shape dance; we pick policy_json → policyJson → policy
  // (last one is a legacy API that nested the content one level).
  const effectivePolicyJson =
    effective?.policy_json ?? effective?.policyJson ?? effective?.policy ?? {};
  const effectiveSource = effective?.source;
  const effectiveVersion = effective?.policy_version ?? effective?.policyVersion;

  // hasOverride is a pure "is there anything saved?" binary. Use the
  // extracted content (what the user actually authored) — not the row
  // wrapper, which always has policy_* columns even when empty.
  const hasOverride = !isEmptyPolicy(deviceEnv.raw);

  // ── Rollout table columns ──────────────────────────────────────────────
  //
  // Liveness columns (Online + Last seen) van junto al Device para que
  // el operador interprete el ack a la derecha en su contexto correcto:
  //   * online + ack reciente  → policy aplicada y viva (alta confianza)
  //   * online + ack viejo     → policy estable, no requiere re-ack
  //   * offline + ack reciente → aplicada antes de offline (media)
  //   * offline + ack antiguo  → estado real desconocido (baja)
  // Sin estas columnas, un ack OK podía interpretarse erróneamente como
  // "device aplicó y sigue corriendo el plugin", aunque el device esté
  // offline desde hace días o nunca recibió un policy_applied real.
  const statusColumns = [
    {
      field: "device_id",
      headerName: "Device",
      minWidth: 200,
      flex: 1,
      valueGetter: (_v, row) => deviceMap.get(row.device_id)?.hostname || row.device_id,
    },
    {
      field: "is_connected",
      headerName: "Online",
      minWidth: 75,
      flex: 0.25,
      sortable: true,
      renderCell: (params) => {
        const online = params.row?.is_connected === true;
        const lastSeen = params.row?.last_heartbeat;
        // Tooltip enriquecido con last seen para evitar dos hovers
        // separados — el operador ve el dot y al pasar el mouse
        // entiende exactamente qué tan reciente es esa señal.
        const tooltip = online
          ? lastSeen
            ? `Online · last heartbeat ${formatRelativeTime(lastSeen)}`
            : "Online — active session"
          : lastSeen
            ? `Offline · last seen ${formatRelativeTime(lastSeen)}`
            : "Offline · never seen";
        return <OnlineDot online={online} title={tooltip} />;
      },
    },
    {
      field: "last_heartbeat",
      headerName: "Last seen",
      minWidth: 110,
      flex: 0.4,
      // Render relative para scan-rapido, tooltip absoluto para
      // precision cuando el operador necesita correlacionar con logs.
      renderCell: (params) => {
        const value = params.value;
        if (!value) return <Typography variant="caption" sx={{ color: "text.secondary" }}>Never</Typography>;
        return (
          <Tooltip title={formatDate(value)} arrow>
            <Typography variant="caption">{formatRelativeTime(value)}</Typography>
          </Tooltip>
        );
      },
    },
    {
      field: "desired_policy_source",
      headerName: "Source",
      minWidth: 140,
      flex: 0.5,
      renderCell: (params) => renderSourceChip(params.value),
    },
    {
      field: "desired_policy_version",
      headerName: "Desired",
      minWidth: 110,
      flex: 0.4,
      valueGetter: (_v, row) => row.desired_policy_version || "—",
    },
    {
      field: "last_sent_policy_version",
      headerName: "Sent",
      minWidth: 110,
      flex: 0.4,
      valueGetter: (_v, row) => row.last_sent_policy_version || "—",
    },
    {
      field: "last_ack_status",
      headerName: "ACK",
      minWidth: 130,
      flex: 0.5,
      renderCell: (params) => renderAckChip(params.row.last_ack_status, null),
    },
    {
      field: "last_ack_at",
      headerName: "ACK At",
      minWidth: 140,
      flex: 0.5,
      renderCell: (params) => formatDate(params.value),
    },
    {
      field: "last_ack_message",
      headerName: "Message",
      minWidth: 220,
      flex: 1,
      valueGetter: (_v, row) => row.last_ack_message || "—",
    },
  ];

  const columnVisibilityModel = React.useMemo(() => {
    if (isSmDown) {
      // En móvil priorizamos: Device + Online + ACK status. Ocultamos
      // detalles que requieren precisión (versions, timestamps,
      // mensajes) — el operador puede tap en una row para ver el
      // device override panel con el detalle completo.
      return {
        last_ack_at: false,
        last_ack_message: false,
        desired_policy_version: false,
        last_heartbeat: false,
        last_sent_policy_version: false,
      };
    }
    return {};
  }, [isSmDown]);

  if (!canManage) {
    return (
      <Box sx={{ px: { xs: 2, sm: 0.5 }, py: { xs: 2, sm: 0.5 } }}>
        <Alert severity="warning" sx={{ borderRadius: 3 }}>
          Policy management is restricted to active tenant admins and owners.
        </Alert>
      </Box>
    );
  }

  return (
    <Box
      sx={
        embedded
          ? { minWidth: 0 }
          : { px: { xs: 2, sm: 0.5 }, py: { xs: 2, sm: 0.5 }, minWidth: 0 }
      }
    >
      {/* Header */}
      {embedded ? (
        <Box sx={{ display: "flex", justifyContent: "flex-end", mb: 1.5 }}>
          <RefreshControl
            refreshSeconds={refreshSeconds}
            onRefreshSecondsChange={setRefreshSeconds}
            onRefresh={refreshAll}
            loading={tenantLoading}
          />
        </Box>
      ) : (
        <PageHeader
          title="Agent Settings"
          subtitle="How the agent and its plugins behave — collection schedules, feature gates and runtime limits. Enable plugins under Plugin Control; security remediation lives in Security Baselines; mobile/MAM in Device Management."
          icon={<TuneOutlinedIcon />}
          actions={
            <RefreshControl
              refreshSeconds={refreshSeconds}
              onRefreshSecondsChange={setRefreshSeconds}
              onRefresh={refreshAll}
              loading={tenantLoading}
            />
          }
        />
      )}

      {/* Summary cards — intentionally complementary, not mutually
          exclusive: a device can show up in both `Devices tracked` and
          `ACK OK`. Tracked is total; the other three are a breakdown
          of that total by last-ACK state. Hints below each value
          spell this out so the numbers don't look double-counted. */}
      <Box sx={{ mb: 2 }}>
        <Grid container spacing={2} alignItems="stretch">
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <SummaryCard
              title="Devices tracked"
              value={summary.total}
              hint="total with policy rollout state"
              icon={<AssignmentOutlinedIcon />}
              accent={BRAND.dark}
              tint={BRAND.darkSoft}
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <SummaryCard
              title="ACK OK"
              value={summary.acked}
              hint={
                summary.total > 0
                  ? `${summary.acked} / ${summary.total} applied`
                  : "no rollouts yet"
              }
              icon={<CheckCircleOutlineOutlinedIcon />}
              accent={BRAND.tealText}
              tint={BRAND.tealSoft}
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <SummaryCard
              title="Pending ACK"
              value={summary.pending}
              hint="sent, awaiting agent reply"
              icon={<HourglassEmptyOutlinedIcon />}
              accent={BRAND.alert.high}
              tint="rgba(199,121,43,0.14)"
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <SummaryCard
              title="ACK errors"
              value={summary.errors}
              hint="agent rejected or failed to apply"
              icon={<ErrorOutlineOutlinedIcon />}
              accent={BRAND.alert.error}
              tint={BRAND.alert.errorSoft}
            />
          </Grid>
        </Grid>
      </Box>

      {/* Tabs */}
      <SectionPaper
        variant="panel"
        sx={{ p: 0, overflow: "hidden", mb: 2 }}
      >
        <Tabs
          value={tab}
          onChange={(_e, next) => setTab(next)}
          sx={{
            borderBottom: `1px solid ${BRAND.border}`,
            bgcolor: BRAND.darkSoft,
            "& .MuiTab-root": {
              textTransform: "none",
              fontWeight: 700,
              color: BRAND.dark,
              minHeight: 48,
              outline: "none",
              "&:focus, &:focus-visible": {
                outline: "none",
                boxShadow: "none",
              },
              "&.Mui-focusVisible": {
                backgroundColor: BRAND.cyanSoft,
              },
            },
            "& .Mui-selected": { color: `${BRAND.teal} !important` },
            "& .MuiTabs-indicator": { backgroundColor: BRAND.teal, height: 3 },
          }}
        >
          <Tab value="tenant" label="Tenant Policy" icon={<TuneOutlinedIcon />} iconPosition="start" sx={{ gap: 0.75 }} />
          <Tab value="device" label="Device Overrides" icon={<AccountTreeOutlinedIcon />} iconPosition="start" sx={{ gap: 0.75 }} />
        </Tabs>

        <Box sx={{ p: { xs: 1.5, sm: 2 } }}>
          {tab === "tenant" ? (
            <TenantTab
              tenantForm={tenantForm}
              setTenantForm={setTenantForm}
              tenantJsonDraft={tenantJsonDraft}
              setTenantJsonDraft={setTenantJsonDraft}
              tenantJsonError={tenantJsonError}
              setTenantJsonError={setTenantJsonError}
              tenantVersion={tenantVersion}
              tenantHash={tenantHash}
              tenantUpdatedAt={tenantUpdatedAt}
              tenantSaving={tenantSaving}
              tenantLoadError={tenantLoadError}
              onRetryLoad={loadTenant}
              tenantPushing={tenantPushing}
              onSave={handleSaveTenant}
              onPush={handlePushTenant}
              onSaveRawJson={handleSaveTenantRawJson}
              tenantStatus={tenantStatus}
              statusColumns={statusColumns}
              columnVisibilityModel={columnVisibilityModel}
              onRowClick={(row) => handleSwitchToDevice(row.device_id)}
              loading={tenantLoading}
              pluginCoverageResult={pluginCoverageResult}
            />
          ) : (
            <DeviceTab
              devices={devices}
              gatewayForSelected={gatewayForSelected}
              selectedDeviceId={selectedDeviceId}
              setSelectedDeviceId={setSelectedDeviceId}
              deviceMap={deviceMap}
              hasOverride={hasOverride}
              deviceForm={deviceForm}
              setDeviceForm={setDeviceForm}
              deviceJsonDraft={deviceJsonDraft}
              setDeviceJsonDraft={setDeviceJsonDraft}
              deviceJsonError={deviceJsonError}
              setDeviceJsonError={setDeviceJsonError}
              deviceVersion={deviceVersion}
              deviceHash={deviceHash}
              deviceUpdatedAt={deviceUpdatedAt}
              effectivePolicyJson={effectivePolicyJson}
              effectiveSource={effectiveSource}
              effectiveVersion={effectiveVersion}
              deviceStatus={deviceStatus}
              deviceSaving={deviceSaving}
              devicePushing={devicePushing}
              devicePolling={devicePolling}
              deviceDeleting={deviceDeleting}
              loading={deviceLoading}
              onSave={handleSaveDevice}
              onPush={handlePushDevice}
              onDelete={handleDeleteDevice}
            />
          )}
        </Box>
      </SectionPaper>

      <BrandSnackbar
        open={snackbar.open}
        severity={snackbar.severity}
        message={snackbar.message}
        onClose={() => setSnackbar((prev) => ({ ...prev, open: false }))}
      />
    </Box>
  );
}

// ── Tenant tab ──────────────────────────────────────────────────────────

function TenantTab(props) {
  const {
    tenantForm, setTenantForm,
    tenantJsonDraft, setTenantJsonDraft,
    tenantJsonError, setTenantJsonError,
    tenantVersion, tenantHash, tenantUpdatedAt,
    tenantSaving, tenantPushing, onSave, onPush, onSaveRawJson,
    tenantLoadError, onRetryLoad,
    tenantStatus, statusColumns, columnVisibilityModel, onRowClick,
    loading,
    pluginCoverageResult,
  } = props;

  return (
    <Grid container spacing={2}>
      <Grid size={{ xs: 12, lg: 5 }}>
        <SectionPaper
          variant="panel"
          sx={{ minWidth: 0 }}
        >
          <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 1, mb: 1 }}>
            <Typography sx={{ fontSize: TEXT.lg, fontWeight: 800, color: BRAND.dark }}>
              Tenant policy
            </Typography>
          </Box>

          <Box sx={{ display: "grid", gap: 0.5, mb: 2 }}>
            <DetailRow label="Version" value={tenantVersion} mono />
            <DetailRow label="Hash" value={shortHash(tenantHash)} mono />
            <DetailRow label="Updated" value={formatDate(tenantUpdatedAt)} />
          </Box>

          <Divider sx={{ borderColor: BRAND.border, mb: 2 }} />

          <PolicyForm
            form={tenantForm}
            onChange={setTenantForm}
            jsonDraft={tenantJsonDraft}
            setJsonDraft={setTenantJsonDraft}
            jsonError={tenantJsonError}
            setJsonError={setTenantJsonError}
            onSaveRawJson={onSaveRawJson}
          />

          {tenantLoadError ? (
            // Sin esto el formulario se ve normal — con defaults — y nada
            // indica que lo que hay en pantalla no es la política real.
            <Alert
              severity="error"
              sx={{ mt: 2.5 }}
              action={
                <Button color="inherit" size="small" onClick={onRetryLoad}>
                  Retry
                </Button>
              }
            >
              <AlertTitle>Couldn&apos;t read the current policy</AlertTitle>
              {tenantLoadError} — the form below shows default values, not this
              tenant&apos;s configuration. Saving is disabled so it can&apos;t be
              overwritten.
            </Alert>
          ) : null}

          <Box sx={{ mt: 2.5, display: "flex", gap: 1, flexWrap: "wrap" }}>
            <Button
              variant="contained"
              startIcon={<SaveOutlinedIcon />}
              onClick={onSave}
              disabled={tenantSaving || Boolean(tenantJsonError) || Boolean(tenantLoadError)}
              sx={{
                bgcolor: BRAND.teal,
                color: BRAND.surface,
                fontWeight: 700,
                textTransform: "none",
                "&:hover": { bgcolor: BRAND.tealHover },
              }}
            >
              {tenantSaving ? "Saving…" : "Save"}
            </Button>
            <Button
              variant="outlined"
              startIcon={<SendOutlinedIcon />}
              onClick={onPush}
              disabled={tenantPushing}
              sx={{
                textTransform: "none",
                fontWeight: 700,
                borderColor: BRAND.teal,
                color: BRAND.teal,
                "&:hover": { borderColor: BRAND.tealHover, bgcolor: BRAND.tealSoft },
              }}
            >
              {tenantPushing ? "Pushing…" : "Push to all"}
            </Button>
          </Box>
        </SectionPaper>
      </Grid>

      <Grid size={{ xs: 12, lg: 7 }}>
        {/*
          Plugin coverage real — qué plugins están EFECTIVAMENTE corriendo
          en runtime según el último facts publish de cada agent. Distinto
          de "ack OK" en la tabla de Rollout status abajo: el ack confirma
          que el agent recibió y procesó la policy en su momento, pero un
          ack viejo en un device offline o un runtime desincronizado
          (bug de la saga PMP) no garantiza que el plugin esté activo
          ahora. Esta strip lo refleja desde agent.capabilities.
        */}
        <Box sx={{ mb: 2 }}>
          <PluginCoverageStrip result={pluginCoverageResult} loading={loading} />
        </Box>

        <SectionPaper
          variant="panel"
          sx={{ minWidth: 0, overflow: "hidden" }}
        >
          <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 1.5, flexWrap: "wrap", gap: 1 }}>
            <Typography sx={{ fontSize: TEXT.lg, fontWeight: 800, color: BRAND.dark }}>
              Rollout status
            </Typography>
            <Typography sx={{ fontSize: TEXT.sm, color: "text.secondary" }}>
              {tenantStatus.length} devices tracked · click a row to edit override
            </Typography>
          </Box>

          <Box sx={{ width: "100%", overflowX: "auto" }}>
            <DataGrid
              autoHeight
              disableRowSelectionOnClick
              rows={tenantStatus}
              columns={statusColumns}
              loading={loading}
              getRowId={(row) => row.device_id}
              onRowClick={(params) => onRowClick?.(params.row)}
              columnVisibilityModel={columnVisibilityModel}
              pageSizeOptions={[10, 25, 50]}
              initialState={{ pagination: { paginationModel: { pageSize: 10, page: 0 } } }}
              sx={DATAGRID_SX}
            />
          </Box>
        </SectionPaper>
      </Grid>
    </Grid>
  );
}

// ── Device tab ──────────────────────────────────────────────────────────

function DeviceTab(props) {
  const {
    devices, selectedDeviceId, setSelectedDeviceId, deviceMap,
    gatewayForSelected,
    hasOverride,
    deviceForm, setDeviceForm,
    deviceJsonDraft, setDeviceJsonDraft,
    deviceJsonError, setDeviceJsonError,
    deviceVersion, deviceHash, deviceUpdatedAt,
    effectivePolicyJson, effectiveSource, effectiveVersion,
    deviceStatus,
    deviceSaving, devicePushing, devicePolling, deviceDeleting, loading,
    onSave, onPush, onDelete,
  } = props;

  const selectedDevice = selectedDeviceId ? deviceMap.get(selectedDeviceId) : null;

  return (
    <Box>
      {/* Device selector */}
      <Box sx={{ mb: 2 }}>
        <TextField
          select
          label="Device"
          size="small"
          value={selectedDeviceId}
          onChange={(e) => setSelectedDeviceId(e.target.value)}
          fullWidth
          helperText={
            selectedDevice
              ? `${selectedDevice.connected ? "Connected" : "Offline"} · agent ${selectedDevice.agentVersion || "unknown"}`
              : `${devices.length} devices known`
          }
        >
          {devices.length === 0 ? (
            <MenuItem value="">No devices available</MenuItem>
          ) : (
            devices.map((d) => (
              <MenuItem key={d.deviceId} value={d.deviceId}>
                {d.hostname}
                {d.hostname !== d.deviceId ? ` · ${d.deviceId}` : ""}
                {d.connected ? " · online" : " · offline"}
              </MenuItem>
            ))
          )}
        </TextField>
      </Box>

      {!selectedDeviceId ? (
        <Paper
          variant="outlined"
          sx={{
            p: 3,
            borderRadius: 2,
            borderColor: BRAND.border,
            borderStyle: "dashed",
            bgcolor: BRAND.darkSoft,
            textAlign: "center",
            color: "text.secondary",
          }}
        >
          <InfoOutlinedIcon sx={{ fontSize: ICON["2xl"], color: BRAND.gray, mb: 1 }} />
          <Typography variant="body2">Select a device to inspect and edit its override.</Typography>
        </Paper>
      ) : (
        <Grid container spacing={2}>
          {gatewayForSelected && (
            <Grid size={12}>
              <Alert severity="info" icon={<HubOutlinedIcon />}>
                This device is the <strong>Infrastructure Gateway</strong> “{gatewayForSelected.name}”.
                Its <code>gateway</code> policy block is managed from{" "}
                <strong>Patch Management → Virtual infrastructure</strong> — edit it there,
                not here, or your change will be replaced the next time the gateway is saved.
              </Alert>
            </Grid>
          )}
          {/* Override editor */}
          <Grid size={{ xs: 12, lg: 6 }}>
            <SectionPaper
              variant="panel"
              sx={{ minWidth: 0 }}
            >
              <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 1, mb: 1 }}>
                <Typography sx={{ fontSize: TEXT.lg, fontWeight: 800, color: BRAND.dark }}>
                  Device override
                </Typography>
                {hasOverride ? (
                  <Chip
                    label="Override active"
                    size="small"
                    sx={{
                      bgcolor: BRAND.cyanSoft,
                      color: BRAND.dark,
                      fontWeight: 700,
                      border: `1px solid ${BRAND.cyan}88`,
                    }}
                  />
                ) : (
                  <Chip
                    label="No override"
                    size="small"
                    sx={{
                      bgcolor: BRAND.darkSoft,
                      color: BRAND.dark,
                      fontWeight: 700,
                      border: `1px solid ${BRAND.border}`,
                    }}
                  />
                )}
              </Box>

              <Box sx={{ display: "grid", gap: 0.5, mb: 2 }}>
                <DetailRow label="Version" value={deviceVersion || "—"} mono />
                <DetailRow label="Hash" value={shortHash(deviceHash)} mono />
                <DetailRow label="Updated" value={formatDate(deviceUpdatedAt)} />
              </Box>

              <Divider sx={{ borderColor: BRAND.border, mb: 2 }} />

              <PolicyForm
                form={deviceForm}
                onChange={setDeviceForm}
                jsonDraft={deviceJsonDraft}
                setJsonDraft={setDeviceJsonDraft}
                jsonError={deviceJsonError}
                setJsonError={setDeviceJsonError}
              />

              <Box sx={{ mt: 2.5, display: "flex", gap: 1, flexWrap: "wrap" }}>
                <Button
                  variant="contained"
                  startIcon={<SaveOutlinedIcon />}
                  onClick={onSave}
                  disabled={deviceSaving || Boolean(deviceJsonError) || loading}
                  sx={{
                    bgcolor: BRAND.teal,
                    color: BRAND.surface,
                    fontWeight: 700,
                    textTransform: "none",
                    "&:hover": { bgcolor: BRAND.tealHover },
                  }}
                >
                  {deviceSaving ? "Saving…" : hasOverride ? "Update override" : "Create override"}
                </Button>
                <Button
                  variant="outlined"
                  startIcon={<SendOutlinedIcon />}
                  onClick={onPush}
                  disabled={devicePushing || loading}
                  sx={{
                    textTransform: "none",
                    fontWeight: 700,
                    borderColor: BRAND.teal,
                    color: BRAND.teal,
                    "&:hover": { borderColor: BRAND.tealHover, bgcolor: BRAND.tealSoft },
                  }}
                >
                  {devicePushing ? "Pushing…" : "Push"}
                </Button>
                <Button
                  variant="outlined"
                  color="error"
                  startIcon={<DeleteOutlineOutlinedIcon />}
                  onClick={onDelete}
                  disabled={deviceDeleting || !hasOverride || loading}
                  sx={{ textTransform: "none", fontWeight: 700 }}
                >
                  {deviceDeleting ? "Removing…" : "Remove override"}
                </Button>
              </Box>
            </SectionPaper>
          </Grid>

          {/* Effective + status */}
          <Grid size={{ xs: 12, lg: 6 }}>
            <SectionPaper
              variant="panel"
              sx={{ minWidth: 0, mb: 2 }}
            >
              <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 1, mb: 1 }}>
                <Typography sx={{ fontSize: TEXT.lg, fontWeight: 800, color: BRAND.dark }}>
                  Effective policy
                </Typography>
                {renderSourceChip(effectiveSource)}
              </Box>
              <Box sx={{ display: "grid", gap: 0.5, mb: 1 }}>
                <DetailRow label="Version" value={effectiveVersion || "—"} mono />
              </Box>
              <JsonBlock value={effectivePolicyJson} maxHeight={220} />
            </SectionPaper>

            <SectionPaper
              variant="panel"
              sx={{ minWidth: 0 }}
            >
              <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 1, mb: 1 }}>
                <Typography sx={{ fontSize: TEXT.lg, fontWeight: 800, color: BRAND.dark }}>
                  Sync status
                </Typography>
                <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                  {/* Lightweight live indicator while the post-push poll
                      runs. Fades in for up to 30 s; once ACK arrives or
                      the window elapses, the chip shows the real result. */}
                  {devicePolling && (
                    <Chip
                      label="Waiting for ACK…"
                      size="small"
                      icon={<HourglassEmptyOutlinedIcon sx={{ fontSize: ICON.sm }} />}
                      sx={{
                        bgcolor: BRAND.cyanSoft,
                        color: BRAND.tealText,
                        fontWeight: 700,
                        border: `1px solid ${BRAND.teal}55`,
                        animation: "pulse 1.5s ease-in-out infinite",
                        "@keyframes pulse": {
                          "0%, 100%": { opacity: 1 },
                          "50%": { opacity: 0.5 },
                        },
                        "& .MuiChip-icon": { color: BRAND.tealText },
                      }}
                    />
                  )}
                  {deviceStatus ? renderAckChip(deviceStatus.last_ack_status, null) : null}
                </Box>
              </Box>
              {deviceStatus ? (
                <Box sx={{ display: "grid", gap: 0.5 }}>
                  <DetailRow label="Desired" value={deviceStatus.desired_policy_version || "—"} mono />
                  <DetailRow label="Source" value={deviceStatus.desired_policy_source || "—"} />
                  <DetailRow label="Last sent" value={deviceStatus.last_sent_policy_version || "—"} mono />
                  <DetailRow label="Sent at" value={formatDate(deviceStatus.last_sent_at)} />
                  <DetailRow label="ACK version" value={deviceStatus.last_ack_policy_version || "—"} mono />
                  <DetailRow label="ACK at" value={formatDate(deviceStatus.last_ack_at)} />
                  <DetailRow label="Message" value={deviceStatus.last_ack_message || "—"} />
                </Box>
              ) : (
                <Typography variant="body2" color="text.secondary">
                  No sync activity recorded yet for this device.
                </Typography>
              )}
            </SectionPaper>
          </Grid>
        </Grid>
      )}
    </Box>
  );
}
