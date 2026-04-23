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
  Snackbar,
  TextField,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import RefreshOutlinedIcon from "@mui/icons-material/RefreshOutlined";
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

// Tracenium brand palette
const BRAND = {
  dark: "#3B404D",      // dark slate — headings, primary text
  teal: "#5A9F9F",      // primary accent — CTAs, active states
  tealHover: "#4E8C8C",
  cyan: "#8FFDFF",      // bright accent — highlights
  gray: "#BEBEBE",      // borders, neutral
  // derived surfaces
  tealSoft: "rgba(90,159,159,0.12)",
  tealText: "#3E7878",
  cyanSoft: "rgba(143,253,255,0.22)",
  darkSoft: "rgba(59,64,77,0.08)",
  border: "rgba(190,190,190,0.5)",
  rowHover: "rgba(143,253,255,0.10)",
  shadow: "0 8px 20px rgba(59,64,77,0.10)",
};
import { DataGrid } from "@mui/x-data-grid";

import { useAuthContext } from "../auth/AuthContext";
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
import { listAgentVersions } from "../api/binaries";

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
// Arch is now reported by the agent itself (agent.arch in the facts
// payload) and surfaced by /known-devices. When a device pre-dates the
// arch-reporting change and `item.arch` is null, we fall back to a
// per-platform heuristic that's correct for most of the fleet (macOS
// → arm64 after Apple Silicon, otherwise x64).
const DEFAULT_VERSION_PLATFORM = "windows";
const DEFAULT_VERSION_ARCH = "x64";

function archForPlatform(platform) {
  return platform === "macos" ? "arm64" : "x64";
}

/**
 * Resolve (platform, arch) for the device a job is targeting. Prefers
 * the device-reported arch; falls back to the platform heuristic only
 * when the device hasn't reported one yet (legacy agent).
 */
