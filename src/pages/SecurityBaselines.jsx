// src/pages/SecurityBaselines.jsx
//
// Security remediation baselines — the `security.*` slice of the tenant
// policy. Split out of the old Policies god-page because it answers a
// different question for a different audience: Agent Settings is "how
// often does the agent collect?", this is "what state must the endpoint
// be in, and may the agent fix it automatically?".
//
// Writes through the domain-scoped PATCH, so a save here physically
// cannot touch the agent-config or device-management blocks (see
// setTenantPolicyDomain in the backend). Tenant-level only: per-device
// security overrides stay in Agent Settings → Device Overrides, which
// still authors the whole document.

import * as React from "react";
import { Alert, Box, Button, Typography } from "@mui/material";
import SaveOutlinedIcon from "@mui/icons-material/SaveOutlined";
import SendOutlinedIcon from "@mui/icons-material/SendOutlined";
import ShieldOutlinedIcon from "@mui/icons-material/ShieldOutlined";

import PageHeader from "../components/common/PageHeader";
import SectionPaper from "../components/common/SectionPaper";
import BrandSnackbar from "../components/common/BrandSnackbar";
import RefreshControl, { useAutoRefresh } from "../components/common/RefreshControl";
import { useAuthContext } from "../auth/AuthContext";
import { getMyCapabilities } from "../api/roles";
import { useConfirm } from "../components/common/ConfirmDialog";
import { usePluginCatalog } from "../hooks/usePluginCatalog";
import { BRAND } from "../theme/brand";
import { formatDate } from "../utils/format";
import {
  getTenantPolicy,
  patchTenantPolicyDomain,
  pushTenantPolicy,
} from "../api/policies";
// Fase C — live evidence on each capability card + concrete blast
// radius in the push confirm, both fed by the compliance API.
import { getCategorySummary, getComplianceSummary } from "../api/compliance";
import { CAPABILITY_TO_CATEGORIES, evidenceForCapability } from "../components/Compliance/capabilityBridge";
import {
  readSecurityFromPolicy,
  securityFormToPolicy,
  extractPolicyEnvelope,
} from "../components/Policies/policyTransforms";
import { DetailRow, shortHash } from "../components/Policies/policyDisplay";
import SecurityPolicySection from "../components/Policies/SecurityPolicySection";

