import * as React from "react";
import Grid from "@mui/material/Grid";
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Checkbox,
  Chip,
  Collapse,
  Divider,
  FormControlLabel,
  MenuItem,
  Paper,
  Radio,
  RadioGroup,
  TextField,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import CheckBoxOutlineBlankIcon from "@mui/icons-material/CheckBoxOutlineBlank";
import CheckBoxIcon from "@mui/icons-material/CheckBox";
import RefreshControl, { useAutoRefresh } from "../components/common/RefreshControl";
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
import {
  dispatchAssetGroupJob,
  listAssetGroupMembers,
  listAssetGroups,
} from "../api/assetGroups";
import { listFrom } from "../api/shape";
import { useCachedFetch } from "../hooks/useCachedFetch";
import { listAgentVersions } from "../api/binaries";
import { formatDate } from "../utils/format";
import { updateSearchParams } from "../utils/browserState";
import { buildBatchRow } from "../utils/jobBatches";
import { buildJobPayload, validateNumericField, resolveTypeFilter } from "../utils/jobForm";
import { hasJobResult, formatJobResult } from "../utils/jobResult";

const FACT_TYPE_OPTIONS = [
  { value: "inventory", label: "Inventory" },
  { value: "compliance", label: "Compliance" },
  { value: "patch", label: "Patch" },
  { value: "cdp", label: "Certificates" },
  { value: "all", label: "All" },
];

const PATCH_INSTALL_MODE_OPTIONS = [
  { value: "install", label: "Install" },
  { value: "download", label: "Download Only" },
];

const TARGET_OPTIONS = [
  { value: "device", label: "Device(s)" },
  { value: "group", label: "Group" },
  { value: "tenant", label: "All Connected Devices" },
];

// Server-side cap on /asset-groups/:id/members?pageSize (see
// asset-groups.controller.ts). For groups larger than this, "specific
// device(s) in group" only offers the first page — the helper text
// below the picker says so and points the operator at "Entire group"
// instead of pretending to offer full coverage.
const GROUP_MEMBERS_PAGE_SIZE = 100;

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

/**
 * Type-to-search device picker with a checkbox per row so the operator
 * can select one or several devices without losing the free-text
 * filter — plain MUI <Select> menus don't support typing to narrow a
 * fleet-sized list. Used both for the top-level "Device(s)" target
 * mode and for "specific device(s) in group" (same shape, different
 * source list), so the filter/checkbox/chip behavior stays identical
 * in both places.
 */
