// src/pages/SecurityCompliance.jsx
//
// Real wiring of the Security Compliance module. Replaces the prior
// placeholder screen with four sections driven by the compliance API:
//
//   1. Hero — tenant-wide KPIs (compliant / non-compliant / avg score).
//   2. Framework table — per-framework aggregate (avg score + counts)
//      with a switcher that filters the device table below.
//   3. Device table — one row per device with its score against the
//      currently selected framework. Click → drill-down drawer.
//   4. Device drawer — findings grouped by category, each with the
//      frameworks it maps to (CIS 9.3.1, NIST SC-7(5), CSF PR.IR-01)
//      surfaced as chips + description + remediation.
//
// Design principles:
//   - The verdict comes from a framework, not from Tracenium. Every
//     finding chip shows the framework control ID; hover = full title.
//   - "info" severity never penalizes the score — it shows as a
//     neutral chip in the detail view.
//   - Errors + not_applicable results are surfaced explicitly so the
//     operator can tell "device didn't report" from "device is
//     non-compliant".

import * as React from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Drawer,
  Grid,
  IconButton,
  MenuItem,
  Select,
  Snackbar,
  Stack,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tabs,
  TextField,
  Tooltip,
  Typography
} from "@mui/material";
import GppGoodOutlinedIcon from "@mui/icons-material/GppGoodOutlined";
import DevicesOutlinedIcon from "@mui/icons-material/DevicesOutlined";
import ShieldOutlinedIcon from "@mui/icons-material/ShieldOutlined";
import ReportProblemOutlinedIcon from "@mui/icons-material/ReportProblemOutlined";
import VerifiedOutlinedIcon from "@mui/icons-material/VerifiedOutlined";
// Sprint 4 — diff + export
import FileDownloadOutlinedIcon from "@mui/icons-material/FileDownloadOutlined";
// Sprint 5 — settings panel trigger
import SettingsOutlinedIcon from "@mui/icons-material/SettingsOutlined";
import MenuBookOutlinedIcon from "@mui/icons-material/MenuBookOutlined";
import FilterAltOutlinedIcon from "@mui/icons-material/FilterAltOutlined";
// Sprint 6 — PDF export + bulk actions
import PictureAsPdfOutlinedIcon from "@mui/icons-material/PictureAsPdfOutlined";

import {
  getComplianceSummary,
  getFrameworks,
  getFrameworkSummary,
  getDevicePosture,
  getDeviceDetail,
  getDeviceTimeseries,
  // Sprint 4
  downloadFindingsCsv,
  // Sprint 6
  downloadFindingsPdf
} from "../api/compliance";
import { BRAND, ICON, ROLE, TEXT } from "../theme/brand";
import {
  ScoreBar,
  StatusChip,
} from "../components/Compliance/complianceChips";
import { getSearchParam, updateSearchParams } from "../utils/browserState";
import { parseUrlFilters, filterDevices } from "./complianceFilters";

import { useAuthContext } from "../auth/AuthContext";
import { useConfirm } from "../components/common/ConfirmDialog";
// Fase C — the posture side of the capability↔category bridge: mode
// chips on the category breakdown, "auto-fix available" hints on
// findings, and a set-to-auto quick action that patches the security
// policy domain without leaving the Posture tab.
import { getTenantPolicy, patchTenantPolicyDomain } from "../api/policies";
// Sprint 4 — one-click fix from the finding card (crosswalk-gated).
import { remediate as remediateFinding } from "../api/patchManagement";
import {
  readSecurityFromPolicy,
  securityFormToPolicy,
  extractPolicyEnvelope,
} from "../components/Policies/policyTransforms";
import { baselineModeForCategory } from "../components/Compliance/capabilityBridge";
import PageHeader from "../components/common/PageHeader";
import SectionPaper from "../components/common/SectionPaper";
import SharedSummaryCard from "../components/common/SummaryCard";
import RefreshControl, { useAutoRefresh } from "../components/common/RefreshControl";
import DeviceDrawerContent from "../components/Compliance/DeviceDrawerContent";
import { PatchChip, formatRelativeTime } from "../components/Compliance/PatchLevel";
import MttrCard from "../components/Compliance/MttrCard";
import ComplianceSettingsPanel from "../components/Compliance/ComplianceSettingsPanel";
import { CatalogBrowser } from "../components/Compliance/ComplianceCatalogDialog";
import ComplianceCategoryBreakdown from "../components/Compliance/ComplianceCategoryBreakdown";
import ComplianceTrendChart from "../components/Compliance/ComplianceTrendChart";
import { useCachedFetch } from "../hooks/useCachedFetch";
import { useComplianceBands } from "../hooks/useComplianceBands";
import { scoreBandRole, scoreBandSoftRole } from "../theme/scoreBands";

// ---------- constants --------------------------------------------------------

// ── Sprint 3 — remediation lifecycle ────────────────────────────────

// Client-side mirror of the backend's transition matrix
// (modules/compliance/finding-lifecycle.service.ts:ALLOWED_TRANSITIONS).
// Used to drive the action menu so the operator only sees valid next
// states. The backend re-validates and returns the canonical
// `allowedTransitions` set on 409, so this is purely for UX
// responsiveness — drift between front and back doesn't break
// anything, it just shows one more option that gets rejected.
// Remediation-lifecycle constants + date/ack helpers moved to
// components/Compliance/complianceHelpers.js (imported at the top).

// Sprint 7 item 3.1 — true if the device was enrolled in the last
// 24h. Used to render the "Recently enrolled" chip; the threshold
// matches the typical "give it one scan cycle" window. The data
// itself comes from `agent.created_at` (exposed via fetchTenantDevicePosture).
const RECENTLY_ENROLLED_THRESHOLD_MS = 24 * 60 * 60 * 1000;
function isRecentlyEnrolled(isoString) {
  if (!isoString) return false;
  const then = Date.parse(isoString);
  if (!Number.isFinite(then)) return false;
  return Date.now() - then < RECENTLY_ENROLLED_THRESHOLD_MS;
}

// Patch-recency cluster (helpers + PatchChip/PatchRow/PatchLevelSection)
// moved to components/Compliance/PatchLevel.jsx (imported at top).


