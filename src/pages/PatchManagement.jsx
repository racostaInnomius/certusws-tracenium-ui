import * as React from "react";
import { getSearchParam, updateSearchParams } from "../utils/browserState";
import Grid from "@mui/material/Grid";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Drawer,
  IconButton,
  Tab,
  Tabs,
  Tooltip,
  Typography,
} from "@mui/material";

import PlayArrowOutlinedIcon from "@mui/icons-material/PlayArrowOutlined";
import HourglassEmptyOutlinedIcon from "@mui/icons-material/HourglassEmptyOutlined";
import RadioButtonUncheckedOutlinedIcon from "@mui/icons-material/RadioButtonUncheckedOutlined";
import PendingActionsOutlinedIcon from "@mui/icons-material/PendingActionsOutlined";
import CheckCircleOutlineOutlinedIcon from "@mui/icons-material/CheckCircleOutlineOutlined";
import DevicesOtherOutlinedIcon from "@mui/icons-material/DevicesOtherOutlined";

import SystemUpdateAltOutlinedIcon from "@mui/icons-material/SystemUpdateAltOutlined";
import ExtensionOutlinedIcon from "@mui/icons-material/ExtensionOutlined";
import ScheduleOutlinedIcon from "@mui/icons-material/ScheduleOutlined";
import BugReportOutlinedIcon from "@mui/icons-material/BugReportOutlined";
import ThirdPartyTab from "../components/patch-management/ThirdPartyTab";
import MaintenanceWindowsPanel from "../components/patch-management/MaintenanceWindowsPanel";
import GatewayPanel from "../components/patch-management/gateway/GatewayPanel";
import VulnerabilitiesTab from "../components/patch-management/VulnerabilitiesTab";
import HttpsOutlinedIcon from "@mui/icons-material/HttpsOutlined";
import HubOutlinedIcon from "@mui/icons-material/HubOutlined";
import FolderSharedOutlinedIcon from "@mui/icons-material/FolderSharedOutlined";
import TuneOutlinedIcon from "@mui/icons-material/TuneOutlined";

import ReportProblemOutlinedIcon from "@mui/icons-material/ReportProblemOutlined";
import RestartAltOutlinedIcon from "@mui/icons-material/RestartAltOutlined";
import CloseOutlinedIcon from "@mui/icons-material/CloseOutlined";
import RefreshOutlinedIcon from "@mui/icons-material/RefreshOutlined";
import DownloadOutlinedIcon from "@mui/icons-material/DownloadOutlined";

import { BRAND, DATAGRID_SX, ICON, ROLE, TEXT } from "../theme/brand";
import { DataGrid } from "@mui/x-data-grid";
import PageHeader from "../components/common/PageHeader";
import BrandSnackbar from "../components/common/BrandSnackbar";
import SectionPaper from "../components/common/SectionPaper";
import SummaryCard from "../components/common/SummaryCard";
import RefreshControl, { useAutoRefresh } from "../components/common/RefreshControl";
import JobTracker from "../components/common/JobTracker";
import { useCachedFetch } from "../hooks/useCachedFetch";
import { useAuthContext } from "../auth/AuthContext";
import { getTenantPolicy } from "../api/policies";
import {
  getPatchSummary,
  getPatchDevices,
  getDeviceScanItems,
  bulkInstall,
  bulkScan
} from "../api/patchManagement";
import { createDeviceJob } from "../api/jobs";
import FindingsPanel from "../components/patch-management/FindingsPanel";
import { listFrom } from "../api/shape";

// ── Remediation catalog. Mirrors the Security Compliance categories —
//    each compliance check has a matching remediation action here. When
//    the PMP plugin lands, each remediation maps to a tenant-level
//    automation (e.g. "apply baseline" or "install KB").
/**
 * Categories another tab already shows. "Other" is defined as the complement,
 * so anything the catalog adds later surfaces here instead of vanishing.
 */
const OTHER_EXCLUDES = "crypto,cryptography,network_sharing";

