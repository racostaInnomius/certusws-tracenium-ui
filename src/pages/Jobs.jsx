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
  Stack,
  TextField,
  Typography,
  useMediaQuery,
  useTheme
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
import AssignmentOutlinedIcon from "@mui/icons-material/AssignmentOutlined";
import SearchOutlinedIcon from "@mui/icons-material/SearchOutlined";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import AddCircleOutlineOutlinedIcon from "@mui/icons-material/AddCircleOutlineOutlined";
import { DataGrid } from "@mui/x-data-grid";
import { getJobsTimeseries } from "../api/overview";
import JobsTimeseriesChart from "../components/Overview/JobsTimeseriesChart";

// BRAND used to be duplicated here (Fase 1 homologation deleted it).
// Central source of truth lives in src/theme/brand.js; adding
// borderStrong/tealText/etc. there propagates automatically.
import { BRAND, DATAGRID_SX, ICON, NEUTRAL, TEXT, TEXT_MUTED } from "../theme/brand";
import PageHeader from "../components/common/PageHeader";
import SectionPaper from "../components/common/SectionPaper";

import { useAuthContext } from "../auth/AuthContext";
import { useConfirm } from "../components/common/ConfirmDialog";
import BrandSnackbar from "../components/common/BrandSnackbar";
import {
  cancelJob,
  createDeviceJob,
  createTenantJobs,
  getJob,
  listJobTypes,
  listAllKnownDevices,
  listTenantJobs,
  retryJob,
} from "../api/jobs";
import {
  dispatchAssetGroupJob,
  listAssetGroupMembers,
  listAssetGroups,
} from "../api/assetGroups";
import { listFrom } from "../api/shape";
import { getMyCapabilities } from "../api/roles";
import { useCachedFetch } from "../hooks/useCachedFetch";
import { listAgentVersions } from "../api/binaries";
import { formatDate } from "../utils/format";
import { updateSearchParams } from "../utils/browserState";
import { buildBatchRow } from "../utils/jobBatches";
import { alternarSeleccionVisible, buildJobPayload, validateNumericField, resolveTypeFilter } from "../utils/jobForm";
import { deriveTriage, groupFailingDevices, groupFailureCauses } from "../utils/jobInsights";
import { CHART_CATEGORICAL } from "../theme/chartPalette";
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

  // Texto de búsqueda, elevado a estado para que "Select all" sepa a qué se
  // refiere "all": a lo que el operador está viendo, no a la flota entera.
  const [query, setQuery] = React.useState("");

  const matchesQuery = React.useCallback(
    (o) => {
      const q = query.trim().toLowerCase();
      if (!q) return true;
      return (
        (o.hostname || "").toLowerCase().includes(q) ||
        (o.deviceId || "").toLowerCase().includes(q)
      );
    },
    [query]
  );

  const visible = React.useMemo(() => devices.filter(matchesQuery), [devices, matchesQuery]);
  const visibleIds = React.useMemo(() => visible.map((d) => d.deviceId), [visible]);
  const todosVisiblesElegidos =
    visibleIds.length > 0 && visibleIds.every((id) => value.includes(id));

  // Por qué existe: medido en producción, 128 de 139 despachos multi-equipo
  // llevaban UN SOLO equipo, y hubo 57 ráfagas de agent_update lanzadas de una
  // en una por el mismo operador en la misma hora. El multi-select ya
  // funcionaba —hubo un lote de 39 equipos— pero armarlo costaba 39 clics.
  // Esto no cambia lo que se puede hacer; cambia lo que cuesta hacerlo.
  const alternarVisibles = React.useCallback(() => {
    onChange(alternarSeleccionVisible(value, visibleIds));
  }, [onChange, value, visibleIds]);

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
      inputValue={query}
      onInputChange={(_e, next, reason) => {
        // `reset` lo dispara la propia selección; conservar el texto ahí es lo
        // que permite elegir varios de una misma búsqueda sin reescribirla.
        if (reason !== "reset") setQuery(next);
      }}
      filterOptions={(opts) => opts.filter(matchesQuery)}
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
              <Typography sx={{ fontSize: TEXT.md, fontWeight: 600, color: BRAND.dark }} noWrap>
                {option.hostname || option.deviceId}
              </Typography>
              <Typography sx={{ fontSize: TEXT.xs, color: BRAND.gray }} noWrap>
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
      // Encabezado fijo de la lista con la acción de selección masiva. Va
      // dentro del desplegable y no fuera para que aparezca justo donde el
      // operador ya está mirando cuando decide a quién apunta.
      ListboxProps={{ style: { paddingTop: 0 } }}
      PaperComponent={({ children, ...rest }) => (
        <Paper {...rest}>
          {visibleIds.length > 0 ? (
            <Box
              onMouseDown={(e) => e.preventDefault()} // no robar el foco al input
              sx={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                px: 1.5,
                py: 0.75,
                borderBottom: `1px solid ${BRAND.border}`,
                position: "sticky",
                top: 0,
                bgcolor: BRAND.surface,
                zIndex: 1,
              }}
            >
              <Typography sx={{ fontSize: TEXT.xs, color: BRAND.gray }}>
                {query.trim()
                  ? `${visibleIds.length} coinciden con “${query.trim()}”`
                  : `${visibleIds.length} equipos`}
              </Typography>
              <Button
                size="small"
                onClick={alternarVisibles}
                sx={{ fontSize: TEXT.xs, fontWeight: 700, minWidth: 0 }}
              >
                {todosVisiblesElegidos ? "Quitar todos" : "Seleccionar todos"}
              </Button>
            </Box>
          ) : null}
          {children}
        </Paper>
      )}
    />
  );
}