function navigateTo(page, extraQuery = {}) {
  const params = new URLSearchParams(window.location.search);
  params.set("page", page);
  Object.entries(extraQuery).forEach(([k, v]) => {
    if (v == null) params.delete(k);
    else params.set(k, String(v));
  });
  // Collapse accidental `//` in the pathname so pushState doesn't
  // silently reject the URL as cross-origin (see navigateWithQuery
  // comment in Overview.jsx for the full story).
  const pathname = window.location.pathname.replace(/^\/+/, "/") || "/";
  window.history.pushState({}, "", `${pathname}?${params.toString()}`);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

// Sprint 2 item 2 — clickable table rows must be keyboard-reachable.
// Enter and Space both activate (Space is what native buttons do);
// preventDefault stops Space from scrolling the page.
function rowKeyHandler(activate) {
  return (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      activate();
    }
  };
}

function readUrlFilters() {
  if (typeof window === "undefined") return {};
  return parseUrlFilters(window.location.search);
}

// Fase B — Baselines lives as a tab of this page. Lazy so Posture (the
// default and most-visited tab) doesn't pay for the policy editor until
// the operator actually switches.
const SecurityBaselines = React.lazy(() => import("./SecurityBaselines"));

// Deep-linkable via ?scpTab=. Same pattern Configurations uses for
// ?settingsTab=. "baselines" is privileged-only — resolveTab() downgrades
// it to "posture" for USER-role members.
const SCP_TABS = ["posture", "baselines", "catalog"];

