import * as React from "react";
import Grid from "@mui/material/Grid";
import {
  Alert,
  Box,
  Button,
  Chip,
  Collapse,
  Divider,
  MenuItem,
  Paper,
  TextField,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import RefreshControl from "../components/common/RefreshControl";
import PlayArrowOutlinedIcon from "@mui/icons-material/PlayArrowOutlined";
import RestartAltOutlinedIcon from "@mui/icons-material/RestartAltOutlined";
import CancelOutlinedIcon from "@mui/icons-material/CancelOutlined";
import ExpandMoreOutlinedIcon from "@mui/icons-material/ExpandMoreOutlined";
import ExpandLessOutlinedIcon from "@mui/icons-material/ExpandLessOutlined";
import TuneOutlinedIcon from "@mui/icons-material/TuneOutlined";
import LinkOutlinedIcon from "@mui/icons-material/LinkOutlined";
import DevicesOtherOutlinedIcon from "@mui/icons-material/DevicesOtherOutlined";
import AssignmentOutlinedIcon from "@mui/icons-material/AssignmentOutlined";
import HourglassBottomOutlinedIcon from "@mui/icons-material/HourglassBottomOutlined";
import TaskAltOutlinedIcon from "@mui/icons-material/TaskAltOutlined";
import SearchOutlinedIcon from "@mui/icons-material/SearchOutlined";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import AddCircleOutlineOutlinedIcon from "@mui/icons-material/AddCircleOutlineOutlined";
import { DataGrid } from "@mui/x-data-grid";
import { getJobsTimeseries } from "../api/overview";
import JobsTimeseriesChart from "../components/Overview/JobsTimeseriesChart";

// BRAND used to be duplicated here (Fase 1 homologation deleted it).
// Central source of truth lives in src/theme/brand.js; adding
// borderStrong/tealText/etc. there propagates automatically.
import { BRAND, DATAGRID_SX } from "../theme/brand";
import PageHeader from "../components/common/PageHeader";
import SectionPaper from "../components/common/SectionPaper";
import SummaryCard from "../components/common/SummaryCard";

import { useAuthContext } from "../auth/AuthContext";
import { useConfirm } from "../components/common/ConfirmDialog";
import BrandSnackbar from "../components/common/BrandSnackbar";
import {
  cancelJob,
  createDeviceJob,
  createTenantJobs,
  getJob,
  listJobTypes,
  listKnownDevices,
  listTenantJobs,
  retryJob,
} from "../api/jobs";
import { useCachedFetch } from "../hooks/useCachedFetch";
import { listAgentVersions } from "../api/binaries";
import { formatDate } from "../utils/format";
import { updateSearchParams } from "../utils/browserState";

const FACT_TYPE_OPTIONS = [
  { value: "inventory", label: "Inventory" },
  { value: "compliance", label: "Compliance" },
  { value: "patch", label: "Patch" },
  { value: "all", label: "All" },
];

const PATCH_INSTALL_MODE_OPTIONS = [
  { value: "install", label: "Install" },
  { value: "download", label: "Download Only" },
];

const TARGET_OPTIONS = [
  { value: "device", label: "Selected Device" },
  { value: "tenant", label: "All Connected Devices" },
];

// Agent update jobs carry only { version } in the payload. The agent
// receives the job and downloads the binary that matches ITS OWN
// platform/architecture, so the UI does not need to expose platform/arch
// selectors. What the UI DOES need is to query
// /binaries/agent/versions using the (platform, arch) pair of the
// SELECTED device, so the dropdown lists versions that actually exist
// for that host.
//
// Arch is reported by the agent (agent.arch in the facts payload) and
// surfaced by /known-devices. If the device is running a legacy agent
// that predates arch reporting, the backend tries to infer arch from
// the CPU brand in hardware_inventory; only if that also fails does
// `device.arch` stay null here.
//
// For macOS we keep a conservative heuristic: the supported floor is
// arm64 (Apple Silicon) since Intel Macs are effectively out of fleet,
// so defaulting to arm64 on a missing signal is empirically right.
//
// For Windows we deliberately do NOT default to x64. A silent default
// was the original bug on Surface/Copilot+ arm64 hosts — the dropdown
// listed x64 versions that don't exist in blob, or hid arm64 versions
// that do. When arch is unknown we return null and let the caller
// surface "device hasn't reported arch yet" in the UI.
const DEFAULT_VERSION_PLATFORM = "windows";
// Used only in tenant-fanout mode where each agent resolves its own
// arch at download time — the dropdown just needs to list something.
const DEFAULT_TENANT_FANOUT_ARCH = "x64";

function archForPlatform(platform) {
  if (platform === "macos") return "arm64";
  // windows / linux / unknown: no silent default — UI handles null.
  return null;
}

/**
 * Resolve (platform, arch) for the device a job is targeting. Prefers
 * the device-reported arch; falls back to the platform heuristic only
 * when the device hasn't reported one yet (legacy agent).
 *
 * Returns arch=null for Windows/Linux devices whose arch is still
 * unknown. Callers must handle that case explicitly — there's no
 * silent x64 fallback anymore.
 */
function resolveVersionFetchKey(device) {
  if (!device) {
    return { platform: DEFAULT_VERSION_PLATFORM, arch: null };
  }
  const platform = device.platform || DEFAULT_VERSION_PLATFORM;
  const arch = device.arch || archForPlatform(platform);
  return { platform, arch };
}

function DetailRow({ label, value, mono = false }) {
  return (
    <Box sx={{ display: "flex", gap: 1.5, alignItems: "baseline" }}>
      <Typography
        sx={{
          fontSize: 12,
          color: "text.secondary",
          fontWeight: 600,
          minWidth: 88,
          textTransform: "uppercase",
          letterSpacing: 0.3,
        }}
      >
        {label}
      </Typography>
      <Typography
        sx={{
          fontSize: 13,
          color: BRAND.dark,
          fontFamily: mono ? "monospace" : "inherit",
          wordBreak: "break-all",
          flex: 1,
        }}
      >
        {value}
      </Typography>
    </Box>
  );
}

/**
 * Horizontal-bar breakdown of Jobs by job_type within the same
 * windowDays the Jobs-by-status chart is using. Rendered with a
 * lightweight CSS bar (no recharts import bloat for a list of <10
 * short rows) — each row is {type, count}. The widest bar fills the
 * track; everything else scales proportionally so the user reads
 * ranking at a glance. Empty windows render an honest hint.
 */
function JobsByTypeCard({ windowDays, data, loading }) {
  const items = Array.isArray(data?.items) ? data.items : [];
  const total = Number(data?.total || 0);
  const max = items.reduce((acc, it) => Math.max(acc, Number(it.count || 0)), 0) || 1;

  return (
    <Paper
      elevation={0}
      sx={{
        p: 2,
        borderRadius: 2,
        border: `1px solid ${BRAND.border}`,
        height: "100%",
        display: "flex",
        flexDirection: "column",
        minWidth: 0,
      }}
    >
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 1,
          mb: 1,
        }}
      >
        <Typography variant="subtitle2" sx={{ color: BRAND.dark, fontWeight: 700 }}>
          Jobs by type — last {windowDays} day{Number(windowDays) === 1 ? "" : "s"}
        </Typography>
        <Chip
          size="small"
          label={`${total} job${total === 1 ? "" : "s"}`}
          sx={{
            height: 20,
            fontSize: 11,
            fontWeight: 700,
            bgcolor: BRAND.tealSoft,
            color: BRAND.tealText,
          }}
        />
      </Box>

      {loading && items.length === 0 ? (
        <Typography variant="caption" color="text.secondary">
          Loading…
        </Typography>
      ) : items.length === 0 ? (
        <Box
          sx={{
            flex: 1,
            minHeight: 160,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: BRAND.gray,
          }}
        >
          <Typography variant="caption">No jobs in window</Typography>
        </Box>
      ) : (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 0.75, mt: 0.5 }}>
          {items.map((row) => {
            const pct = Math.round((Number(row.count || 0) / max) * 100);
            return (
              <Box key={row.type} sx={{ display: "flex", flexDirection: "column", gap: 0.25 }}>
                <Box sx={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                  <Typography
                    sx={{
                      fontSize: 12,
                      fontWeight: 600,
                      color: BRAND.dark,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      pr: 1,
                    }}
                  >
                    {row.type}
                  </Typography>
                  <Typography
                    sx={{ fontSize: 12, fontWeight: 700, color: BRAND.teal, flexShrink: 0 }}
                  >
                    {row.count}
                  </Typography>
                </Box>
                <Box
                  sx={{
                    height: 6,
                    borderRadius: 3,
                    bgcolor: BRAND.darkSoft,
                    overflow: "hidden",
                  }}
                >
                  <Box
                    sx={{
                      width: `${pct}%`,
                      height: "100%",
                      bgcolor: BRAND.teal,
                      transition: "width 240ms ease",
                    }}
                  />
                </Box>
              </Box>
            );
          })}
        </Box>
      )}
    </Paper>
  );
}