function DetailRow({ label, value, mono = false }) {
  return (
    <Box sx={{ display: "flex", gap: 1.5, alignItems: "baseline" }}>
      <Typography
        sx={{
          fontSize: TEXT.sm,
          color: TEXT_MUTED,
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
          fontSize: TEXT.md,
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
/**
 * Jobs by type, as a donut.
 *
 * Was a stack of horizontal bars. A donut answers the question this card is
 * actually asked — "what is this tenant's job mix" — as one shape, and gives
 * the total a natural home in the middle.
 *
 * Palette: CHART_CATEGORICAL from theme/chartPalette, NOT the brand teal ramp.
 * Adjacent slices need perceptual separation; teal-on-teal-on-cyan reads as
 * one blur at donut scale. That module exists for exactly this and already
 * anchors its first entry to BRAND.teal, so the card still starts in brand.
 *
 * Clicking a slice or a legend row filters the history below.
 */
function JobsByTypeCard({ windowDays, data, loading, typeLabels, onSelectType, selectedType }) {
  const items = Array.isArray(data?.items) ? data.items : [];
  const total = Number(data?.total || 0);

  // Donut geometry. A circle of circumference C drawn with stroke-dasharray
  // `len C-len` and rotated by the running offset gives one arc per slice —
  // no chart library, no extra chunk on a card that has never needed one.
  const R = 52;
  const C = 2 * Math.PI * R;
  // Cumulative offsets without mutating a variable across the map: the React
  // Compiler rejects reassignment during render, and it is right to — a
  // running `let` inside a render body is state pretending to be a local.
  const slices = items.reduce((acc, row, i) => {
    const share = total > 0 ? Number(row.count || 0) / total : 0;
    const previous = acc[acc.length - 1];
    acc.push({
      type: row.type,
      label: typeLabels?.get(row.type) || row.type,
      count: row.count,
      color: CHART_CATEGORICAL[i % CHART_CATEGORICAL.length],
      len: share * C,
      offset: previous ? previous.offset + previous.len : 0,
    });
    return acc;
  }, []);

  return (
    <SectionPaper variant="panel" sx={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <Box sx={{ mb: 1.5 }}>
        <Typography variant="subtitle2" sx={{ color: BRAND.dark, fontWeight: 700 }}>
          Jobs by type
        </Typography>
        <Typography sx={{ fontSize: TEXT.sm, color: TEXT_MUTED }}>
          Last {windowDays} day{Number(windowDays) === 1 ? "" : "s"} · click to filter
        </Typography>
      </Box>

      {loading && items.length === 0 ? (
        <Typography sx={{ fontSize: TEXT.sm, color: TEXT_MUTED }}>Loading…</Typography>
      ) : items.length === 0 ? (
        <Box sx={{ flex: 1, minHeight: 140, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Typography sx={{ fontSize: TEXT.sm, color: BRAND.gray }}>No jobs in window</Typography>
        </Box>
      ) : (
        <Stack direction="row" spacing={2.5} alignItems="center" sx={{ flex: 1, minWidth: 0 }}>
          <Box sx={{ position: "relative", width: 128, height: 128, flexShrink: 0 }}>
            <svg width="128" height="128" viewBox="0 0 128 128" role="img" aria-label="Jobs by type">
              <g transform="rotate(-90 64 64)">
                {slices.map((s) => (
                  <circle
                    key={s.type}
                    cx="64"
                    cy="64"
                    r={R}
                    fill="none"
                    stroke={s.color}
                    strokeWidth={selectedType === s.type ? 24 : 20}
                    strokeDasharray={`${s.len} ${C - s.len}`}
                    strokeDashoffset={-s.offset}
                    style={{ cursor: "pointer", transition: "stroke-width 120ms ease" }}
                    onClick={() => onSelectType?.(s.type)}
                  />
                ))}
              </g>
            </svg>
            <Box
              sx={{
                position: "absolute",
                inset: 0,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                pointerEvents: "none",
              }}
            >
              <Typography sx={{ fontSize: TEXT["2xl"], fontWeight: 600, color: BRAND.dark, lineHeight: 1 }}>
                {total}
              </Typography>
              <Typography sx={{ fontSize: TEXT.xs, color: TEXT_MUTED }}>jobs</Typography>
            </Box>
          </Box>

          <Stack spacing={1} sx={{ flex: 1, minWidth: 0 }}>
            {slices.map((s) => {
              const active = selectedType === s.type;
              return (
                <Stack
                  key={s.type}
                  direction="row"
                  spacing={1.25}
                  alignItems="center"
                  role="button"
                  tabIndex={0}
                  aria-pressed={active}
                  onClick={() => onSelectType?.(s.type)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onSelectType?.(s.type);
                    }
                  }}
                  sx={{
                    cursor: "pointer",
                    borderRadius: 1,
                    px: 0.75,
                    py: 0.25,
                    bgcolor: active ? BRAND.tealSoft : "transparent",
                    "&:hover": { bgcolor: active ? BRAND.tealSoft : BRAND.surfaceMuted },
                  }}
                >
                  <Box sx={{ width: 9, height: 9, borderRadius: 0.5, bgcolor: s.color, flexShrink: 0 }} />
                  <Typography sx={{ flex: 1, fontSize: TEXT.md, color: BRAND.dark, minWidth: 0 }} noWrap>
                    {s.label}
                  </Typography>
                  <Typography sx={{ fontSize: TEXT.md, fontWeight: 600, color: BRAND.dark }}>
                    {s.count}
                  </Typography>
                </Stack>
              );
            })}
          </Stack>
        </Stack>
      )}
    </SectionPaper>
  );
}

/**
 * Status as a dot plus a word, not a filled pill.
 *
 * The history renders up to a dozen rows at once. With a bordered, tinted pill
 * on every one, the screen carried a dozen coloured rectangles competing for
 * attention — and colour stopped meaning "look here" precisely because
 * everything had it. A 7px dot keeps the same at-a-glance read (colour is
 * still the first thing the eye lands on) while giving the failures back their
 * loudness relative to the completions.
 *
 * `attempts` rides alongside the label when a job has burnt more than one, so
 * "Timeout 5/5" reads as one fact instead of forcing a glance at a separate
 * column that is blank for most rows.
 */
const STATUS_DOT = {
  completed: { label: "Completed", color: BRAND.teal },
  running: { label: "Running", color: BRAND.cyanText },
  sent: { label: "Sent", color: BRAND.cyanText },
  pending: { label: "Pending", color: BRAND.alert.warning },
  retrying: { label: "Retrying", color: BRAND.alert.warning },
  failed: { label: "Failed", color: BRAND.alert.error },
  timeout: { label: "Timeout", color: BRAND.alert.error },
  cancelled: { label: "Cancelled", color: BRAND.gray },
  expired: { label: "Expired", color: BRAND.gray },
};

function renderStatusChip(status, attempts) {
  const value = String(status || "").toLowerCase();
  const spec = STATUS_DOT[value] || { label: status || "Unknown", color: BRAND.gray };
  const burnt = Number(attempts) > 1 ? String(attempts) : null;

  return (
    <Stack direction="row" spacing={1} alignItems="center" sx={{ minWidth: 0 }}>
      <Box
        sx={{ width: 7, height: 7, borderRadius: "50%", bgcolor: spec.color, flexShrink: 0 }}
      />
      <Typography sx={{ fontSize: TEXT.md, color: BRAND.dark, whiteSpace: "nowrap" }}>
        {spec.label}
      </Typography>
      {burnt ? (
        <Typography sx={{ fontSize: TEXT.sm, color: TEXT_MUTED }}>
          {burnt}
        </Typography>
      ) : null}
    </Stack>
  );
}


/**
 * Batch rows read like single rows: the same dot, the same weight.
 *
 * They kept a filled pill after the single rows moved to dots, so a grouped
 * dispatch looked like a different KIND of thing rather than the same thing
 * covering several devices — the exact confusion the batch row exists to
 * avoid. The counts stay, because on a batch "how many of them" IS the status.
 */
function renderBatchStatusChip(row) {
  const { __doneCount: done, __failedCount: failed, __totalCount: total } = row;

  let label;
  let color;
  if (done < total) {
    label = "Running";
    color = BRAND.cyanText;
  } else if (failed === 0) {
    label = "Completed";
    color = BRAND.teal;
  } else if (failed === total) {
    label = "Failed";
    color = BRAND.alert.error;
  } else {
    label = "Partial";
    color = BRAND.alert.warning;
  }

  const count = done < total ? `${done}/${total}` : failed > 0 && failed < total
    ? `${total - failed}/${total}`
    : String(total);

  return (
    <Stack direction="row" spacing={1} alignItems="center" sx={{ minWidth: 0 }}>
      <Box sx={{ width: 7, height: 7, borderRadius: "50%", bgcolor: color, flexShrink: 0 }} />
      <Typography sx={{ fontSize: TEXT.md, color: BRAND.dark, whiteSpace: "nowrap" }}>
        {label}
      </Typography>
      <Typography sx={{ fontSize: TEXT.sm, color: TEXT_MUTED }}>
        {count}
      </Typography>
    </Stack>
  );
}


export default function Jobs() {
  const theme = useTheme();
  const isMdDown = useMediaQuery(theme.breakpoints.down("md"));
  const isSmDown = useMediaQuery(theme.breakpoints.down("sm"));
  const { auth } = useAuthContext();
  const confirm = useConfirm();

  const tenantId = auth?.tenantId;
  const isActiveMember = auth?.tenantMember?.isActive === true;

  // ADR-0011 Phase 2: whether this page renders at all is driven by the
  // caller's own effective capabilities (custom or built-in role), not a
  // hardcoded OWNER/ADMIN name check — a custom role granted "jobs" (e.g.
  // "IT Support") gets in, same as OWNER/ADMIN, and so does a built-in
  // USER (BUILTIN_ROLE_SEED_PERMISSIONS already grants USER "jobs" — it
  // was only this page's own gate that never honored that). Dispatch/
  // retry/cancel remain admin+capability gated server-side regardless
  // (requireTenantAdmin + requireCapability("jobs") in
  // jobs.routes.ts) — a member who can view but not dispatch will get
  // today's existing error handling on those actions; splitting that out
  // into its own finer-grained gate is Phase 4, not this pass.
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
  const canManageJobs = isActiveMember && Boolean(myPermissions?.has("jobs"));

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
        listAllKnownDevices(),
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
  // Which triage cell drives the history filter, or "" for none. Declared here
  // with the other filters because `filteredRows` reads it — further down it
  // was a TDZ error the build never sees and the page smoke test does.
  const [triageFilter, setTriageFilter] = React.useState("");
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

      // "Stuck" has no status of its own: it is pending/retrying that never
      // left the queue. Without this predicate the triage cell would count
      // rows the table could not then show.
      const matchesStuck =
        triageFilter !== "stuck" ||
        (["pending", "retrying"].includes(String(row.status || "").toLowerCase()) &&
          !row.sent_at);

      return matchesStatus && matchesJobType && matchesSearch && matchesStuck;
    });
  }, [groupedRows, deviceMap, deferredSearch, statusFilter, jobTypeFilter, triageFilter]);

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
      // ── Device · Type, one cell ───────────────────────────────────
      // They were two columns, and they are read together: "which machine,
      // doing what". Merging them frees the width that made every column
      // truncate, and lets the device — the thing an operator scans for —
      // carry the weight while the type sits under it as the qualifier.
      field: "hostname",
      headerName: "Device · Type",
      minWidth: 240,
      flex: 1.1,
      sortable: true,
      valueGetter: (_value, row) =>
        row.__isBatch
          ? `${row.__totalCount} devices`
          : deviceMap.get(String(row.device_id || ""))?.hostname || row.device_id,
      renderCell: (params) => (
        <Box sx={{ minWidth: 0, py: 0.5 }}>
          <Typography
            sx={{ fontSize: TEXT.md, fontWeight: 600, color: BRAND.dark }}
            noWrap
          >
            {params.value}
          </Typography>
          <Typography sx={{ fontSize: TEXT.sm, color: TEXT_MUTED }} noWrap>
            {jobTypeLabels.get(params.row.job_type) || params.row.job_type}
          </Typography>
        </Box>
      ),
    },
    {
      // ── Status, with attempts and the error that explains it ──────
      // `attempts` and `last_error` were their own columns. Both are blank
      // or "-" on the majority of rows (a job that worked has one attempt
      // and no error), so they spent full-width columns saying nothing and
      // forced the useful ones to truncate. Folded in here they appear only
      // when they mean something, next to the status they qualify.
      field: "status",
      headerName: "Status",
      minWidth: 210,
      flex: 0.95,
      renderCell: (params) => {
        if (params.row.__isBatch) return renderBatchStatusChip(params.row);
        const error = params.row.last_error;
        return (
          <Box sx={{ minWidth: 0, py: 0.5 }}>
            {renderStatusChip(params.value, params.row.attempts)}
            {error ? (
              <Typography
                sx={{ fontSize: TEXT.sm, color: BRAND.alert.errorText, mt: 0.25 }}
                noWrap
                title={error}
              >
                {error}
              </Typography>
            ) : null}
          </Box>
        );
      },
    },
    {
      // Completed-at moves into the detail panel — on a history the question
      // is almost always "when was this fired".
      field: "created_at",
      headerName: "When",
      minWidth: 160,
      flex: 0.6,
      renderCell: (params) => (
        <Typography sx={{ fontSize: TEXT.sm, color: BRAND.dark }} noWrap>
          {formatDate(params.value)}
        </Typography>
      ),
    },
    {
      // Backend LEFT JOIN's TenantMember on the sub so we can show the
      // operator email instead of a raw Auth0 subject like `auth0|abc123`.
      // Falls back to the sub when no membership row matches (old rows,
      // deleted users) so we never show "—" in place of identifiable info.
      field: "created_by",
      headerName: "Who",
      minWidth: 190,
      flex: 0.8,
      valueGetter: (_value, row) =>
        row.created_by_email || row.created_by || "system",
      renderCell: (params) => (
        <Typography sx={{ fontSize: TEXT.sm, color: TEXT_MUTED }} noWrap title={params.value}>
          {params.value}
        </Typography>
      ),
    },
  ];

  // "155 total · 2 running" — the two numbers an operator opens this page for.
  // In-flight covers everything the orchestrator still owns, so a job between
  // retries is counted as live rather than quietly dropped from both figures.
  const jobCountSummary = React.useMemo(() => {
    const total = tenantJobs.length;
    const live = tenantJobs.filter((j) =>
      ["pending", "sent", "running", "retrying"].includes(String(j.status || "").toLowerCase())
    ).length;
    if (!total) return "No jobs yet";
    const totalText = `${total}${historyTruncated ? "+" : ""} total`;
    return live ? `${totalText} · ${live} in flight` : totalText;
  }, [tenantJobs, historyTruncated]);

  // ── Failures, two lenses ──────────────────────────────────────────────
  const [failureLens, setFailureLens] = React.useState("cause");

  const failureLensRows = React.useMemo(() => {
    if (failureLens === "device") {
      return groupFailingDevices(tenantJobs, { deviceMap }).map((d) => ({
        key: d.deviceId,
        label: d.hostname,
        count: d.count,
        meta: d.lastAt ? formatDate(new Date(d.lastAt).toISOString()) : null,
        // Search by hostname: it is what the row shows and what the search
        // box matches. Falls back to the id for a device the roster lost.
        term: d.hostname,
        dot: d.count >= 3 ? BRAND.alert.error : BRAND.alert.warning,
      }));
    }
    return groupFailureCauses(tenantJobs).map((c) => ({
      key: c.cause,
      label: c.cause,
      count: c.count,
      meta: null,
      // The search box already matches last_error, so the normalized cause
      // works as a term without adding a filter to the backend. "unreported"
      // is a label, not a string in the data — searching it would match
      // nothing, so it searches nothing and just clears.
      term: c.cause === "unreported" ? "" : c.cause,
      dot: c.count >= 3 ? BRAND.alert.error : BRAND.alert.warning,
    }));
  }, [failureLens, tenantJobs, deviceMap]);

  // ── Triage ────────────────────────────────────────────────────────────
  const triage = React.useMemo(() => deriveTriage(tenantJobs), [tenantJobs]);

  const triageCells = React.useMemo(
    () => [
      {
        key: "failed",
        label: "FAILED · 24H",
        value: triage.failed,
        sub: "need review",
        dot: BRAND.alert.error,
        fg: triage.failed > 0 ? BRAND.alert.errorText : BRAND.dark,
      },
      {
        key: "timeout",
        label: "TIMED OUT · 24H",
        value: triage.timedOut,
        sub: "agent went quiet",
        dot: BRAND.alert.error,
        fg: triage.timedOut > 0 ? BRAND.alert.errorText : BRAND.dark,
      },
      {
        key: "stuck",
        label: "STUCK IN QUEUE",
        value: triage.stuck,
        sub: "never sent, >24h",
        dot: BRAND.alert.warning,
        fg: triage.stuck > 0 ? BRAND.alert.warningText : BRAND.dark,
      },
      {
        key: "success",
        label: "SUCCESS RATE",
        // null (nothing terminal yet) prints as an em dash rather than 0%,
        // which would read as "everything is failing".
        value: triage.successRate === null ? "—" : `${triage.successRate}%`,
        sub: triage.terminal ? `${triage.completed} of ${triage.terminal}` : "no finished jobs",
        dot: BRAND.teal,
        fg: BRAND.dark,
      },
    ],
    [triage]
  );

  /**
   * Clicking a triage cell filters the table below.
   *
   * This is what makes the band worth its space: every panel is an entry
   * point into the history, not decoration. It reuses the status filter the
   * page already has — nothing new in the backend.
   *
   * "success" is deliberately NOT a filter: it is a rate, not a set of rows.
   * Clicking it clears instead, which is also what a second click on an
   * active cell does.
   */
  const applyTriageFilter = React.useCallback((key) => {
    setTriageFilter((current) => {
      const next = current === key || key === "success" ? "" : key;
      setStatusFilter(next === "failed" ? "failed" : next === "timeout" ? "timeout" : "all");
      // `stuck` has no status of its own — it is pending/retrying that never
      // left. The rows are surfaced through the dedicated flag below.
      return next;
    });
  }, []);

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

  if (capabilitiesLoading) {
    // Avoids a flash of the "restricted" message below while the
    // caller's own permission set is still in flight.
    return (
      <Box sx={{ px: { xs: 2, sm: 0.5 }, py: { xs: 2, sm: 0.5 } }}>
        <Typography sx={{ fontSize: TEXT.sm, color: TEXT_MUTED }}>Loading…</Typography>
      </Box>
    );
  }

  if (!canManageJobs) {
    return (
      <Box sx={{ px: { xs: 2, sm: 0.5 }, py: { xs: 2, sm: 0.5 } }}>
        <Alert severity="warning" sx={{ mb: 2, borderRadius: 3 }}>
          You don't have permission to view jobs. Ask a tenant admin to grant the Jobs capability.
        </Alert>
      </Box>
    );
  }

  return (
    <Box sx={{ px: { xs: 2, sm: 0.5 }, py: { xs: 2, sm: 0.5 } }}>
      <PageHeader
        title="Jobs"
        subtitle="Dispatch and track orchestrator jobs across the fleet"
        // The live count keeps its place, but in the `chips` slot rather than
        // in the title — same slot Overview uses for its freshness line. The
        // heading itself stays identical to the other 22 pages.
        chips={
          <Typography variant="caption" sx={{ color: "text.secondary" }}>
            {jobCountSummary}
          </Typography>
        }
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

      {/* ── Triage strip ────────────────────────────────────────────────
          Replaces five KPI cards that between them said very little about
          jobs: two measured the FLEET (connected / known devices, which
          belong on Overview), two restated what the page heading now
          carries (total, in flight), and NONE showed failures — the one
          number on a jobs page that asks for a person.

          `stuck` in particular exists nowhere else in the UI: jobs that
          were never sent and have been waiting over a day. Two of them sat
          on a dead endpoint for 46 hours and only surfaced by querying the
          database by hand.

          Each cell filters the history below — see `applyTriageFilter`. */}
      <SectionPaper variant="panel" sx={{ p: 0, mb: 2, overflow: "hidden" }}>
        <Stack direction={{ xs: "column", sm: "row" }} sx={{ minWidth: 0 }}>
          {triageCells.map((cell) => {
            const active = triageFilter === cell.key;
            return (
              <Box
                key={cell.key}
                role="button"
                tabIndex={0}
                aria-label={`${cell.label}: ${cell.value}. Filter the history`}
                aria-pressed={active}
                onClick={() => applyTriageFilter(cell.key)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    applyTriageFilter(cell.key);
                  }
                }}
                sx={{
                  flex: 1,
                  minWidth: 0,
                  px: 2.25,
                  py: 1.5,
                  cursor: "pointer",
                  borderRight: { sm: `1px solid ${BRAND.border}` },
                  borderBottom: { xs: `1px solid ${BRAND.border}`, sm: "none" },
                  "&:last-of-type": { borderRight: "none", borderBottom: "none" },
                  bgcolor: active ? BRAND.tealSoft : "transparent",
                  transition: "background-color 120ms ease",
                  "&:hover": { bgcolor: active ? BRAND.tealSoft : BRAND.surfaceMuted },
                }}
              >
                <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
                  <Box sx={{ width: 7, height: 7, borderRadius: "50%", bgcolor: cell.dot, flexShrink: 0 }} />
                  <Typography sx={{ fontSize: TEXT.xs, fontWeight: 600, letterSpacing: 0.6, color: TEXT_MUTED }}>
                    {cell.label}
                  </Typography>
                </Stack>
                <Stack direction="row" spacing={1} alignItems="baseline">
                  <Typography sx={{ fontSize: TEXT["3xl"], fontWeight: 600, color: cell.fg, lineHeight: 1 }}>
                    {cell.value}
                  </Typography>
                  <Typography sx={{ fontSize: TEXT.sm, color: TEXT_MUTED }} noWrap>
                    {cell.sub}
                  </Typography>
                </Stack>
              </Box>
            );
          })}
        </Stack>
      </SectionPaper>

      {/* Jobs by status (timeseries) + Jobs by type (breakdown).
          The two share `chartWindowDays`; the chart's window toggle
          re-slices both cards in lock-step. Laid out 8/4 so the stack
          has room for one readable column per day on md+ screens. */}
      <Grid container spacing={2} sx={{ mb: 2 }} alignItems="stretch">
        <Grid size={{ xs: 12, md: 8 }}>
          <JobsTimeseriesChart
            result={chartTimeseries}
            loading={chartLoading}
            windowDays={chartWindowDays}
            onWindowDaysChange={setChartWindowDays}
            // Stacked here, not on Overview: this card sits directly above
            // the history it summarises, so the question is what SHARE of
            // the day failed — a band, not three lines to eyeball against
            // each other. Overview keeps the lines.
            variant="stacked"
          />
        </Grid>
        <Grid size={{ xs: 12, md: 4 }}>
          <JobsByTypeCard
            windowDays={chartWindowDays}
            data={jobsByType}
            typeLabels={jobTypeLabels}
            selectedType={jobTypeFilter === "all" ? null : jobTypeFilter}
            onSelectType={(type) =>
              setJobTypeFilter((current) => (current === type ? "all" : type))
            }
            loading={chartLoading || loadingJobs}
          />
        </Grid>
      </Grid>

      {/* ── Failures, two lenses ─────────────────────────────────────────
          "What is breaking" and "where is it breaking" are the same question
          from two angles, so they share one panel with a toggle instead of
          taking a slot each. Both feed the search box the page already has —
          it matches last_error and hostname — so neither lens needs a new
          backend filter.

          Only rendered when something IS failing: a panel that spends most of
          its life saying "nothing here" is the kind of decoration this
          refactor is removing. */}
      {failureLensRows.length > 0 ? (
        <SectionPaper variant="panel" sx={{ p: 0, mb: 2, overflow: "hidden" }}>
          <Stack
            direction={{ xs: "column", sm: "row" }}
            spacing={1.5}
            alignItems={{ sm: "center" }}
            justifyContent="space-between"
            sx={{ px: 2, py: 1.5, borderBottom: `1px solid ${BRAND.border}` }}
          >
            <Box>
              <Typography variant="subtitle2" sx={{ color: BRAND.dark, fontWeight: 700 }}>
                Failures
              </Typography>
              <Typography sx={{ fontSize: TEXT.sm, color: TEXT_MUTED }}>
                {failureLens === "cause"
                  ? "What is breaking — click to search the history"
                  : "Where it keeps breaking — click to search the history"}
              </Typography>
            </Box>
            <Stack direction="row" sx={{ border: `1px solid ${BRAND.borderStrong}`, borderRadius: 2, overflow: "hidden", flexShrink: 0 }}>
              {[
                { key: "cause", label: "By cause" },
                { key: "device", label: "By device" },
              ].map((lens) => (
                <Box
                  key={lens.key}
                  role="button"
                  tabIndex={0}
                  aria-pressed={failureLens === lens.key}
                  onClick={() => setFailureLens(lens.key)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setFailureLens(lens.key);
                    }
                  }}
                  sx={{
                    px: 1.75,
                    minHeight: 34,
                    display: "flex",
                    alignItems: "center",
                    cursor: "pointer",
                    fontSize: TEXT.md,
                    fontWeight: failureLens === lens.key ? 700 : 400,
                    color: failureLens === lens.key ? BRAND.dark : TEXT_MUTED,
                    bgcolor: failureLens === lens.key ? BRAND.tealSoft : "transparent",
                  }}
                >
                  {lens.label}
                </Box>
              ))}
            </Stack>
          </Stack>

          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" } }}>
            {failureLensRows.map((row) => (
              <Stack
                key={row.key}
                direction="row"
                spacing={1.5}
                alignItems="center"
                role="button"
                tabIndex={0}
                aria-label={`${row.label}: ${row.count} failures. Search the history`}
                onClick={() => setSearch(row.term)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setSearch(row.term);
                  }
                }}
                sx={{
                  px: 2,
                  py: 1.25,
                  cursor: "pointer",
                  borderBottom: `1px solid ${BRAND.border}`,
                  "&:hover": { bgcolor: BRAND.surfaceMuted },
                }}
              >
                <Box sx={{ width: 7, height: 7, borderRadius: "50%", bgcolor: row.dot, flexShrink: 0 }} />
                <Typography sx={{ flex: 1, fontSize: TEXT.md, color: BRAND.dark, minWidth: 0 }} noWrap title={row.label}>
                  {row.label}
                </Typography>
                {row.meta ? (
                  <Typography sx={{ fontSize: TEXT.sm, color: TEXT_MUTED }}>
                    {row.meta}
                  </Typography>
                ) : null}
                <Typography sx={{ fontSize: TEXT.md, fontWeight: 600, color: row.dot }}>
                  {row.count}
                </Typography>
              </Stack>
            ))}
          </Box>
        </SectionPaper>
      ) : null}

      <SectionPaper
        variant="panel"
        // Collapsed, this is a BAR, not a card: tighter padding and no shadow,
        // so it reads as a control the operator can walk past on the way to
        // the table. Expanded it becomes the panel it always was.
        sx={{
          p: createJobOpen ? { xs: 1.5, sm: 2.5 } : { xs: 1, sm: 1.25 },
          mb: 2,
          boxShadow: createJobOpen ? undefined : "none",
        }}
      >
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
          {createJobOpen ? (
            <Box>
              <Typography variant="subtitle2" sx={{ color: BRAND.dark, fontWeight: 700, mb: 0.25 }}>
                Create Job
              </Typography>
              <Typography sx={{ fontSize: TEXT.md, color: TEXT_MUTED }}>
                Dispatch a job to a single device or to every connected device in the tenant.
              </Typography>
            </Box>
          ) : (
            // Collapsed: one line. The sentence explaining what dispatching is
            // costs a second row of vertical space on every visit to a page
            // whose subject is the table below it.
            <Stack direction="row" spacing={1.25} alignItems="center" sx={{ minWidth: 0 }}>
              <Box sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: BRAND.teal, flexShrink: 0 }} />
              <Typography sx={{ fontSize: TEXT.base, fontWeight: 600, color: BRAND.dark }}>
                Create Job
              </Typography>
              <Typography sx={{ fontSize: TEXT.md, color: TEXT_MUTED }} noWrap>
                one device, a group, or the whole tenant
              </Typography>
            </Stack>
          )}
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
              <Typography variant="subtitle2" sx={{ color: BRAND.dark, fontWeight: 700 }}>
                Tenant Job History
              </Typography>
              <Typography sx={{ fontSize: TEXT.sm, color: TEXT_MUTED }}>
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
              <Typography variant="subtitle2" sx={{ color: BRAND.dark, fontWeight: 700 }}>
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
                <Typography sx={{ color: TEXT_MUTED }}>Loading batch…</Typography>
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
                            <Typography sx={{ fontSize: TEXT.md, fontWeight: 600, color: BRAND.dark }} noWrap>
                              {deviceMap.get(String(job.device_id || ""))?.hostname || job.device_id}
                            </Typography>
                            {job.last_error ? (
                              <Typography sx={{ fontSize: TEXT.xs, color: BRAND.alert.error }} noWrap>
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
                  color: TEXT_MUTED,
                  p: 3,
                  border: `1px dashed ${BRAND.border}`,
                  borderRadius: 2,
                  bgcolor: BRAND.darkSoft,
                }}
              >
                <Box>
                  <InfoOutlinedIcon sx={{ fontSize: ICON["2xl"], color: BRAND.gray, mb: 1 }} />
                  <Typography variant="body2">Select a job from the table to see its details.</Typography>
                </Box>
              </Box>
            ) : loadingJobDetail ? (
              <Typography sx={{ color: TEXT_MUTED }}>Loading job detail…</Typography>
            ) : !selectedJob ? (
              <Typography sx={{ color: TEXT_MUTED }}>Job detail unavailable.</Typography>
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
                          fontSize: TEXT.md,
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
                          fontSize: TEXT.sm,
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
                      color: NEUTRAL[100],
                      borderColor: BRAND.dark,
                      overflow: "auto",
                      maxHeight: 220,
                      fontFamily: "monospace",
                      fontSize: TEXT.sm,
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