export default function SecurityCompliance({ initialTab }) {
  // RBAC — same convention as SecurityBaselines.jsx: ADMIN/OWNER may
  // mutate (finding lifecycle, bulk ops, settings) and pull evidence
  // exports; USER is read-only. The backend enforces the same split
  // (compliance.routes.ts requireTenantAdmin), so this only decides
  // what to render — never rely on it as the security boundary.
  const { auth } = useAuthContext();
  const tenantRole = String(auth?.tenantMember?.role || "");
  const isActiveMember = auth?.tenantMember?.isActive === true;
  const canManage = isActiveMember && (tenantRole === "ADMIN" || tenantRole === "OWNER");

  // Sprint 2 item 1 — tenant-configured score bands (85/60 defaults).
  // Single cached fetch shared by every band-colored surface below.
  const bands = useComplianceBands();

  // Fase B — tab state. URL param wins over the prop so a reload after
  // switching tabs stays where the operator left it (the prop is only
  // the seed the `security-baselines` registry alias plants); then the
  // effect mirrors every change back to ?scpTab=.
  const [tab, setTab] = React.useState(() => {
    const fromUrl = getSearchParam("scpTab", "");
    if (SCP_TABS.includes(fromUrl)) return fromUrl;
    if (SCP_TABS.includes(initialTab)) return initialTab;
    return "posture";
  });
  React.useEffect(() => {
    updateSearchParams({ scpTab: tab === "posture" ? "" : tab });
  }, [tab]);
  // Baselines is privileged-only (the page itself hard-blocks USER, but
  // the tab shouldn't even render). Deep links degrade to Posture.
  const effectiveTab = tab === "baselines" && !canManage ? "posture" : tab;

  // ── Fase C — baseline modes on the Posture tab ─────────────────────
  //
  // Fail-soft policy read: when it errors (or the viewer is USER) the
  // Posture tab renders exactly as before the bridge existed — no
  // chips, no hints. `policyRefresh` bumps after a set-to-auto patch.
  const confirmDialog = useConfirm();
  const tenantId = auth?.tenantId;
  const [securityForm, setSecurityForm] = React.useState(null);
  const [policyRefresh, setPolicyRefresh] = React.useState(0);
  React.useEffect(() => {
    if (!canManage || !tenantId) return undefined;
    let cancelled = false;
    getTenantPolicy(tenantId)
      .then((res) => {
        if (cancelled) return;
        const env = extractPolicyEnvelope(res);
        setSecurityForm(readSecurityFromPolicy(env.raw ?? {}));
      })
      .catch(() => {
        if (!cancelled) setSecurityForm(null);
      });
    return () => {
      cancelled = true;
    };
  }, [canManage, tenantId, policyRefresh, tab]);

  const modeForCategory = React.useCallback(
    (category) => (securityForm ? baselineModeForCategory(securityForm, category) : null),
    [securityForm]
  );

  const [selectedFramework, setSelectedFramework] = React.useState(""); // "" = overall

  // Deep-link filters (pre-populated from URL, user can clear via
  // chips). Client-side only — we already have the full device list
  // from the backend, so filtering in-memory is cheap and avoids
  // round-tripping for every chip click.
  const initialFilters = React.useMemo(() => readUrlFilters(), []);
  const [statusFilter, setStatusFilter] = React.useState(initialFilters.status || "");
  const [platformFilter, setPlatformFilter] = React.useState(initialFilters.platform || "");
  const [versionBucketFilter, setVersionBucketFilter] = React.useState(
    initialFilters.versionBucket || ""
  );
  // Sprint 2 item 8 — ?score-band= from the Overview health card,
  // parsed at last (the card promised it since it shipped).
  const [scoreBandFilter, setScoreBandFilter] = React.useState(
    initialFilters.scoreBand || ""
  );

  // Keep the URL in sync with the on-page filters so they persist across
  // refresh and are shareable (replaceState — no navigation). Empty values are
  // removed by updateSearchParams; the legacy `severity` param is cleared once
  // the honest `status` filter takes over.
  React.useEffect(() => {
    updateSearchParams({
      status: statusFilter,
      platform: platformFilter,
      versionBucket: versionBucketFilter,
      "score-band": scoreBandFilter,
      severity: "",
    });
  }, [statusFilter, platformFilter, versionBucketFilter, scoreBandFilter]);

  const [drawerAgentId, setDrawerAgentId] = React.useState(null);
  const [drawerData, setDrawerData] = React.useState(null);
  const [drawerTimeseries, setDrawerTimeseries] = React.useState(null);
  const [drawerLoading, setDrawerLoading] = React.useState(false);
  // Distinct from `drawerData === null`. A failed request and a device
  // with genuinely no compliance data used to be the same state, and the
  // drawer reported both as "no compliance data for this device yet" —
  // telling the operator something false ABOUT THE DEVICE when the real
  // problem was a 403 or a 500 on our side.
  const [drawerError, setDrawerError] = React.useState(null);

  // Cache key includes the selected framework so flipping the picker
  // gets its own snapshot — coming back to a previously-loaded
  // framework rehydrates instantly. Empty framework = "All frameworks
  // (weighted)".
  const loader = React.useCallback(async () => {
    // Sprint 2 item 3 — partial failures used to vanish: four blanket
    // `.catch(() => null)` meant a dead framework-summary endpoint
    // rendered as an innocently empty section. allSettled keeps the
    // page resilient (one failure never blanks the others) but the
    // failed section NAMES now travel with the data so the page can
    // say "hero KPIs failed to load" instead of lying with zeros.
    const requests = [
      { key: "summary", label: "hero KPIs", run: () => getComplianceSummary() },
      { key: "frameworks", label: "framework list", run: () => getFrameworks() },
      { key: "frameworkSummary", label: "framework summary", run: () => getFrameworkSummary() },
      {
        key: "devices",
        label: "device posture",
        run: () => getDevicePosture(selectedFramework ? { framework: selectedFramework } : {}),
      },
    ];
    const settled = await Promise.allSettled(requests.map((r) => r.run()));
    const byKey = {};
    const failedSections = [];
    settled.forEach((res, i) => {
      if (res.status === "fulfilled") {
        byKey[requests[i].key] = res.value;
      } else {
        byKey[requests[i].key] = null;
        failedSections.push(requests[i].label);
      }
    });
    return {
      summary: byKey.summary?.summary ?? null,
      frameworks: Array.isArray(byKey.frameworks?.frameworks) ? byKey.frameworks.frameworks : [],
      // Sprint 4 — compliance pack telemetry from /frameworks.
      packActive: Boolean(byKey.frameworks?.packActive),
      totalFrameworks: Number(byKey.frameworks?.totalFrameworks) || 0,
      frameworkSummary: Array.isArray(byKey.frameworkSummary?.items) ? byKey.frameworkSummary.items : [],
      devices: Array.isArray(byKey.devices?.items) ? byKey.devices.items : [],
      failedSections,
    };
  }, [selectedFramework]);

  const cacheKey = `securityCompliance:${selectedFramework || "all"}`;
  const { data, loading, refreshing, error, refetch } = useCachedFetch(cacheKey, loader);

  // Sprint 2 item 4 — one refresh to rule them all. The header's
  // RefreshControl used to refetch only the four page-level calls; the
  // trend chart, MTTR card and category breakdown each own independent
  // fetch lifecycles it never reached. Bumping this token (threaded as
  // their reloadKey) makes a single click actually refresh the page.
  const [refreshToken, setRefreshToken] = React.useState(0);
  const refreshAll = React.useCallback(() => {
    setRefreshToken((n) => n + 1);
    return refetch();
  }, [refetch]);
  const summary = data?.summary ?? null;
  // Stable fallback identities — see AssetsDashboard for the same
  // pattern. Without these, downstream useMemo deps see a fresh `[]`
  // on every render and re-run.
  const frameworks = React.useMemo(() => data?.frameworks ?? [], [data]);
  const frameworkSummary = React.useMemo(() => data?.frameworkSummary ?? [], [data]);
  const devices = React.useMemo(() => data?.devices ?? [], [data]);
  const errorMsg = error ? error?.message || "Failed to load compliance data" : null;

  const [refreshSeconds, setRefreshSeconds] = useAutoRefresh(refreshAll, "scAutoRefresh");

  const openDrawer = React.useCallback(async (agentId) => {
    setDrawerAgentId(agentId);
    setDrawerLoading(true);
    setDrawerData(null);
    setDrawerTimeseries(null);
    setDrawerError(null);
    try {
      // The detail is the drawer. Its failure has to reach the operator —
      // swallowing it left them reading "no compliance data yet", which
      // is a claim about the device rather than about the request.
      const detail = await getDeviceDetail(agentId);
      setDrawerData(detail ?? null);
    } catch (err) {
      setDrawerError(err?.message || "Could not load this device's compliance detail.");
      setDrawerData(null);
    }

    // The 30-day trend is secondary decoration: it gets its own request
    // and its own failure, and losing the chart must not cost the
    // findings list the operator actually came for.
    try {
      setDrawerTimeseries((await getDeviceTimeseries(agentId, 30)) ?? null);
    } catch {
      setDrawerTimeseries(null);
    }

    setDrawerLoading(false);
  }, []);

  // Sprint 3 — refetch just the drawer (NOT the device table) after a
  // lifecycle mutation. The device table's overall score is unaffected
  // by ack / remediation-status changes (those don't touch the score),
  // so a full page refetch is wasteful. We only re-hit getDeviceDetail
  // to refresh the findings list + their ack/status fields.
  const refetchDrawer = React.useCallback(async () => {
    if (!drawerAgentId) return;
    try {
      const detail = await getDeviceDetail(drawerAgentId).catch(() => null);
      setDrawerData(detail ?? null);
    } catch {
      // Silent — the next user action will retry. We don't want to
      // surface a refetch failure as an error because the underlying
      // mutation already succeeded; the dashboard is just stale.
    }
  }, [drawerAgentId]);

  const closeDrawer = () => {
    setDrawerAgentId(null);
    setDrawerData(null);
    setDrawerTimeseries(null);
    setDrawerError(null);
  };

  // Sprint 3 — page-level Snackbar surface for lifecycle mutations.
  // Single state object instead of separate severity/message states so
  // an open-then-open in quick succession atomically replaces both.
  const [toast, setToast] = React.useState(null);
  const showToast = React.useCallback((t) => setToast(t), []);
  const hideToast = React.useCallback(() => setToast(null), []);

  // Fase C — "Set to auto-remediate" from a category row. Re-reads the
  // policy immediately before patching (not the cached securityForm) so
  // the optimistic-lock version is fresh, flips ONLY the enforceable
  // capabilities mapped to this category, and writes through the same
  // domain-scoped PATCH the Baselines editor uses — a save here can't
  // touch anything outside the security block.
  const handleSetCategoryAuto = React.useCallback(
    async (category) => {
      if (!canManage || !tenantId) return;
      const info = securityForm ? baselineModeForCategory(securityForm, category) : null;
      const targets = info?.autoUpgradable ?? [];
      if (!targets.length) return;
      const labels = targets.map((c) => c.label).join(", ");
      const ok = await confirmDialog({
        title: "Enable auto-remediation?",
        body:
          `This sets ${labels} to auto — the agent will FIX drift on the ` +
          "device, not just report it, starting with the next compliance " +
          "pass after the policy reaches the fleet.\n\nVet in report-only " +
          "first if you haven't.",
        confirmText: "Set to auto",
        danger: true,
      });
      if (!ok) return;
      try {
        const res = await getTenantPolicy(tenantId);
        const env = extractPolicyEnvelope(res);
        const fresh = readSecurityFromPolicy(env.raw ?? {});
        const capabilities = { ...fresh.capabilities };
        for (const cap of targets) {
          capabilities[cap.key] = {
            ...(capabilities[cap.key] || { mode: null, values: {} }),
            mode: "auto",
          };
        }
        const security = securityFormToPolicy({ ...fresh, capabilities });
        await patchTenantPolicyDomain(tenantId, "security", security ? { security } : {}, {
          expectedVersion: env.version,
        });
        setPolicyRefresh((n) => n + 1);
        showToast({
          severity: "success",
          message: `${labels} set to auto-remediate. Push or wait for the next policy sync to reach devices.`,
        });
      } catch (e) {
        showToast({
          severity: "error",
          message:
            e?.status === 409
              ? "Policy was modified by someone else — try again."
              : e?.body?.message || "Failed to update the baseline.",
        });
      }
    },
    [canManage, tenantId, securityForm, confirmDialog, showToast]
  );

  // Sprint 4 — one-click remediation on the open device. Delegates to
  // the same POST /patch-management/remediate the PM grid uses (mode
  // apply, single device); the backend translates the catalog id to the
  // agent's handler id and, on a successful ACK, writes the outcome
  // back onto this very finding (remediation_status → remediated). The
  // drawer refetch shows that transition without a page reload.
  const handleRemediateFinding = React.useCallback(
    async (finding) => {
      if (!canManage || !drawerAgentId || !finding?.checkId) return;
      const ok = await confirmDialog({
        title: "Remediate on this device?",
        body:
          `The agent will run its fix for "${finding.title || finding.checkId}" on this ` +
          "device now (apply mode). Some fixes need a reboot to fully take effect; the " +
          "finding is marked remediated once the agent confirms, and the next scan " +
          "verifies it.",
        confirmText: "Fix now",
        danger: true,
      });
      if (!ok) return;
      try {
        const res = await remediateFinding({
          checkId: finding.checkId,
          mode: "apply",
          deviceIds: [drawerAgentId],
        });
        const id = res?.remediation?.id;
        showToast({
          severity: "success",
          message: id
            ? `Remediation #${id} queued for this device. The finding updates when the agent reports back.`
            : "Remediation queued for this device.",
        });
        // The remediation row exists now; the finding flips when the ACK
        // lands. Refetch once so a fast agent is reflected immediately.
        setTimeout(() => { refetchDrawer(); }, 4000);
      } catch (e) {
        showToast({
          severity: "error",
          message:
            e?.status === 403
              ? "Patch Management plugin is not enabled for this tenant."
              : e?.body?.message || e?.message || "Failed to queue the remediation.",
        });
      }
    },
    [canManage, drawerAgentId, confirmDialog, showToast, refetchDrawer]
  );

  // Fase C — bundle handed to the category breakdown (chips + actions).
  const baselineBridge = React.useMemo(() => {
    if (!canManage || !securityForm) return null;
    return {
      modeForCategory,
      onSetAuto: handleSetCategoryAuto,
      onConfigure: () => setTab("baselines"),
    };
  }, [canManage, securityForm, modeForCategory, handleSetCategoryAuto]);

  // Sprint 4/6 — CSV/PDF export. Downloads go through httpGetBlob (see
  // api/compliance.js) rather than a plain `<a href>` so an MSP operator's
  // X-Tenant-Id override actually reaches the backend; failures surface
  // through the same toast as the rest of the page instead of navigating
  // the tab to a raw error response.
  const [exportingCsv, setExportingCsv] = React.useState(false);
  const [exportingPdf, setExportingPdf] = React.useState(false);

  const handleExportCsv = React.useCallback(async () => {
    setExportingCsv(true);
    try {
      await downloadFindingsCsv({ framework: selectedFramework || undefined });
    } catch (err) {
      showToast({ severity: "error", message: err?.message || "Could not export CSV." });
    } finally {
      setExportingCsv(false);
    }
  }, [selectedFramework, showToast]);

  const handleExportPdf = React.useCallback(async () => {
    setExportingPdf(true);
    try {
      await downloadFindingsPdf({ framework: selectedFramework || undefined });
    } catch (err) {
      showToast({ severity: "error", message: err?.message || "Could not export PDF." });
    } finally {
      setExportingPdf(false);
    }
  }, [selectedFramework, showToast]);

  // Sprint 5 — settings panel open/close. Boolean state; the panel
  // component owns the form state internally. (The catalog dialog's
  // sibling state left in Fase B — the catalog is a tab now.)
  const [settingsOpen, setSettingsOpen] = React.useState(false);

  // Framework picker label lookup.
  const frameworkLabels = React.useMemo(() => {
    const map = new Map();
    for (const f of frameworks) map.set(f.framework, f.shortName || f.framework);
    return map;
  }, [frameworks]);

  const selectedFrameworkLabel = selectedFramework
    ? frameworkLabels.get(selectedFramework) || selectedFramework
    : "All frameworks (weighted)";

  // Client-side filtering of the device table. We already have the full device
  // list from the backend, so filtering in-memory is cheap. Logic lives in the
  // pure, unit-tested filterDevices helper (complianceFilters.js).
  const filteredDevices = React.useMemo(
    () =>
      filterDevices(devices, {
        scoreBand: scoreBandFilter,
        status: statusFilter,
        platform: platformFilter,
        versionBucket: versionBucketFilter,
      }, bands),
    [devices, platformFilter, statusFilter, versionBucketFilter, scoreBandFilter, bands]
  );

  return (
    <Box sx={{ pb: 6 }}>
      {/* Page header ------------------------------------------------------- */}
      <PageHeader
        title="Security Compliance"
        subtitle={
          effectiveTab === "baselines" ? (
            "The endpoint state you require — and whether the agent may correct drift automatically. Posture shows the evidence of that state."
          ) : effectiveTab === "catalog" ? (
            "Every control Tracenium evaluates, across platforms and frameworks. Read-only — the catalog is global."
          ) : (
            <>
              Verdict is derived from published benchmarks (CIS) and standards (NIST SP 800-53, NIST CSF).
              <br />
              Tracenium maps the agent&apos;s evidence to the control IDs on each finding.
            </>
          )
        }
        icon={<GppGoodOutlinedIcon />}
        actions={
          effectiveTab !== "posture" ? undefined : (
          <Stack direction="row" spacing={1} alignItems="center">
            {/* Fase B: the "Baselines" button (Fase A) and the catalog
                icon-button both became tabs — the header now only hosts
                posture-scoped actions (settings, exports, refresh). */}
            {/* Sprint 5 — tenant compliance settings dialog opener.
                Compact icon button rather than a full "Settings"
                label because the header is already crowded with
                framework picker + export + refresh. */}
            {canManage ? (
              <Tooltip title="Compliance settings" arrow placement="bottom">
                <IconButton
                  aria-label="Compliance settings"
                  size="small"
                  onClick={() => setSettingsOpen(true)}
                  sx={{
                    border: `1px solid ${BRAND.border}`,
                    borderRadius: 1
                  }}
                >
                  <SettingsOutlinedIcon sx={{ fontSize: ICON.lg }} />
                </IconButton>
              </Tooltip>
            ) : null}
            {/* Sprint 4 — CSV export. Fetched as an authenticated blob
                (see handleExportCsv) rather than a plain anchor href, so
                the X-Tenant-Id header for MSP-drilled sessions actually
                reaches the backend. Filter is the currently selected
                framework so the operator can "save what they're looking
                at" without a separate export dialog. */}
            {/* Exports are admin-gated (requireTenantAdmin on the
                backend) — they hand the full evidence set to whoever
                clicks, so USER-role members don't get the buttons. */}
            {canManage ? (
            <Tooltip
              title={
                selectedFramework
                  ? `Export findings for ${selectedFrameworkLabel} as CSV`
                  : "Export all findings as CSV (every mapped framework)"
              }
              arrow
              placement="bottom"
            >
              <span>
                <Button
                  onClick={handleExportCsv}
                  disabled={exportingCsv}
                  size="small"
                  variant="outlined"
                  startIcon={<FileDownloadOutlinedIcon sx={{ fontSize: ICON.md }} />}
                  sx={{ textTransform: "none" }}
                >
                  {exportingCsv ? "Exporting…" : "Export CSV"}
                </Button>
              </span>
            </Tooltip>
            ) : null}
            {/* Sprint 6 — PDF export. Same authenticated-blob pattern as
                CSV; pdfkit emits Content-Disposition so the filename
                still comes from the backend. */}
            {canManage ? (
            <Tooltip
              title={
                selectedFramework
                  ? `Export findings for ${selectedFrameworkLabel} as PDF`
                  : "Export all findings as PDF"
              }
              arrow
              placement="bottom"
            >
              <span>
                <Button
                  onClick={handleExportPdf}
                  disabled={exportingPdf}
                  size="small"
                  variant="outlined"
                  startIcon={<PictureAsPdfOutlinedIcon sx={{ fontSize: ICON.md }} />}
                  sx={{ textTransform: "none" }}
                >
                  {exportingPdf ? "Exporting…" : "Export PDF"}
                </Button>
              </span>
            </Tooltip>
            ) : null}
            <RefreshControl
              refreshSeconds={refreshSeconds}
              onRefreshSecondsChange={setRefreshSeconds}
              onRefresh={refreshAll}
              loading={loading || refreshing}
            />
          </Stack>
          )
        }
      />

      {/* Fase B — the module's three faces: what we observe (Posture),
          what we require (Baselines, privileged), what we evaluate
          (Catalog). Same Tabs styling as Configurations. */}
      <Tabs
        value={effectiveTab}
        onChange={(_e, next) => setTab(next)}
        sx={{
          mb: 2,
          borderBottom: `1px solid ${BRAND.border}`,
          "& .MuiTab-root": {
            textTransform: "none",
            fontWeight: 700,
            color: BRAND.dark,
            minHeight: 48,
            outline: "none",
            "&:focus": { outline: "none" },
          },
          "& .Mui-selected": { color: `${BRAND.teal} !important` },
          "& .MuiTabs-indicator": { backgroundColor: BRAND.teal, height: 3 },
        }}
      >
        <Tab
          value="posture"
          label="Posture"
          icon={<GppGoodOutlinedIcon fontSize="small" />}
          iconPosition="start"
          sx={{ gap: 0.75 }}
        />
        {canManage ? (
          <Tab
            value="baselines"
            label="Baselines"
            icon={<ShieldOutlinedIcon fontSize="small" />}
            iconPosition="start"
            sx={{ gap: 0.75 }}
          />
        ) : null}
        <Tab
          value="catalog"
          label="Catalog"
          icon={<MenuBookOutlinedIcon fontSize="small" />}
          iconPosition="start"
          sx={{ gap: 0.75 }}
        />
      </Tabs>

      {effectiveTab === "baselines" ? (
        <React.Suspense
          fallback={
            <Box sx={{ display: "grid", placeItems: "center", minHeight: 240 }}>
              <CircularProgress size={26} sx={{ color: BRAND.teal }} />
            </Box>
          }
        >
          {/* onNavigate: inside the tab, "go see the evidence" means
              switching to Posture, not a page navigation. */}
          <SecurityBaselines embedded onNavigate={() => setTab("posture")} />
        </React.Suspense>
      ) : null}

      {effectiveTab === "catalog" ? (
        <SectionPaper variant="panel" sx={{ p: { xs: 1.5, sm: 2 } }}>
          <CatalogBrowser active sx={{ height: "72vh" }} />
        </SectionPaper>
      ) : null}

      {effectiveTab !== "posture" ? null : (
      <>
      {errorMsg ? (
        <Alert severity="error" sx={{ mb: 2 }}>
          {errorMsg}
        </Alert>
      ) : null}

      {/* Sprint 2 item 3 — partial-failure banner. The sections below
          still render (empty) so the page stays navigable; this stops
          the emptiness from masquerading as "all clear". */}
      {Array.isArray(data?.failedSections) && data.failedSections.length > 0 ? (
        <Alert severity="warning" sx={{ mb: 2 }}>
          Some sections failed to load: {data.failedSections.join(", ")}. Showing
          the rest — retry with the refresh control above.
        </Alert>
      ) : null}

      {/* Hero KPIs — homologated with Overview's Hero. The "Compliance"
          and "Critical findings" cards mirror Overview/HeroKpis exactly
          (same labels, icons, score/severity color buckets) so a user
          jumping between the two surfaces reads them as one signal.
          "Devices reporting" + "Compliant" stay because they're
          framework-specific — they don't appear on Overview but make
          sense as drill-down context here. */}
      {(() => {
        const avgScore = summary?.avgScore;
        // Sprint 1/2 — the exception-adjusted fleet average. Shown as a
        // tooltip on the Compliance card whenever it diverges from the
        // raw score: the delta IS the weight of the vetted exceptions.
        const avgAdjusted = summary?.avgScoreAdjusted;
        const complianceAccent = scoreBandRole(avgScore, bands) ?? BRAND.teal;
        const complianceTint = scoreBandSoftRole(avgScore, bands) ?? BRAND.tealSoft;
        const criticalHigh =
          (summary?.openFindings?.critical ?? 0) +
          (summary?.openFindings?.high ?? 0);
        const findingsAccent = criticalHigh > 0 ? ROLE.critical : ROLE.positive;
        const findingsTint = criticalHigh > 0 ? ROLE.criticalSoft : ROLE.positiveSoft;
        return (
          <Grid container spacing={2} sx={{ mb: 2 }}>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <SharedSummaryCard
                title="Devices reporting"
                value={summary?.devicesReporting ?? "—"}
                icon={<DevicesOutlinedIcon fontSize="small" />}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <SharedSummaryCard
                title="Compliance"
                value={avgScore != null ? `${Math.round(avgScore)}%` : "—"}
                icon={<ShieldOutlinedIcon fontSize="small" />}
                accent={complianceAccent}
                tint={complianceTint}
                titleHint={
                  avgAdjusted != null && avgScore != null && Math.round(avgAdjusted) !== Math.round(avgScore)
                    ? `Adjusted for accepted exceptions: ${Math.round(avgAdjusted)}%. The gap vs the raw score is the weight of acknowledged / risk-accepted findings.`
                    : "Raw evaluator score. When exceptions (acks, risk-accepted) exist, the adjusted average appears here."
                }
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <SharedSummaryCard
                title="Compliant"
                value={summary?.statusBreakdown?.compliant ?? 0}
                icon={<VerifiedOutlinedIcon fontSize="small" />}
                accent={ROLE.positive}
                tint={ROLE.positiveSoft}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <SharedSummaryCard
                title="Critical findings"
                value={criticalHigh}
                icon={<ReportProblemOutlinedIcon fontSize="small" />}
                accent={findingsAccent}
                tint={findingsTint}
              />
            </Grid>
          </Grid>
        );
      })()}

      {/* Fleet compliance trend over time — the audit / CIO "are we improving?"
          view. Backed by the fleet-timeseries endpoint. */}
      <ComplianceTrendChart notify={(severity, message) => showToast({ severity, message })} reloadKey={refreshToken} />

      {/* Framework switcher + per-framework summary ------------------------ */}
      <SectionPaper variant="panel" sx={{ p: 2, mb: 2 }}>
        <Stack
          direction={{ xs: "column", sm: "row" }}
          justifyContent="space-between"
          alignItems={{ xs: "flex-start", sm: "center" }}
          gap={1.5}
          sx={{ mb: 1.5 }}
        >
          <Box>
            <Typography variant="subtitle2" sx={{ color: BRAND.dark, fontWeight: 700 }}>
              Posture by framework
            </Typography>
            <Typography variant="caption" sx={{ color: BRAND.gray }}>
              Scoring uses the severity weights defined by each framework. Switch to filter the device table below.
              {/* Sprint 4 — say so when a compliance pack is trimming the
                  list, so nobody wonders where the other frameworks went. */}
              {data?.packActive ? (
                <Tooltip
                  title={`This tenant's compliance pack shows ${frameworks.length} of ${data.totalFrameworks} catalog frameworks. Change it in Compliance settings.`}
                  arrow
                >
                  <Chip
                    size="small"
                    label={`Pack: ${frameworks.length} of ${data.totalFrameworks}`}
                    onClick={canManage ? () => setSettingsOpen(true) : undefined}
                    clickable={canManage}
                    sx={{ ml: 1, height: 18, fontSize: TEXT.xs, fontWeight: 700, bgcolor: BRAND.tealSoft, color: BRAND.tealText }}
                  />
                </Tooltip>
              ) : null}
            </Typography>
          </Box>
          <Select
            value={selectedFramework}
            onChange={(e) => setSelectedFramework(e.target.value)}
            size="small"
            displayEmpty
            sx={{ minWidth: 260 }}
          >
            <MenuItem value="">All frameworks (weighted)</MenuItem>
            {frameworks.map((f) => (
              <MenuItem key={f.framework} value={f.framework}>
                {f.shortName || f.framework}
              </MenuItem>
            ))}
          </Select>
        </Stack>

        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 700 }}>Framework</TableCell>
                <TableCell align="right" sx={{ fontWeight: 700 }}>Devices reporting</TableCell>
                <TableCell align="right" sx={{ fontWeight: 700 }}>Compliant</TableCell>
                <TableCell align="right" sx={{ fontWeight: 700 }}>Non-compliant</TableCell>
                <TableCell align="right" sx={{ fontWeight: 700 }}>Avg score</TableCell>
                <TableCell align="right" sx={{ fontWeight: 700 }}>Pass / Applicable</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {frameworkSummary.length === 0 && !loading ? (
                <TableRow>
                  <TableCell colSpan={6} align="center" sx={{ color: BRAND.gray, py: 3 }}>
                    No devices have reported compliance yet.
                  </TableCell>
                </TableRow>
              ) : (
                frameworkSummary.map((f) => (
                  <TableRow
                    key={f.framework}
                    hover
                    sx={{ cursor: "pointer" }}
                    onClick={() => setSelectedFramework(f.framework)}
                    selected={f.framework === selectedFramework}
                    tabIndex={0}
                    role="button"
                    aria-label={`Filter by ${frameworkLabels.get(f.framework) || f.framework}`}
                    onKeyDown={rowKeyHandler(() => setSelectedFramework(f.framework))}
                  >
                    <TableCell>
                      <Stack>
                        <Typography variant="body2" sx={{ fontWeight: 600, color: BRAND.dark }}>
                          {frameworkLabels.get(f.framework) || f.framework}
                        </Typography>
                        <Typography variant="caption" sx={{ color: BRAND.gray }}>
                          {f.framework}
                        </Typography>
                      </Stack>
                    </TableCell>
                    <TableCell align="right">{f.devicesReporting}</TableCell>
                    <TableCell align="right" sx={{ color: ROLE.positive, fontWeight: 600 }}>
                      {f.devicesCompliant}
                    </TableCell>
                    <TableCell align="right" sx={{ color: ROLE.critical, fontWeight: 600 }}>
                      {f.devicesNonCompliant}
                    </TableCell>
                    <TableCell align="right">
                      <Box sx={{ display: "inline-block" }}>
                        <ScoreBar value={f.avgScore} bands={bands} />
                      </Box>
                    </TableCell>
                    <TableCell align="right" sx={{ color: BRAND.dark }}>
                      {f.totalPassed} / {f.totalApplicable}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </SectionPaper>

      {/* Fleet posture by control category (firewall, crypto, patching, …) —
          the fleet analogue of the drawer's per-device category grouping.
          Sits below the framework table (compliance vs benchmarks) and above
          the MTTR/device views (triage). */}
      <ComplianceCategoryBreakdown baselineBridge={baselineBridge} reloadKey={refreshToken} />

      {/* Sprint 5 — fleet time-to-close by severity. Mounted between
          the framework table (top-down "how does the fleet compare to
          benchmarks") and the device table (drill-down) so an
          operator's eye lands on it BEFORE they scroll into per-
          device triage. */}
      <MttrCard reloadKey={refreshToken} />

      {/* Device table ------------------------------------------------------ */}
      <SectionPaper variant="panel" sx={{ p: 2 }}>
        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
          <Box>
            <Typography variant="subtitle2" sx={{ color: BRAND.dark, fontWeight: 700 }}>
              Devices
            </Typography>
            <Typography variant="caption" sx={{ color: BRAND.gray }}>
              Filtered by <strong>{selectedFrameworkLabel}</strong>. Click a row for findings.
            </Typography>
          </Box>
          {loading ? <CircularProgress size={18} sx={{ color: BRAND.teal }} /> : null}
        </Stack>

        {/* On-page filter toolbar. Sets the same client-side filters that used
            to be deep-link-only; changes sync back to the URL so they persist
            on refresh + are shareable. "All" clears a filter. */}
        <Stack
          direction="row"
          spacing={1}
          sx={{ mb: 1.5, flexWrap: "wrap", gap: 1, alignItems: "center" }}
        >
          <FilterAltOutlinedIcon sx={{ fontSize: ICON.lg, color: BRAND.gray }} />
          <TextField
            select size="small" label="Status" value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            sx={{ minWidth: 150 }}
          >
            <MenuItem value="">All statuses</MenuItem>
            <MenuItem value="fail">Failing</MenuItem>
            <MenuItem value="pass">Compliant</MenuItem>
          </TextField>
          <TextField
            select size="small" label="Platform" value={platformFilter}
            onChange={(e) => setPlatformFilter(e.target.value)}
            sx={{ minWidth: 150 }}
          >
            <MenuItem value="">All platforms</MenuItem>
            <MenuItem value="windows">Windows</MenuItem>
            <MenuItem value="macos">macOS</MenuItem>
            <MenuItem value="linux">Linux</MenuItem>
          </TextField>
          <TextField
            select size="small" label="Agent version" value={versionBucketFilter}
            onChange={(e) => setVersionBucketFilter(e.target.value)}
            sx={{ minWidth: 160 }}
          >
            <MenuItem value="">All versions</MenuItem>
            <MenuItem value="current">Current</MenuItem>
            <MenuItem value="one_behind">One behind</MenuItem>
            <MenuItem value="older">Older</MenuItem>
            <MenuItem value="unknown">Unknown</MenuItem>
          </TextField>
          <TextField
            select size="small" label="Score band" value={scoreBandFilter}
            onChange={(e) => setScoreBandFilter(e.target.value)}
            sx={{ minWidth: 140 }}
          >
            <MenuItem value="">All bands</MenuItem>
            <MenuItem value="good">Good (&ge;{bands.goodMin})</MenuItem>
            <MenuItem value="warning">Warning ({bands.warningMin}&ndash;{bands.goodMin - 1})</MenuItem>
            <MenuItem value="critical">Critical (&lt;{bands.warningMin})</MenuItem>
            <MenuItem value="unscored">Unscored</MenuItem>
          </TextField>
          <Box sx={{ flex: 1 }} />
          <Typography variant="caption" sx={{ color: BRAND.gray, fontWeight: 600 }}>
            {filteredDevices.length} of {devices.length} devices
          </Typography>
          {statusFilter || platformFilter || versionBucketFilter || scoreBandFilter ? (
            <Button
              size="small"
              onClick={() => {
                setStatusFilter("");
                setPlatformFilter("");
                setVersionBucketFilter("");
                setScoreBandFilter("");
              }}
              sx={{ textTransform: "none", color: BRAND.gray }}
            >
              Clear
            </Button>
          ) : null}
        </Stack>

        <TableContainer>
          <Table size="small">
            <TableHead>
              {/* Pass / Applicable only carries meaningful data when a
                  framework filter is active — frameworkScore.passed and
                  .applicable are only populated under that scope. With
                  no framework selected the column rendered "—" for every
                  row and was just visual noise. We hide it entirely in
                  that case so the table stays focused on the columns
                  that actually have signal. */}
              <TableRow>
                <TableCell sx={{ fontWeight: 700 }}>Host</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Platform</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Agent</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Status</TableCell>
                <TableCell align="right" sx={{ fontWeight: 700 }}>Score</TableCell>
                {selectedFramework ? (
                  <TableCell align="right" sx={{ fontWeight: 700 }}>Pass / Applicable</TableCell>
                ) : null}
                {/* Patch-level chip: count + days-since-latest, color coded.
                    Intentionally sits between pass/applicable and last report
                    so operators can scan "how many passing checks vs how
                    patched" side-by-side. */}
                <TableCell align="right" sx={{ fontWeight: 700 }}>Patches</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Last report</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredDevices.length === 0 && !loading ? (
                <TableRow>
                  <TableCell colSpan={selectedFramework ? 8 : 7} align="center" sx={{ color: BRAND.gray, py: 3 }}>
                    {devices.length === 0
                      ? "No devices have reported compliance under this framework."
                      : "No devices match the applied filters. Clear chips above to see all."}
                  </TableCell>
                </TableRow>
              ) : (
                filteredDevices.map((d) => {
                  const useFw = Boolean(selectedFramework && d.frameworkScore);
                  const score = useFw ? d.frameworkScore.score : d.overallScore;
                  const passed = useFw ? d.frameworkScore.passed : null;
                  const applicable = useFw ? d.frameworkScore.applicable : null;
                  return (
                    <TableRow
                      key={d.agentId}
                      hover
                      sx={{ cursor: "pointer" }}
                      onClick={() => openDrawer(d.agentId)}
                      tabIndex={0}
                      role="button"
                      aria-label={`Open details for ${d.hostname || d.agentId}`}
                      onKeyDown={rowKeyHandler(() => openDrawer(d.agentId))}
                    >
                      <TableCell>
                        <Typography variant="body2" sx={{ color: BRAND.dark, fontWeight: 600 }}>
                          {d.hostname || d.agentId}
                        </Typography>
                        {d.hostname ? (
                          <Typography variant="caption" sx={{ color: BRAND.gray, display: "block" }}>
                            {d.agentId}
                          </Typography>
                        ) : null}
                        {/* Sprint 7 item 3.1 (real detector) — chip
                            shown when the device was enrolled within
                            the last 24h. Distinct from
                            "insufficient_data" which can also fire
                            for long-standing devices with broken
                            collectors. We don't gate the chip on
                            status === insufficient_data because a
                            freshly-enrolled device that DOES manage
                            to score quickly should still get the
                            "new" indicator briefly. */}
                        {isRecentlyEnrolled(d.agentCreatedAtUtc) ? (
                          <Chip
                            label="Recently enrolled"
                            size="small"
                            sx={{
                              mt: 0.25,
                              bgcolor: BRAND.tealSoft,
                              color: BRAND.tealText,
                              fontWeight: 700,
                              height: 20,
                              fontSize: TEXT.xs,
                              fontStyle: "italic"
                            }}
                          />
                        ) : d.overallStatus === "insufficient_data" ? (
                          // Older device with insufficient data is a
                          // different concern — collector is sending
                          // incomplete evidence. We still show a hint
                          // but the wording shifts blame off the
                          // operator ("wait it out") and toward the
                          // collector ("look into this").
                          <Typography
                            variant="caption"
                            sx={{
                              color: BRAND.gray,
                              fontStyle: "italic",
                              display: "block",
                              mt: 0.25
                            }}
                          >
                            Insufficient evidence — check collector
                          </Typography>
                        ) : null}
                      </TableCell>
                      <TableCell sx={{ textTransform: "capitalize" }}>
                        {d.platform || "—"}
                      </TableCell>
                      <TableCell>{d.agentVersion || "—"}</TableCell>
                      <TableCell>
                        <StatusChip status={d.overallStatus || "unknown"} />
                      </TableCell>
                      <TableCell align="right">
                        {/* Pass `score` through unchanged — null is now a
                            meaningful "insufficient_data" signal that
                            ScoreBar renders as "—" with neutral gray.
                            The previous `score ?? 0` coerced null → 0
                            and painted a full red bar for devices that
                            had simply not reported a scorable posture,
                            making them look catastrophically broken. */}
                        <ScoreBar value={score} bands={bands} />
                      </TableCell>
                      {selectedFramework ? (
                        <TableCell align="right">
                          {useFw ? `${passed} / ${applicable}` : "—"}
                        </TableCell>
                      ) : null}
                      <TableCell align="right">
                        <PatchChip patchSummary={d.patchSummary} />
                      </TableCell>
                      <TableCell>
                        {/* Sprint 1 item 3.2 — relative time is more
                            scannable than the full locale-formatted
                            timestamp. We keep the full timestamp in a
                            tooltip so an auditor who wants the exact
                            time can still get it. */}
                        {d.collectedAtUtc ? (
                          <Tooltip
                            title={new Date(d.collectedAtUtc).toLocaleString()}
                            arrow
                            placement="top"
                          >
                            <Typography variant="body2" sx={{ color: BRAND.dark }}>
                              {formatRelativeTime(d.collectedAtUtc) ?? "—"}
                            </Typography>
                          </Tooltip>
                        ) : (
                          <Typography variant="body2" sx={{ color: BRAND.gray }}>
                            —
                          </Typography>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </SectionPaper>

      {/* Drawer: device drill-down ---------------------------------------- */}
      <Drawer
        anchor="right"
        open={Boolean(drawerAgentId)}
        onClose={closeDrawer}
        PaperProps={{
          sx: {
            width: { xs: "100%", sm: 560, md: 640 },
            maxWidth: "100%"
          }
        }}
      >
        <DeviceDrawerContent
          agentId={drawerAgentId}
          loading={drawerLoading}
          data={drawerData}
          error={drawerError}
          onRetry={() => openDrawer(drawerAgentId)}
          timeseries={drawerTimeseries}
          onClose={closeDrawer}
          frameworkLabels={frameworkLabels}
          onNavigateToAsset={() => {
            closeDrawer();
            navigateTo("assets", { agentId: drawerAgentId });
          }}
          // Sprint 3 — lifecycle wiring
          onRequestRefetch={refetchDrawer}
          onToast={showToast}
          canManage={canManage}
          // Fase C — "auto-fix available" hints on findings whose
          // category maps to an enforceable capability not yet in auto.
          baselineHintForCategory={
            baselineBridge
              ? (category) => {
                  const info = modeForCategory(category);
                  if (!info || info.mode === "auto" || !info.autoUpgradable.length) return null;
                  return { mode: info.mode, capabilities: info.autoUpgradable.map((c) => c.label) };
                }
              : null
          }
          onOpenBaselines={() => setTab("baselines")}
          onRemediateFinding={canManage ? handleRemediateFinding : null}
          onOpenVulnerabilities={() => {
            closeDrawer();
            navigateTo("patch", { pmTab: "vulnerabilities" });
          }}
        />
      </Drawer>

      {/* Sprint 3 — page-level Snackbar for finding lifecycle
          actions (ack, revoke, status change). Auto-dismisses after
          4 s on success, 6 s on warning/error so the operator has
          time to read the structured backend message
          (INVALID_TRANSITION etc.). */}
      <Snackbar
        open={Boolean(toast)}
        autoHideDuration={toast?.severity === "success" ? 4000 : 6000}
        onClose={hideToast}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
      >
        {toast ? (
          <Alert
            onClose={hideToast}
            severity={toast.severity}
            variant="filled"
            sx={{ minWidth: 320 }}
          >
            {toast.message}
          </Alert>
        ) : undefined}
      </Snackbar>

      {/* Sprint 5 — tenant compliance settings dialog. Triggered
          from the header icon. Posts to PUT /settings; uses the
          same showToast surface as the lifecycle actions. */}
      <ComplianceSettingsPanel
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onToast={showToast}
      />
      </>
      )}
    </Box>
  );
}

