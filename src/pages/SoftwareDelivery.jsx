// src/pages/SoftwareDelivery.jsx
//
// SDP — operator surface for the Software Delivery Plugin.
//
// This file is the SHELL only: tab order, permission/plugin gating, and the
// snackbar every tab reports through. Each tab is its own component under
// components/software-delivery/ — CatalogTab and DeploymentsTab used to be
// declared here, which is how the page reached a thousand lines while its
// other three tabs were already extracted.

import * as React from "react";
import { Box, Tabs, Tab, Typography } from "@mui/material";
import InventoryOutlinedIcon from "@mui/icons-material/InventoryOutlined";
import LocalShippingOutlinedIcon from "@mui/icons-material/LocalShippingOutlined";
import AutoAwesomeOutlinedIcon from "@mui/icons-material/AutoAwesomeOutlined";
import CloudDownloadOutlinedIcon from "@mui/icons-material/CloudDownloadOutlined";
import HubOutlinedIcon from "@mui/icons-material/HubOutlined";
import SpaceDashboardOutlinedIcon from "@mui/icons-material/SpaceDashboardOutlined";

import { BRAND, TEXT } from "../theme/brand";
import PageHeader from "../components/common/PageHeader";
import SectionPaper from "../components/common/SectionPaper";
import BrandSnackbar from "../components/common/BrandSnackbar";
import { useAuthContext } from "../auth/AuthContext";
import { getMyCapabilities } from "../api/roles";
import { getTenantPolicy } from "../api/policies";
import { usePluginCatalog } from "../hooks/usePluginCatalog";

import CatalogTab from "../components/software-delivery/CatalogTab";
import DeploymentsTab from "../components/software-delivery/DeploymentsTab";
import IntakeTab from "../components/software-delivery/IntakeTab";
import DistributionTab from "../components/software-delivery/DistributionTab";
import OverviewTab from "../components/software-delivery/OverviewTab";

// Tab order in one place: the Overview tab was inserted at 0, which shifts
// every other index. Naming them keeps cross-tab navigation (deploy →
// deployments, KPI card → its tab) from silently pointing at the wrong panel
// the next time the order changes.
const TAB_INDEX = {
  overview: 0,
  catalog: 1,
  deployments: 2,
  intake: 3,
  distribution: 4,
};

const TAB_SX = {
  textTransform: "none",
  fontWeight: 700,
  minHeight: 56,
  color: "text.secondary",
  "&.Mui-selected": { color: BRAND.dark },
};

// ── Page shell ────────────────────────────────────────────────────