function DeviceCheckAutocomplete({ label, devices, value, onChange, disabled, helperText }) {
  const selectedOptions = React.useMemo(
    () => devices.filter((d) => value.includes(d.deviceId)),
    [devices, value]
  );

  return (
    <Autocomplete
      multiple
      fullWidth
      size="small"
      disableCloseOnSelect
      disabled={disabled}
      options={devices}
      value={selectedOptions}
      onChange={(_e, next) => onChange(next.map((d) => d.deviceId))}
      isOptionEqualToValue={(opt, val) => opt.deviceId === val.deviceId}
      getOptionLabel={(opt) => opt.hostname || opt.deviceId}
      filterOptions={(opts, state) => {
        const q = state.inputValue.trim().toLowerCase();
        if (!q) return opts;
        return opts.filter(
          (o) =>
            (o.hostname || "").toLowerCase().includes(q) ||
            (o.deviceId || "").toLowerCase().includes(q)
        );
      }}
      noOptionsText="No matching devices"
      renderOption={(props, option, { selected }) => {
        const { key, ...optionProps } = props;
        return (
          <Box component="li" key={key || option.deviceId} {...optionProps} sx={{ py: "4px !important" }}>
            <Checkbox
              icon={<CheckBoxOutlineBlankIcon fontSize="small" />}
              checkedIcon={<CheckBoxIcon fontSize="small" />}
              checked={selected}
              size="small"
              sx={{ mr: 1, p: 0.25, color: BRAND.teal, "&.Mui-checked": { color: BRAND.teal } }}
            />
            <Box sx={{ minWidth: 0 }}>
              <Typography sx={{ fontSize: 13, fontWeight: 600, color: BRAND.dark }} noWrap>
                {option.hostname || option.deviceId}
              </Typography>
              <Typography sx={{ fontSize: 11, color: BRAND.gray }} noWrap>
                {option.connected ? "Connected" : "Offline"}
                {option.agentVersion ? ` · agent ${option.agentVersion}` : ""}
              </Typography>
            </Box>
          </Box>
        );
      }}
      renderTags={(selectedValues, getTagProps) =>
        selectedValues.map((option, index) => {
          const { key, ...tagProps } = getTagProps({ index });
          return (
            <Chip
              key={key || option.deviceId}
              {...tagProps}
              size="small"
              label={option.hostname || option.deviceId}
              sx={{ bgcolor: BRAND.tealSoft, color: BRAND.tealText, fontWeight: 600 }}
            />
          );
        })
      }
      renderInput={(params) => (
        <TextField
          {...params}
          label={label}
          placeholder={value.length ? "" : "Type to search…"}
          helperText={helperText}
        />
      )}
    />
  );
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
        sx={{ bgcolor: "rgba(199,121,43,0.14)", color: BRAND.alert.high, fontWeight: 700, border: "1px solid rgba(199,121,43,0.4)" }}
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


function renderBatchStatusChip(row) {
  const { __doneCount: done, __failedCount: failed, __totalCount: total } = row;

  if (done < total) {
    return (
      <Chip
        label={`Running ${done}/${total}`}
        size="small"
        sx={{ bgcolor: BRAND.cyanSoft, color: BRAND.dark, fontWeight: 700, border: `1px solid ${BRAND.cyan}88` }}
      />
    );
  }
  if (failed === 0) {
    return (
      <Chip
        label={`Completed (${total})`}
        size="small"
        sx={{ bgcolor: BRAND.tealSoft, color: BRAND.tealText, fontWeight: 700, border: `1px solid ${BRAND.teal}55` }}
      />
    );
  }
  return (
    <Chip
      label={failed === total ? `Failed (${total})` : `${total - failed}/${total} ok`}
      size="small"
      sx={{ bgcolor: BRAND.alert.errorSoft, color: BRAND.alert.error, fontWeight: 700, border: `1px solid ${BRAND.alert.error}55` }}
    />
  );
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
  // Every advertised type — the history's label lookup and type filter
  // use this, so it must include the non-creatable ones (a job_type that
  // can't be filtered is worse than useless in a history).
  const jobTypeOptions = React.useMemo(() => jobsMeta?.types ?? [], [jobsMeta]);
  // The subset an operator can actually build from the form. The backend
  // marks creatable=false for types whose payload is a snapshot from
  // another page (software_install, patch_remediate) or that are
  // system-emitted (software_dp_prefetch, reset_baseline). Older backends
  // predate the flag and sent no creatable key at all — treat a missing
  // flag as creatable so the form doesn't go empty against them.
  const creatableJobTypeOptions = React.useMemo(
    () => jobTypeOptions.filter((t) => t.creatable !== false),
    [jobTypeOptions]
  );
  // job_type -> label, for the history table's Type column. Falls back to
  // the raw type so an unknown value still renders (just unlabelled).
  const jobTypeLabels = React.useMemo(() => {
    const m = new Map();
    for (const t of jobTypeOptions) m.set(t.jobType, t.label || t.jobType);
    return m;
  }, [jobTypeOptions]);
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
    const rawType = (params.get("type") || "").toLowerCase();
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
      // Type is validated against the catalogue once it loads (below), not
      // here — the catalogue isn't available on first render. An unknown
      // value just leaves the filter at "all" via that guard.
      type: highlightJobId ? "all" : (rawType || "all"),
      search: highlightJobId ? "" : rawSearch.trim(),
      highlightJobId
    };
  }, []);

  const [tenantJobs, setTenantJobs] = React.useState([]);
  const [selectedDeviceIds, setSelectedDeviceIds] = React.useState([]);

  // ── Group targeting ─────────────────────────────────────────────
  const [groupCatalog, setGroupCatalog] = React.useState([]);
  const [loadingGroups, setLoadingGroups] = React.useState(false);
  const [selectedGroupId, setSelectedGroupId] = React.useState("");
  // "entire" dispatches via /asset-groups/:id/jobs (backend resolves
  // membership, including re-evaluating dynamic-group criteria at
  // dispatch time). "specific" narrows to hand-picked members of that
  // group via the same device multi-select used for target=device.
  const [groupTargetMode, setGroupTargetMode] = React.useState("entire");
  const [groupMemberDevices, setGroupMemberDevices] = React.useState([]);
  const [groupMembersTotal, setGroupMembersTotal] = React.useState(0);
  const [loadingGroupMembers, setLoadingGroupMembers] = React.useState(false);
  const [groupDeviceIds, setGroupDeviceIds] = React.useState([]);
  const [selectedJobId, setSelectedJobId] = React.useState(initialFilters.highlightJobId || "");
  const [selectedJob, setSelectedJob] = React.useState(null);
  // Set instead of selectedJobId when the operator clicks a grouped
  // (multi-device) row — mutually exclusive with it, see selectRow().
  const [selectedBatchId, setSelectedBatchId] = React.useState("");

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
  const [jobTypeFilter, setJobTypeFilter] = React.useState(initialFilters.type || "all");
  const [search, setSearch] = React.useState(initialFilters.search || "");
  // The just-dispatched job to flash once its row renders — cleared
  // after the animation plays so it never re-triggers on a later
  // re-render (filter change, refresh poll, etc).
  const [highlightRowId, setHighlightRowId] = React.useState(initialFilters.highlightJobId || "");
  // The backend caps the history window and reports when older jobs exist
  // beyond it. Surfaced as a banner so the operator knows the list — and
  // therefore the filters and search that run over it — is not the whole
  // story once a tenant grows past the window.
  const [historyTruncated, setHistoryTruncated] = React.useState(false);

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
      setHistoryTruncated(response?.truncated === true);
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
      const job = response?.job ?? null;
      setSelectedJob(job);

      // The detail fetch is always fresh; the table row backing it may
      // not be (auto-refresh runs on its own cadence, not on every
      // click). Patch just that row in place so a click never shows a
      // status here that contradicts what's still sitting in Tenant
      // Job History — no need to wait for the next refresh tick.
      if (job) {
        setTenantJobs((prev) =>
          prev.map((row) => (row.job_id === job.job_id ? { ...row, ...job } : row))
        );
      }
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
    setSelectedDeviceIds((current) => {
      const stillValid = current.filter((id) => known.some((item) => item.deviceId === id));
      if (stillValid.length > 0) return stillValid;
      return known[0]?.deviceId ? [known[0].deviceId] : [];
    });
    setJobType((current) => {
      // Only creatable types are valid selections for the form. A default
      // that landed on a view-only type would build an unsubmittable job.
      const creatable = types.filter((t) => t.creatable !== false);
      if (current && creatable.some((item) => item.jobType === current)) return current;
      return creatable[0]?.jobType || "facts_snapshot";
    });
    // A ?type= deep-link that names no advertised type would hide every
    // row. Once the catalogue is loaded, drop such a value back to "all"
    // (resolveTypeFilter). Only touches a non-"all" filter, so it never
    // fights the operator's own selection.
    setJobTypeFilter((current) =>
      current === "all" ? current : resolveTypeFilter(current, types)
    );
  }, [jobsMeta]);

  // Lazy-load the asset-group catalog the first time the operator
  // switches to Group targeting — avoids the extra round trip on every
  // page load for operators who never use group dispatch.
  const groupsLoadedRef = React.useRef(false);
  React.useEffect(() => {
    if (targetMode !== "group" || groupsLoadedRef.current || !canManageJobs) return;
    groupsLoadedRef.current = true;
    setLoadingGroups(true);
    listAssetGroups()
      .then((res) => setGroupCatalog(listFrom(res, { context: "jobsTargetGroups" })))
      .catch((err) => {
        setSnackbar({
          open: true,
          message: err?.body?.message || err?.message || "Failed to load asset groups",
          severity: "error",
        });
        setGroupCatalog([]);
      })
      .finally(() => setLoadingGroups(false));
  }, [targetMode, canManageJobs]);

  // Fetch the group's members whenever the operator narrows to
  // "specific device(s) in group" — cleared (and the previous
  // selection dropped) the moment the group changes so a stale
  // deviceId from a different group can't ride along silently.
  React.useEffect(() => {
    if (targetMode !== "group" || groupTargetMode !== "specific" || !selectedGroupId) {
      setGroupMemberDevices([]);
      setGroupMembersTotal(0);
      return undefined;
    }
    let cancelled = false;
    setGroupDeviceIds([]);
    setLoadingGroupMembers(true);
    listAssetGroupMembers(selectedGroupId, { pageSize: GROUP_MEMBERS_PAGE_SIZE })
      .then((res) => {
        if (cancelled) return;
        setGroupMemberDevices(listFrom(res, { context: "jobsGroupMembers" }));
        setGroupMembersTotal(Number(res?.total ?? res?.count ?? 0));
      })
      .catch((err) => {
        if (cancelled) return;
        setSnackbar({
          open: true,
          message: err?.body?.message || err?.message || "Failed to load group members",
          severity: "error",
        });
        setGroupMemberDevices([]);
        setGroupMembersTotal(0);
      })
      .finally(() => {
        if (!cancelled) setLoadingGroupMembers(false);
      });
    return () => {
      cancelled = true;
    };
  }, [targetMode, groupTargetMode, selectedGroupId]);

  // Resolve the (platform, arch) pair to use when fetching agent versions.
  // - targetMode "device" with EXACTLY ONE device selected: use that
  //   device's platform/arch, so the dropdown only lists versions that
  //   actually exist for it.
  // - Anything that can fan out to more than one device (multiple
  //   devices selected, a group in either sub-mode, or "all connected")
  //   is potentially mixed-platform: each agent resolves its own binary
  //   at apply time, so we fall back to a deterministic default just to
  //   keep the version dropdown non-empty rather than guessing a
  //   specific device's platform.
  const isSingleDeviceTarget = targetMode === "device" && selectedDeviceIds.length === 1;
  const isFanoutTarget = !isSingleDeviceTarget;
  const versionFetchDevice = React.useMemo(() => {
    if (!isSingleDeviceTarget) return null;
    return knownDevices.find((d) => d.deviceId === selectedDeviceIds[0]) ?? null;
  }, [isSingleDeviceTarget, knownDevices, selectedDeviceIds]);

  const { platform: versionFetchPlatform, arch: versionFetchArch } =
    resolveVersionFetchKey(versionFetchDevice);

  // In fan-out mode we still need SOME arch to list versions — the
  // fan-out itself is arch-agnostic (each agent resolves its own binary
  // at apply time), so picking a common default keeps the dropdown
  // non-empty without misleading the operator about any specific
  // device. For a single targeted device we respect
  // resolveVersionFetchKey's null and surface that to the UI.
  const effectiveArch =
    versionFetchArch ??
    (isFanoutTarget ? DEFAULT_TENANT_FANOUT_ARCH : null);

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

  // Smooth-scrolls the Tenant Job History panel into view and pulses
  // the given row (see the DataGrid's getRowClassName / the
  // traceniumJobFlash keyframe below) for ~2.6s. Shared by the
  // deep-link-arrival effect below AND by handleSubmit, so a job
  // dispatched right here on the Jobs page gets the exact same
  // "look, there it is" treatment as one landed on via JobTracker's
  // "View in Jobs" arrow from another page.
  const flashAndScrollToRow = React.useCallback((rowId) => {
    if (!rowId) return;
    setHighlightRowId(rowId);
    const scrollTimer = window.setTimeout(() => {
      document.getElementById("tenant-job-history-panel")?.scrollIntoView({
        behavior: "smooth",
        block: "start"
      });
    }, 150);
    window.setTimeout(() => setHighlightRowId(""), 2600);
    return () => clearTimeout(scrollTimer);
  }, []);

  // Deep-link flash: if we landed here via JobTracker's "View in Jobs"
  // arrow, run the same scroll + pulse once on mount, then clear the
  // URL param so a later refresh doesn't replay it.
  React.useEffect(() => {
    if (!initialFilters.highlightJobId) return;
    updateSearchParams({ highlightJobId: null });
    return flashAndScrollToRow(initialFilters.highlightJobId);
    // Intentionally mount-only — this is a one-shot "just arrived"
    // flash, not a live sync with any state that changes later.
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

  const selectedDeviceObjs = React.useMemo(
    () => selectedDeviceIds.map((id) => deviceMap.get(id)).filter(Boolean),
    [selectedDeviceIds, deviceMap]
  );
  const selectedGroupObj = React.useMemo(
    () => groupCatalog.find((g) => String(g.id) === String(selectedGroupId)) || null,
    [groupCatalog, selectedGroupId]
  );

  // Derived live from tenantJobs (not a snapshot taken at click time)
  // so the batch detail view keeps reflecting reality as auto-refresh
  // ticks bring in newer per-device statuses.
  const selectedBatchJobs = React.useMemo(
    () => (selectedBatchId ? tenantJobs.filter((j) => j.batch_id === selectedBatchId) : []),
    [tenantJobs, selectedBatchId]
  );

  // Row click on the Tenant Job History grid: a grouped (multi-device)
  // row selects the batch view; a plain row selects the single-job
  // view. The two are mutually exclusive.
  const selectRow = React.useCallback((row) => {
    if (row.__isBatch) {
      setSelectedBatchId(row.batch_id);
      setSelectedJobId("");
    } else {
      setSelectedJobId(row.job_id);
      setSelectedBatchId("");
    }
  }, []);

  // Collapse jobs that share a batch_id into one row. A batch of one
  // (e.g. "all connected" resolved to a single device) reads as a
  // normal row — grouping only kicks in once there's actually
  // something to group.
  const groupedRows = React.useMemo(() => {
    const batches = new Map();
    const singles = [];
    for (const row of tenantJobs) {
      if (!row.batch_id) {
        singles.push(row);
        continue;
      }
      if (!batches.has(row.batch_id)) batches.set(row.batch_id, []);
      batches.get(row.batch_id).push(row);
    }

    const rows = [...singles];
    for (const [batchId, jobs] of batches.entries()) {
      if (jobs.length === 1) {
        rows.push(jobs[0]);
      } else {
        rows.push(buildBatchRow(batchId, jobs));
      }
    }

    return rows.sort((a, b) => {
      const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
      const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
      return tb - ta;
    });
  }, [tenantJobs]);

  const filteredRows = React.useMemo(() => {
    const q = deferredSearch.trim().toLowerCase();

    const matchesRowSearch = (row, needle) => {
      const device = deviceMap.get(String(row.device_id || ""));
      const hostname = String(device?.hostname || "").toLowerCase();
      return (
        String(row.job_id || "").toLowerCase().includes(needle) ||
        String(row.device_id || "").toLowerCase().includes(needle) ||
        hostname.includes(needle) ||
        String(row.job_type || "").toLowerCase().includes(needle) ||
        String(row.last_error || "").toLowerCase().includes(needle)
      );
    };

    return groupedRows.filter((row) => {
      const matchesStatus =
        statusFilter === "all" || String(row.status || "").toLowerCase() === statusFilter;
      const matchesJobType =
        jobTypeFilter === "all" || String(row.job_type || "").toLowerCase() === jobTypeFilter;
      const matchesSearch =
        !q ||
        (row.__isBatch
          ? row.__jobs.some((j) => matchesRowSearch(j, q))
          : matchesRowSearch(row, q));

      return matchesStatus && matchesJobType && matchesSearch;
    });
  }, [groupedRows, deviceMap, deferredSearch, statusFilter, jobTypeFilter]);

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
    {
      field: "job_id",
      headerName: "Job ID",
      minWidth: 210,
      flex: 1,
      valueGetter: (value, row) => (row.__isBatch ? `Batch · ${row.__totalCount} devices` : value),
    },
    {
      field: "hostname",
      headerName: "Hostname",
      minWidth: 180,
      flex: 0.8,
      valueGetter: (_value, row) =>
        row.__isBatch
          ? `${row.__totalCount} devices`
          : deviceMap.get(String(row.device_id || ""))?.hostname || row.device_id,
    },
    // Device ID column dropped — the hostname column already
    // identifies the target, and the full UUID is still available in
    // the detail drawer for anyone who needs it for logs / support.
    {
      field: "job_type",
      headerName: "Type",
      minWidth: 150,
      flex: 0.6,
      // Show the human label ("Distribution Prefetch") not the raw
      // job_type ("software_dp_prefetch"). The catalogue now advertises
      // all 8 types, so every value resolves; the fallback keeps an
      // unknown value visible rather than blank.
      valueGetter: (value) => jobTypeLabels.get(value) || value,
    },
    {
      field: "status",
      headerName: "Status",
      minWidth: 140,
      flex: 0.6,
      renderCell: (params) => (params.row.__isBatch ? renderBatchStatusChip(params.row) : renderStatusChip(params.value)),
    },
    {
      field: "attempts",
      headerName: "Attempts",
      minWidth: 90,
      flex: 0.35,
      valueGetter: (value, row) => (row.__isBatch ? "—" : value),
    },
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

  // Auto-refresh — was hand-rolled here and defaulted OFF, unlike every
  // other list page (PatchManagement, SecurityCompliance, Overview,
  // Assets, Audit, Alerts, …), which all use this shared hook with its
  // 60s default. That's the root cause of a real bug: dispatch a job,
  // watch Tenant Job History sit on "Pending" forever after it actually
  // finished (confirmed only by clicking into Job Detail, which always
  // fetches fresh) — because with refresh off, the table simply never
  // asked the backend again. Switching to useAutoRefresh fixes that and
  // brings this page in line with the rest of the app (same 60s
  // default, persisted to the URL, pauses on a hidden tab).
  const autoRefreshTick = React.useCallback(() => {
    if (!canManageJobs || submitting || jobActionRunning) return;
    refreshAll();
  }, [canManageJobs, jobActionRunning, refreshAll, submitting]);
  const [autoRefreshSeconds, setAutoRefreshSeconds] = useAutoRefresh(autoRefreshTick, "jobsAutoRefresh");

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

    if (targetMode === "device" && selectedDeviceIds.length === 0) {
      setSnackbar({
        open: true,
        message: "Select at least one device first",
        severity: "error",
      });
      return;
    }

    if (targetMode === "group") {
      if (!selectedGroupId) {
        setSnackbar({ open: true, message: "Select a group first", severity: "error" });
        return;
      }
      if (groupTargetMode === "specific" && groupDeviceIds.length === 0) {
        setSnackbar({
          open: true,
          message: "Select at least one device in the group",
          severity: "error",
        });
        return;
      }
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
        : targetMode === "group"
        ? groupTargetMode === "entire"
          ? `every member of group "${selectedGroupObj?.name || selectedGroupId}"${
              Number.isFinite(selectedGroupObj?.memberCount)
                ? ` (~${selectedGroupObj.memberCount} device(s))`
                : ""
            }`
          : `${groupDeviceIds.length} device(s) in group "${selectedGroupObj?.name || selectedGroupId}"`
        : selectedDeviceIds.length === 1
        ? `${selectedDeviceObjs[0]?.hostname || selectedDeviceIds[0]} (${selectedDeviceIds[0]})${
            selectedDeviceObjs[0]?.connected ? "" : " [offline]"
          }`
        : `${selectedDeviceIds.length} selected devices`;
    const confirmed = await confirm({
      title: `Dispatch ${jobType}?`,
      body: `The job will be queued for ${dispatchDescription}.`,
      confirmText: "Dispatch",
    });
    if (!confirmed) return;

    // Whatever row the operator should be shown after the table
    // reloads — a real job_id for a single-device dispatch, or the
    // synthetic `batch:<batchId>` id (see groupedRows) for anything
    // that fans out to multiple devices, since those collapse into one
    // row in Tenant Job History.
    let newRowId = "";

    try {
      setSubmitting(true);

      if (targetMode === "tenant") {
        const response = await createTenantJobs(tenantId, {
          deviceIds: connectedDeviceIds,
          ...payload,
        });
        newRowId = response?.created?.batchId ? `batch:${response.created.batchId}` : "";

        setSnackbar({
          open: true,
          message: `Tenant job queued for ${response?.created?.count ?? connectedDeviceIds.length} devices`,
          severity: "success",
        });
      } else if (targetMode === "group") {
        if (groupTargetMode === "entire") {
          const response = await dispatchAssetGroupJob(selectedGroupId, payload);
          newRowId = response?.batchId ? `batch:${response.batchId}` : "";
          setSnackbar({
            open: true,
            message: `Dispatched ${response?.count ?? 0} job(s) to "${
              response?.groupName || selectedGroupObj?.name || selectedGroupId
            }"`,
            severity: "success",
          });
        } else if (groupDeviceIds.length === 1) {
          const response = await createDeviceJob(groupDeviceIds[0], payload);
          newRowId = response?.jobId || "";
          setSelectedJobId(response?.jobId || "");
          setSnackbar({
            open: true,
            message: `Job queued successfully (${response?.jobId || "created"})`,
            severity: "success",
          });
        } else {
          const response = await createTenantJobs(tenantId, {
            deviceIds: groupDeviceIds,
            ...payload,
          });
          newRowId = response?.created?.batchId ? `batch:${response.created.batchId}` : "";
          setSnackbar({
            open: true,
            message: `Job queued for ${response?.created?.count ?? groupDeviceIds.length} device(s)`,
            severity: "success",
          });
        }
      } else if (selectedDeviceIds.length === 1) {
        const response = await createDeviceJob(selectedDeviceIds[0], payload);
        newRowId = response?.jobId || "";
        setSelectedJobId(response?.jobId || "");
        setSnackbar({
          open: true,
          message: selectedDeviceObjs[0]?.connected
            ? `Job queued successfully (${response?.jobId || "created"})`
            : `Job queued offline for ${selectedDeviceObjs[0]?.hostname || selectedDeviceIds[0]} (${response?.jobId || "created"})`,
          severity: "success",
        });
      } else {
        const response = await createTenantJobs(tenantId, {
          deviceIds: selectedDeviceIds,
          ...payload,
        });
        newRowId = response?.created?.batchId ? `batch:${response.created.batchId}` : "";
        setSnackbar({
          open: true,
          message: `Job queued for ${response?.created?.count ?? selectedDeviceIds.length} device(s)`,
          severity: "success",
        });
      }

      await loadTenantJobs();
      flashAndScrollToRow(newRowId);
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
              accent={BRAND.alert.high}
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
                    color: BRAND.surface,
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
              sm: targetMode === "tenant" ? "1fr" : "1fr 2fr",
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
            <DeviceCheckAutocomplete
              label="Device(s)"
              devices={knownDevices}
              value={selectedDeviceIds}
              onChange={setSelectedDeviceIds}
              disabled={loadingMeta}
              helperText={
                selectedDeviceIds.length === 1
                  ? `${selectedDeviceObjs[0]?.connected ? "Connected" : "Offline"} · agent ${
                      selectedDeviceObjs[0]?.agentVersion || "unknown"
                    } · ${connectedDeviceIds.length}/${knownDevices.length} online`
                  : selectedDeviceIds.length > 1
                  ? `${selectedDeviceIds.length} devices selected · ${connectedDeviceIds.length}/${knownDevices.length} online`
                  : `${connectedDeviceIds.length}/${knownDevices.length} online`
              }
            />
          ) : targetMode === "group" ? (
            <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
              <TextField
                select
                label="Group"
                size="small"
                value={selectedGroupId}
                onChange={(e) => {
                  setSelectedGroupId(e.target.value);
                  setGroupDeviceIds([]);
                }}
                disabled={loadingGroups}
                helperText={
                  groupCatalog.length === 0
                    ? loadingGroups
                      ? "Loading groups…"
                      : "No asset groups available — create one from the Asset Groups page"
                    : selectedGroupObj
                    ? `${selectedGroupObj.kind === "dynamic" ? "Dynamic" : "Static"}${
                        Number.isFinite(selectedGroupObj.memberCount)
                          ? ` · ${selectedGroupObj.memberCount} member(s)`
                          : ""
                      }`
                    : "Membership for dynamic groups is evaluated at dispatch time."
                }
                fullWidth
              >
                {groupCatalog.length === 0 ? (
                  <MenuItem value="">No asset groups</MenuItem>
                ) : (
                  groupCatalog.map((g) => (
                    <MenuItem key={g.id} value={String(g.id)}>
                      {g.name}
                      {g.kind === "dynamic" ? " (dynamic)" : ""}
                      {Number.isFinite(g.memberCount) ? ` · ${g.memberCount}` : ""}
                    </MenuItem>
                  ))
                )}
              </TextField>

              <RadioGroup
                row
                value={groupTargetMode}
                onChange={(e) => setGroupTargetMode(e.target.value)}
              >
                <FormControlLabel value="entire" control={<Radio size="small" />} label="Entire group" />
                <FormControlLabel
                  value="specific"
                  control={<Radio size="small" />}
                  label="Specific device(s) in group"
                />
              </RadioGroup>

              {groupTargetMode === "specific" ? (
                <DeviceCheckAutocomplete
                  label="Devices in group"
                  devices={groupMemberDevices}
                  value={groupDeviceIds}
                  onChange={setGroupDeviceIds}
                  disabled={!selectedGroupId || loadingGroupMembers}
                  helperText={
                    !selectedGroupId
                      ? "Pick a group first"
                      : loadingGroupMembers
                      ? "Loading members…"
                      : groupMemberDevices.length === 0
                      ? "This group has no members"
                      : groupMembersTotal > groupMemberDevices.length
                      ? `${groupDeviceIds.length} selected · showing first ${groupMemberDevices.length} of ${groupMembersTotal} members (use "Entire group" for full coverage)`
                      : `${groupDeviceIds.length} of ${groupMemberDevices.length} selected`
                  }
                />
              ) : (
                <Alert severity="info" variant="outlined" sx={{ borderRadius: 2, alignItems: "center", py: 0.25 }}>
                  This job will be dispatched to every member of{" "}
                  <strong>{selectedGroupObj?.name || "the selected group"}</strong>
                  {selectedGroupObj?.kind === "dynamic"
                    ? " (membership re-evaluated at dispatch time)."
                    : "."}
                </Alert>
              )}
            </Box>
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
            {creatableJobTypeOptions.map((opt) => (
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
              color: BRAND.surface,
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
                Showing <strong>{filteredRows.length}</strong> row{filteredRows.length === 1 ? "" : "s"} ·{" "}
                {/* "loaded", not "total", once the window is truncated —
                    tenantJobs is then the window, not the whole history. */}
                {tenantJobs.length} job{tenantJobs.length === 1 ? "" : "s"} {historyTruncated ? "loaded" : "total"}
                {groupedRows.length !== tenantJobs.length ? " (multi-device dispatches grouped)" : ""}
              </Typography>
            </Box>

            {historyTruncated ? (
              <Alert
                severity="info"
                variant="outlined"
                sx={{ borderRadius: 2, mb: 1.5, py: 0.25, alignItems: "center" }}
              >
                Showing the most recent {tenantJobs.length} jobs. Older jobs
                exist beyond this window — filters and search below apply only
                to what's loaded here.
              </Alert>
            ) : null}

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
              onRowClick={(params) => selectRow(params.row)}
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
                {selectedBatchId ? "Batch Detail" : "Job Detail"}
              </Typography>
              {selectedBatchId && selectedBatchJobs.length > 0
                ? renderBatchStatusChip(buildBatchRow(selectedBatchId, selectedBatchJobs))
                : selectedJob
                ? renderStatusChip(selectedJob.status)
                : null}
            </Box>

            {selectedBatchId ? (
              selectedBatchJobs.length === 0 ? (
                <Typography color="text.secondary">Loading batch…</Typography>
              ) : (
                <Box sx={{ display: "flex", flexDirection: "column", gap: 1.75, flex: 1, minHeight: 0 }}>
                  <Box>
                    <Typography variant="overline" sx={{ color: BRAND.teal, fontWeight: 800, letterSpacing: 1.2 }}>
                      Identity
                    </Typography>
                    <Box sx={{ mt: 0.5, display: "grid", gap: 0.5 }}>
                      <DetailRow label="Type" value={selectedBatchJobs[0]?.job_type} />
                      <DetailRow label="Devices" value={String(selectedBatchJobs.length)} />
                      <DetailRow label="Created By" value={selectedBatchJobs[0]?.created_by_email || selectedBatchJobs[0]?.created_by || "—"} />
                      <DetailRow label="Created" value={formatDate(selectedBatchJobs[0]?.created_at)} />
                    </Box>
                  </Box>

                  <Divider sx={{ borderColor: BRAND.border }} />

                  <Box sx={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
                    <Typography variant="overline" sx={{ color: BRAND.teal, fontWeight: 800, letterSpacing: 1.2, mb: 0.5 }}>
                      Devices involved
                    </Typography>
                    <Box sx={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 0.75, pr: 0.5 }}>
                      {selectedBatchJobs.map((job) => (
                        <Box
                          key={job.job_id}
                          onClick={() => {
                            setSelectedJobId(job.job_id);
                            setSelectedBatchId("");
                          }}
                          sx={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            gap: 1,
                            p: 1,
                            borderRadius: 1.5,
                            border: `1px solid ${BRAND.border}`,
                            cursor: "pointer",
                            transition: "background-color 0.15s ease",
                            "&:hover": { bgcolor: BRAND.darkSoft },
                          }}
                        >
                          <Box sx={{ minWidth: 0 }}>
                            <Typography sx={{ fontSize: 13, fontWeight: 600, color: BRAND.dark }} noWrap>
                              {deviceMap.get(String(job.device_id || ""))?.hostname || job.device_id}
                            </Typography>
                            {job.last_error ? (
                              <Typography sx={{ fontSize: 11, color: BRAND.alert.error }} noWrap>
                                {job.last_error}
                              </Typography>
                            ) : null}
                          </Box>
                          {renderStatusChip(job.status)}
                        </Box>
                      ))}
                    </Box>
                  </Box>
                </Box>
              )
            ) : !selectedJobId ? (
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
                    {/* Prefer the resolved email over the raw Auth0 sub, same
                        as the history table. getJob now LEFT JOINs TenantMember
                        so this matches what the row showed — before, clicking a
                        row flipped this from a readable email to `auth0|…`. */}
                    <DetailRow label="Created By" value={selectedJob.created_by_email || selectedJob.created_by || "—"} />
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

                {/* Result — what the agent reported back on completion.
                    The panel used to show only the payload (what was
                    REQUESTED); this is what actually HAPPENED. For a
                    patch_remediate dry-run, whose whole purpose is to
                    return a result without acting, the payload alone made
                    the detail view useless. Only shown when the agent
                    returned something, so a still-running or never-answered
                    job doesn't render an empty block. */}
                {hasJobResult(selectedJob.result_json) ? (
                  <>
                    <Divider sx={{ borderColor: BRAND.border }} />
                    <Box>
                      <Typography variant="overline" sx={{ color: BRAND.tealText, fontWeight: 800, letterSpacing: 1.2 }}>
                        Result
                      </Typography>
                      <Paper
                        variant="outlined"
                        sx={{
                          mt: 0.5,
                          p: 1.25,
                          borderColor: `${BRAND.teal}55`,
                          bgcolor: BRAND.tealSoft,
                          color: BRAND.dark,
                          overflow: "auto",
                          maxHeight: 220,
                          fontFamily: "monospace",
                          fontSize: 12,
                          whiteSpace: "pre-wrap",
                          wordBreak: "break-word",
                        }}
                      >
                        {formatJobResult(selectedJob.result_json)}
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