const CATEGORIES = [
  {
    key: "patches",
    label: "Patches",
    icon: <SystemUpdateAltOutlinedIcon />,
    blurb:
      "Apply operating-system and security updates reported by Security Compliance as missing or pending.",
    actions: [
      {
        id: "patch.install_security",
        name: "Install missing security updates",
        description:
          "Deploy KBs flagged as Critical/Security on devices where Security Compliance reports them as missing.",
        impact: "host",
      },
      {
        id: "patch.install_quality",
        name: "Install pending quality / rollup updates",
        description:
          "Push non-security cumulative updates to devices that are behind the baseline.",
        impact: "host",
      },
      {
        id: "patch.schedule_reboot",
        name: "Schedule reboot for pending patches",
        description:
          "Trigger a controlled reboot window for devices with reboot-pending state.",
        impact: "downtime",
      },
      {
        id: "patch.update_drivers",
        name: "Apply driver updates",
        description:
          "Install optional driver updates where allowed by tenant policy.",
        impact: "host",
      },
      {
        id: "patch.scan_now",
        name: "Force patch scan",
        description:
          "Refresh patch inventory on demand instead of waiting for the next scheduled collection.",
        impact: "none",
      },
    ],
  },
  {
    key: "tls",
    label: "TLS & Ciphers",
    icon: <HttpsOutlinedIcon />,
    blurb:
      "Harden SChannel to meet tenant baseline: enable modern protocols, disable deprecated ones and weak ciphers.",
    actions: [
      {
        id: "tls.enable_1_2",
        name: "Enable TLS 1.2",
        description: "Ensures the minimum recommended version is available to all services.",
        impact: "reboot",
      },
      {
        id: "tls.enable_1_3",
        name: "Enable TLS 1.3",
        description: "Enables TLS 1.3 on hosts that support it.",
        impact: "reboot",
      },
      {
        id: "tls.disable_1_0_1_1",
        name: "Disable TLS 1.0 and 1.1",
        description:
          "Turns off deprecated protocol versions via SChannel registry settings.",
        impact: "reboot",
      },
      {
        id: "tls.disable_ssl",
        name: "Disable SSL 2.0 / 3.0",
        description: "Hard-disable obsolete protocols at server and client.",
        impact: "reboot",
      },
      {
        id: "tls.disable_weak_ciphers",
        name: "Disable weak cipher suites",
        description:
          "Removes RC4, DES, 3DES, NULL, EXPORT and anonymous DH suites from the cipher order.",
        impact: "reboot",
      },
    ],
  },
  {
    key: "smb",
    label: "SMB",
    icon: <HubOutlinedIcon />,
    blurb:
      "Harden the Server Message Block stack — disable legacy protocol, enforce signing, block anonymous access.",
    actions: [
      {
        id: "smb.disable_v1",
        name: "Disable SMBv1",
        description:
          "Removes the SMB1 feature / protocol from the device. Mitigates EternalBlue family.",
        impact: "reboot",
      },
      {
        id: "smb.require_server_signing",
        name: "Require SMB signing (server side)",
        description: "Blocks unsigned inbound SMB sessions.",
        impact: "none",
      },
      {
        id: "smb.require_client_signing",
        name: "Require SMB signing (client side)",
        description: "Signs every outbound SMB session from this host.",
        impact: "none",
      },
      {
        id: "smb.enable_encryption",
        name: "Enable SMB 3.x encryption",
        description:
          "Turn on transport encryption for all shares (or selected sensitive shares).",
        impact: "none",
      },
      {
        id: "smb.disable_guest",
        name: "Disable guest / anonymous SMB",
        description:
          "Blocks anonymous access to shares and named pipes.",
        impact: "none",
      },
    ],
  },
  {
    key: "shares",
    label: "Shared Folders",
    icon: <FolderSharedOutlinedIcon />,
    blurb:
      "Fix share and NTFS permissions flagged by Security Compliance — remove open grants and reconcile mismatches.",
    actions: [
      {
        id: "shares.remove_everyone",
        name: "Remove Everyone ACE",
        description:
          "Strip the Everyone principal from every share where Security Compliance flagged it.",
        impact: "access",
      },
      {
        id: "shares.lock_auth_users",
        name: "Reduce Authenticated Users rights",
        description:
          "Downgrade Full Control to Read on shares where the tenant baseline requires it.",
        impact: "access",
      },
      {
        id: "shares.reconcile_share_ntfs",
        name: "Reconcile share vs NTFS permissions",
        description:
          "Align effective permissions where share-level and NTFS-level ACLs disagree.",
        impact: "access",
      },
      {
        id: "shares.remove_unexpected",
        name: "Remove unexpected hidden shares",
        description:
          "Delete `$`-suffixed shares that are not part of the tenant baseline.",
        impact: "access",
      },
    ],
  },
  {
    key: "other",
    label: "Other",
    icon: <TuneOutlinedIcon />,
    blurb:
      "Generic host-hardening remediations driven by Security Compliance findings.",
    actions: [
      {
        id: "other.enable_bitlocker",
        name: "Enable BitLocker on OS volume",
        description:
          "Turn on full-disk encryption with the key-protection mode defined in the policy.",
        impact: "reboot",
      },
      {
        id: "other.enable_defender_rt",
        name: "Enable Defender real-time protection",
        description:
          "Re-enable RTP if disabled and refresh signatures to the latest intel.",
        impact: "none",
      },
      {
        id: "other.enable_firewall",
        name: "Enable Windows Firewall profiles",
        description:
          "Activate Firewall on Domain, Private and Public profiles.",
        impact: "none",
      },
      {
        id: "other.raise_uac",
        name: "Raise UAC level",
        description: "Set UAC to 'Always notify' (or the tenant baseline level).",
        impact: "none",
      },
      {
        id: "other.enable_lsa_protection",
        name: "Enable LSA protection / Credential Guard",
        description:
          "Harden LSASS on supported hosts against credential theft.",
        impact: "reboot",
      },
      {
        id: "other.rotate_local_admin",
        name: "Rotate local administrator account",
        description: "Rename / disable / rotate password per tenant policy.",
        impact: "access",
      },
      {
        id: "other.set_ps_policy",
        name: "Set PowerShell execution policy",
        description:
          "Apply tenant baseline (AllSigned / Restricted).",
        impact: "none",
      },
    ],
  },
  {
    // Third-party patching: rendered by ThirdPartyPanel (not the legacy
    // CategoryPanel / FindingsPanel), so it carries no `actions`.
    key: "third-party",
    label: "Third-party",
    icon: <ExtensionOutlinedIcon />,
    blurb:
      "Detect installed third-party software that is behind its latest catalog version, and deploy the linked package to update it.",
    actions: [],
  },
  {
    // CVE mapping: vulnerable installed software (exposure) + the CVE
    // catalog. Rendered by VulnerabilitiesTab — no `actions`.
    key: "vulnerabilities",
    label: "Vulnerabilities",
    icon: <BugReportOutlinedIcon />,
    blurb:
      "Surface installed software running a version with a known CVE, matched against your CVE catalog, and see how many devices are exposed.",
    actions: [],
  },
  {
    // Maintenance windows: tenant config for WHEN deployments dispatch.
    // Rendered by MaintenanceWindowsPanel — no `actions`.
    key: "maintenance",
    label: "Maintenance",
    icon: <ScheduleOutlinedIcon />,
    blurb:
      "Restrict when patch and software deployments are allowed to dispatch — e.g. overnight only. No windows means immediate dispatch.",
    actions: [],
  },
  {
    // Rendered by GatewayPanel — no `actions`.
    key: "gateway",
    label: "Virtual infrastructure",
    icon: <HubOutlinedIcon />,
    blurb:
      "Snapshot virtual machines in vCenter before patching them, so a bad patch can be rolled back. Physical hosts and VMs with no gateway patch as usual.",
    actions: [],
  },
];

function IMPACT_CHIP({ impact }) {
  const map = {
    none: { label: "No impact", bg: BRAND.tealSoft, fg: BRAND.tealText, border: `${BRAND.teal}55` },
    host: { label: "Host busy", bg: BRAND.cyanSoft, fg: BRAND.dark, border: `${BRAND.cyan}88` },
    access: { label: "Access change", bg: "rgba(199,121,43,0.14)", fg: BRAND.alert.high, border: "rgba(199,121,43,0.4)" },
    reboot: { label: "May reboot", bg: BRAND.alert.errorSoft, fg: BRAND.alert.error, border: `${BRAND.alert.error}55` },
    downtime: { label: "Downtime", bg: BRAND.alert.errorSoft, fg: BRAND.alert.error, border: `${BRAND.alert.error}55` },
  };
  const cfg = map[impact] || { label: impact || "—", bg: BRAND.darkSoft, fg: BRAND.dark, border: BRAND.border };
  return (
    <Chip
      label={cfg.label}
      size="small"
      sx={{
        height: 22,
        fontSize: TEXT.xs,
        fontWeight: 700,
        bgcolor: cfg.bg,
        color: cfg.fg,
        border: `1px solid ${cfg.border}`,
      }}
    />
  );
}

// Map of action.id → bulk operation. Only the IDs listed here are
// actionable today; everything else stays disabled (those category
// items describe future TLS/SMB/shares/BitLocker remediations that
// require new agent-side jobTypes — not yet implemented). Each entry
// describes how to translate a click into a backend call.
const BULK_ACTION_MAP = {
  "patch.install_security": {
    op: "bulk-install",
    severity: ["critical", "important"],
    label: "Install missing security updates"
  },
  "patch.install_quality": {
    op: "bulk-install",
    severity: ["moderate", "low", "unknown"],
    label: "Install pending quality updates"
  },
  "patch.scan_now": {
    op: "bulk-scan",
    label: "Force patch scan"
  }
};

function ActionsList({ actions, pmpEnabled, onRun }) {
  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 1, mt: 1.5 }}>
      {actions.map((a) => {
        const wired = Boolean(BULK_ACTION_MAP[a.id]);
        const enabled = pmpEnabled && wired;
        return (
        <Box
          key={a.id}
          sx={{
            display: "flex",
            alignItems: { xs: "flex-start", sm: "center" },
            gap: 1.5,
            p: 1.5,
            borderRadius: 2,
            border: `1px solid ${BRAND.border}`,
            bgcolor: BRAND.surface,
            transition: "background-color 0.12s ease, border-color 0.12s ease",
            "&:hover": { borderColor: BRAND.teal, bgcolor: BRAND.tealSoft },
            flexDirection: { xs: "column", sm: "row" },
          }}
        >
          <RadioButtonUncheckedOutlinedIcon
            sx={{ color: BRAND.gray, fontSize: TEXT.xl, mt: { xs: 0, sm: 0.25 }, flexShrink: 0 }}
          />
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, flexWrap: "wrap" }}>
              <Typography sx={{ fontSize: TEXT.base, fontWeight: 700, color: BRAND.dark }}>
                {a.name}
              </Typography>
              <IMPACT_CHIP impact={a.impact} />
            </Box>
            <Typography sx={{ fontSize: TEXT.sm, color: "text.secondary", mt: 0.25 }}>
              {a.description}
            </Typography>
          </Box>
          <Box sx={{ display: "flex", gap: 1, flexShrink: 0, alignSelf: { xs: "flex-end", sm: "center" } }}>
            <Button
              disabled={!enabled}
              onClick={enabled ? () => onRun?.(a) : undefined}
              size="small"
              startIcon={<PlayArrowOutlinedIcon />}
              sx={{
                textTransform: "none",
                fontWeight: 700,
                bgcolor: enabled ? BRAND.teal : BRAND.tealSoft,
                color: enabled ? BRAND.surface : BRAND.tealText,
                "&:hover": { bgcolor: enabled ? BRAND.tealHover : BRAND.tealSoft },
                "&.Mui-disabled": {
                  bgcolor: BRAND.darkSoft,
                  color: BRAND.gray,
                  borderColor: BRAND.border,
                },
              }}
            >
              Remediate
            </Button>
          </Box>
        </Box>
        );
      })}
    </Box>
  );
}

