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
import CloudDownloadOutlinedIcon from "@mui/icons-material/CloudDownloadOutlined";
import HubOutlinedIcon from "@mui/icons-material/HubOutlined";
import SpaceDashboardOutlinedIcon from "@mui/icons-material/SpaceDashboardOutlined";

import { BRAND, TEXT } from "../theme/brand";
import PageHeader from "../components/common/PageHeader";
import RefreshControl, { useAutoRefresh } from "../components/common/RefreshControl";
import GoToReportButton from "../components/common/GoToReportButton";
import SectionPaper from "../components/common/SectionPaper";
import BrandSnackbar from "../components/common/BrandSnackbar";
import { useAuthContext } from "../auth/AuthContext";
import { getMyCapabilities } from "../api/roles";
import { getTenantPolicy } from "../api/policies";
import { usePluginCatalog } from "../hooks/usePluginCatalog";
import { useEffectiveTenantId } from "../hooks/useEffectiveTenantId";

import CatalogTab from "../components/software-delivery/CatalogTab";
import DeploymentsTab from "../components/software-delivery/DeploymentsTab";
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
  // ⚠️ Sin `intake`: la fase 3 retiró esa pestaña. Revisar lo que subiste es
  // un paso del flujo del catálogo y vive en un cajón colgado de él, no como
  // sección propia compitiendo en la barra.
  distribution: 3,
};

const TAB_SX = {
  textTransform: "none",
  fontWeight: 700,
  minHeight: 56,
  color: "text.secondary",
  "&.Mui-selected": { color: BRAND.dark },
};

// ── Page shell ────────────────────────────────────────────────────

// El informe que cubre lo que pasa por esta página: su sección de actividad
// lleva los despliegues de software del periodo. No hay un tipo "sdp" en el
// catálogo y no se inventa uno aquí — la clave tiene que existir en
// `REPORT_REGISTRY` o Reports avisa de que no está disponible.
const FLEET_HEALTH_KEY = "global.fleet-health";