// `embedded` — rendered as the Baselines tab inside Security Compliance
// (Fase B) rather than as a standalone page: skips the PageHeader (the
// host page owns the header) and keeps its own RefreshControl in a slim
// right-aligned row, same convention as AgentSettings inside Settings.
export default function SecurityBaselines({ onNavigate, embedded = false }) {
  const { auth } = useAuthContext();
  const confirm = useConfirm();

  const tenantId = auth?.tenantId;
  const isActiveMember = auth?.tenantMember?.isActive === true;

  // ADR-0011 Phase 3: gate on the "security_compliance" capability
  // instead of a hardcoded OWNER/ADMIN name check — see the same fix
  // already applied to Jobs.jsx/Audit.jsx/PKI.jsx. Defaults to
  // disabled while the fetch is in flight (fail-closed).
  const [myPermissions, setMyPermissions] = React.useState(null);

  React.useEffect(() => {
    if (!tenantId) return;
    let alive = true;
    getMyCapabilities(tenantId)
      .then((resp) => {
        if (!alive) return;
        setMyPermissions(new Set(Array.isArray(resp?.permissions) ? resp.permissions : []));
      })
      .catch(() => {
        if (!alive) return;
        setMyPermissions(new Set());
      });
    return () => {
      alive = false;
    };
  }, [tenantId]);

  const capabilitiesLoading = isActiveMember && myPermissions === null;
  const canManage = isActiveMember && Boolean(myPermissions?.has("security_compliance"));

  // El modo `auto` remedia en el endpoint: lo habilita PMP (enterprise). Sin
  // derecho la opción se deshabilita con el motivo, no se oculta.
  const { isEntitled } = usePluginCatalog();
  const autoEntitled = isEntitled("pmp");

  const [policyRow, setPolicyRow] = React.useState(null);
  // SecurityPolicySection is props-driven against `form.security`, so we
  // keep the same shape it expects rather than inventing a new one.
  const [form, setForm] = React.useState(() => ({ security: readSecurityFromPolicy({}) }));
  const [loadedSecurity, setLoadedSecurity] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  // Distinta de `policyRow === null`, que también significa "todavía no
  // hay política". Confundirlas pintaba el formulario con defaults sin
  // avisar Y desarmaba el candado optimista: extractPolicyEnvelope(null)
  // da version=null, que se traduce en "no mandes If-Match", así que el
  // PATCH pisaba lo que hubiera en el servidor. El candado nunca protegió
  // contra una lectura fallida, solo contra otro escritor.
  const [loadError, setLoadError] = React.useState(null);
  const [saving, setSaving] = React.useState(false);
  const [pushing, setPushing] = React.useState(false);
  const [snackbar, setSnackbar] = React.useState({ open: false, message: "", severity: "success" });

  const showSnack = React.useCallback((message, severity = "success") => {
    setSnackbar({ open: true, message, severity });
  }, []);

  // Fase C — posture evidence alongside the policy. Both compliance
  // calls are fail-soft: the editor must stay usable when the
  // compliance API is down (cards just render without badges).
  const [categorySummary, setCategorySummary] = React.useState(null);
  const [fleetSummary, setFleetSummary] = React.useState(null);

  const load = React.useCallback(async () => {
    if (!canManage || !tenantId) return;
    try {
      setLoading(true);
      const [res, catSum, fleet] = await Promise.all([
        getTenantPolicy(tenantId).then(
          (r) => { setLoadError(null); return r; },
          (err) => { setLoadError(err?.message || "Could not load the tenant policy."); return null; }
        ),
        getCategorySummary().catch(() => null),
        getComplianceSummary().catch(() => null),
      ]);
      const env = extractPolicyEnvelope(res);
      const policy = env.raw ?? {};
      setPolicyRow(res ?? null);
      setForm({ security: readSecurityFromPolicy(policy) });
      // Snapshot of what's on the server, for dirty-tracking.
      setLoadedSecurity(JSON.stringify(securityFormToPolicy(readSecurityFromPolicy(policy))));
      setCategorySummary(Array.isArray(catSum?.items) ? catSum.items : null);
      setFleetSummary(fleet?.summary ?? null);
    } catch (e) {
      console.error(e);
      showSnack("Failed to load security baseline", "error");
    } finally {
      setLoading(false);
    }
  }, [canManage, tenantId, showSnack]);

  const evidenceByCapability = React.useMemo(() => {
    if (!categorySummary) return null;
    const out = {};
    for (const capKey of Object.keys(CAPABILITY_TO_CATEGORIES)) {
      const ev = evidenceForCapability(categorySummary, capKey);
      if (ev) out[capKey] = ev;
    }
    return out;
  }, [categorySummary]);

  React.useEffect(() => {
    load();
  }, [load]);

  const [refreshSeconds, setRefreshSeconds] = useAutoRefresh(load, "securityBaselinesAutoRefresh");

  // Dirty tracking (the old Policies page had none — save was always
  // enabled, which made accidental no-op saves that bumped the policy
  // version and re-pushed the whole fleet very easy).
  const currentSerialized = React.useMemo(
    () => JSON.stringify(securityFormToPolicy(form.security)),
    [form.security]
  );
  const dirty = loadedSecurity !== null && currentSerialized !== loadedSecurity;

  const handleSave = async () => {
    if (!canManage || !tenantId) return;
    // Rechazar aquí y no solo deshabilitar el botón: el botón se puede
    // rehabilitar en cualquier re-render, y esto no admite un "casi".
    if (loadError) {
      showSnack("The current policy could not be read — reload before saving.", "error");
      return;
    }
    try {
      setSaving(true);
      const security = securityFormToPolicy(form.security);
      // Replace-slice: an empty baseline means "no security block", so we
      // send an empty slice and the server drops the key.
      const slice = security ? { security } : {};
      const expectedVersion = extractPolicyEnvelope(policyRow).version;
      await patchTenantPolicyDomain(tenantId, "security", slice, { expectedVersion });
      showSnack("Security baseline saved", "success");
      await load();
    } catch (e) {
      if (e?.status === 409) {
        showSnack(
          "Policy was modified by someone else. Reloaded — review your changes and save again.",
          "warning"
        );
        await load();
      } else {
        console.error(e);
        showSnack(e?.body?.message || "Failed to save security baseline", "error");
      }
    } finally {
      setSaving(false);
    }
  };

  const handlePush = async () => {
    if (!canManage || !tenantId) return;
    // Fase C item E — concrete blast radius instead of an abstract
    // warning: how many devices this reaches and how many are currently
    // failing, from the same summary that feeds the Posture hero.
    const reach = fleetSummary
      ? `Reaches the ${fleetSummary.devicesReporting ?? 0} device${(fleetSummary.devicesReporting ?? 0) === 1 ? "" : "s"} currently reporting` +
        `${fleetSummary.statusBreakdown?.non_compliant ? ` — ${fleetSummary.statusBreakdown.non_compliant} of them non-compliant right now` : ""}.\n\n`
      : "";
    const ok = await confirm({
      title: "Push tenant policy?",
      body:
        reach +
        "This broadcasts the whole tenant policy — not just the security " +
        "baseline — to every device.\n\nAny pre-existing device-level " +
        "overrides will be reset.",
      confirmText: "Push to all devices",
      danger: true,
    });
    if (!ok) return;
    try {
      setPushing(true);
      const res = await pushTenantPolicy(tenantId);
      const parts = [`${res?.targeted ?? 0} targeted`, `${res?.sent ?? 0} delivered immediately`];
      const cleared = res?.clearedOverrides ?? 0;
      if (cleared > 0) parts.push(`${cleared} device override${cleared === 1 ? "" : "s"} reset`);
      showSnack(`Policy push: ${parts.join(" · ")}`, "success");
      await load();
    } catch (e) {
      console.error(e);
      showSnack("Failed to push policy", "error");
    } finally {
      setPushing(false);
    }
  };

  if (capabilitiesLoading) {
    return (
      <Box sx={{ px: { xs: 2, sm: 0.5 }, py: { xs: 2, sm: 0.5 } }}>
        <Typography sx={{ color: "text.secondary" }}>Loading…</Typography>
      </Box>
    );
  }

  if (!canManage) {
    return (
      <Box sx={{ px: { xs: 2, sm: 0.5 }, py: { xs: 2, sm: 0.5 } }}>
        <Alert severity="warning" sx={{ borderRadius: 3 }}>
          You don't have permission to view security baselines. Ask a tenant admin to grant the Security Compliance capability.
        </Alert>
      </Box>
    );
  }

  const env = extractPolicyEnvelope(policyRow);

  return (
    <Box sx={{ px: embedded ? 0 : { xs: 2, sm: 0.5 }, py: embedded ? 0 : { xs: 2, sm: 0.5 }, minWidth: 0 }}>
      {embedded ? (
        <Box sx={{ display: "flex", justifyContent: "flex-end", mb: 1.5 }}>
          <RefreshControl
            refreshSeconds={refreshSeconds}
            onRefreshSecondsChange={setRefreshSeconds}
            onRefresh={load}
            loading={loading}
          />
        </Box>
      ) : (
        <PageHeader
          title="Security Baselines"
          subtitle="The endpoint state you require — and whether the agent may correct drift automatically. Evidence of the current state lives in Security Compliance."
          icon={<ShieldOutlinedIcon />}
          actions={
            <RefreshControl
              refreshSeconds={refreshSeconds}
              onRefreshSecondsChange={setRefreshSeconds}
              onRefresh={load}
              loading={loading}
            />
          }
        />
      )}

      <SectionPaper variant="panel" sx={{ p: { xs: 1.5, sm: 2 }, mb: 2 }}>
        <Box sx={{ display: "flex", flexWrap: "wrap", gap: 2, mb: 2 }}>
          <DetailRow label="Policy version" value={env.version ?? "—"} mono />
          <DetailRow label="Hash" value={shortHash(env.hash)} mono />
          <DetailRow label="Updated" value={formatDate(env.updatedAt)} />
        </Box>

        <Alert severity="info" sx={{ mb: 2, borderRadius: 2 }}>
          Modes are per-capability. <strong>report-only</strong> (the default) reads
          the endpoint state and reports drift without changing anything;{" "}
          <strong>auto</strong> lets the agent remediate. Capabilities marked
          "coming soon" persist your intent but have no remediator yet.
        </Alert>

        <SecurityPolicySection
          autoEntitled={autoEntitled}
          form={form}
          onChange={setForm}
          readOnly={loading}
          evidenceByCapability={evidenceByCapability}
          // "Show me the evidence" — embedded, the host swaps to the
          // Posture tab; standalone, it navigates to the SCP page.
          onShowEvidence={() => onNavigate?.("ad")}
        />

        <Box sx={{ mt: 2.5, display: "flex", gap: 1, flexWrap: "wrap", alignItems: "center" }}>
          <Button
            variant="contained"
            startIcon={<SaveOutlinedIcon />}
            onClick={handleSave}
            disabled={saving || loading || !dirty}
            sx={{
              textTransform: "none",
              fontWeight: 800,
              bgcolor: BRAND.teal,
              "&:hover": { bgcolor: BRAND.tealHover },
            }}
          >
            {saving ? "Saving…" : "Save baseline"}
          </Button>
          <Button
            variant="outlined"
            startIcon={<SendOutlinedIcon />}
            onClick={handlePush}
            disabled={pushing || loading}
            sx={{ textTransform: "none", fontWeight: 700, borderColor: BRAND.teal, color: BRAND.tealText }}
          >
            {pushing ? "Pushing…" : "Push now"}
          </Button>
          {dirty ? (
            <Typography variant="caption" sx={{ color: BRAND.alert.warning, fontWeight: 700 }}>
              Unsaved changes
            </Typography>
          ) : null}
          <Box sx={{ flex: 1 }} />
          {/* Redundant when embedded — the Posture tab is one click up. */}
          {embedded ? null : (
            <Button
              size="small"
              onClick={() => onNavigate?.("ad")}
              sx={{ textTransform: "none", color: BRAND.gray }}
            >
              View compliance evidence →
            </Button>
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