function CategoryPanel({ category, pmpEnabled, onRunAction }) {
  return (
    <SectionPaper
      variant="panel"
      sx={{ minWidth: 0 }}
    >
      <Box sx={{ display: "flex", alignItems: "flex-start", gap: 1.5, flexWrap: "wrap" }}>
        <Box
          sx={{
            width: 44,
            height: 44,
            borderRadius: 2,
            bgcolor: BRAND.tealSoft,
            color: BRAND.teal,
            display: "grid",
            placeItems: "center",
            flexShrink: 0,
          }}
        >
          {category.icon}
        </Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontSize: TEXT.lg, fontWeight: 800, color: BRAND.dark }}>
            {category.label}
          </Typography>
          <Typography sx={{ fontSize: TEXT.md, color: "text.secondary", mt: 0.25 }}>
            {category.blurb}
          </Typography>
        </Box>
      </Box>

      {!pmpEnabled ? (
        <Alert
          severity="info"
          variant="outlined"
          icon={<HourglassEmptyOutlinedIcon fontSize="small" />}
          sx={{
            mt: 2,
            borderRadius: 2,
            borderColor: BRAND.border,
            bgcolor: BRAND.darkSoft,
            color: BRAND.dark,
            "& .MuiAlert-icon": { color: BRAND.dark },
          }}
        >
          PMP plugin is not enabled in this tenant&apos;s policy — remediation
          actions are disabled. Turn on PMP in <strong>Policies</strong> to
          unlock fleet-wide patch operations.
        </Alert>
      ) : null}

      <ActionsList
        actions={category.actions}
        pmpEnabled={pmpEnabled}
        onRun={onRunAction}
      />
    </SectionPaper>
  );
}

// Shape of a tenant policy as returned by /api/v1/policies/tenants/:id/policy.
// We only care about whether `plugins.enabled` includes "pmp" — the rest of
// the body (modules, intervals, etc.) is irrelevant to this page.
function isPmpEnabledIn(policyRes) {
  const env = policyRes?.policy ?? policyRes ?? {};
  const raw = env?.policy_json ?? env?.policyJson ?? env;
  const enabled = raw?.plugins?.enabled;
  return Array.isArray(enabled) && enabled.includes("pmp");
}