function resolveVersionFetchKey(device) {
  if (!device) {
    return { platform: DEFAULT_VERSION_PLATFORM, arch: DEFAULT_VERSION_ARCH };
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

function SummaryCard({ title, value, icon, accent = BRAND.teal, tint = BRAND.tealSoft }) {
  return (
    <Paper
      elevation={0}
      sx={{
        p: 1.75,
        minHeight: 96,
        borderRadius: 3,
        border: `1px solid ${BRAND.border}`,
        boxShadow: BRAND.shadow,
        display: "flex",
        alignItems: "center",
        gap: 1.75,
        transition: "transform 0.15s ease, box-shadow 0.15s ease",
        "&:hover": {
          transform: "translateY(-1px)",
          boxShadow: "0 12px 26px rgba(59,64,77,0.14)",
        },
      }}
    >
      <Box
        sx={{
          width: 44,
          height: 44,
          borderRadius: 2,
          bgcolor: tint,
          color: accent,
          display: "grid",
          placeItems: "center",
          flexShrink: 0,
        }}
      >
        {icon}
      </Box>
      <Box sx={{ minWidth: 0 }}>
        <Typography sx={{ fontSize: 12, color: "text.secondary", fontWeight: 600, letterSpacing: 0.3, textTransform: "uppercase" }}>
          {title}
        </Typography>
        <Typography sx={{ fontSize: 26, fontWeight: 800, color: BRAND.dark, lineHeight: 1.1 }}>
          {value}
        </Typography>
      </Box>
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
        sx={{ bgcolor: "rgba(179,38,30,0.12)", color: "#b3261e", fontWeight: 700, border: "1px solid rgba(179,38,30,0.35)" }}
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

function formatDate(value) {
  if (!value) return " - ";
  const date = new Date(value);
  return date.toLocaleString("en-US", {
    year: "2-digit",
    month: "short",
    day: "2-digit",
    hourCycle: "h24",
    hour: "2-digit",
    minute: "2-digit",
  });
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

  const tenantId = auth?.tenantId;
  const tenantRole = String(auth?.tenantMember?.role || "");
  const isActiveMember = auth?.tenantMember?.isActive === true;
  const canManageJobs = isActiveMember && (tenantRole === "ADMIN" || tenantRole === "OWNER");

  const [jobTypeOptions, setJobTypeOptions] = React.useState([]);
  const [connectedDeviceIds, setConnectedDeviceIds] = React.useState([]);
  const [knownDevices, setKnownDevices] = React.useState([]);
  const [tenantJobs, setTenantJobs] = React.useState([]);
  const [selectedDeviceId, setSelectedDeviceId] = React.useState("");
  const [selectedJobId, setSelectedJobId] = React.useState("");
  const [selectedJob, setSelectedJob] = React.useState(null);

  const [loadingMeta, setLoadingMeta] = React.useState(true);
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
  const [statusFilter, setStatusFilter] = React.useState("all");
  const [jobTypeFilter, setJobTypeFilter] = React.useState("all");
  const [search, setSearch] = React.useState("");

  const [snackbar, setSnackbar] = React.useState({
    open: false,
    message: "",
    severity: "success",
  });
  const deferredSearch = React.useDeferredValue(search);

  const loadMeta = React.useCallback(async () => {
    if (!canManageJobs) return;

    try {
      setLoadingMeta(true);
      const [knownResponse, typeResponse] = await Promise.all([
        listKnownDevices(),
        listJobTypes(),
      ]);

      const known = Array.isArray(knownResponse?.items) ? knownResponse.items.map((item) => ({
        deviceId: String(item?.deviceId || "").trim(),
        hostname: String(item?.hostname || "").trim() || String(item?.deviceId || "").trim(),
        connected: item?.connected === true,
        enrollmentStatus: item?.enrollmentStatus ?? null,
        agentVersion: item?.agentVersion ?? null,
        // Normalised by the backend (windows | macos | linux | null).
        // Used to filter /binaries/agent/versions so the dropdown shows
        // the right version set for the selected host.
        platform: item?.platform ?? null,
        enrolledAt: item?.enrolledAt ?? null,
        lastSeenAt: item?.lastSeenAt ?? null,
        connectedAt: item?.connectedAt ?? null,
        updatedAt: item?.updatedAt ?? null,
      })).filter((item) => item.deviceId) : [];
      const devices = known.filter((item) => item.connected).map((item) => item.deviceId);
      const types = Array.isArray(typeResponse?.items) ? typeResponse.items : [];

      setConnectedDeviceIds(devices);
      setKnownDevices(known);
      setJobTypeOptions(types);
      setSelectedDeviceId((current) => {
        if (current && known.some((item) => item.deviceId === current)) return current;
        return known[0]?.deviceId || devices[0] || "";
      });
      setJobType((current) => {
        if (current && types.some((item) => item.jobType === current)) return current;
        return types[0]?.jobType || "facts_snapshot";
      });
    } catch (e) {
      console.error(e);
      setConnectedDeviceIds([]);
      setKnownDevices([]);
      setJobTypeOptions([]);
      setSnackbar({
        open: true,
        message: "Failed to load jobs metadata",
        severity: "error",
      });
    } finally {
      setLoadingMeta(false);
    }
  }, [canManageJobs]);

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

  React.useEffect(() => {
    loadMeta();
  }, [loadMeta]);

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

  React.useEffect(() => {
    if (jobType !== "agent_update" || !canManageJobs) {
      return;
    }

    let cancelled = false;
    setLoadingVersions(true);
    setVersionsError("");

    listAgentVersions({
      platform: versionFetchPlatform,
      arch: versionFetchArch,
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
        setVersionsError(`No versions available for ${versionFetchPlatform}/${versionFetchArch}`);
      })
      .finally(() => {
        if (!cancelled) setLoadingVersions(false);
      });

    return () => {
      cancelled = true;
    };
  }, [jobType, canManageJobs, versionFetchPlatform, versionFetchArch]);

  React.useEffect(() => {
    loadTenantJobs();
  }, [loadTenantJobs]);

  React.useEffect(() => {
    loadJobDetail(selectedJobId);
  }, [selectedJobId, loadJobDetail]);

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

  const columns = [
    { field: "job_id", headerName: "Job ID", minWidth: 210, flex: 1 },
    {
      field: "hostname",
      headerName: "Hostname",
      minWidth: 180,
      flex: 0.8,
      valueGetter: (_value, row) => deviceMap.get(String(row.device_id || ""))?.hostname || row.device_id,
    },
    { field: "device_id", headerName: "Device ID", minWidth: 210, flex: 1 },
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
      field: "created_by",
      headerName: "Created By",
      minWidth: 160,
      flex: 0.8,
      valueGetter: (_value, row) => row.created_by || " - ",
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
        loadMeta(),
        loadTenantJobs(),
        selectedJobId ? loadJobDetail(selectedJobId) : Promise.resolve(),
      ]);
    } finally {
      setRefreshing(false);
    }
  }, [loadJobDetail, loadMeta, loadTenantJobs, selectedJobId]);

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
    const confirmed = window.confirm(
      `Dispatch ${jobType} to ${dispatchDescription}?`
    );
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

    const confirmed = window.confirm(`Retry job ${selectedJobId}?`);
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

    const confirmed = window.confirm(`Cancel job ${selectedJobId}?`);
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
      <Box
        sx={{
          mb: 2,
          display: "flex",
          justifyContent: "space-between",
          alignItems: { xs: "stretch", sm: "center" },
          gap: 2,
          flexWrap: "wrap",
          flexDirection: { xs: "column", sm: "row" },
        }}
      >
        <Box>
          <Typography variant="h4" sx={{ color: BRAND.dark, fontWeight: 800, letterSpacing: -0.5 }}>
            Jobs
          </Typography>
          <Typography variant="body2" sx={{ color: "text.secondary", mt: 0.25 }}>
            Dispatch jobs and review tenant-wide execution history.
          </Typography>
        </Box>

        <Box sx={{ display: "flex", gap: 1.5, alignItems: "center", flexWrap: "wrap" }}>
          <TextField
            select
            label="Auto refresh"
            size="small"
            value={autoRefreshSeconds}
            onChange={(e) => setAutoRefreshSeconds(e.target.value)}
            sx={{ minWidth: 150 }}
          >
            <MenuItem value="0">Off</MenuItem>
            <MenuItem value="30">Every 30s</MenuItem>
            <MenuItem value="60">Every 60s</MenuItem>
            <MenuItem value="120">Every 2 min</MenuItem>
          </TextField>
          <Button
            variant="outlined"
            startIcon={<RefreshOutlinedIcon />}
            onClick={refreshAll}
            disabled={refreshing}
            sx={{
              textTransform: "none",
              fontWeight: 700,
              borderColor: BRAND.teal,
              color: BRAND.teal,
              "&:hover": { borderColor: BRAND.tealHover, bgcolor: BRAND.tealSoft },
            }}
          >
            {refreshing ? "Refreshing…" : "Refresh"}
          </Button>
        </Box>
      </Box>

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

      <Paper
        elevation={0}
        sx={{
          p: { xs: 1.5, sm: 2.5 },
          mb: 2,
          borderRadius: 3,
          border: `1px solid ${BRAND.border}`,
          boxShadow: BRAND.shadow,
        }}
      >
        <Typography sx={{ fontSize: 18, fontWeight: 800, color: BRAND.dark, mb: 0.25 }}>
          Create Job
        </Typography>
        <Typography sx={{ fontSize: 13, color: "text.secondary", mb: 2 }}>
          Dispatch a job to a single device or to every connected device in the tenant.
        </Typography>

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
                knownDevices.map((device) => (
                  <MenuItem key={device.deviceId} value={device.deviceId}>
                    {device.hostname}
                    {device.hostname !== device.deviceId ? ` · ${device.deviceId}` : ""}
                    {device.connected ? " · online" : " · offline"}
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
                  : `Versions available for ${versionFetchPlatform}/${versionFetchArch}. Each agent downloads the binary matching its own platform.`
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
      </Paper>

      <Grid container spacing={2} alignItems="stretch">
        <Grid size={{ xs: 12, lg: 8 }}>
          <Paper
            elevation={0}
            sx={{
              p: { xs: 1.5, sm: 2 },
              borderRadius: 3,
              border: `1px solid ${BRAND.border}`,
              boxShadow: BRAND.shadow,
            }}
          >
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
              onRowClick={(params) => setSelectedJobId(params.row.job_id)}
              pageSizeOptions={[10, 25, 50]}
              initialState={{
                pagination: {
                  paginationModel: { pageSize: 10, page: 0 },
                },
              }}
              columnVisibilityModel={columnVisibilityModel}
              sx={{
                border: "none",
                "& .MuiDataGrid-columnHeaders": {
                  backgroundColor: BRAND.darkSoft,
                  color: BRAND.dark,
                  fontWeight: 700,
                  borderBottom: `1px solid ${BRAND.border}`,
                },
                "& .MuiDataGrid-columnHeaderTitle": { fontWeight: 700 },
                "& .MuiDataGrid-row": {
                  cursor: "pointer",
                  transition: "background-color 0.12s ease",
                },
                "& .MuiDataGrid-row:hover": { backgroundColor: BRAND.rowHover },
                "& .MuiDataGrid-row.Mui-selected, & .MuiDataGrid-row.Mui-selected:hover": {
                  backgroundColor: BRAND.cyanSoft,
                },
                "& .MuiDataGrid-cell": {
                  borderBottom: `1px solid ${BRAND.border}`,
                },
                "& .MuiDataGrid-footerContainer": {
                  borderTop: `1px solid ${BRAND.border}`,
                },
              }}
            />
          </Paper>
        </Grid>

        <Grid size={{ xs: 12, lg: 4 }}>
          <Paper
            elevation={0}
            sx={{
              p: 2,
              borderRadius: 3,
              border: `1px solid ${BRAND.border}`,
              boxShadow: BRAND.shadow,
              height: "100%",
              display: "flex",
              flexDirection: "column",
            }}
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
                      <Typography variant="overline" sx={{ color: "#b3261e", fontWeight: 800, letterSpacing: 1.2 }}>
                        Last Error
                      </Typography>
                      <Paper
                        variant="outlined"
                        sx={{
                          mt: 0.5,
                          p: 1.25,
                          borderColor: "rgba(179,38,30,0.35)",
                          bgcolor: "rgba(179,38,30,0.06)",
                          color: "#7a1a15",
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
          </Paper>
        </Grid>
      </Grid>

      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={() => setSnackbar((prev) => ({ ...prev, open: false }))}
      >
        <Alert
          severity={snackbar.severity}
          variant="filled"
          onClose={() => setSnackbar((prev) => ({ ...prev, open: false }))}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}