function renderStatusChip(status) {
  const value = String(status || "").toLowerCase();

  if (value === "completed") {
    return (
      <Chip
        label="Completed"
        size="small"
        sx={{ bgcolor: BRAND.tealSoft, color: BRAND.tealText, fontWeight: 700, border: `1px solid ${BRAND.teal}55` }}
      />
    );
  }

  if (value === "running" || value === "sent") {
    return (
      <Chip
        label={value === "running" ? "Running" : "Sent"}
        size="small"
        sx={{ bgcolor: BRAND.cyanSoft, color: BRAND.dark, fontWeight: 700, border: `1px solid ${BRAND.cyan}88` }}
      />
    );
  }

  if (value === "pending" || value === "retrying") {
    return (
      <Chip
        label={value === "pending" ? "Pending" : "Retrying"}
        size="small"
        sx={{ bgcolor: "rgba(199,121,43,0.14)", color: "#8b5418", fontWeight: 700, border: "1px solid rgba(199,121,43,0.4)" }}
      />
    );
  }

  if (value === "failed" || value === "timeout" || value === "cancelled") {
    return (
      <Chip
        label={String(status || "Failed")}
        size="small"
        sx={{ bgcolor: BRAND.alert.errorSoft, color: BRAND.alert.error, fontWeight: 700, border: `1px solid ${BRAND.alert.error}55` }}
      />
    );
  }

  return (
    <Chip
      label={status || "Unknown"}
      size="small"
      sx={{ bgcolor: BRAND.darkSoft, color: BRAND.dark, fontWeight: 700 }}
    />
  );
}


