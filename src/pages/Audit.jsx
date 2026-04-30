import * as React from "react";
import Grid from "@mui/material/Grid";
import {
  Alert,
  Box,
  Button,
  Chip,
  Collapse,
  Divider,
  Drawer,
  IconButton,
  ListSubheader,
  MenuItem,
  Paper,
  Snackbar,
  TextField,
  Tooltip,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import { DataGrid } from "@mui/x-data-grid";
import RestartAltOutlinedIcon from "@mui/icons-material/RestartAltOutlined";
import CloseOutlinedIcon from "@mui/icons-material/CloseOutlined";
import DownloadOutlinedIcon from "@mui/icons-material/DownloadOutlined";
import AssessmentOutlinedIcon from "@mui/icons-material/AssessmentOutlined";
import BlockOutlinedIcon from "@mui/icons-material/BlockOutlined";
import DevicesOtherOutlinedIcon from "@mui/icons-material/DevicesOtherOutlined";
import ScheduleOutlinedIcon from "@mui/icons-material/ScheduleOutlined";
import FilterListOutlinedIcon from "@mui/icons-material/FilterListOutlined";
import ExpandMoreOutlinedIcon from "@mui/icons-material/ExpandMoreOutlined";
import ExpandLessOutlinedIcon from "@mui/icons-material/ExpandLessOutlined";
import FactCheckOutlinedIcon from "@mui/icons-material/FactCheckOutlined";
import AuditTimeseriesChart from "../components/Overview/AuditTimeseriesChart";

import {
  getAuditFacets,
  getAuditSummary,
  listAuditEvents
} from "../api/audit";
import { getAuditTimeseries } from "../api/overview";
import { listKnownDevices } from "../api/jobs";
import { useAuthContext } from "../auth/AuthContext";
import {
  downloadTextFile,
  getSearchParam,
  toCsv,
  updateSearchParams,
} from "../utils/browserState";

import { BRAND, DATAGRID_SX } from "../theme/brand";
import PageHeader from "../components/common/PageHeader";
import BrandSnackbar from "../components/common/BrandSnackbar";
import SectionPaper from "../components/common/SectionPaper";
import SummaryCard from "../components/common/SummaryCard";
import RefreshControl, { useAutoRefresh } from "../components/common/RefreshControl";
import { getEventTypeMeta, groupFacetsByCategory } from "../constants/auditEventTypes";

/**
 * Render an event_type cell with a category-tinted chip and the
 * pretty label. Tooltip shows the raw token for grep-driven users
 * who already know "POLICY_TENANT_PUSHED" by name and want to
 * confirm what they're looking at.
 */
function EventTypeChip({ value, dense = false }) {
  const meta = getEventTypeMeta(value);
  return (
    <Tooltip title={meta.raw || "—"} placement="top" arrow>
      <Chip
        size="small"
        label={meta.label}
        sx={{
          bgcolor: meta.tint,
          color: meta.color,
          fontWeight: 700,
          fontSize: dense ? 11 : 12,
          border: `1px solid ${meta.color}55`,
          maxWidth: "100%",
          "& .MuiChip-label": {
            overflow: "hidden",
            textOverflow: "ellipsis",
          },
        }}
      />
    </Tooltip>
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
          minWidth: 96,
          textTransform: "uppercase",
          letterSpacing: 0.3,
          flexShrink: 0,
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

function renderOutcomeChip(outcome) {
  const value = String(outcome || "").toLowerCase();

  if (value === "ok") {
    return (
      <Chip
        label="OK"
        size="small"
        sx={{ bgcolor: BRAND.tealSoft, color: BRAND.tealText, fontWeight: 700, border: `1px solid ${BRAND.teal}55` }}
      />
    );
  }

  if (value === "rejected") {
    return (
      <Chip
        label="Rejected"
        size="small"
        sx={{ bgcolor: BRAND.alert.errorSoft, color: BRAND.alert.error, fontWeight: 700, border: `1px solid ${BRAND.alert.error}55` }}
      />
    );
  }

  if (value === "error") {
    return (
      <Chip
        label="Error"
        size="small"
        sx={{ bgcolor: "rgba(199,121,43,0.14)", color: "#8b5418", fontWeight: 700, border: "1px solid rgba(199,121,43,0.4)" }}
      />
    );
  }

  return (
    <Chip
      label={outcome || "Unknown"}
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
    second: "2-digit",
  });
}

function toIsoOrUndefined(value) {
  if (!value) return undefined;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return undefined;
  return parsed.toISOString();
}

export default function Audit() {
  const initialParamsRef = React.useRef({
    deviceId: getSearchParam("auditDeviceId", ""),
    eventType: getSearchParam("auditEventType", ""),
    outcome: getSearchParam("auditOutcome", "all"),
    correlationId: getSearchParam("auditCorrelationId", ""),
    from: getSearchParam("auditFrom", ""),
    to: getSearchParam("auditTo", ""),
    page: Math.max(Number(getSearchParam("auditPage", "0")) || 0, 0),
    pageSize: Math.max(Number(getSearchParam("auditPageSize", "10")) || 10, 1),
    eventId: getSearchParam("auditEventId", ""),
  });
  const theme = useTheme();
  const isMdDown = useMediaQuery(theme.breakpoints.down("md"));
  const isSmDown = useMediaQuery(theme.breakpoints.down("sm"));
  const { auth } = useAuthContext();

  const tenantMemberRole = String(auth?.tenantMember?.role || "");
  const tenantMemberIsActive = auth?.tenantMember?.isActive === true;
  const canAccess = tenantMemberIsActive && ["OWNER", "ADMIN"].includes(tenantMemberRole);

  const [rows, setRows] = React.useState([]);
  const [summary, setSummary] = React.useState(null);
  const [facets, setFacets] = React.useState({ eventTypes: [], outcomes: [] });
  const [selectedEvent, setSelectedEvent] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  // Separate state for the timeseries chart so its own 1d/7d/30d
  // toggle (inside AuditTimeseriesChart) can refetch independently
  // without dragging the full audit load through a reload.
  const [auditTimeseries, setAuditTimeseries] = React.useState(null);
  const [loadingTimeseries, setLoadingTimeseries] = React.useState(true);

  // Filters collapse state. Default closed — the page is scannable
  // without filters most of the time, and hiding the block gives more
  // room to the event table. When a filter param is deep-linked from
  // another page we auto-expand so the user sees what's applied.
  const [filtersOpen, setFiltersOpen] = React.useState(() => {
    const p = initialParamsRef.current;
    return Boolean(
      p.deviceId || p.eventType || p.outcome || p.correlationId || p.from || p.to
    );
  });
  // device_id → hostname map, loaded once, used to render hostnames instead
  // of raw device UUIDs in table cells and detail panel.
  const [deviceIndex, setDeviceIndex] = React.useState(() => new Map());

  const [deviceId, setDeviceId] = React.useState(initialParamsRef.current.deviceId);
  const [eventType, setEventType] = React.useState(initialParamsRef.current.eventType);
  const [outcome, setOutcome] = React.useState(initialParamsRef.current.outcome);
  const [correlationId, setCorrelationId] = React.useState(initialParamsRef.current.correlationId);
  const [from, setFrom] = React.useState(initialParamsRef.current.from);
  const [to, setTo] = React.useState(initialParamsRef.current.to);
  const [paginationModel, setPaginationModel] = React.useState({
    page: initialParamsRef.current.page,
    pageSize: initialParamsRef.current.pageSize,
  });
  const [totalRows, setTotalRows] = React.useState(0);
  const [refreshNonce, setRefreshNonce] = React.useState(0);
  const [refreshing, setRefreshing] = React.useState(false);
  const [selectedEventId, setSelectedEventId] = React.useState(initialParamsRef.current.eventId);

  const [snackbar, setSnackbar] = React.useState({
    open: false,
    message: "",
    severity: "success",
  });
  const deferredDeviceId = React.useDeferredValue(deviceId);
  const deferredCorrelationId = React.useDeferredValue(correlationId);

  const queryParams = React.useMemo(() => ({
    deviceId: deferredDeviceId || undefined,
    eventType: eventType || undefined,
    outcome: outcome !== "all" ? outcome : undefined,
    correlationId: deferredCorrelationId || undefined,
    from: toIsoOrUndefined(from),
    to: toIsoOrUndefined(to),
  }), [deferredCorrelationId, deferredDeviceId, eventType, from, outcome, to]);

  const hasInvalidDateRange = React.useMemo(() => {
    if (!from || !to) return false;
    const fromTime = new Date(from).getTime();
    const toTime = new Date(to).getTime();
    if (Number.isNaN(fromTime) || Number.isNaN(toTime)) return true;
    return fromTime > toTime;
  }, [from, to]);

  React.useEffect(() => {
    setPaginationModel((prev) => ({ ...prev, page: 0 }));
  }, [deviceId, eventType, outcome, correlationId, from, to]);

  // Timeseries for the chart. Default window is 7 days — matches the
  // Overview's default so a user jumping between pages sees the same
  // shape. The chart component itself owns its own 1d/7d/30d toggle,
  // so this initial load is effectively a warmup; the chart refetches
  // independently when the user flips the window.
  React.useEffect(() => {
    if (!canAccess) return;
    let cancelled = false;
    setLoadingTimeseries(true);
    getAuditTimeseries(7)
      .then((v) => { if (!cancelled) setAuditTimeseries(v); })
      .catch(() => { if (!cancelled) setAuditTimeseries(null); })
      .finally(() => { if (!cancelled) setLoadingTimeseries(false); });
    return () => { cancelled = true; };
  }, [canAccess]);

  // Load the device catalog once so we can show hostnames instead of UUIDs.
  React.useEffect(() => {
    if (!canAccess) return;
    let cancelled = false;
    listKnownDevices()
      .then((res) => {
        if (cancelled) return;
        const items = Array.isArray(res?.items) ? res.items : [];
        const map = new Map();
        items.forEach((it) => {
          const id = String(it?.deviceId || "").trim();
          const host = String(it?.hostname || "").trim();
          if (id) map.set(id, host || id);
        });
        setDeviceIndex(map);
      })
      .catch(() => { /* non-fatal — fall back to device ids */ });
    return () => { cancelled = true; };
  }, [canAccess]);

  const getHostname = React.useCallback(
    (deviceIdValue) => {
      const id = String(deviceIdValue || "").trim();
      if (!id) return "\u2014";
      return deviceIndex.get(id) || id;
    },
    [deviceIndex]
  );

  React.useEffect(() => {
    if (!canAccess) return;
    if (hasInvalidDateRange) return;

    let cancelled = false;

    (async () => {
      try {
        setLoading(true);
        const [eventsResponse, summaryResponse, facetsResponse] = await Promise.all([
          listAuditEvents({
            ...queryParams,
            page: paginationModel.page,
            pageSize: paginationModel.pageSize,
          }),
          getAuditSummary(queryParams),
          getAuditFacets(queryParams),
        ]);

        if (cancelled) return;

        const items = Array.isArray(eventsResponse?.items) ? eventsResponse.items : [];
        setRows(items);
        setTotalRows(Number(eventsResponse?.total ?? 0));
        setSelectedEvent((current) => {
          if (selectedEventId && items.some((item) => String(item.id) === String(selectedEventId))) {
            return items.find((item) => String(item.id) === String(selectedEventId)) ?? null;
          }

          if (current && items.some((item) => item.id === current.id)) {
            return items.find((item) => item.id === current.id) ?? current;
          }

          return items[0] ?? null;
        });
        setSummary(summaryResponse?.summary ?? null);
        setFacets(facetsResponse?.facets ?? { eventTypes: [], outcomes: [] });
      } catch (e) {
        console.error(e);
        if (cancelled) return;
        setRows([]);
        setSummary(null);
        setFacets({ eventTypes: [], outcomes: [] });
        setSelectedEvent(null);
        setTotalRows(0);
        setSnackbar({
          open: true,
          message: "Failed to load audit events",
          severity: "error",
        });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [canAccess, hasInvalidDateRange, paginationModel.page, paginationModel.pageSize, queryParams, refreshNonce, selectedEventId]);

  React.useEffect(() => {
    updateSearchParams({
      auditDeviceId: deviceId,
      auditEventType: eventType,
      auditOutcome: outcome !== "all" ? outcome : "",
      auditCorrelationId: correlationId,
      auditFrom: from,
      auditTo: to,
      auditPage: paginationModel.page,
      auditPageSize: paginationModel.pageSize,
      auditEventId: selectedEvent?.id ?? selectedEventId,
    });
  }, [
    correlationId,
    deviceId,
    eventType,
    from,
    outcome,
    paginationModel.page,
    paginationModel.pageSize,
    selectedEvent?.id,
    selectedEventId,
    to,
  ]);

  React.useEffect(() => {
    if (!loading) {
      setRefreshing(false);
    }
  }, [loading]);

  const handleRefresh = React.useCallback(() => {
    setRefreshing(true);
    setRefreshNonce((value) => value + 1);
  }, []);

  const [refreshSeconds, setRefreshSeconds] = useAutoRefresh(handleRefresh, "auditAutoRefresh");

  const handleReset = React.useCallback(() => {
    setDeviceId("");
    setEventType("");
    setOutcome("all");
    setCorrelationId("");
    setFrom("");
    setTo("");
    setSelectedEventId("");
    setSelectedEvent(null);
    setPaginationModel((prev) => ({ ...prev, page: 0 }));
  }, []);

  const handleExportCsv = React.useCallback(() => {
    const csv = toCsv(rows);
    downloadTextFile(`audit-events-${new Date().toISOString()}.csv`, csv || "id\n", "text/csv;charset=utf-8");
  }, [rows]);

  const handleExportJson = React.useCallback(() => {
    const payload = {
      exportedAtUtc: new Date().toISOString(),
      filters: queryParams,
      summary,
      totalRows,
      items: rows,
      selectedEvent,
    };
    downloadTextFile(
      `audit-events-${new Date().toISOString()}.json`,
      JSON.stringify(payload, null, 2),
      "application/json;charset=utf-8"
    );
  }, [queryParams, rows, selectedEvent, summary, totalRows]);

  const columns = [
    {
      field: "occurred_at_utc",
      headerName: "Occurred At",
      minWidth: 170,
      flex: 0.7,
      renderCell: (params) => formatDate(params.value),
    },
    {
      field: "event_type",
      headerName: "Event Type",
      minWidth: 200,
      flex: 0.9,
      renderCell: (params) => <EventTypeChip value={params.value} dense />,
    },
    {
      field: "outcome",
      headerName: "Outcome",
      minWidth: 110,
      flex: 0.45,
      renderCell: (params) => renderOutcomeChip(params.value),
    },
    {
      field: "device_id",
      headerName: "Device",
      minWidth: 200,
      flex: 1,
      valueGetter: (_v, row) => getHostname(row.device_id),
    },
    { field: "correlation_id", headerName: "Correlation", minWidth: 220, flex: 0.9 },
    { field: "peer", headerName: "Peer", minWidth: 160, flex: 0.6, valueGetter: (_v, row) => row.peer || " - " },
    { field: "reason", headerName: "Reason", minWidth: 200, flex: 0.8, valueGetter: (_v, row) => row.reason || " - " },
  ];

  const columnVisibilityModel = React.useMemo(() => {
    if (isSmDown) {
      return {
        peer: false,
        reason: false,
        correlation_id: false,
      };
    }

    if (isMdDown) {
      return {
        peer: false,
      };
    }

    return {};
  }, [isMdDown, isSmDown]);

  if (!canAccess) {
    return (
      <Box sx={{ px: { xs: 2, sm: 0.5 }, py: { xs: 2, sm: 0.5 } }}>
        <Alert severity="warning" sx={{ borderRadius: 3 }}>
          Audit access is restricted to active tenant admins and owners.
        </Alert>
      </Box>
    );
  }

  return (
    <Box sx={{ px: { xs: 2, sm: 0.5 }, py: { xs: 2, sm: 0.5 }, minWidth: 0 }}>
      {/* Header */}
      <PageHeader
        title="Audit"
        subtitle="Investigate security events and operational traces from the control plane."
        icon={<FactCheckOutlinedIcon />}
        actions={
          <>
            <Button
              variant="outlined"
              startIcon={<DownloadOutlinedIcon />}
              onClick={handleExportCsv}
              disabled={rows.length === 0}
              sx={{
                textTransform: "none",
                fontWeight: 700,
                borderColor: BRAND.teal,
                color: BRAND.teal,
                "&:hover": { borderColor: BRAND.tealHover, bgcolor: BRAND.tealSoft },
              }}
            >
              CSV
            </Button>
            <Button
              variant="outlined"
              startIcon={<DownloadOutlinedIcon />}
              onClick={handleExportJson}
              disabled={rows.length === 0}
              sx={{
                textTransform: "none",
                fontWeight: 700,
                borderColor: BRAND.teal,
                color: BRAND.teal,
                "&:hover": { borderColor: BRAND.tealHover, bgcolor: BRAND.tealSoft },
              }}
            >
              JSON
            </Button>
            {/* Reset moved into the filter bar as "Clear filters"
                — surfaces only when there's something to clear, and
                keeps the header focused on the high-level actions
                (export + refresh). */}
            <RefreshControl
              refreshSeconds={refreshSeconds}
              onRefreshSecondsChange={setRefreshSeconds}
              onRefresh={handleRefresh}
              loading={refreshing}
            />
          </>
        }
      />

      {/* KPI strip — 4 cards in a single uniform row, then the
          timeseries chart full-width below.
          Why 4 instead of the previous 6:
            * Total = OK + Rejected + Error, so showing all four is
              redundant when Rejected/Error are zero (the common
              case). Folded Rejected+Error into a single "Failures"
              card with an inline breakdown.
            * Side-by-side cards + chart at md=7/5 left the chart
              cramped and the bottom-row card ("Devices seen") at
              a different height because it lacked `stretch`. A
              single full-width chart shows the histogram shape much
              better and fixes the asymmetry by removing the layout
              that caused it. */}
      <Box sx={{ mb: 2 }}>
        <Grid container spacing={2} alignItems="stretch">
          <Grid size={{ xs: 12, sm: 6, md: 3 }} sx={{ display: "flex" }}>
            <SummaryCard
              stretch
              title="Total events"
              value={summary?.total ?? 0}
              icon={<AssessmentOutlinedIcon />}
              accent={BRAND.dark}
              tint={BRAND.darkSoft}
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 3 }} sx={{ display: "flex" }}>
            {/* Failures = Rejected + Error. Tooltip on the title
                spells out the breakdown so an operator scanning a
                non-zero count knows whether to chase rejections
                (auth / policy) or errors (transport / runtime).
                When zero, the card stays neutral-tinted; when
                positive we lean error-tinted to draw the eye. */}
            {(() => {
              const rejected = summary?.rejected_count ?? 0;
              const errors = summary?.error_count ?? 0;
              const failures = rejected + errors;
              const breakdown =
                failures > 0
                  ? `Rejected: ${rejected} · Error: ${errors}`
                  : "No rejected or errored events.";
              return (
                <SummaryCard
                  stretch
                  title="Failures"
                  titleHint={`Sum of rejected + error outcomes. ${breakdown}`}
                  value={failures}
                  icon={<BlockOutlinedIcon />}
                  accent={failures > 0 ? BRAND.alert.error : BRAND.gray}
                  tint={failures > 0 ? BRAND.alert.errorSoft : BRAND.darkSoft}
                />
              );
            })()}
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 3 }} sx={{ display: "flex" }}>
            <SummaryCard
              stretch
              title="Last 24h"
              value={summary?.last_24h ?? 0}
              icon={<ScheduleOutlinedIcon />}
              accent={BRAND.teal}
              tint={BRAND.tealSoft}
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 3 }} sx={{ display: "flex" }}>
            <SummaryCard
              stretch
              title="Devices seen"
              titleHint="Distinct device IDs that ever appeared in the audit log — can exceed the current fleet because events from rejected/removed devices are retained."
              value={summary?.unique_devices ?? 0}
              icon={<DevicesOtherOutlinedIcon />}
              accent={BRAND.dark}
              tint={BRAND.cyanSoft}
            />
          </Grid>
        </Grid>
      </Box>

      {/* Timeseries chart — full width below the KPI strip.
          AuditTimeseriesChart expects the allSettled-style envelope
          (same shape it gets on the Overview page); we adapt here so
          the chart component stays untouched. */}
      <Box sx={{ mb: 2 }}>
        <AuditTimeseriesChart
          result={
            auditTimeseries
              ? { status: "fulfilled", value: auditTimeseries }
              : null
          }
          loading={loadingTimeseries}
        />
      </Box>

      {/* Filter bar — single horizontal line when collapsed, dense
          4-col grid when expanded.
          Quick filter chips ("Policy / PKI / gRPC") sit inline with
          the Filters toggle so 80% of operator triage flows ("show
          me policy events from the last day") become a one-click
          action, no panel expansion needed. Each chip drives the
          eventType state to the SCREAMING_SNAKE/lowercase top
          member of its category — picked from the live facets so
          we never set a filter to a key the backend doesn't have
          rows for. */}
      {(() => {
        const activeFilters = [
          deviceId,
          eventType,
          outcome && outcome !== "all" ? outcome : "",
          correlationId,
          from,
          to,
        ].filter((v) => String(v || "").trim() !== "").length;

        // Map each Quick Filter chip → the highest-volume event_type
        // currently in the facets that belongs to the named category.
        // If a category has no rows yet, the chip stays disabled so
        // the operator doesn't get an empty result page after click.
        const groupedFacets = groupFacetsByCategory(facets.eventTypes || []);
        const facetByCategory = Object.fromEntries(
          groupedFacets.map((g) => [g.category, g])
        );
        const QUICK_CHIPS = ["Policies", "PKI", "gRPC"];

        return (
          <Box sx={{ mb: 2 }}>
            <SectionPaper
              variant="panel"
              sx={{ p: { xs: 1, sm: 1.25 } }}
            >
              {/* Header row: toggle + active count + quick chips +
                  Reset (only when there's something to reset). One
                  flex row that wraps gracefully on small screens. */}
              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  flexWrap: "wrap",
                  gap: 1,
                }}
              >
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={<FilterListOutlinedIcon />}
                  endIcon={filtersOpen ? <ExpandLessOutlinedIcon /> : <ExpandMoreOutlinedIcon />}
                  onClick={() => setFiltersOpen((v) => !v)}
                  sx={{
                    textTransform: "none",
                    borderColor: BRAND.border,
                    color: BRAND.dark,
                    "&:hover": { borderColor: BRAND.teal, bgcolor: BRAND.tealSoft },
                  }}
                >
                  Filters
                  {activeFilters > 0 ? (
                    <Chip
                      size="small"
                      label={activeFilters}
                      sx={{
                        ml: 0.75,
                        height: 18,
                        fontSize: 11,
                        bgcolor: BRAND.tealSoft,
                        color: BRAND.tealText,
                        fontWeight: 700,
                      }}
                    />
                  ) : null}
                </Button>

                <Divider orientation="vertical" flexItem sx={{ mx: 0.5, my: 0.5 }} />

                <Typography
                  sx={{
                    fontSize: 11.5,
                    fontWeight: 700,
                    letterSpacing: 0.5,
                    textTransform: "uppercase",
                    color: BRAND.gray,
                  }}
                >
                  Quick:
                </Typography>
                {QUICK_CHIPS.map((cat) => {
                  const group = facetByCategory[cat];
                  const top = group?.items?.[0];
                  const disabled = !top;
                  const meta = top ? getEventTypeMeta(top.value) : null;
                  const isActive = top && eventType === top.value;
                  return (
                    <Chip
                      key={cat}
                      label={cat}
                      size="small"
                      clickable={!disabled}
                      onClick={() => {
                        if (!top) return;
                        setEventType(isActive ? "" : top.value);
                      }}
                      sx={{
                        fontWeight: 700,
                        bgcolor: isActive
                          ? meta?.color || BRAND.teal
                          : meta?.tint || BRAND.darkSoft,
                        color: isActive ? "#fff" : meta?.color || BRAND.gray,
                        border: `1px solid ${(meta?.color || BRAND.border)}55`,
                        opacity: disabled ? 0.4 : 1,
                        cursor: disabled ? "not-allowed" : "pointer",
                        "&:hover": disabled
                          ? {}
                          : {
                              bgcolor: isActive
                                ? meta?.color
                                : meta?.tint || BRAND.tealSoft,
                              filter: "brightness(0.97)",
                            },
                      }}
                    />
                  );
                })}

                <Box sx={{ flex: 1 }} />

                {activeFilters > 0 ? (
                  <Button
                    size="small"
                    variant="text"
                    startIcon={<RestartAltOutlinedIcon />}
                    onClick={handleReset}
                    sx={{
                      textTransform: "none",
                      color: BRAND.dark,
                      "&:hover": { bgcolor: BRAND.darkSoft },
                    }}
                  >
                    Clear filters
                  </Button>
                ) : null}
              </Box>

              {/* Expanded panel — dense 4-col grid in md+ for less
                  vertical real estate. Renders inside the same
                  SectionPaper so the visual frame stays continuous
                  with the toggle row above. */}
              <Collapse in={filtersOpen} timeout="auto" unmountOnExit>
                <Divider sx={{ my: 1.25, borderColor: BRAND.border }} />
                <Box
                  sx={{
                    display: "grid",
                    gap: 1.25,
                    gridTemplateColumns: {
                      xs: "1fr",
                      sm: "repeat(2, minmax(0, 1fr))",
                      md: "repeat(4, minmax(0, 1fr))",
                    },
                  }}
                >
                  <TextField
                    label="Device ID"
                    size="small"
                    value={deviceId}
                    onChange={(e) => setDeviceId(e.target.value)}
                    fullWidth
                  />
                  <TextField
                    select
                    label="Event Type"
                    size="small"
                    value={eventType}
                    onChange={(e) => setEventType(e.target.value)}
                    fullWidth
                  >
                    <MenuItem value="">All event types</MenuItem>
                    {groupedFacets.flatMap((group) => [
                      <ListSubheader
                        key={`hdr-${group.category}`}
                        sx={{
                          bgcolor: group.tint,
                          color: group.color,
                          fontWeight: 800,
                          letterSpacing: 0.5,
                          fontSize: 11,
                          textTransform: "uppercase",
                          lineHeight: "28px",
                        }}
                      >
                        {group.category}
                      </ListSubheader>,
                      ...group.items.map((item) => (
                        <MenuItem key={item.value} value={item.value} sx={{ pl: 3 }}>
                          <Box
                            component="span"
                            sx={{
                              flex: 1,
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {item.label}
                          </Box>
                          <Typography
                            component="span"
                            sx={{
                              ml: 1,
                              fontSize: 11,
                              color: BRAND.gray,
                              fontWeight: 600,
                            }}
                          >
                            {item.count}
                          </Typography>
                        </MenuItem>
                      )),
                    ])}
                  </TextField>
                  <TextField
                    select
                    label="Outcome"
                    size="small"
                    value={outcome}
                    onChange={(e) => setOutcome(e.target.value)}
                    fullWidth
                  >
                    <MenuItem value="all">All outcomes</MenuItem>
                    {(facets.outcomes || []).map((item) => (
                      <MenuItem key={item.value} value={item.value}>
                        {item.value} ({item.count})
                      </MenuItem>
                    ))}
                  </TextField>
                  <TextField
                    label="Correlation ID"
                    size="small"
                    value={correlationId}
                    onChange={(e) => setCorrelationId(e.target.value)}
                    fullWidth
                  />
                  <TextField
                    label="From"
                    size="small"
                    type="datetime-local"
                    value={from}
                    onChange={(e) => setFrom(e.target.value)}
                    InputLabelProps={{ shrink: true }}
                    fullWidth
                  />
                  <TextField
                    label="To"
                    size="small"
                    type="datetime-local"
                    value={to}
                    onChange={(e) => setTo(e.target.value)}
                    InputLabelProps={{ shrink: true }}
                    error={hasInvalidDateRange}
                    helperText={hasInvalidDateRange ? "End date must be after start date" : ""}
                    fullWidth
                  />
                </Box>
              </Collapse>
            </SectionPaper>
          </Box>
        );
      })()}

      {/* Audit table — full width. The detail panel previously sat
          to the right (lg=4) and ate ~33% of horizontal real estate
          even when nothing was selected. Now it lives in a Drawer
          (right side, ~520px) that opens on row click and closes
          via X / backdrop click — same pattern as Patch Management.
          DataGrid uses density="compact" in md+ for ~30% more rows
          per viewport without sacrificing legibility. */}
      <SectionPaper variant="panel" sx={{ minWidth: 0, overflow: "hidden" }}>
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
            Audit Events
          </Typography>
          <Typography sx={{ fontSize: 12, color: "text.secondary" }}>
            <strong>{totalRows}</strong> total
          </Typography>
        </Box>

        <Box sx={{ width: "100%", overflowX: "auto" }}>
          <DataGrid
            autoHeight
            density={isSmDown ? "standard" : "compact"}
            disableRowSelectionOnClick
            rows={rows}
            columns={columns}
            loading={loading}
            rowCount={totalRows}
            paginationMode="server"
            paginationModel={paginationModel}
            onPaginationModelChange={setPaginationModel}
            getRowId={(row) => row.id}
            onRowClick={(params) => {
              setSelectedEvent(params.row);
              setSelectedEventId(String(params.row.id));
            }}
            pageSizeOptions={[10, 25, 50]}
            columnVisibilityModel={columnVisibilityModel}
            sx={DATAGRID_SX}
          />
        </Box>
      </SectionPaper>

      {/* Detail Drawer — opens when a row is clicked, closes on
          backdrop click, ESC, or the close button. Width is responsive:
          full-width on mobile, ~520px on tablet+, ~600px on wide
          screens. State is driven by `selectedEvent` (already in
          place) — we just route it through `open` instead of a
          conditional sidebar. */}
      <Drawer
        anchor="right"
        open={Boolean(selectedEvent)}
        onClose={() => {
          setSelectedEvent(null);
          setSelectedEventId("");
        }}
        slotProps={{
          paper: {
            sx: {
              width: { xs: "100%", sm: 520, lg: 600 },
              p: 2,
              bgcolor: "#fff",
            },
          },
        }}
      >
        {selectedEvent ? (
          <Box sx={{ display: "flex", flexDirection: "column", gap: 1.75, height: "100%" }}>
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 1,
              }}
            >
              <Typography sx={{ fontSize: 18, fontWeight: 800, color: BRAND.dark }}>
                Event Detail
              </Typography>
              <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                {renderOutcomeChip(selectedEvent.outcome)}
                <IconButton
                  size="small"
                  onClick={() => {
                    setSelectedEvent(null);
                    setSelectedEventId("");
                  }}
                  aria-label="Close detail"
                  sx={{ color: BRAND.gray, "&:hover": { color: BRAND.dark } }}
                >
                  <CloseOutlinedIcon fontSize="small" />
                </IconButton>
              </Box>
            </Box>

            <Box sx={{ display: "flex", flexDirection: "column", gap: 1.75, flex: 1, overflow: "auto" }}>
              {/* Identity */}
              <Box>
                <Typography variant="overline" sx={{ color: BRAND.teal, fontWeight: 800, letterSpacing: 1.2 }}>
                  Identity
                </Typography>
                <Box sx={{ mt: 0.5, display: "grid", gap: 0.5 }}>
                  <DetailRow label="Occurred" value={formatDate(selectedEvent.occurred_at_utc)} />
                  {/* Event Type — chip + raw token together so the
                      operator gets the pretty label AND can copy
                      the raw string for ticket / grep / docs. */}
                  <Box sx={{ display: "flex", gap: 1.5, alignItems: "center" }}>
                    <Typography
                      sx={{
                        fontSize: 12,
                        color: "text.secondary",
                        fontWeight: 600,
                        minWidth: 96,
                        textTransform: "uppercase",
                        letterSpacing: 0.3,
                        flexShrink: 0,
                      }}
                    >
                      Event Type
                    </Typography>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1, flex: 1, minWidth: 0 }}>
                      <EventTypeChip value={selectedEvent.event_type} />
                      <Typography
                        sx={{
                          fontSize: 11,
                          color: BRAND.gray,
                          fontFamily: "monospace",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {selectedEvent.event_type}
                      </Typography>
                    </Box>
                  </Box>
                  <DetailRow label="Host" value={getHostname(selectedEvent.device_id)} />
                  <DetailRow label="Device ID" value={selectedEvent.device_id || "—"} mono />
                  <DetailRow label="Correlation" value={selectedEvent.correlation_id || "—"} mono />
                </Box>
              </Box>

              <Divider sx={{ borderColor: BRAND.border }} />

              {/* Context */}
              <Box>
                <Typography variant="overline" sx={{ color: BRAND.teal, fontWeight: 800, letterSpacing: 1.2 }}>
                  Context
                </Typography>
                <Box sx={{ mt: 0.5, display: "grid", gap: 0.5 }}>
                  <DetailRow label="Peer" value={selectedEvent.peer || "—"} />
                  <DetailRow label="Reason" value={selectedEvent.reason || "—"} />
                  <DetailRow
                    label="mTLS FP"
                    value={selectedEvent.mtls_fingerprint_sha256 || "—"}
                    mono
                  />
                </Box>
              </Box>

              <Divider sx={{ borderColor: BRAND.border }} />

              {/* Details JSON */}
              <Box>
                <Typography variant="overline" sx={{ color: BRAND.teal, fontWeight: 800, letterSpacing: 1.2 }}>
                  Details
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
                    maxHeight: 360,
                    fontFamily: "monospace",
                    fontSize: 12,
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                  }}
                >
                  {JSON.stringify(selectedEvent.details ?? {}, null, 2)}
                </Paper>
              </Box>
            </Box>
          </Box>
        ) : null}
      </Drawer>

      <BrandSnackbar
        open={snackbar.open}
        severity={snackbar.severity}
        message={snackbar.message}
        onClose={() => setSnackbar((prev) => ({ ...prev, open: false }))}
      />
    </Box>
  );
}