export default function SoftwareDelivery() {
  const { auth } = useAuthContext();
  const tenantId = auth?.tenantId;
  const isActive = auth?.tenantMember?.isActive === true;
  // ADR-0011 Phase 3: was a hardcoded ADMIN/OWNER role check — now
  // reads the caller's effective permission set so a custom role
  // holding software_delivery can manage too. The backend enforces
  // the same split (software-delivery.routes.ts requireCapability
  // ("software_delivery")); this only decides what to render.
  // Defaults to false while the fetch is in flight (fail-closed).
  const [myPermissions, setMyPermissions] = React.useState(null);
  React.useEffect(() => {
    if (!tenantId) return undefined;
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
  const isAdmin = isActive && Boolean(myPermissions?.has("software_delivery"));

  // Plugin catalog from the backend — needed for the required-plugin
  // semantics in getEnabledPluginSet (AMP is always enabled even if
  // missing from policy.plugins.enabled).
  const { getEnabledPluginSet } = usePluginCatalog();

  // Plugin entitlement gate. SDP is opt-in per tenant — if the
  // tenant's policy doesn't list "sdp" in `plugins.enabled[]`, we
  // render the page in read-only mode with an informational banner.
  // There's no more in-app self-service toggle for this (Plugin
  // Control was retired — turning a plugin on/off is no longer a
  // tenant-side action); Billing shows the same "included, not active"
  // status for context. This mirrors how the backend gates writes
  // (403 SOFTWARE_DELIVERY_PLUGIN_DISABLED on POST /:id/deploy).
  //
  // Tri-valued state during load:
  //   null  → still fetching the tenant policy (don't render
  //           write-enabling controls yet to avoid a flash).
  //   true  → enabled, full UI.
  //   false → disabled, banner + read-only.
  const [sdpEnabled, setSdpEnabled] = React.useState(null);
  const [policyError, setPolicyError] = React.useState(false);

  React.useEffect(() => {
    if (!tenantId) {
      setSdpEnabled(false);
      return undefined;
    }
    let cancelled = false;
    getTenantPolicy(tenantId)
      .then((res) => {
        if (cancelled) return;
        // The endpoint answers `{ ok, policy: { policy_version,
        // policy_hash, policy_json } }` — the row is WRAPPED. Reading
        // `res.policy_json` directly yields undefined, which made
        // getEnabledPluginSet see an empty policy and the gate report
        // "plugin disabled" for tenants that actually have SDP enabled.
        // Unwrap the envelope first, same as PluginControl /
        // PatchManagement / AgentSettings do. 404 → helper resolves null.
        const row = res?.policy ?? res;
        const policyJson = row?.policy_json ?? row?.policyJson ?? null;
        const enabled = getEnabledPluginSet(policyJson);
        setSdpEnabled(enabled.has("sdp"));
        setPolicyError(false);
      })
      .catch((err) => {
        if (cancelled) return;
        // Soft-fail: if we can't read the tenant policy, treat as
        // not enabled and surface a generic banner. We DON'T silently
        // assume enabled — better to block deploys than leak ones we
        // shouldn't allow.
        console.warn("[SoftwareDelivery] tenant policy fetch failed", err);
        setSdpEnabled(false);
        setPolicyError(true);
      });
    return () => {
      cancelled = true;
    };
    // getEnabledPluginSet identity changes when the plugin catalog
    // finally loads — re-run so a Required plugin like AMP that
    // wasn't yet known when the policy fetched gets resolved
    // correctly on the second pass.
  }, [tenantId, getEnabledPluginSet]);

  // Effective `canManage` is the AND of admin role + plugin enabled.
  // Reads stay open even when the plugin is disabled (so the operator
  // can browse what they had pre-disable, and so the disabled-state
  // banner shows alongside any existing rows for context).
  const canManage = isAdmin && sdpEnabled === true;

  const [activeTab, setActiveTab] = React.useState(0);
  const [snackbar, setSnackbar] = React.useState({
    open: false,
    severity: "success",
    message: "",
  });
  const [autoOpenDeploymentId, setAutoOpenDeploymentId] = React.useState(null);

  const notify = React.useCallback((severity, message) => {
    setSnackbar({ open: true, severity, message });
  }, []);

  const handleDeployFired = React.useCallback((id) => {
    setAutoOpenDeploymentId(id);
    setActiveTab(TAB_INDEX.deployments);
  }, []);

  return (
    <Box sx={{ px: { xs: 2, sm: 0.5 }, py: { xs: 2, sm: 0.5 } }}>
      <PageHeader
        title="Software Delivery"
        subtitle="Deploy third-party software to the fleet — catalog, target groups, per-device results"
        icon={<CloudDownloadOutlinedIcon />}
      />

      {/* Plugin-disabled banner. Renders only after we've resolved
          the policy state — sdpEnabled === false means a confirmed
          off, NOT loading. */}
      {sdpEnabled === false ? (
        <SectionPaper
          variant="panel"
          sx={{
            mb: 2,
            p: 2,
            borderLeft: `4px solid ${BRAND.alert?.warning || BRAND.teal}`,
          }}
        >
          <Box sx={{ minWidth: 0 }}>
            <Typography sx={{ fontWeight: 800, color: BRAND.dark, fontSize: TEXT.base }}>
              {policyError
                ? "Could not verify SDP entitlement"
                : "Software Delivery isn't active for this tenant"}
            </Typography>
            <Typography sx={{ fontSize: TEXT.md, color: BRAND.gray, mt: 0.5 }}>
              {policyError
                ? "We couldn't fetch the tenant policy. Page is read-only until the check succeeds. Refresh or reach out to support if this persists."
                : "It's included in your plan, but activation isn't a self-service toggle anymore — contact your Tracenium account team to have it turned on. Reads stay open in the meantime."}
            </Typography>
          </Box>
        </SectionPaper>
      ) : null}

      <SectionPaper variant="panel" sx={{ mb: 2, p: 0, overflow: "hidden" }}>
        <Tabs
          value={activeTab}
          onChange={(_e, v) => setActiveTab(v)}
          variant="scrollable"
          scrollButtons="auto"
          sx={{
            px: { xs: 1, sm: 2 },
            minHeight: 56,
            "& .MuiTabs-indicator": {
              height: 3,
              borderRadius: 999,
              backgroundColor: BRAND.teal,
            },
          }}
        >
          <Tab
            icon={<SpaceDashboardOutlinedIcon fontSize="small" />}
            iconPosition="start"
            label="Overview"
            sx={TAB_SX}
          />
          <Tab
            icon={<InventoryOutlinedIcon fontSize="small" />}
            iconPosition="start"
            label="Catalog"
            sx={TAB_SX}
          />
          <Tab
            icon={<LocalShippingOutlinedIcon fontSize="small" />}
            iconPosition="start"
            label="Deployments"
            sx={TAB_SX}
          />
          <Tab
            icon={<AutoAwesomeOutlinedIcon fontSize="small" />}
            iconPosition="start"
            label="AI Intake"
            sx={TAB_SX}
          />
          <Tab
            icon={<HubOutlinedIcon fontSize="small" />}
            iconPosition="start"
            label="Distribution"
            sx={TAB_SX}
          />
        </Tabs>
      </SectionPaper>

      {activeTab === 0 ? (
        <OverviewTab onNavigateTab={(key) => setActiveTab(TAB_INDEX[key] ?? 0)} />
      ) : activeTab === 1 ? (
        <CatalogTab
          canManage={canManage}
          notify={notify}
          onDeployFire={handleDeployFired}
          onNavigateTab={(key) => setActiveTab(TAB_INDEX[key] ?? 0)}
        />
      ) : activeTab === 2 ? (
        <DeploymentsTab
          canManage={canManage}
          notify={notify}
          autoOpenDeploymentId={autoOpenDeploymentId}
          onConsumedAutoOpen={() => setAutoOpenDeploymentId(null)}
        />
      ) : activeTab === 3 ? (
        <IntakeTab canManage={canManage} notify={notify} />
      ) : (
        <DistributionTab canManage={canManage} notify={notify} />
      )}

      <BrandSnackbar
        open={snackbar.open}
        severity={snackbar.severity}
        message={snackbar.message}
        onClose={() => setSnackbar((s) => ({ ...s, open: false }))}
      />
    </Box>
  );
}