function buildJobPayload(jobType, factType, version, patchMode, kbArticleIds) {
  if (jobType === "agent_update") {
    return { version: String(version || "").trim() };
  }

  if (jobType === "facts_snapshot") {
    return { factType };
  }

  if (jobType === "patch_scan") {
    return {};
  }

  if (jobType === "patch_install") {
    const normalizedKbArticleIds = String(kbArticleIds || "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);

    const payload = {
      mode: String(patchMode || "install").trim() || "install",
    };

    if (normalizedKbArticleIds.length > 0) {
      payload.kbArticleIds = normalizedKbArticleIds;
    }

    return payload;
  }

  return {};
}

function validateNumericField(value, { min, max, required = false }) {
  if (!String(value ?? "").trim()) {
    return required ? `Value must be between ${min} and ${max}` : null;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    return `Value must be between ${min} and ${max}`;
  }

  return null;
}

export default function Jobs() {
  const theme = useTheme();
  const isMdDown = useMediaQuery(theme.breakpoints.down("md"));
  const isSmDown = useMediaQuery(theme.breakpoints.down("sm"));
  const { auth } = useAuthContext();
  const confirm = useConfirm();

  const tenantId = auth?.tenantId;
  const tenantRole = String(auth?.tenantMember?.role || "");
  const isActiveMember = auth?.tenantMember?.isActive === true;
  const canManageJobs = isActiveMember && (tenantRole === "ADMIN" || tenantRole === "OWNER");

  // Jobs metadata (known devices + job types): a parameterless on-mount fetch,
  // routed through useCachedFetch for stale-while-revalidate + dedup +
  // last-known-good on a transient error. The three lists are derived from the
  // cached snapshot; the selection reconciliation loadMeta used to do inline
  // now lives in a dedicated effect (idempotent — keeps the current selection
  // when it's still valid).
  const {
    data: jobsMeta,
    loading: loadingMeta,
    refetch: reloadMeta,
  } = useCachedFetch(
    "jobs:meta:v1",
    async () => {
      const [knownResponse, typeResponse] = await Promise.all([
        listKnownDevices(),
        listJobTypes(),
      ]);
      const known = Array.isArray(knownResponse?.items)
        ? knownResponse.items
            .map((item) => ({
              deviceId: String(item?.deviceId || "").trim(),
              hostname:
                String(item?.hostname || "").trim() || String(item?.deviceId || "").trim(),
              connected: item?.connected === true,
              enrollmentStatus: item?.enrollmentStatus ?? null,
              agentVersion: item?.agentVersion ?? null,
              platform: item?.platform ?? null,
              arch: item?.arch ?? null,
              enrolledAt: item?.enrolledAt ?? null,
              lastSeenAt: item?.lastSeenAt ?? null,
              connectedAt: item?.connectedAt ?? null,
              updatedAt: item?.updatedAt ?? null,
            }))
            .filter((item) => item.deviceId)
        : [];
      const types = Array.isArray(typeResponse?.items) ? typeResponse.items : [];
      return { known, types };
    },
    { enabled: canManageJobs, staleMs: 60_000, storageMaxAgeMs: 10 * 60_000, revalidateOnMount: "stale" }
  );
  const knownDevices = React.useMemo(() => jobsMeta?.known ?? [], [jobsMeta]);
  const jobTypeOptions = React.useMemo(() => jobsMeta?.types ?? [], [jobsMeta]);
  const connectedDeviceIds = React.useMemo(
    () => knownDevices.filter((item) => item.connected).map((item) => item.deviceId),
    [knownDevices]
  );

  // Deep-link filters from other pages (Overview KPIs, Assets "view
  // jobs", JobTracker's "View in Jobs" arrow, etc). "in_flight" is a
  // virtual filter coming from the Overview's jobs KPI — we map it to
  // "running" since the Jobs page's status dropdown operates on single
  // values. Other unrecognized URL values fall through to "all" so a
  // typo doesn't silently hide every row.
  //
  // highlightJobId takes priority over any other filter: the whole
  // point is "here's the job you just dispatched," so status/type/
  // search are forced back to "all" rather than risking a stale filter
  // (left over from browsing this page earlier) hiding it.
  const initialFilters = React.useMemo(() => {
    if (typeof window === "undefined") return {};
    const params = new URLSearchParams(window.location.search);
    const rawStatus = (params.get("status") || "").toLowerCase();
    const rawSearch = params.get("search") || "";
    const highlightJobId = params.get("highlightJobId") || "";
    const statusMap = {
      in_flight: "running",
      pending: "pending",
      running: "running",
      sent: "sent",
      retrying: "retrying",
      completed: "completed",
      failed: "failed",
      timeout: "timeout",
      cancelled: "cancelled"
    };
    return {
      status: highlightJobId ? "all" : (statusMap[rawStatus] || "all"),
      search: highlightJobId ? "" : rawSearch.trim(),
      highlightJobId
    };
  }, []);

  const [tenantJobs, setTenantJobs] = React.useState([]);
  const [selectedDeviceId, setSelectedDeviceId] = React.useState("");
  const [selectedJobId, setSelectedJobId] = React.useState(initialFilters.highlightJobId || "");
  const [selectedJob, setSelectedJob] = React.useState(null);

  const [loadingJobs, setLoadingJobs] = React.useState(false);
  const [loadingJobDetail, setLoadingJobDetail] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [jobActionRunning, setJobActionRunning] = React.useState(false);
  const [refreshing, setRefreshing] = React.useState(false);

  const [jobType, setJobType] = React.useState("facts_snapshot");
  const [targetMode, setTargetMode] = React.useState("device");
  const [factType, setFactType] = React.useState("inventory");
  const [version, setVersion] = React.useState("");
  const [availableVersions, setAvailableVersions] = React.useState([]);
  const [loadingVersions, setLoadingVersions] = React.useState(false);
  const [versionsError, setVersionsError] = React.useState("");
  const [patchMode, setPatchMode] = React.useState("install");
  const [showAdvanced, setShowAdvanced] = React.useState(false);
  const [kbArticleIds, setKbArticleIds] = React.useState("");
  const [timeoutSeconds, setTimeoutSeconds] = React.useState("");
  const [maxAttempts, setMaxAttempts] = React.useState("");
  const [autoRefreshSeconds, setAutoRefreshSeconds] = React.useState("0");

  // Create-Job form is collapsed by default — it occupies ~600px of
  // vertical space that most visits don't need (the page's primary
  // job is reading Tenant Job History). The button toggle mirrors
  // the Audit-page filter pattern so the interaction feels familiar.
  const [createJobOpen, setCreateJobOpen] = React.useState(false);

  // Shared window-days state for the Jobs-by-status timeseries chart
  // AND the Jobs-by-type companion card. Lifting this to the page
  // level is what "connects" them — changing the window on the
  // chart automatically re-slices the type breakdown.
  const [chartWindowDays, setChartWindowDays] = React.useState(7);
  const [chartTimeseries, setChartTimeseries] = React.useState(null);
  const [chartLoading, setChartLoading] = React.useState(true);
  const [statusFilter, setStatusFilter] = React.useState(initialFilters.status || "all");
  const [jobTypeFilter, setJobTypeFilter] = React.useState("all");
  const [search, setSearch] = React.useState(initialFilters.search || "");
  // The just-dispatched job to flash once its row renders — cleared
  // after the animation plays so it never re-triggers on a later
  // re-render (filter change, refresh poll, etc).
  const [highlightRowId, setHighlightRowId] = React.useState(initialFilters.highlightJobId || "");

  const [snackbar, setSnackbar] = React.useState({
    open: false,
    message: "",
    severity: "success",
  });
  const deferredSearch = React.useDeferredValue(search);

  const loadTenantJobs = React.useCallback(async () => {
    if (!canManageJobs || !tenantId) return;

    try {
      setLoadingJobs(true);
      const response = await listTenantJobs(tenantId, { limit: 200 });
      const items = Array.isArray(response?.items) ? response.items : [];
      setTenantJobs(items);
      setSelectedJobId((current) => {
        if (current && items.some((item) => item.job_id === current)) return current;
        return items[0]?.job_id || "";
      });
    } catch (e) {
      console.error(e);
      setTenantJobs([]);
      setSelectedJobId("");
      setSnackbar({
        open: true,
        message: "Failed to load tenant jobs",
        severity: "error",
      });
    } finally {
      setLoadingJobs(false);
    }
  }, [canManageJobs, tenantId]);

  const loadJobDetail = React.useCallback(async (jobId) => {
    if (!canManageJobs || !jobId) {
      setSelectedJob(null);
      return;
    }

    try {
      setLoadingJobDetail(true);
      const response = await getJob(jobId);
      setSelectedJob(response?.job ?? null);
    } catch (e) {
      console.error(e);
      setSelectedJob(null);
      setSnackbar({
        open: true,
        message: "Failed to load job detail",
        severity: "error",
      });
    } finally {
      setLoadingJobDetail(false);
    }
  }, [canManageJobs]);

  // Reconcile the selected device / job type against the loaded metadata.
  // Idempotent: keeps the current selection when it's still valid, so it's
  // safe to re-run on every metadata revalidation. (Was inline in loadMeta.)
  React.useEffect(() => {
    if (!jobsMeta) return;
    const known = jobsMeta.known ?? [];
    const types = jobsMeta.types ?? [];
    const devices = known.filter((item) => item.connected).map((item) => item.deviceId);
    setSelectedDeviceId((current) => {
      if (current && known.some((item) => item.deviceId === current)) return current;
      return known[0]?.deviceId || devices[0] || "";
    });
    setJobType((current) => {
      if (current && types.some((item) => item.jobType === current)) return current;
      return types[0]?.jobType || "facts_snapshot";
    });
  }, [jobsMeta]);

  // Resolve the (platform, arch) pair to use when fetching agent versions.
  // - targetMode "device": use the selected device's platform when known;
  //   otherwise fall back to the windows/x64 defaults so the dropdown is
  //   never empty.
  // - targetMode "tenant": a tenant-wide agent_update fans out to every
  //   connected device regardless of platform; each agent downloads the
  //   binary for its own platform at apply time. We use the defaults to
  //   keep the dropdown deterministic.
  // We reuse the `selectedDevice` memo declared further below for the
  // detail panel; here we only need the platform/arch pair for the
  // version dropdown. Doing an inline find (rather than re-computing
  // via deviceMap) matches the original code path and avoids reordering
  // memos whose downstream consumers assume a specific declaration
  // order.
  const versionFetchDevice = React.useMemo(() => {
    if (targetMode !== "device") return null;
    return knownDevices.find((d) => d.deviceId === selectedDeviceId) ?? null;
  }, [targetMode, knownDevices, selectedDeviceId]);

  const { platform: versionFetchPlatform, arch: versionFetchArch } =
    resolveVersionFetchKey(versionFetchDevice);

  // In tenant-fanout mode we still need SOME arch to list versions —
  // the fan-out itself is arch-agnostic (each agent resolves its own
  // binary at apply time), so picking a common default keeps the
  // dropdown non-empty without misleading the operator about any
  // specific device. For targeted `device` mode we respect
  // resolveVersionFetchKey's null and surface that to the UI.
  const effectiveArch =
    versionFetchArch ??
    (targetMode === "tenant" ? DEFAULT_TENANT_FANOUT_ARCH : null);

  React.useEffect(() => {
    if (jobType !== "agent_update" || !canManageJobs) {
      return;
    }

    // No arch yet — don't call the versions endpoint with a made-up
    // value. The helperText below explains the state to the user.
    if (!effectiveArch) {
      setAvailableVersions([]);
      setVersion("");
      setVersionsError(
        "Device hasn't reported its CPU architecture yet. It will appear on the next facts ingest (usually minutes). Pick a device whose arch is already known, or wait for the next tick."
      );
      setLoadingVersions(false);
      return;
    }

    let cancelled = false;
    setLoadingVersions(true);
    setVersionsError("");

    listAgentVersions({
      platform: versionFetchPlatform,
      arch: effectiveArch,
    })
      .then((response) => {
        if (cancelled) return;
        const versions = Array.isArray(response?.versions) ? response.versions : [];
        setAvailableVersions(versions);
        setVersion((current) => {
          if (current && versions.includes(current)) return current;
          return response?.latestVersion || versions[0] || "";
        });
      })
      .catch((err) => {
        if (cancelled) return;
        console.error(err);
        setAvailableVersions([]);
        setVersion("");
        setVersionsError(`No versions available for ${versionFetchPlatform}/${effectiveArch}`);
      })
      .finally(() => {
        if (!cancelled) setLoadingVersions(false);
      });

    return () => {
      cancelled = true;
    };
  }, [jobType, canManageJobs, versionFetchPlatform, effectiveArch]);

  React.useEffect(() => {
    loadTenantJobs();
  }, [loadTenantJobs]);

  React.useEffect(() => {
    loadJobDetail(selectedJobId);
  }, [selectedJobId, loadJobDetail]);

  // Deep-link flash: if we landed here via JobTracker's "View in Jobs"
  // arrow, scroll the Tenant Job History panel into view, let the CSS
  // pulse (see the DataGrid's getRowClassName below) play, then clear
  // both the URL param and the highlight state so a later refresh
  // doesn't replay it on an unrelated row.
  React.useEffect(() => {
    if (!highlightRowId) return;
    const scrollTimer = setTimeout(() => {
      document.getElementById("tenant-job-history-panel")?.scrollIntoView({
        behavior: "smooth",
        block: "start"
      });
    }, 150);
    updateSearchParams({ highlightJobId: null });
    const clearTimer = setTimeout(() => setHighlightRowId(""), 2600);
    return () => {
      clearTimeout(scrollTimer);
      clearTimeout(clearTimer);
    };
    // Intentionally mount-only — this is a one-shot "just arrived"
    // flash, not a live sync with highlightRowId's later value.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fetch the Jobs-by-status timeseries whenever the window toggle
  // changes. The response drops into `chartTimeseries` wrapped as a
  // Promise.allSettled-shaped object so it can be handed to the
  // shared JobsTimeseriesChart without modification.
  React.useEffect(() => {
    if (!canManageJobs) return;
    let cancelled = false;
    setChartLoading(true);
    getJobsTimeseries(chartWindowDays)
      .then((value) => {
        if (!cancelled) setChartTimeseries({ status: "fulfilled", value });
      })
      .catch((err) => {
        if (!cancelled) setChartTimeseries({ status: "rejected", reason: err });
      })
      .finally(() => {
        if (!cancelled) setChartLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [canManageJobs, chartWindowDays]);

  const deviceMap = React.useMemo(
    () => new Map(knownDevices.map((item) => [item.deviceId, item])),
    [knownDevices]
  );

  const selectedDevice = selectedDeviceId ? deviceMap.get(selectedDeviceId) || null : null;

  const filteredRows = React.useMemo(() => {
    const q = deferredSearch.trim().toLowerCase();

    return tenantJobs.filter((row) => {
      const device = deviceMap.get(String(row.device_id || ""));
      const hostname = String(device?.hostname || "").toLowerCase();
      const matchesStatus =
        statusFilter === "all" || String(row.status || "").toLowerCase() === statusFilter;
      const matchesJobType =
        jobTypeFilter === "all" || String(row.job_type || "").toLowerCase() === jobTypeFilter;
      const matchesSearch =
        !q ||
        String(row.job_id || "").toLowerCase().includes(q) ||
        String(row.device_id || "").toLowerCase().includes(q) ||
        hostname.includes(q) ||
        String(row.job_type || "").toLowerCase().includes(q) ||
        String(row.last_error || "").toLowerCase().includes(q);

      return matchesStatus && matchesJobType && matchesSearch;
    });
  }, [tenantJobs, deviceMap, deferredSearch, statusFilter, jobTypeFilter]);

  const summary = React.useMemo(() => {
    const total = tenantJobs.length;
    const pending = tenantJobs.filter((job) =>
      ["pending", "retrying", "sent", "running"].includes(String(job.status || "").toLowerCase())
    ).length;
    const completed = tenantJobs.filter(
      (job) => String(job.status || "").toLowerCase() === "completed"
    ).length;

    return {
      connectedDevices: connectedDeviceIds.length,
      knownDevices: knownDevices.length,
      total,
      pending,
      completed,
    };
  }, [connectedDeviceIds.length, knownDevices.length, tenantJobs]);

  const columnVisibilityModel = React.useMemo(() => {
    if (isSmDown) {
      return {
        attempts: false,
        sent_at: false,
        completed_at: false,
        created_by: false,
        last_error: false,
      };
    }

    if (isMdDown) {
      return {
        created_by: false,
      };
    }

    return {};
  }, [isMdDown, isSmDown]);

  // Group tenantJobs by job_type within the same rolling window that
  // drives the timeseries chart. This is the "connected" part of the
  // user ask — changing the window toggle on the chart immediately
  // re-slices this breakdown because both reads share
  // `chartWindowDays`. We deliberately derive from the full
  // `tenantJobs` list (already loaded, capped server-side) instead of
  // adding a second API endpoint: counts match what the user sees in
  // the table, and an empty window renders an honest "no jobs".
  const jobsByType = React.useMemo(() => {
    const cutoffMs = Date.now() - Number(chartWindowDays) * 86_400_000;
    const bucketsByType = new Map();
    let total = 0;
    for (const row of tenantJobs) {
      const created = row?.created_at ? new Date(row.created_at).getTime() : 0;
      if (!created || created < cutoffMs) continue;
      const type = String(row?.job_type || "unknown");
      bucketsByType.set(type, (bucketsByType.get(type) || 0) + 1);
      total += 1;
    }
    const items = Array.from(bucketsByType.entries())
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count);
    return { items, total };
  }, [tenantJobs, chartWindowDays]);

  const columns = [
    { field: "job_id", headerName: "Job ID", minWidth: 210, flex: 1 },
    {
      field: "hostname",
      headerName: "Hostname",
      minWidth: 180,
      flex: 0.8,
      valueGetter: (_value, row) => deviceMap.get(String(row.device_id || ""))?.hostname || row.device_id,
    },
    // Device ID column dropped — the hostname column already
    // identifies the target, and the full UUID is still available in
    // the detail drawer for anyone who needs it for logs / support.
    { field: "job_type", headerName: "Type", minWidth: 130, flex: 0.6 },
    {
      field: "status",
      headerName: "Status",
      minWidth: 120,
      flex: 0.55,
      renderCell: (params) => renderStatusChip(params.value),
    },
    { field: "attempts", headerName: "Attempts", minWidth: 90, flex: 0.35 },
    {
      field: "created_at",
      headerName: "Created At",
      minWidth: 150,
      flex: 0.6,
      renderCell: (params) => formatDate(params.value),
    },
    {
      field: "completed_at",
      headerName: "Completed At",
      minWidth: 150,
      flex: 0.6,
      renderCell: (params) => formatDate(params.value),
    },
    {
      // Backend LEFT JOIN's TenantMember on the sub so we can show the
      // operator email instead of a raw Auth0 subject like
      // `auth0|abc123`. Falls back to the sub when no membership row
      // matches (e.g. old rows, deleted users) so we never show "—"
      // in place of identifiable info.
      field: "created_by",
      headerName: "Created By",
      minWidth: 200,
      flex: 0.9,
      valueGetter: (_value, row) =>
        row.created_by_email || row.created_by || " - ",
    },
    {
      field: "last_error",
      headerName: "Last Error",
      minWidth: 220,
      flex: 1,
      valueGetter: (_value, row) => row.last_error || " - ",
    },
  ];

  const selectedJobStatus = String(selectedJob?.status || "").toLowerCase();
  const canRetrySelectedJob = ["failed", "timeout", "cancelled"].includes(selectedJobStatus);
  const canCancelSelectedJob = ["pending", "retrying", "sent", "running"].includes(selectedJobStatus);

  const refreshAll = React.useCallback(async () => {
    try {
      setRefreshing(true);
      await Promise.all([
        reloadMeta(),
        loadTenantJobs(),
        selectedJobId ? loadJobDetail(selectedJobId) : Promise.resolve(),
      ]);
    } finally {
      setRefreshing(false);
    }
  }, [loadJobDetail, reloadMeta, loadTenantJobs, selectedJobId]);

  React.useEffect(() => {
    const intervalSeconds = Number(autoRefreshSeconds || 0);
    if (!canManageJobs || intervalSeconds <= 0) {
      return undefined;
    }

    const timer = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      if (submitting || jobActionRunning) return;
      refreshAll();
    }, intervalSeconds * 1000);

    return () => window.clearInterval(timer);
  }, [autoRefreshSeconds, canManageJobs, jobActionRunning, refreshAll, submitting]);

  const handleSubmit = async () => {
    if (!canManageJobs) return;

    const timeoutError = validateNumericField(timeoutSeconds, { min: 30, max: 86400 });
    if (timeoutError) {
      setSnackbar({
        open: true,
        message: `Timeout seconds: ${timeoutError}`,
        severity: "error",
      });
      return;
    }

    const maxAttemptsError = validateNumericField(maxAttempts, { min: 1, max: 10 });
    if (maxAttemptsError) {
      setSnackbar({
        open: true,
        message: `Max attempts: ${maxAttemptsError}`,
        severity: "error",
      });
      return;
    }

    const payload = {
      jobType,
      payload: buildJobPayload(jobType, factType, version, patchMode, kbArticleIds),
      timeoutSeconds: timeoutSeconds ? Number(timeoutSeconds) : undefined,
      maxAttempts: maxAttempts ? Number(maxAttempts) : undefined,
    };

    if (jobType === "agent_update" && !String(version || "").trim()) {
      setSnackbar({
        open: true,
        message: "Version is required for agent update jobs",
        severity: "error",
      });
      return;
    }

    if (jobType === "patch_install") {
      const normalizedMode = String(patchMode || "").trim();
      if (!PATCH_INSTALL_MODE_OPTIONS.some((opt) => opt.value === normalizedMode)) {
        setSnackbar({
          open: true,
          message: "Patch install mode must be install or download",
          severity: "error",
        });
        return;
      }
    }

    if (targetMode === "device" && !selectedDeviceId) {
      setSnackbar({
        open: true,
        message: "Select a device first",
        severity: "error",
      });
      return;
    }

    if (targetMode === "tenant" && (!tenantId || connectedDeviceIds.length === 0)) {
      setSnackbar({
        open: true,
        message: "No connected devices available for tenant dispatch",
        severity: "error",
      });
      return;
    }

    const dispatchDescription =
      targetMode === "tenant"
        ? `${connectedDeviceIds.length} connected devices`
        : `${selectedDevice?.hostname || selectedDeviceId} (${selectedDeviceId})${selectedDevice?.connected ? "" : " [offline]"}`;
    const confirmed = await confirm({
      title: `Dispatch ${jobType}?`,
      body: `The job will be queued for ${dispatchDescription}.`,
      confirmText: "Dispatch",
    });
    if (!confirmed) return;

    try {
      setSubmitting(true);

      if (targetMode === "tenant") {
        const response = await createTenantJobs(tenantId, {
          deviceIds: connectedDeviceIds,
          ...payload,
        });

        setSnackbar({
          open: true,
          message: `Tenant job queued for ${response?.created?.count ?? connectedDeviceIds.length} devices`,
          severity: "success",
        });
      } else {
        const response = await createDeviceJob(selectedDeviceId, payload);
        setSelectedJobId(response?.jobId || "");
        setSnackbar({
          open: true,
          message: selectedDevice?.connected
            ? `Job queued successfully (${response?.jobId || "created"})`
            : `Job queued offline for ${selectedDevice?.hostname || selectedDeviceId} (${response?.jobId || "created"})`,
          severity: "success",
        });
      }

      await loadTenantJobs();
    } catch (e) {
      console.error(e);
      setSnackbar({
        open: true,
        message: "Failed to create job",
        severity: "error",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleRetry = async () => {
    if (!selectedJobId) return;
    if (!canRetrySelectedJob) return;

    const confirmed = await confirm({
      title: "Retry this job?",
      body: `Job ${selectedJobId} will be moved back to pending and re-dispatched on the next scheduler tick.`,
      confirmText: "Retry",
    });
    if (!confirmed) return;

    try {
      setJobActionRunning(true);
      await retryJob(selectedJobId);
      setSnackbar({
        open: true,
        message: "Job moved back to pending",
        severity: "success",
      });
      await loadTenantJobs();
      await loadJobDetail(selectedJobId);
    } catch (e) {
      console.error(e);
      setSnackbar({
        open: true,
        message: "Failed to retry job",
        severity: "error",
      });
    } finally {
      setJobActionRunning(false);
    }
  };

  const handleCancel = async () => {
    if (!selectedJobId) return;
    if (!canCancelSelectedJob) return;

    const confirmed = await confirm({
      title: "Cancel this job?",
      body: `Job ${selectedJobId} will be marked cancelled and won't be dispatched. In-flight executions on the device side may still complete.`,
      confirmText: "Cancel job",
      cancelText: "Keep job",
      danger: true,
    });
    if (!confirmed) return;

    try {
      setJobActionRunning(true);
      await cancelJob(selectedJobId);
      setSnackbar({
        open: true,
        message: "Job cancelled",
        severity: "success",
      });
      await loadTenantJobs();
      await loadJobDetail(selectedJobId);
    } catch (e) {
      console.error(e);
      setSnackbar({
        open: true,
        message: "Failed to cancel job",
        severity: "error",
      });
    } finally {
      setJobActionRunning(false);
    }
  };

  if (!canManageJobs) {
    return (
      <Box sx={{ px: { xs: 2, sm: 0.5 }, py: { xs: 2, sm: 0.5 } }}>
        <Alert severity="warning" sx={{ mb: 2, borderRadius: 3 }}>
          Jobs management is restricted to active tenant admins and owners.
        </Alert>
      </Box>
    );
  }

  return (
    <Box sx={{ px: { xs: 2, sm: 0.5 }, py: { xs: 2, sm: 0.5 } }}>
      <PageHeader
        title="Jobs"
        subtitle="Dispatch jobs and review tenant-wide execution history."
        icon={<AssignmentOutlinedIcon />}
        actions={
          <RefreshControl
            refreshSeconds={autoRefreshSeconds}
            onRefreshSecondsChange={setAutoRefreshSeconds}
            onRefresh={refreshAll}
            loading={refreshing}
          />
        }
      />

      <Box sx={{ mb: 2 }}>
        <Grid container spacing={2} alignItems="stretch">
          <Grid size={{ xs: 12, sm: 6, md: 2.4 }}>
            <SummaryCard
              title="Connected"
              value={summary.connectedDevices}
              icon={<LinkOutlinedIcon />}
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 2.4 }}>
            <SummaryCard
              title="Known Devices"
              value={summary.knownDevices}
              icon={<DevicesOtherOutlinedIcon />}
              accent={BRAND.dark}
              tint={BRAND.darkSoft}
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 2.4 }}>
            <SummaryCard
              title="Total Jobs"
              value={summary.total}
              icon={<AssignmentOutlinedIcon />}
              accent={BRAND.dark}
              tint={BRAND.cyanSoft}
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 2.4 }}>
            <SummaryCard
              title="Pending / Running"
              value={summary.pending}
              icon={<HourglassBottomOutlinedIcon />}
              accent="#8b5418"
              tint="rgba(199,121,43,0.14)"
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 2.4 }}>
            <SummaryCard
              title="Completed"
              value={summary.completed}
              icon={<TaskAltOutlinedIcon />}
              accent={BRAND.tealText}
              tint={BRAND.tealSoft}
            />
          </Grid>
        </Grid>
      </Box>

      {/* Jobs by status (timeseries) + Jobs by type (breakdown).
          The two share `chartWindowDays`; the chart's window toggle
          re-slices both cards in lock-step. Laid out 8/4 so the
          chart gets enough horizontal room to read the lines clearly
          on md+ screens. */}
      <Grid container spacing={2} sx={{ mb: 2 }} alignItems="stretch">
        <Grid size={{ xs: 12, md: 8 }}>
          <JobsTimeseriesChart
            result={chartTimeseries}
            loading={chartLoading}
            windowDays={chartWindowDays}
            onWindowDaysChange={setChartWindowDays}
          />
        </Grid>
        <Grid size={{ xs: 12, md: 4 }}>
          <JobsByTypeCard
            windowDays={chartWindowDays}
            data={jobsByType}
            loading={chartLoading || loadingJobs}
          />
        </Grid>
      </Grid>

      <SectionPaper variant="panel" sx={{ p: { xs: 1.5, sm: 2.5 }, mb: 2 }}>
        {/* Header row: title + collapse toggle. Create Job opens as a
            full form on demand — most visits read Tenant Job History
            and don't need to see the ~600px-tall form by default. */}
        <Box
          sx={{
            display: "flex",
            alignItems: { xs: "flex-start", sm: "center" },
            justifyContent: "space-between",
            gap: 1.5,
            flexWrap: "wrap",
            mb: createJobOpen ? 2 : 0,
          }}
        >
          <Box>
            <Typography sx={{ fontSize: 18, fontWeight: 800, color: BRAND.dark, mb: 0.25 }}>
              Create Job
            </Typography>
            <Typography sx={{ fontSize: 13, color: "text.secondary" }}>
              Dispatch a job to a single device or to every connected device in the tenant.
            </Typography>
          </Box>
          <Button
            variant={createJobOpen ? "outlined" : "contained"}
            onClick={() => setCreateJobOpen((v) => !v)}
            startIcon={createJobOpen ? null : <AddCircleOutlineOutlinedIcon />}
            endIcon={createJobOpen ? <ExpandLessOutlinedIcon /> : <ExpandMoreOutlinedIcon />}
            sx={{
              textTransform: "none",
              fontWeight: 700,
              ...(createJobOpen
                ? {
                    borderColor: BRAND.teal,
                    color: BRAND.teal,
                    "&:hover": { borderColor: BRAND.tealHover, bgcolor: BRAND.tealSoft },
                  }
                : {
                    bgcolor: BRAND.teal,
                    color: "#fff",
                    "&:hover": { bgcolor: BRAND.tealHover },
                  }),
            }}
          >
            {createJobOpen ? "Hide form" : "New job"}
          </Button>
        </Box>

        <Collapse in={createJobOpen} timeout="auto" unmountOnExit>

        {/* ── Destination ──────────────────────────────────────────── */}
        <Typography
          variant="overline"
          sx={{ color: BRAND.teal, fontWeight: 800, letterSpacing: 1.2 }}
        >
          Destination
        </Typography>
        <Box
          sx={{
            mt: 1,
            display: "grid",
            gap: 2,
            gridTemplateColumns: {
              xs: "1fr",
              sm: targetMode === "device" ? "1fr 2fr" : "1fr",
            },
          }}
        >
          <TextField
            select
            label="Target"
            size="small"
            value={targetMode}
            onChange={(e) => setTargetMode(e.target.value)}
            disabled={loadingMeta}
            fullWidth
          >
            {TARGET_OPTIONS.map((opt) => (
              <MenuItem key={opt.value} value={opt.value}>
                {opt.label}
              </MenuItem>
            ))}
          </TextField>

          {targetMode === "device" ? (
            <TextField
              select
              label="Device"
              size="small"
              value={selectedDeviceId}
              onChange={(e) => setSelectedDeviceId(e.target.value)}
              disabled={loadingMeta}
              helperText={
                selectedDevice
                  ? `${selectedDevice.connected ? "Connected" : "Offline"} · agent ${selectedDevice.agentVersion || "unknown"} · ${connectedDeviceIds.length}/${knownDevices.length} online`
                  : `${connectedDeviceIds.length}/${knownDevices.length} online`
              }
              fullWidth
            >
              {knownDevices.length === 0 ? (
                <MenuItem value="">No known devices</MenuItem>
              ) : (
                // Show hostname only — the connected/offline badge and
                // agent version live in the helperText below the
                // dropdown, and the device id is available on the row
                // once selected. Keeping the MenuItem label to a single
                // token makes scanning the list much faster for
                // operators with fleets of dozens of devices.
                knownDevices.map((device) => (
                  <MenuItem key={device.deviceId} value={device.deviceId}>
                    {device.hostname || device.deviceId}
                  </MenuItem>
                ))
              )}
            </TextField>
          ) : (
            <Alert
              severity="info"
              variant="outlined"
              sx={{ borderRadius: 2, alignItems: "center", py: 0.25 }}
            >
              This job will be dispatched to all{" "}
              <strong>{connectedDeviceIds.length}</strong> currently connected devices in the tenant.
            </Alert>
          )}
        </Box>

        <Divider sx={{ my: 2.5, borderColor: BRAND.border }} />

        {/* ── Job ──────────────────────────────────────────────────── */}
        <Typography
          variant="overline"
          sx={{ color: BRAND.teal, fontWeight: 800, letterSpacing: 1.2 }}
        >
          Job
        </Typography>
        <Box
          sx={{
            mt: 1,
            display: "grid",
            gap: 2,
            gridTemplateColumns: {
              xs: "1fr",
              sm: "1fr 1fr",
            },
          }}
        >
          <TextField
            select
            label="Job Type"
            size="small"
            value={jobType}
            onChange={(e) => setJobType(e.target.value)}
            disabled={loadingMeta}
            fullWidth
          >
            {jobTypeOptions.map((opt) => (
              <MenuItem key={opt.jobType} value={opt.jobType}>
                {opt.label}
              </MenuItem>
            ))}
          </TextField>

          {jobType === "facts_snapshot" ? (
            <TextField
              select
              label="Facts Scope"
              size="small"
              value={factType}
              onChange={(e) => setFactType(e.target.value)}
              fullWidth
            >
              {FACT_TYPE_OPTIONS.map((opt) => (
                <MenuItem key={opt.value} value={opt.value}>
                  {opt.label}
                </MenuItem>
              ))}
            </TextField>
          ) : jobType === "agent_update" ? (
            <TextField
              select
              label="Target Version"
              size="small"
              value={version}
              onChange={(e) => setVersion(e.target.value)}
              disabled={loadingVersions || availableVersions.length === 0}
              error={Boolean(versionsError)}
              helperText={
                loadingVersions
                  ? "Loading versions…"
                  : versionsError
                  ? versionsError
                  : `Versions available for ${versionFetchPlatform}/${effectiveArch}. Each agent downloads the binary matching its own platform.`
              }
              fullWidth
            >
              {availableVersions.length === 0 ? (
                <MenuItem value="">No versions available</MenuItem>
              ) : (
                availableVersions.map((v) => (
                  <MenuItem key={v} value={v}>
                    {v}
                  </MenuItem>
                ))
              )}
            </TextField>
          ) : jobType === "patch_install" ? (
            <TextField
              select
              label="Patch Mode"
              size="small"
              value={patchMode}
              onChange={(e) => setPatchMode(e.target.value)}
              fullWidth
            >
              {PATCH_INSTALL_MODE_OPTIONS.map((opt) => (
                <MenuItem key={opt.value} value={opt.value}>
                  {opt.label}
                </MenuItem>
              ))}
            </TextField>
          ) : (
            <TextField
              label="Execution"
              size="small"
              value="Patch scan will collect current patch state"
              InputProps={{ readOnly: true }}
              fullWidth
            />
          )}

          {jobType === "patch_install" ? (
            <TextField
              label="KB Article IDs"
              size="small"
              value={kbArticleIds}
              onChange={(e) => setKbArticleIds(e.target.value)}
              placeholder="KB5034123, KB5034439"
              helperText="Optional. Leave empty to let the agent decide the applicable patch set."
              fullWidth
              sx={{ gridColumn: { sm: "1 / -1" } }}
            />
          ) : null}
        </Box>

        {/* ── Advanced (collapsible) ────────────────────────────────── */}
        <Collapse in={showAdvanced} unmountOnExit>
          <Divider sx={{ my: 2.5, borderColor: BRAND.border }} />
          <Typography
            variant="overline"
            sx={{ color: BRAND.teal, fontWeight: 800, letterSpacing: 1.2 }}
          >
            Advanced
          </Typography>
          <Box
            sx={{
              mt: 1,
              display: "grid",
              gap: 2,
              gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" },
            }}
          >
            <TextField
              label="Timeout (seconds)"
              size="small"
              type="number"
              value={timeoutSeconds}
              onChange={(e) => setTimeoutSeconds(e.target.value)}
              helperText="30 – 86400. Leave empty for default."
              fullWidth
            />
            <TextField
              label="Max Attempts"
              size="small"
              type="number"
              value={maxAttempts}
              onChange={(e) => setMaxAttempts(e.target.value)}
              helperText="1 – 10. Leave empty for default."
              fullWidth
            />
          </Box>
        </Collapse>

        {/* ── Footer actions ────────────────────────────────────────── */}
        <Box
          sx={{
            mt: 2.5,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 2,
            flexWrap: "wrap",
          }}
        >
          <Button
            size="small"
            onClick={() => setShowAdvanced((v) => !v)}
            startIcon={<TuneOutlinedIcon />}
            endIcon={showAdvanced ? <ExpandLessOutlinedIcon /> : <ExpandMoreOutlinedIcon />}
            sx={{ textTransform: "none", color: BRAND.dark, fontWeight: 600 }}
          >
            {showAdvanced ? "Hide advanced" : "Advanced options"}
          </Button>

          <Button
            variant="contained"
            startIcon={<PlayArrowOutlinedIcon />}
            onClick={handleSubmit}
            disabled={submitting || loadingMeta}
            sx={{
              bgcolor: BRAND.teal,
              color: "#fff",
              fontWeight: 700,
              textTransform: "none",
              minWidth: 170,
              boxShadow: "0 4px 14px rgba(90,159,159,0.35)",
              "&:hover": { bgcolor: BRAND.tealHover, boxShadow: "0 6px 18px rgba(90,159,159,0.45)" },
            }}
          >
            Dispatch Job
          </Button>
        </Box>

        </Collapse>
      </SectionPaper>

      <Grid container spacing={2} alignItems="stretch">
        <Grid size={{ xs: 12, lg: 8 }}>
          <SectionPaper id="tenant-job-history-panel" variant="panel" sx={{ p: { xs: 1.5, sm: 2 } }}>
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 2,
                mb: 1.5,
                flexWrap: "wrap",
              }}
            >
              <Typography sx={{ fontSize: 16, fontWeight: 800, color: BRAND.dark }}>
                Tenant Job History
              </Typography>
              <Typography sx={{ fontSize: 12, color: "text.secondary" }}>
                Showing <strong>{filteredRows.length}</strong> of {tenantJobs.length} jobs
              </Typography>
            </Box>

            <Box
              sx={{
                display: "grid",
                gap: 1.5,
                mb: 1.5,
                gridTemplateColumns: {
                  xs: "1fr",
                  sm: "2fr 1fr 1fr",
                },
              }}
            >
              <TextField
                label="Search"
                size="small"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Job id, hostname, device, type, error…"
                InputProps={{
                  startAdornment: (
                    <SearchOutlinedIcon fontSize="small" sx={{ color: BRAND.gray, mr: 1 }} />
                  ),
                }}
                fullWidth
              />
              <TextField
                select
                label="Status"
                size="small"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                fullWidth
              >
                <MenuItem value="all">All statuses</MenuItem>
                <MenuItem value="pending">Pending</MenuItem>
                <MenuItem value="retrying">Retrying</MenuItem>
                <MenuItem value="sent">Sent</MenuItem>
                <MenuItem value="running">Running</MenuItem>
                <MenuItem value="completed">Completed</MenuItem>
                <MenuItem value="failed">Failed</MenuItem>
                <MenuItem value="timeout">Timeout</MenuItem>
                <MenuItem value="cancelled">Cancelled</MenuItem>
              </TextField>
              <TextField
                select
                label="Job Type"
                size="small"
                value={jobTypeFilter}
                onChange={(e) => setJobTypeFilter(e.target.value)}
                fullWidth
              >
                <MenuItem value="all">All types</MenuItem>
                {jobTypeOptions.map((opt) => (
                  <MenuItem key={opt.jobType} value={opt.jobType}>
                    {opt.label}
                  </MenuItem>
                ))}
              </TextField>
            </Box>

            <DataGrid
              autoHeight
              disableRowSelectionOnClick
              rows={filteredRows}
              columns={columns}
              loading={loadingJobs}
              getRowId={(row) => row.job_id}
              // Row-level pulse for the job we just arrived to highlight
              // (see the mount effect above) — plays twice then the
              // class stops being applied once highlightRowId clears.
              getRowClassName={(params) =>
                params.row.job_id === highlightRowId ? "tracenium-job-flash-row" : ""
              }
              onRowClick={(params) => setSelectedJobId(params.row.job_id)}
              pageSizeOptions={[10, 25, 50]}
              initialState={{
                pagination: {
                  // A fresh deep-linked job is virtually always the most
                  // recent row (default sort is newest-first), but a
                  // bigger first page removes any doubt it's visible
                  // without the operator having to page through.
                  paginationModel: { pageSize: initialFilters.highlightJobId ? 50 : 10, page: 0 },
                },
              }}
              columnVisibilityModel={columnVisibilityModel}
              sx={{
                ...DATAGRID_SX,
                "@keyframes traceniumJobFlash": {
                  "0%, 100%": { backgroundColor: "transparent" },
                  "25%, 75%": { backgroundColor: BRAND.tealSoft }
                },
                "& .tracenium-job-flash-row": {
                  animation: "traceniumJobFlash 1.2s ease-in-out 2"
                }
              }}
            />
          </SectionPaper>
        </Grid>

        <Grid size={{ xs: 12, lg: 4 }}>
          <SectionPaper
            variant="panel"
            sx={{ p: 2, height: "100%", display: "flex", flexDirection: "column" }}
          >
            <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 1.5 }}>
              <Typography sx={{ fontSize: 18, fontWeight: 800, color: BRAND.dark }}>
                Job Detail
              </Typography>
              {selectedJob ? renderStatusChip(selectedJob.status) : null}
            </Box>

            {!selectedJobId ? (
              <Box
                sx={{
                  flex: 1,
                  display: "grid",
                  placeItems: "center",
                  textAlign: "center",
                  color: "text.secondary",
                  p: 3,
                  border: `1px dashed ${BRAND.border}`,
                  borderRadius: 2,
                  bgcolor: BRAND.darkSoft,
                }}
              >
                <Box>
                  <InfoOutlinedIcon sx={{ fontSize: 36, color: BRAND.gray, mb: 1 }} />
                  <Typography variant="body2">Select a job from the table to see its details.</Typography>
                </Box>
              </Box>
            ) : loadingJobDetail ? (
              <Typography color="text.secondary">Loading job detail…</Typography>
            ) : !selectedJob ? (
              <Typography color="text.secondary">Job detail unavailable.</Typography>
            ) : (
              <Box sx={{ display: "flex", flexDirection: "column", gap: 1.75, flex: 1 }}>
                {/* Identity */}
                <Box>
                  <Typography variant="overline" sx={{ color: BRAND.teal, fontWeight: 800, letterSpacing: 1.2 }}>
                    Identity
                  </Typography>
                  <Box sx={{ mt: 0.5, display: "grid", gap: 0.5 }}>
                    <DetailRow label="Job ID" value={selectedJob.job_id} mono />
                    <DetailRow
                      label="Hostname"
                      value={deviceMap.get(String(selectedJob.device_id || ""))?.hostname || "—"}
                    />
                    <DetailRow label="Device" value={selectedJob.device_id} mono />
                    <DetailRow label="Type" value={selectedJob.job_type} />
                    <DetailRow label="Attempts" value={String(selectedJob.attempts ?? 0)} />
                    <DetailRow label="Created By" value={selectedJob.created_by || "—"} />
                    <DetailRow label="Trace ID" value={selectedJob.trace_id || "—"} mono />
                  </Box>
                </Box>

                <Divider sx={{ borderColor: BRAND.border }} />

                {/* Timeline */}
                <Box>
                  <Typography variant="overline" sx={{ color: BRAND.teal, fontWeight: 800, letterSpacing: 1.2 }}>
                    Timeline
                  </Typography>
                  <Box sx={{ mt: 0.5, display: "grid", gap: 0.5 }}>
                    <DetailRow label="Created" value={formatDate(selectedJob.created_at)} />
                    <DetailRow label="Sent" value={formatDate(selectedJob.sent_at)} />
                    <DetailRow label="Completed" value={formatDate(selectedJob.completed_at)} />
                  </Box>
                </Box>

                {/* Error (if any) */}
                {selectedJob.last_error ? (
                  <>
                    <Divider sx={{ borderColor: BRAND.border }} />
                    <Box>
                      <Typography variant="overline" sx={{ color: BRAND.alert.error, fontWeight: 800, letterSpacing: 1.2 }}>
                        Last Error
                      </Typography>
                      <Paper
                        variant="outlined"
                        sx={{
                          mt: 0.5,
                          p: 1.25,
                          borderColor: `${BRAND.alert.error}55`,
                          bgcolor: BRAND.alert.errorSoft,
                          color: BRAND.alert.error,
                          fontSize: 13,
                          fontFamily: "monospace",
                          whiteSpace: "pre-wrap",
                          wordBreak: "break-word",
                        }}
                      >
                        {selectedJob.last_error}
                      </Paper>
                    </Box>
                  </>
                ) : null}

                <Divider sx={{ borderColor: BRAND.border }} />

                {/* Payload */}
                <Box>
                  <Typography variant="overline" sx={{ color: BRAND.teal, fontWeight: 800, letterSpacing: 1.2 }}>
                    Payload
                  </Typography>
                  <Paper
                    variant="outlined"
                    sx={{
                      mt: 0.5,
                      p: 1.25,
                      bgcolor: BRAND.dark,
                      color: "#e2e8f0",
                      borderColor: BRAND.dark,
                      overflow: "auto",
                      maxHeight: 220,
                      fontFamily: "monospace",
                      fontSize: 12,
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-word",
                    }}
                  >
                    {JSON.stringify(selectedJob.payload_json ?? {}, null, 2)}
                  </Paper>
                </Box>

                {/* Actions */}
                <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mt: "auto", pt: 1 }}>
                  <Button
                    size="small"
                    variant="outlined"
                    startIcon={<RestartAltOutlinedIcon />}
                    onClick={handleRetry}
                    disabled={jobActionRunning || !canRetrySelectedJob}
                    sx={{
                      textTransform: "none",
                      fontWeight: 700,
                      borderColor: BRAND.teal,
                      color: BRAND.teal,
                      "&:hover": { borderColor: BRAND.tealHover, bgcolor: BRAND.tealSoft },
                    }}
                  >
                    Retry
                  </Button>
                  <Button
                    size="small"
                    variant="outlined"
                    color="error"
                    startIcon={<CancelOutlinedIcon />}
                    onClick={handleCancel}
                    disabled={jobActionRunning || !canCancelSelectedJob}
                    sx={{ textTransform: "none", fontWeight: 700 }}
                  >
                    Cancel
                  </Button>
                </Box>
              </Box>
            )}
          </SectionPaper>
        </Grid>
      </Grid>

      <BrandSnackbar
        open={snackbar.open}
        severity={snackbar.severity}
        message={snackbar.message}
        onClose={() => setSnackbar((prev) => ({ ...prev, open: false }))}
      />
    </Box>
  );
}