export default function SoftwareDelivery({ onNavigate }) {
  const { auth } = useAuthContext();
  // ⚠️ NOT `auth?.tenantId`. While the operator navigates the vendor/MSP
  // portfolio the selected tenant lives in the MSP context, and `auth` does
  // not have it — which made this page report the plugin as inactive for
  // tenants that had it enabled all along. See useEffectiveTenantId.
  const tenantId = useEffectiveTenantId();
  const isActive = auth?.tenantMember?.isActive === true;
  // ADR-0011 Phase 3: was a hardcoded ADMIN/OWNER role check — now
  // reads the caller's effective permission set so a custom role
  // holding software_delivery can manage too. The backend enforces
  // the same split (software-delivery.routes.ts requireCapability
  // ("software_delivery")); this only decides what to render.
  // Defaults to false while the fetch is in flight (fail-closed).
  // Refresco de página, mismo patrón que Asset Management: subir el nonce es
  // la señal para que las pestañas vuelvan a pedir. Aquí las CUATRO lo miran
  // — un botón de refrescar que sólo refresca la pestaña que su autor tenía
  // delante es peor que no tenerlo, porque no se nota que mintió.
  const [refreshNonce, setRefreshNonce] = React.useState(0);
  const [refreshing, setRefreshing] = React.useState(false);
  const triggerRefresh = React.useCallback(() => {
    setRefreshing(true);
    setRefreshNonce((n) => n + 1);
    // Las pestañas no reportan cuándo terminan, así que el spinner es
    // orientativo y se apaga solo. Mismo apaño (y misma limitación) que
    // Asset Management.
    window.setTimeout(() => setRefreshing(false), 1200);
  }, []);
  const [refreshSeconds, setRefreshSeconds] = useAutoRefresh(triggerRefresh, "sdpAutoRefresh");

  const [myPermissions, setMyPermissions] = React.useState(null);
  // El MISMO endpoint devuelve el rol EFECTIVO que resuelve el servidor
  // (consciente de MSP). Se guarda porque el botón de informe lo necesita, y
  // preguntarlo aquí es mejor que releer `auth.role`, que en una sesión MSP
  // no es el rol sobre el cliente activo.
  const [myRole, setMyRole] = React.useState(null);
  React.useEffect(() => {
    if (!tenantId) return undefined;
    let alive = true;
    getMyCapabilities(tenantId)
      .then((resp) => {
        if (!alive) return;
        setMyPermissions(new Set(Array.isArray(resp?.permissions) ? resp.permissions : []));
        setMyRole(resp?.role ?? null);
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
  // ⚠️ No es lo mismo que `isAdmin`: aquello es la capacidad `software_delivery`
  // y esto es el ROL. El tipo de informe declara `minRole: ["ADMIN","OWNER"]`,
  // así que un rol personalizado que gestiona despliegues pero no es
  // administrador vería un botón que termina en "no disponible".
  const canReport = isActive && ["ADMIN", "OWNER"].includes(String(myRole || ""));

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
  // Intención "abre la cola de revisión" que llega desde el Overview. Mismo
  // patrón que autoOpenDeploymentId: la página la transporta y la pestaña la
  // consume.
  const [openReviewQueue, setOpenReviewQueue] = React.useState(false);

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
        actions={
          <>
            {canReport ? (
              <GoToReportButton
                onNavigate={onNavigate}
                reportKey={FLEET_HEALTH_KEY}
                tooltip="Fleet health report"
              />
            ) : null}
            <RefreshControl
              refreshSeconds={refreshSeconds}
              onRefreshSecondsChange={setRefreshSeconds}
              onRefresh={triggerRefresh}
              loading={refreshing}
            />
          </>
        }
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
              {/* ⚠️ THREE STATES, NOT TWO. "We don't know which tenant" is not
                  "this tenant isn't entitled", and reporting the first as the
                  second is what sent a whole investigation into subscriptions
                  and policy rows that were correct the entire time. */}
              {!tenantId
                ? "No tenant selected"
                : policyError
                  ? "Could not verify SDP entitlement"
                  : "Software Delivery isn't active for this tenant"}
            </Typography>
            <Typography sx={{ fontSize: TEXT.md, color: BRAND.gray, mt: 0.5 }}>
              {!tenantId
                ? "Pick a tenant from the portfolio to see its Software Delivery. Nothing here is a statement about what any tenant has enabled."
                : policyError
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
            icon={<HubOutlinedIcon fontSize="small" />}
            iconPosition="start"
            label="Distribution"
            sx={TAB_SX}
          />
        </Tabs>
      </SectionPaper>

      {activeTab === 0 ? (
        <OverviewTab
          refreshNonce={refreshNonce}
          onNavigateTab={(key, opts) => {
            setActiveTab(TAB_INDEX[key] ?? 0);
            if (opts?.reviewQueue) setOpenReviewQueue(true);
            // Una causa de fallo con UN solo despliegue detrás abre ese
            // despliegue: reutiliza la misma vía que el deploy recién lanzado,
            // y es donde viven los resultados por equipo que la causa promete.
            if (opts?.deploymentId != null) setAutoOpenDeploymentId(opts.deploymentId);
          }}
        />
      ) : activeTab === 1 ? (
        <CatalogTab
          refreshNonce={refreshNonce}
          canManage={canManage}
          notify={notify}
          onDeployFire={handleDeployFired}
          openReviewQueue={openReviewQueue}
          onConsumedReviewQueue={() => setOpenReviewQueue(false)}
        />
      ) : activeTab === 2 ? (
        <DeploymentsTab
          refreshNonce={refreshNonce}
          canManage={canManage}
          notify={notify}
          autoOpenDeploymentId={autoOpenDeploymentId}
          onConsumedAutoOpen={() => setAutoOpenDeploymentId(null)}
        />
      ) : (
        <DistributionTab canManage={canManage} notify={notify} refreshNonce={refreshNonce} />
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