function navigateToPolicies() {
  // Same query-param routing pattern the rest of the app uses (see
  // Overview's navigateWithQuery). A direct anchor would full-reload
  // the SPA, which is jarring for a CTA that's strictly in-app.
  const params = new URLSearchParams(window.location.search);
  // The patch schedule lives in Agent Settings (formerly Policies).
  params.set("page", "agent-settings");
  const pathname = window.location.pathname.replace(/^\/+/, "/") || "/";
  window.history.pushState({}, "", `${pathname}?${params.toString()}`);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

export default function PatchManagement({ onNavigate }) {
  // Deep-linkable via ?pmTab= (same pattern as ?settingsTab= / ?scpTab=).
  // Sprint 4: the SCP drawer's cross.vulnerability.* findings link here
  // with pmTab=vulnerabilities so "go see the KEVs" is one click.
  const [tab, setTab] = React.useState(() => {
    const fromUrl = getSearchParam("pmTab", "");
    return CATEGORIES.some((c) => c.key === fromUrl) ? fromUrl : CATEGORIES[0].key;
  });
  React.useEffect(() => {
    updateSearchParams({ pmTab: tab === CATEGORIES[0].key ? "" : tab });
  }, [tab]);
  const activeCategory = CATEGORIES.find((c) => c.key === tab) ?? CATEGORIES[0];

  const { auth } = useAuthContext();
  const tenantId = auth?.tenantId;
  // PMv2 — admin-gating for the new remediation actions (apply +
  // dry-run + cancel). Reads stay open for any tenant member, same
  // pattern as SDP. `canManage` derives from `pmpEnabled` further
  // below so we do the AND there, not here.
  const tenantRole = auth?.tenantMember?.role;
  const isActiveMember = auth?.tenantMember?.isActive === true;
  const isAdmin =
    isActiveMember
    && (String(tenantRole ?? "") === "ADMIN" || String(tenantRole ?? "") === "OWNER");

  // Tenant policy — the source of truth for "is PMP active". Cached
  // so toggling between pages doesn't flash the placeholder while
  // refetching. Stored under tenantId so different tenants don't
  // collide in the same browser session.
  const policyLoader = React.useCallback(async () => {
    if (!tenantId) return null;
    return getTenantPolicy(tenantId);
  }, [tenantId]);
  const { data: policyRes } = useCachedFetch(
    `patchManagement:policy:${tenantId || "none"}`,
    policyLoader
  );
  const pmpEnabled = isPmpEnabledIn(policyRes);
  const canManage = isAdmin && pmpEnabled;

  // Summary + device list — only fetched when PMP is enabled. Callers
  // pass `enabled` so the loader is a no-op for tenants that haven't
  // turned PMP on; useCachedFetch still mounts but the promise
  // resolves with null and the dashboard renders zero-state.
  const summaryLoader = React.useCallback(async () => {
    if (!pmpEnabled) return null;
    return getPatchSummary();
  }, [pmpEnabled]);
  const {
    data: summaryRes,
    refreshing: summaryRefreshing,
    refetch: refetchSummary
  } = useCachedFetch(
    `patchManagement:summary:${tenantId || "none"}:${pmpEnabled ? "on" : "off"}`,
    summaryLoader
  );
  const summary = summaryRes?.summary ?? null;

  const devicesLoader = React.useCallback(async () => {
    if (!pmpEnabled) return null;
    return getPatchDevices();
  }, [pmpEnabled]);
  const {
    data: devicesRes,
    refreshing: devicesRefreshing,
    refetch: refetchDevices
  } = useCachedFetch(
    `patchManagement:devices:${tenantId || "none"}:${pmpEnabled ? "on" : "off"}`,
    devicesLoader
  );
  const devices = React.useMemo(
    () => (Array.isArray(devicesRes?.items) ? devicesRes.items : []),
    [devicesRes]
  );

  const refreshAll = React.useCallback(() => {
    refetchSummary();
    refetchDevices();
  }, [refetchSummary, refetchDevices]);
  const [refreshSeconds, setRefreshSeconds] = useAutoRefresh(
    refreshAll,
    "patchAutoRefresh"
  );

  const refreshing = Boolean(summaryRefreshing || devicesRefreshing);

  // Drill-down drawer: opened when the operator clicks a device row.
  // Holds the selected device + its full patch list (fetched on open)
  // + a Set of selected hotfix IDs for the "Install selected" action.
  // Reset on close so reopening the same device fetches fresh data.
  const [drawerDevice, setDrawerDevice] = React.useState(null);
  const [drawerItems, setDrawerItems] = React.useState([]);
  const [drawerLoading, setDrawerLoading] = React.useState(false);
  const [selectedHotfixes, setSelectedHotfixes] = React.useState(() => new Set());
  const [dispatching, setDispatching] = React.useState(false);
  const [snackbar, setSnackbar] = React.useState({ open: false, severity: "success", message: "" });

  // Snackbar helper. Defined ahead of the action callbacks so the
  // useCallback dep arrays below can reference `notify` without
  // hitting the const TDZ at render time (the previous order put
  // this declaration AFTER handleRunCategoryAction's `[notify]`
  // dep array, which threw a ReferenceError on first render and
  // blanked the page).
  const notify = React.useCallback((severity, message) => {
    setSnackbar({ open: true, severity, message });
  }, []);

  // Active jobs tracker — populated on each successful dispatch and
  // shown as a sticky bottom-right card. Polled by JobTracker until
  // every job reaches a terminal state. Operators can dispatch
  // multiple actions in a row (e.g. install on Mac1, then run scan
  // on Mac2) and watch them progress side by side.
  const [activeJobs, setActiveJobs] = React.useState([]);
  const handleAllJobsDone = React.useCallback(() => {
    // Trigger a dashboard refresh once all tracked jobs settle so the
    // post-job state (status flips, missing-count drops, reboot
    // pending) surfaces without the operator having to click Refresh.
    refreshAll();
  }, [refreshAll]);
  const dismissTracker = React.useCallback(() => setActiveJobs([]), []);

  // Bulk-action confirm dialog. Holds the action descriptor (from
  // CATEGORIES[].actions) plus the dry-run plan from the backend.
  // Two-step flow: click button → fetch plan → show dialog with
  // "X devices will receive Y patches" → confirm → real dispatch.
  const [bulkDialog, setBulkDialog] = React.useState(null); // { action, plan, loading, dispatching }

  const handleRunCategoryAction = React.useCallback(async (action) => {
    const cfg = BULK_ACTION_MAP[action.id];
    if (!cfg) return;

    if (cfg.op === "bulk-scan") {
      // Scan is non-destructive — dispatch immediately, no preview.
      try {
        const res = await bulkScan();
        const dispatched = Array.isArray(res?.dispatched) ? res.dispatched : [];
        if (dispatched.length === 0) {
          notify("info", "No PMP-reporting devices to scan");
          return;
        }
        setActiveJobs((prev) => [
          ...prev,
          ...dispatched.map((d) => ({
            jobId: d.jobId,
            label: `Scan · ${d.hostname || d.agentId.slice(0, 8)}`
          }))
        ]);
        notify("success", `Patch scan dispatched to ${dispatched.length} device${dispatched.length === 1 ? "" : "s"}`);
      } catch (err) {
        console.error("[patch-mgmt] bulk-scan failed", err);
        notify("error", `Scan dispatch failed: ${err?.message || "unknown error"}`);
      }
      return;
    }

    // bulk-install: dry-run first to show preview, then real dispatch on confirm.
    setBulkDialog({ action, cfg, plan: null, loading: true, dispatching: false });
    try {
      const res = await bulkInstall({
        severity: cfg.severity,
        mode: "install",
        dryRun: true
      });
      setBulkDialog((prev) => prev ? { ...prev, plan: res?.plan ?? [], loading: false } : null);
    } catch (err) {
      console.error("[patch-mgmt] bulk-install dry-run failed", err);
      notify("error", `Could not load plan: ${err?.message || "unknown error"}`);
      setBulkDialog(null);
    }
  }, [notify]);

  const confirmBulkInstall = React.useCallback(async () => {
    if (!bulkDialog || bulkDialog.dispatching) return;
    setBulkDialog((prev) => prev ? { ...prev, dispatching: true } : null);
    try {
      const res = await bulkInstall({
        severity: bulkDialog.cfg.severity,
        mode: "install",
        dryRun: false
      });
      const dispatched = Array.isArray(res?.dispatched) ? res.dispatched : [];
      const skipped = Array.isArray(res?.skipped) ? res.skipped : [];

      if (dispatched.length === 0) {
        notify("info", `No devices matched the ${bulkDialog.cfg.label.toLowerCase()} filter`);
      } else {
        setActiveJobs((prev) => [
          ...prev,
          ...dispatched.map((d) => ({
            jobId: d.jobId,
            label: `${bulkDialog.cfg.label} (${d.kbCount}) · ${d.hostname || d.agentId.slice(0, 8)}`
          }))
        ]);
        const skipMsg = skipped.length > 0 ? ` · ${skipped.length} skipped` : "";
        notify("success", `Dispatched to ${dispatched.length} device${dispatched.length === 1 ? "" : "s"}${skipMsg}`);
      }
      setBulkDialog(null);
    } catch (err) {
      console.error("[patch-mgmt] bulk-install failed", err);
      notify("error", `Dispatch failed: ${err?.message || "unknown error"}`);
      setBulkDialog((prev) => prev ? { ...prev, dispatching: false } : null);
    }
  }, [bulkDialog, notify]);

  const openDrawer = React.useCallback(async (device) => {
    setDrawerDevice(device);
    setSelectedHotfixes(new Set());
    setDrawerLoading(true);
    setDrawerItems([]);
    try {
      const res = await getDeviceScanItems(device.agentId);
      const items = listFrom(res, { context: "patchManagement" });
      setDrawerItems(items);
    } catch (err) {
      console.error("[patch-mgmt] failed to load device items", err);
      notify("error", "Failed to load patch list for device");
    } finally {
      setDrawerLoading(false);
    }
  }, [notify]);

  const closeDrawer = React.useCallback(() => {
    if (dispatching) return; // don't strand the operator mid-job
    setDrawerDevice(null);
    setDrawerItems([]);
    setSelectedHotfixes(new Set());
  }, [dispatching]);

  const toggleHotfix = React.useCallback((hotfixId) => {
    setSelectedHotfixes((prev) => {
      const next = new Set(prev);
      if (next.has(hotfixId)) next.delete(hotfixId);
      else next.add(hotfixId);
      return next;
    });
  }, []);

  const toggleAllSelection = React.useCallback(() => {
    setSelectedHotfixes((prev) => {
      // Treat "all selected" if every item with an id is in the set.
      const allIds = drawerItems
        .map((it) => it.hotfixId)
        .filter((id) => Boolean(id));
      const allSelected = allIds.length > 0 && allIds.every((id) => prev.has(id));
      if (allSelected) return new Set();
      return new Set(allIds);
    });
  }, [drawerItems]);

  // Dispatch a job to the device. Wraps `createDeviceJob` with the
  // shared spinner + error handling so each action button just calls
  // this with its own jobType + payload. After a successful dispatch
  // we close the drawer (the agent works async; the operator can
  // come back and the dashboard auto-refresh will reflect progress)
  // and trigger an immediate dashboard refresh so the new job's
  // effect on overall_status surfaces fast.
  const dispatchJob = React.useCallback(async (jobType, payload, label) => {
    if (!drawerDevice || dispatching) return;
    setDispatching(true);
    try {
      const res = await createDeviceJob(drawerDevice.agentId, {
        jobType,
        payload
      });
      const jobId = res?.job?.jobId || res?.jobId;
      if (jobId) {
        // Push the job into the active tracker. The tracker polls
        // getJob until terminal status, so the operator sees the
        // job progress through running → success without needing to
        // re-poll manually. Notify (toast) is kept only for the
        // dispatch-failure branch below since the tracker IS the
        // ongoing-status feedback.
        setActiveJobs((prev) => [
          ...prev,
          { jobId, label: `${label} · ${drawerDevice.hostname || drawerDevice.agentId.slice(0, 8)}` }
        ]);
      } else {
        notify("success", `${label} dispatched`);
      }
      closeDrawer();
    } catch (err) {
      console.error(`[patch-mgmt] ${jobType} dispatch failed`, err);
      notify("error", `${label} failed: ${err?.message || "unknown error"}`);
    } finally {
      setDispatching(false);
    }
  }, [drawerDevice, dispatching, notify, closeDrawer]);

  const handleInstallSelected = React.useCallback(() => {
    if (selectedHotfixes.size === 0) return;
    const kbArticleIds = Array.from(selectedHotfixes);
    dispatchJob(
      "patch_install",
      { mode: "install", kbArticleIds },
      `Install ${kbArticleIds.length} patch${kbArticleIds.length === 1 ? "" : "es"}`
    );
  }, [selectedHotfixes, dispatchJob]);

  const handleInstallAll = React.useCallback(() => {
    dispatchJob(
      "patch_install",
      { mode: "install", kbArticleIds: [] },
      "Install all missing patches"
    );
  }, [dispatchJob]);

  const handleRunScan = React.useCallback(() => {
    dispatchJob("patch_scan", {}, "Patch scan");
  }, [dispatchJob]);

  // KPI numbers, with sensible zeros when PMP is off or pre-first-scan.
  const kpis = React.useMemo(() => {
    const status = summary?.statusBreakdown || {};
    const sev = summary?.severityBreakdown || {};
    const reportedCount = Number(summary?.devicesReporting ?? 0);
    const totalMissing = Number(summary?.totalMissing ?? 0);
    const criticalish = Number(sev.critical ?? 0) + Number(sev.important ?? 0);
    const rebootDevices = Number(status.reboot_required ?? 0);
    const healthy = Number(status.healthy ?? 0);
    return { reportedCount, totalMissing, criticalish, rebootDevices, healthy };
  }, [summary]);

  const deviceColumns = React.useMemo(() => [
    {
      field: "hostname",
      headerName: "Hostname",
      flex: 1.2,
      minWidth: 180,
      renderCell: (params) =>
        params.row.hostname || params.row.agentId.slice(0, 12)
    },
    {
      field: "platform",
      headerName: "Platform",
      flex: 0.6,
      minWidth: 100,
      renderCell: (params) => params.row.platform || "—"
    },
    {
      field: "overallStatus",
      headerName: "Status",
      flex: 0.8,
      minWidth: 140,
      renderCell: (params) => {
        const v = String(params.row.overallStatus || "unknown");
        // Mirrors PmpOverallStatus in the agent
        // (pmp-types.ts: 8 values + 'unknown' fallback). Adding a
        // new agent status without listing it here means devices
        // show up as "Unknown" in the table — they're not actually
        // unknown, just unmapped. Color logic:
        //   positive (green)  → healthy
        //   teal              → in-flight states (installing, scan_pending)
        //   caution (amber)   → updates available
        //   critical (red)    → reboot pending or error
        //   neutral grey      → idle / inventory_only / unknown
        // `inventory_only` is intentionally neutral: the scan ran
        // and found 0 pending patches — that's a calm "OK" state,
        // not a victory call (we reserve "Healthy" for the explicit
        // provider-reported healthy).
        const meta = {
          idle:              { label: "Idle",              fg: BRAND.gray,     bg: BRAND.surfaceMuted },
          inventory_only:    { label: "Inventory only",    fg: BRAND.dark,     bg: BRAND.darkSoft     },
          scan_pending:      { label: "Scan pending",      fg: BRAND.tealText, bg: BRAND.tealSoft     },
          updates_available: { label: "Updates avail.",    fg: ROLE.caution,   bg: ROLE.cautionSoft   },
          installing:        { label: "Installing",        fg: BRAND.tealText, bg: BRAND.tealSoft     },
          reboot_required:   { label: "Reboot pending",    fg: ROLE.critical,  bg: ROLE.criticalSoft  },
          healthy:           { label: "Healthy",           fg: ROLE.positive,  bg: ROLE.positiveSoft  },
          error:             { label: "Error",             fg: ROLE.critical,  bg: ROLE.criticalSoft  },
          unknown:           { label: "Unknown",           fg: BRAND.gray,     bg: BRAND.surfaceMuted },
        };
        const m = meta[v] || meta.unknown;
        const chip = (
          <Chip
            size="small"
            label={m.label}
            sx={{
              bgcolor: m.bg,
              color: m.fg,
              fontWeight: 700,
              height: 22,
              ...(params.row.scanNote ? { cursor: "help" } : null),
            }}
          />
        );
        // The scan's own explanation of why it came back with nothing —
        // an IPC timeout, an empty Windows Update result, a provider error.
        // Without it "Inventory only / 0 patches" reads as a clean machine,
        // and a fleet that is silently failing to scan looks fine.
        if (!params.row.scanNote) return chip;
        return (
          <Tooltip title={params.row.scanNote} arrow placement="top">
            {chip}
          </Tooltip>
        );
      }
    },
    {
      field: "missingCount",
      headerName: "Missing",
      type: "number",
      flex: 0.5,
      minWidth: 100,
      align: "right",
      headerAlign: "right",
      renderCell: (params) => (
        <Typography sx={{ fontWeight: 700, color: params.row.missingCount > 0 ? ROLE.critical : BRAND.dark }}>
          {params.row.missingCount}
        </Typography>
      )
    },
    {
      field: "rebootRequired",
      headerName: "Reboot",
      flex: 0.5,
      minWidth: 90,
      renderCell: (params) =>
        params.row.rebootRequired ? (
          <RestartAltOutlinedIcon sx={{ fontSize: ICON.lg, color: ROLE.critical }} />
        ) : (
          <Typography sx={{ color: BRAND.gray, fontSize: TEXT.md }}>—</Typography>
        )
    },
    {
      field: "collectedAtUtc",
      headerName: "Last scan",
      flex: 0.9,
      minWidth: 160,
      renderCell: (params) => {
        const v = params.row.collectedAtUtc;
        if (!v) return "—";
        try {
          return new Date(v).toLocaleString("en-US", {
            year: "2-digit", month: "short", day: "2-digit",
            hour: "2-digit", minute: "2-digit", hourCycle: "h24"
          });
        } catch { return "—"; }
      }
    }
  ], []);

  return (
    <Box sx={{ px: { xs: 2, sm: 0.5 }, py: { xs: 2, sm: 0.5 }, minWidth: 0 }}>
      <PageHeader
        title="Patch Management"
        subtitle={
          pmpEnabled
            ? "Active. Scan + remediation surfaces below; per-device drill-down via the Devices table."
            : "Remediate findings collected by Security Compliance."
        }
        icon={<SystemUpdateAltOutlinedIcon />}
        actions={
          <>
            {pmpEnabled ? (
              <Chip
                label="PMP active"
                size="small"
                icon={<CheckCircleOutlineOutlinedIcon sx={{ fontSize: ICON.sm }} />}
                sx={{
                  bgcolor: ROLE.positiveSoft,
                  color: ROLE.positive,
                  fontWeight: 700,
                  border: `1px solid ${ROLE.positive}55`,
                  "& .MuiChip-icon": { color: ROLE.positive }
                }}
              />
            ) : (
              <Chip
                label="PMP plugin disabled"
                size="small"
                icon={<HourglassEmptyOutlinedIcon sx={{ fontSize: ICON.sm }} />}
                sx={{
                  bgcolor: BRAND.cyanSoft,
                  color: BRAND.dark,
                  fontWeight: 700,
                  border: `1px solid ${BRAND.cyan}88`,
                  "& .MuiChip-icon": { color: BRAND.dark },
                }}
              />
            )}
            <RefreshControl
              refreshSeconds={refreshSeconds}
              onRefreshSecondsChange={setRefreshSeconds}
              onRefresh={refreshAll}
              loading={refreshing}
            />
          </>
        }
      />

      {/* Disabled-state CTA. Replaces the four "—" placeholder cards
          with one explicit explanation + a button that lands the
          operator on the Policies page. */}
      {!pmpEnabled ? (
        <Alert
          severity="info"
          variant="outlined"
          sx={{
            mb: 2,
            borderRadius: 2,
            borderColor: BRAND.border,
            bgcolor: BRAND.darkSoft,
            color: BRAND.dark,
            "& .MuiAlert-icon": { color: BRAND.dark },
          }}
          action={
            <Button
              size="small"
              variant="contained"
              onClick={navigateToPolicies}
              sx={{
                textTransform: "none",
                bgcolor: BRAND.teal,
                "&:hover": { bgcolor: BRAND.tealHover }
              }}
            >
              Open Policies
            </Button>
          }
        >
          PMP is disabled in this tenant&apos;s policy. Enable the &quot;PMP — Patch
          Management&quot; switch in <strong>Policies</strong> to start collecting
          patch state from agents and unlock the dashboard below.
        </Alert>
      ) : null}

      {/* Active-state KPIs. Five cards mirror the SCP page's hero so
          a CISO scanning between pages reads them as one family. The
          severity card combines critical+important since macOS reports
          everything as "unknown" today and Windows MSRC severity is
          coarse-grained — splitting further would render mostly
          zeros on a real fleet. */}
      {pmpEnabled ? (
        <Box sx={{ mb: 2 }}>
          <Grid container spacing={2} alignItems="stretch">
            <Grid size={{ xs: 12, sm: 6, md: 4, lg: 2.4 }}>
              <SummaryCard
                title="Devices reporting"
                value={kpis.reportedCount}
                icon={<DevicesOtherOutlinedIcon />}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 4, lg: 2.4 }}>
              <SummaryCard
                title="Total missing"
                value={kpis.totalMissing}
                icon={<PendingActionsOutlinedIcon />}
                accent={kpis.totalMissing > 0 ? ROLE.caution : ROLE.positive}
                tint={kpis.totalMissing > 0 ? ROLE.cautionSoft : ROLE.positiveSoft}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 4, lg: 2.4 }}>
              <SummaryCard
                title="Critical / Important"
                value={kpis.criticalish}
                icon={<ReportProblemOutlinedIcon />}
                accent={kpis.criticalish > 0 ? ROLE.critical : ROLE.positive}
                tint={kpis.criticalish > 0 ? ROLE.criticalSoft : ROLE.positiveSoft}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 4, lg: 2.4 }}>
              <SummaryCard
                title="Reboot pending"
                value={kpis.rebootDevices}
                icon={<RestartAltOutlinedIcon />}
                accent={kpis.rebootDevices > 0 ? ROLE.critical : BRAND.dark}
                tint={kpis.rebootDevices > 0 ? ROLE.criticalSoft : BRAND.darkSoft}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 4, lg: 2.4 }}>
              <SummaryCard
                title="Healthy"
                value={kpis.healthy}
                icon={<CheckCircleOutlineOutlinedIcon />}
                accent={ROLE.positive}
                tint={ROLE.positiveSoft}
              />
            </Grid>
          </Grid>
        </Box>
      ) : null}

      {/* Devices table — only when PMP is on. The remediation tabs
          below stay visible regardless because they're documentation
          of what PMP can do, not live actions. Once we wire the
          install path, those tabs become per-device action launchers
          rather than placeholders. */}
      {pmpEnabled ? (
        <SectionPaper variant="panel" sx={{ p: { xs: 1.5, sm: 2 }, mb: 2 }}>
          <Box sx={{ display: "flex", justifyContent: "space-between", mb: 1.5 }}>
            <Typography sx={{ fontSize: TEXT.lg, fontWeight: 800, color: BRAND.dark }}>
              Devices
            </Typography>
            <Typography sx={{ fontSize: TEXT.sm, color: "text.secondary" }}>
              {devices.length} reporting
            </Typography>
          </Box>
          <Box sx={{ width: "100%" }}>
            <DataGrid
              autoHeight
              rows={devices}
              columns={deviceColumns}
              getRowId={(row) => row.agentId}
              disableRowSelectionOnClick
              onRowClick={(params) => openDrawer(params.row)}
              pageSizeOptions={[10, 25, 50]}
              initialState={{ pagination: { paginationModel: { pageSize: 10 } } }}
              sx={{
                ...DATAGRID_SX,
                "& .MuiDataGrid-row": { cursor: "pointer" }
              }}
            />
          </Box>
        </SectionPaper>
      ) : null}

      {/* Remediation catalog (categories). Kept visible in both
          states: pre-rollout it's the spec of what PMP will do;
          post-rollout it's the menu of available actions. The
          per-action "Run" buttons remain disabled until the job
          dispatcher path is wired (next milestone). */}
      <SectionPaper
        variant="panel"
        sx={{ p: 0, bgcolor: BRAND.surface, overflow: "hidden", mb: 2 }}
      >
        <Tabs
          value={tab}
          onChange={(_e, next) => setTab(next)}
          variant="scrollable"
          scrollButtons="auto"
          allowScrollButtonsMobile
          sx={{
            borderBottom: `1px solid ${BRAND.border}`,
            bgcolor: BRAND.darkSoft,
            "& .MuiTab-root": {
              textTransform: "none",
              fontWeight: 700,
              color: BRAND.dark,
              minHeight: 48,
              px: 2,
              outline: "none",
              "&:focus": { outline: "none" },
              "&.Mui-focusVisible": { backgroundColor: BRAND.cyanSoft },
            },
            "& .Mui-selected": { color: `${BRAND.teal} !important` },
            "& .MuiTabs-indicator": { backgroundColor: BRAND.teal, height: 3 },
          }}
        >
          {CATEGORIES.map((c) => (
            <Tab
              key={c.key}
              value={c.key}
              label={c.label}
              icon={c.icon}
              iconPosition="start"
              sx={{ gap: 0.75 }}
            />
          ))}
        </Tabs>

        <Box sx={{ p: { xs: 1.5, sm: 2 } }}>
          {/* Patches tab keeps the legacy CategoryPanel — the
              "documentation-of-actions + Run buttons" surface that
              wires into bulkInstall / bulkScan. The other tabs are
              the v2 surface: real findings + click-to-fix. */}
          {tab === "patches" ? (
            <CategoryPanel
              category={activeCategory}
              pmpEnabled={pmpEnabled}
              onRunAction={handleRunCategoryAction}
            />
          ) : tab === "third-party" ? (
            <ThirdPartyTab
              canManage={canManage}
              notify={(severity, message) => setSnackbar({ open: true, severity, message })}
            />
          ) : tab === "vulnerabilities" ? (
            <VulnerabilitiesTab
              canManage={canManage}
              notify={(severity, message) => setSnackbar({ open: true, severity, message })}
            />
          ) : tab === "maintenance" ? (
            <MaintenanceWindowsPanel
              canManage={canManage}
              notify={(severity, message) => setSnackbar({ open: true, severity, message })}
            />
          ) : tab === "gateway" ? (
            <GatewayPanel
              canManage={canManage}
              devices={devices}
              notify={(severity, message) => setSnackbar({ open: true, severity, message })}
            />
          ) : (
            <FindingsPanel
              tabKey={tab}
              category={
                // TLS covers BOTH catalog categories. `crypto` holds the real
                // work (weak certificate keys and signatures, expired certs,
                // non-standard roots, SSH MACs); `cryptography` holds a single
                // Linux password-hash check. This tab used to name only the
                // second, so it displayed one unrelated finding while 203 rows
                // of certificate problems stayed invisible.
                tab === "tls"    ? "crypto,cryptography"
                : tab === "smb"  ? "network_sharing"
                : tab === "shares" ? "network_sharing"
                : undefined
              }
              categoriesNotIn={
                // "Other" is a complement, not a category. Naming `firewall`
                // here made it a fourth narrow tab and hid everything the
                // catalog grew afterwards — patching (which carries the KEV
                // checks), identity_policy, disk_encryption, network_hardening,
                // filesystem_hardening, integrity, antimalware: 636 of 984 open
                // findings across the fleet, none of them reachable from this
                // page. Excluding what the other tabs claim means a new catalog
                // category shows up here by default instead of disappearing.
                tab === "other" ? OTHER_EXCLUDES : undefined
              }
              checkIdContains={
                // Split the shared `network_sharing` catalog category
                // between the SMB and Shares tabs. Catalog's checkId
                // naming convention puts "smb" or "share" in the
                // last segment, so a substring match is unambiguous.
                tab === "smb"    ? "smb"
                : tab === "shares" ? "share"
                : undefined
              }
              canManage={canManage}
              notify={(severity, message) =>
                setSnackbar({ open: true, severity, message })
              }
            />
          )}
        </Box>
      </SectionPaper>

      {/* Per-device drill-down drawer. Opened when the operator clicks
          a row in the devices table. Renders the missing-patch list
          for that one device + the three actions an operator wants
          per-machine: install selected, install all, run scan now.
          The drawer is the action surface — the page's Tabs below
          are intentionally left as documentation of fleet-wide
          remediation categories (not yet wired). */}
      <Drawer
        anchor="right"
        open={Boolean(drawerDevice)}
        onClose={closeDrawer}
        PaperProps={{
          sx: { width: { xs: "100%", sm: 540, md: 620 }, maxWidth: "100%" }
        }}
      >
        {drawerDevice ? (
          <Box sx={{ height: "100%", display: "flex", flexDirection: "column" }}>
            {/* Header */}
            <Box sx={{ p: 2, display: "flex", alignItems: "center", gap: 1.5, borderBottom: `1px solid ${BRAND.border}` }}>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography sx={{ fontWeight: 800, color: BRAND.dark, fontSize: TEXT.xl }}>
                  {drawerDevice.hostname || drawerDevice.agentId.slice(0, 12)}
                </Typography>
                <Typography sx={{ color: "text.secondary", fontSize: TEXT.sm }}>
                  {drawerDevice.platform || "—"}
                  {drawerDevice.collectedAtUtc ? (
                    <> · last scan {new Date(drawerDevice.collectedAtUtc).toLocaleString("en-US", {
                      month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h24"
                    })}</>
                  ) : null}
                </Typography>
              </Box>
              <IconButton aria-label="Close" onClick={closeDrawer} disabled={dispatching} size="small">
                <CloseOutlinedIcon />
              </IconButton>
            </Box>

            {/* Action bar */}
            <Box sx={{ p: 2, display: "flex", gap: 1, flexWrap: "wrap", borderBottom: `1px solid ${BRAND.border}`, bgcolor: BRAND.darkSoft }}>
              <Button
                variant="contained"
                size="small"
                startIcon={dispatching ? <CircularProgress size={14} sx={{ color: BRAND.surface }} /> : <DownloadOutlinedIcon />}
                onClick={handleInstallSelected}
                disabled={dispatching || selectedHotfixes.size === 0}
                sx={{ textTransform: "none", bgcolor: BRAND.teal, "&:hover": { bgcolor: BRAND.tealHover } }}
              >
                Install selected ({selectedHotfixes.size})
              </Button>
              <Button
                variant="outlined"
                size="small"
                startIcon={<DownloadOutlinedIcon />}
                onClick={handleInstallAll}
                disabled={dispatching || drawerItems.length === 0}
                sx={{
                  textTransform: "none",
                  borderColor: BRAND.teal,
                  color: BRAND.teal,
                  "&:hover": { borderColor: BRAND.tealHover, bgcolor: BRAND.tealSoft }
                }}
              >
                Install all
              </Button>
              <Button
                variant="outlined"
                size="small"
                startIcon={<RefreshOutlinedIcon />}
                onClick={handleRunScan}
                disabled={dispatching}
                sx={{
                  textTransform: "none",
                  borderColor: BRAND.gray,
                  color: BRAND.dark,
                  "&:hover": { borderColor: BRAND.dark, bgcolor: BRAND.darkSoft }
                }}
              >
                Run scan now
              </Button>
            </Box>

            {/* Patch list */}
            <Box sx={{ flex: 1, overflow: "auto" }}>
              {drawerLoading ? (
                <Box sx={{ display: "flex", justifyContent: "center", p: 4 }}>
                  <CircularProgress size={32} sx={{ color: BRAND.teal }} />
                </Box>
              ) : drawerItems.length === 0 ? (
                <Box sx={{ p: 4, textAlign: "center" }}>
                  <CheckCircleOutlineOutlinedIcon sx={{ fontSize: ICON["3xl"], color: ROLE.positive, mb: 1 }} />
                  <Typography sx={{ color: BRAND.dark, fontWeight: 700 }}>No missing patches</Typography>
                  <Typography sx={{ color: "text.secondary", fontSize: TEXT.md, mt: 0.5 }}>
                    This device is up to date.
                  </Typography>
                </Box>
              ) : (
                <Box sx={{ p: 1 }}>
                  {/* Select-all row */}
                  <Box sx={{ display: "flex", alignItems: "center", px: 1, py: 0.5, borderBottom: `1px solid ${BRAND.border}` }}>
                    <Checkbox
                      size="small"
                      checked={
                        drawerItems.length > 0 &&
                        drawerItems
                          .map((it) => it.hotfixId)
                          .filter(Boolean)
                          .every((id) => selectedHotfixes.has(id))
                      }
                      indeterminate={selectedHotfixes.size > 0 && selectedHotfixes.size < drawerItems.length}
                      onChange={toggleAllSelection}
                      disabled={dispatching}
                      sx={{ "&.Mui-checked": { color: BRAND.teal }, "&.MuiCheckbox-indeterminate": { color: BRAND.teal } }}
                    />
                    <Typography sx={{ fontSize: TEXT.sm, color: "text.secondary", flex: 1 }}>
                      {drawerItems.length} missing — select to install specific ones
                    </Typography>
                  </Box>
                  {drawerItems.map((item, idx) => {
                    const id = item.hotfixId || `idx-${idx}`;
                    const checked = selectedHotfixes.has(item.hotfixId);
                    const sevMeta = {
                      critical:  { label: "Critical",  fg: ROLE.critical,  bg: ROLE.criticalSoft },
                      important: { label: "Important", fg: ROLE.caution,   bg: ROLE.cautionSoft },
                      moderate:  { label: "Moderate",  fg: BRAND.tealText, bg: BRAND.tealSoft },
                      low:       { label: "Low",       fg: BRAND.gray,     bg: BRAND.surfaceMuted },
                      unknown:   { label: "Unknown",   fg: BRAND.gray,     bg: BRAND.surfaceMuted }
                    };
                    const sev = sevMeta[String(item.severity || "unknown")] || sevMeta.unknown;
                    return (
                      <Box
                        key={id}
                        sx={{
                          display: "flex",
                          alignItems: "flex-start",
                          gap: 1,
                          px: 1,
                          py: 1,
                          borderBottom: `1px solid ${BRAND.border}`,
                          "&:hover": { bgcolor: BRAND.surfaceMuted }
                        }}
                      >
                        <Checkbox
                          size="small"
                          checked={checked}
                          onChange={() => item.hotfixId && toggleHotfix(item.hotfixId)}
                          disabled={dispatching || !item.hotfixId}
                          sx={{ mt: -0.5, "&.Mui-checked": { color: BRAND.teal } }}
                        />
                        <Box sx={{ flex: 1, minWidth: 0 }}>
                          <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
                            <Chip
                              size="small"
                              label={sev.label}
                              sx={{ bgcolor: sev.bg, color: sev.fg, fontWeight: 700, height: 20, fontSize: TEXT.xs }}
                            />
                            {item.hotfixId ? (
                              <Typography sx={{ fontFamily: "monospace", fontSize: TEXT.sm, color: BRAND.dark }}>
                                {item.hotfixId}
                              </Typography>
                            ) : null}
                          </Box>
                          <Typography sx={{ fontSize: TEXT.md, color: BRAND.dark, mt: 0.5, wordBreak: "break-word" }}>
                            {item.title || "(no title)"}
                          </Typography>
                          {item.source ? (
                            <Typography sx={{ fontSize: TEXT.xs, color: BRAND.gray, mt: 0.25 }}>
                              source: {item.source}
                            </Typography>
                          ) : null}
                        </Box>
                      </Box>
                    );
                  })}
                </Box>
              )}
            </Box>

            <Divider />

            {/* Footer */}
            <Box sx={{ p: 1.5, display: "flex", justifyContent: "flex-end", gap: 1 }}>
              <Button onClick={closeDrawer} disabled={dispatching} size="small" sx={{ textTransform: "none", color: BRAND.dark }}>
                Close
              </Button>
            </Box>
          </Box>
        ) : null}
      </Drawer>

      <BrandSnackbar
        open={snackbar.open}
        severity={snackbar.severity}
        message={snackbar.message}
        onClose={() => setSnackbar((s) => ({ ...s, open: false }))}
      />

      {/* Bulk-install confirm dialog. Two states:
            * loading: dry-run is in flight (spinner)
            * loaded:  shows the plan ("X devices, Y patches each") +
                       Cancel/Confirm buttons. Confirm fires the real
                       dispatch with dryRun:false. */}
      <Dialog
        open={Boolean(bulkDialog)}
        onClose={() => bulkDialog && !bulkDialog.dispatching && setBulkDialog(null)}
        PaperProps={{ sx: { width: 520, maxWidth: "100%" } }}
      >
        <DialogTitle sx={{ fontWeight: 800, color: BRAND.dark }}>
          {bulkDialog?.action?.name || "Confirm bulk action"}
        </DialogTitle>
        <DialogContent>
          {bulkDialog?.loading ? (
            <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, py: 2 }}>
              <CircularProgress size={20} sx={{ color: BRAND.teal }} />
              <Typography sx={{ color: "text.secondary" }}>Computing target list…</Typography>
            </Box>
          ) : bulkDialog ? (
            <Box>
              <Typography sx={{ color: BRAND.dark, mb: 1.5 }}>
                {bulkDialog.action.description}
              </Typography>
              {bulkDialog.plan && bulkDialog.plan.length > 0 ? (
                <>
                  <Typography sx={{ fontSize: TEXT.md, fontWeight: 700, color: BRAND.dark, mb: 1 }}>
                    Will dispatch to {bulkDialog.plan.length} device{bulkDialog.plan.length === 1 ? "" : "s"}:
                  </Typography>
                  <Box
                    sx={{
                      maxHeight: 240,
                      overflowY: "auto",
                      border: `1px solid ${BRAND.border}`,
                      borderRadius: 2,
                      bgcolor: BRAND.darkSoft
                    }}
                  >
                    {bulkDialog.plan.map((p) => (
                      <Box
                        key={p.agentId}
                        sx={{
                          display: "flex",
                          alignItems: "center",
                          gap: 1,
                          px: 1.5,
                          py: 0.75,
                          borderBottom: `1px solid ${BRAND.border}`,
                          "&:last-child": { borderBottom: "none" }
                        }}
                      >
                        <Typography sx={{ flex: 1, fontSize: TEXT.md, color: BRAND.dark, minWidth: 0 }} noWrap>
                          {p.hostname || p.agentId.slice(0, 12)}
                          {p.platform ? <Typography component="span" sx={{ fontSize: TEXT.xs, color: BRAND.gray, ml: 1 }}>{p.platform}</Typography> : null}
                        </Typography>
                        <Chip
                          size="small"
                          label={`${p.kbCount} patch${p.kbCount === 1 ? "" : "es"}`}
                          sx={{ bgcolor: BRAND.tealSoft, color: BRAND.tealText, fontWeight: 700, height: 20, fontSize: TEXT.xs }}
                        />
                      </Box>
                    ))}
                  </Box>
                  <Typography sx={{ fontSize: TEXT.sm, color: "text.secondary", mt: 1.5 }}>
                    Each device will receive a <strong>patch_install</strong> job with its specific
                    KB list. Devices not listed have no matching patches.
                  </Typography>
                </>
              ) : (
                <Alert severity="info" variant="outlined" sx={{ mt: 1 }}>
                  No devices have patches matching this filter. Nothing to do.
                </Alert>
              )}
            </Box>
          ) : null}
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => setBulkDialog(null)}
            disabled={bulkDialog?.dispatching}
            sx={{ textTransform: "none", color: BRAND.dark }}
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={confirmBulkInstall}
            disabled={!bulkDialog || bulkDialog.loading || bulkDialog.dispatching || !bulkDialog.plan || bulkDialog.plan.length === 0}
            startIcon={bulkDialog?.dispatching ? <CircularProgress size={14} sx={{ color: BRAND.surface }} /> : null}
            sx={{ textTransform: "none", bgcolor: BRAND.teal, "&:hover": { bgcolor: BRAND.tealHover } }}
          >
            Dispatch
          </Button>
        </DialogActions>
      </Dialog>

      <JobTracker
        jobs={activeJobs}
        onAllDone={handleAllJobsDone}
        onDismiss={dismissTracker}
        onNavigate={onNavigate}
      />
    </Box>
  );
}
