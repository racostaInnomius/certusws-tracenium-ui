// src/pages/Reports.jsx
//
// ADR-0008 Fase F1a — "one door for every report". Catalog is entirely
// server-driven (GET /api/v1/reports/types): a tenant without a given
// plugin/role simply never sees that row, so there's no client-side
// gating logic to keep in sync with the backend.
//
// ADR-0014 E3 adds two things below the catalog: monthly schedules (with
// their own ledger of what was generated, archived and sent) and a run
// history that can hand back the archived file — the exact bytes whose
// SHA-256 is on record.

import * as React from "react";
import { Box, Button, Chip, IconButton, Paper, Switch, Tooltip, Typography } from "@mui/material";
import { DataGrid } from "@mui/x-data-grid";
import DownloadOutlinedIcon from "@mui/icons-material/DownloadOutlined";
import MailOutlineIcon from "@mui/icons-material/MailOutline";
import EventRepeatOutlinedIcon from "@mui/icons-material/EventRepeatOutlined";
import PlayArrowOutlinedIcon from "@mui/icons-material/PlayArrowOutlined";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import BrandSnackbar from "../components/common/BrandSnackbar";
import EmailReportDialog from "../components/Reports/EmailReportDialog";
import ReportParamsDialog from "../components/Reports/ReportParamsDialog";
import ScheduleReportDialog from "../components/Reports/ScheduleReportDialog";
import {
  getReportTypes, getReportRuns, runReport,
  listReportSchedules, updateReportSchedule, deleteReportSchedule, runReportScheduleNow, downloadReportRun,
} from "../api/reports";
import {
  describePeriod, formatWhen, recipientCount, runStatusColor, runStatusLabel, summarizeParams, triggerLabel, typeHasPeriod,
} from "../components/Reports/reportSchedules";
import { BRAND, TEXT } from "../theme/brand";

export default function Reports() {
  const [rows, setRows] = React.useState([]);
  const [runs, setRuns] = React.useState([]);
  const [schedules, setSchedules] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  // `${key}:${format}` while that specific button's download is in flight.
  const [runningKey, setRunningKey] = React.useState(null);
  const [busyScheduleId, setBusyScheduleId] = React.useState(null);
  const [snackbar, setSnackbar] = React.useState({ open: false, message: "", severity: "success" });
  const [emailTarget, setEmailTarget] = React.useState(null);
  const [scheduleTarget, setScheduleTarget] = React.useState(null);
  // Types that declare `params` ask for them first (ReportParamsDialog);
  // `paramsTarget` remembers what to do once the operator confirms.
  const [paramsTarget, setParamsTarget] = React.useState(null); // { row, format, intent: "run" | "email" }
  const [emailParams, setEmailParams] = React.useState(null);

  const loadSchedules = React.useCallback(async () => {
    // Schedules are additive: a backend without the endpoint (or a
    // transient error) must not blank the catalog.
    try {
      const res = await listReportSchedules();
      setSchedules(res?.schedules || []);
    } catch {
      setSchedules([]);
    }
  }, []);

  const loadData = React.useCallback(async () => {
    setLoading(true);
    try {
      const [typesRes, runsRes] = await Promise.all([getReportTypes(), getReportRuns({ limit: 20 })]);
      setRows((typesRes.types || []).map((t) => ({ id: t.key, ...t })));
      setRuns(runsRes.runs || []);
      await loadSchedules();
    } catch (err) {
      setSnackbar({ open: true, message: err?.message || "Could not load reports.", severity: "error" });
    } finally {
      setLoading(false);
    }
  }, [loadSchedules]);

  React.useEffect(() => {
    loadData();
  }, [loadData]);

  const typeByKey = React.useMemo(() => Object.fromEntries(rows.map((r) => [r.key, r])), [rows]);

  const handleRun = async (key, format, params) => {
    setRunningKey(`${key}:${format}`);
    try {
      await runReport(key, format, params);
      // Refresh the history table so the run just kicked off shows up
      // without a manual reload.
      loadData();
    } catch (err) {
      setSnackbar({ open: true, message: err?.message || "Report failed.", severity: "error" });
    } finally {
      setRunningKey(null);
    }
  };

  const handleEmailResult = (result) => {
    const sentCount = result?.sent?.length || 0;
    const failedCount = result?.failed?.length || 0;
    if (failedCount === 0) {
      setSnackbar({ open: true, message: `Emailed to ${sentCount} recipient${sentCount === 1 ? "" : "s"}.`, severity: "success" });
    } else if (sentCount === 0) {
      setSnackbar({ open: true, message: `Could not send to any recipient (${result.failed[0]?.reason || "unknown error"}).`, severity: "error" });
    } else {
      setSnackbar({
        open: true,
        message: `Sent to ${sentCount}, failed for ${failedCount} (${result.failed.map((f) => f.email).join(", ")}).`,
        severity: "warning"
      });
    }
    loadData();
  };

  const withSchedule = async (id, fn, okMessage) => {
    setBusyScheduleId(id);
    try {
      await fn();
      if (okMessage) setSnackbar({ open: true, message: okMessage, severity: "success" });
      await loadSchedules();
      const runsRes = await getReportRuns({ limit: 20 }).catch(() => null);
      if (runsRes) setRuns(runsRes.runs || []);
    } catch (err) {
      setSnackbar({ open: true, message: err?.message || "Schedule action failed.", severity: "error" });
    } finally {
      setBusyScheduleId(null);
    }
  };

  const handleToggleSchedule = (s) => withSchedule(s.id, () => updateReportSchedule(s.id, { enabled: !s.enabled }));
  const handleDeleteSchedule = (s) => withSchedule(s.id, () => deleteReportSchedule(s.id), "Schedule deleted.");
  const handleRunSchedule = (s) =>
    withSchedule(s.id, async () => {
      const res = await runReportScheduleNow(s.id);
      const r = res?.result;
      if (r?.failed) throw new Error(r.errors?.[0]?.error || "Run failed.");
      if (r?.skipped) throw new Error("Skipped: the plugin behind this report is not enabled on the tenant.");
    }, "Report generated.");

  const handleDownloadRun = async (run) => {
    try {
      await downloadReportRun(run);
    } catch (err) {
      setSnackbar({ open: true, message: err?.message || "Download failed.", severity: "error" });
    }
  };

  const typeColumns = [
    { field: "group", headerName: "Group", minWidth: 100 },
    { field: "label", headerName: "Report", minWidth: 220, flex: 1 },
    { field: "description", headerName: "Description", minWidth: 320, flex: 1.4 },
    {
      field: "actions",
      headerName: "Run now",
      minWidth: 340,
      sortable: false,
      filterable: false,
      renderCell: (params) => (
        <Box sx={{ display: "flex", gap: 0.5 }}>
          {(params.row.formats || []).map((format) => (
            <Button
              key={format}
              size="small"
              startIcon={<DownloadOutlinedIcon />}
              disabled={runningKey === `${params.row.key}:${format}`}
              onClick={() =>
                params.row.params?.length
                  ? setParamsTarget({ row: params.row, format, intent: "run" })
                  : handleRun(params.row.key, format)
              }
              sx={{ textTransform: "none" }}
            >
              {format.toUpperCase()}
            </Button>
          ))}
          <Button
            size="small"
            startIcon={<MailOutlineIcon />}
            onClick={() =>
              params.row.params?.length
                ? setParamsTarget({ row: params.row, format: params.row.formats?.[0], intent: "email" })
                : setEmailTarget(params.row)
            }
            sx={{ textTransform: "none" }}
          >
            Email
          </Button>
          <Button
            size="small"
            startIcon={<EventRepeatOutlinedIcon />}
            onClick={() => setScheduleTarget(params.row)}
            sx={{ textTransform: "none" }}
          >
            Schedule
          </Button>
        </Box>
      ),
    },
  ];

  const scheduleColumns = [
    {
      field: "reportKey",
      headerName: "Report",
      minWidth: 220,
      flex: 1,
      valueGetter: (_v, row) => typeByKey[row.reportKey]?.label || row.reportKey,
    },
    { field: "format", headerName: "Format", minWidth: 80, valueFormatter: (v) => String(v || "").toUpperCase() },
    {
      field: "params",
      headerName: "Scope",
      minWidth: 200,
      flex: 1,
      sortable: false,
      valueGetter: (_v, row) => {
        const type = typeByKey[row.reportKey];
        const scope = summarizeParams(row, type);
        const period = typeHasPeriod(type) ? describePeriod(row.periodMonths) : "";
        return [scope, period].filter(Boolean).join(" · ") || "—";
      },
    },
    {
      field: "recipients",
      headerName: "Recipients",
      minWidth: 100,
      valueGetter: (_v, row) => recipientCount(row),
    },
    { field: "nextRunAt", headerName: "Next run", minWidth: 160, valueFormatter: (v) => formatWhen(v) },
    {
      field: "lastRunStatus",
      headerName: "Last run",
      minWidth: 200,
      renderCell: (params) =>
        params.row.lastRunAt ? (
          <Tooltip title={formatWhen(params.row.lastRunAt)}>
            <Chip size="small" label={runStatusLabel(params.row.lastRunStatus)} color={runStatusColor(params.row.lastRunStatus)} variant="outlined" />
          </Tooltip>
        ) : (
          <Typography sx={{ fontSize: TEXT.sm, color: BRAND.gray }}>Never</Typography>
        ),
    },
    {
      field: "enabled",
      headerName: "Enabled",
      minWidth: 90,
      sortable: false,
      renderCell: (params) => (
        <Switch
          size="small"
          checked={Boolean(params.row.enabled)}
          disabled={busyScheduleId === params.row.id}
          onChange={() => handleToggleSchedule(params.row)}
          inputProps={{ "aria-label": `Enable schedule ${params.row.id}` }}
        />
      ),
    },
    {
      field: "scheduleActions",
      headerName: "",
      minWidth: 110,
      sortable: false,
      filterable: false,
      renderCell: (params) => (
        <Box sx={{ display: "flex", gap: 0.25 }}>
          <Tooltip title="Run now">
            <span>
              <IconButton size="small" aria-label="Run now" disabled={busyScheduleId === params.row.id} onClick={() => handleRunSchedule(params.row)}>
                <PlayArrowOutlinedIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
          <Tooltip title="Delete schedule">
            <span>
              <IconButton size="small" aria-label="Delete schedule" disabled={busyScheduleId === params.row.id} onClick={() => handleDeleteSchedule(params.row)}>
                <DeleteOutlineIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
        </Box>
      ),
    },
  ];

  const runColumns = [
    { field: "occurredAt", headerName: "When", minWidth: 170, valueFormatter: (v) => formatWhen(v) },
    { field: "key", headerName: "Report", minWidth: 200, flex: 1 },
    { field: "format", headerName: "Format", minWidth: 80, valueFormatter: (v) => String(v || "").toUpperCase() },
    { field: "trigger", headerName: "Via", minWidth: 100, valueFormatter: (v) => triggerLabel(v) },
    { field: "actor", headerName: "By", minWidth: 200, flex: 1 },
    {
      field: "outcome",
      headerName: "Outcome",
      minWidth: 150,
      renderCell: (params) => (
        <Tooltip title={params.row.error || (params.row.sha256 ? `SHA-256 ${params.row.sha256}` : "")}>
          <Chip size="small" label={runStatusLabel(params.row.outcome)} color={runStatusColor(params.row.outcome)} variant="outlined" />
        </Tooltip>
      ),
    },
    {
      field: "download",
      headerName: "",
      minWidth: 60,
      sortable: false,
      filterable: false,
      renderCell: (params) =>
        params.row.downloadable ? (
          <Tooltip title="Download archived copy">
            <IconButton size="small" aria-label="Download archived copy" onClick={() => handleDownloadRun(params.row)}>
              <DownloadOutlinedIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        ) : null,
    },
  ];

  return (
    <Box>
      <Typography variant="h5" sx={{ fontWeight: 800, color: BRAND.dark, mb: 2 }}>
        Reports
      </Typography>

      <Paper
        sx={{ p: 2, mb: 3, borderRadius: 3, border: `1px solid ${BRAND.border}`, boxShadow: BRAND.shadow }}
      >
        <Typography sx={{ fontSize: TEXT.md, fontWeight: 700, color: BRAND.dark, mb: 1.5 }}>
          Catalog
        </Typography>
        <Box sx={{ width: "100%" }}>
          <DataGrid
            rows={rows}
            columns={typeColumns}
            loading={loading}
            autoHeight
            disableRowSelectionOnClick
            hideFooterSelectedRowCount
            pageSizeOptions={[10, 25]}
            initialState={{ pagination: { paginationModel: { pageSize: 10, page: 0 } } }}
            sx={{ border: "none" }}
          />
        </Box>
      </Paper>

      <Paper sx={{ p: 2, mb: 3, borderRadius: 3, border: `1px solid ${BRAND.border}`, boxShadow: BRAND.shadow }}>
        <Typography sx={{ fontSize: TEXT.md, fontWeight: 700, color: BRAND.dark, mb: 0.5 }}>
          Schedules
        </Typography>
        <Typography sx={{ fontSize: TEXT.sm, color: BRAND.gray, mb: 1.5 }}>
          Monthly on the 1st. Each run is archived with its SHA-256 and emailed to its recipients.
        </Typography>
        {schedules.length === 0 ? (
          <Typography sx={{ fontSize: TEXT.sm, color: BRAND.gray }} data-testid="schedules-empty">
            No schedules yet. Use "Schedule" on a catalog row to get a report every month.
          </Typography>
        ) : (
          <Box sx={{ width: "100%" }}>
            <DataGrid
              rows={schedules}
              columns={scheduleColumns}
              autoHeight
              disableRowSelectionOnClick
              hideFooterSelectedRowCount
              pageSizeOptions={[10, 25]}
              initialState={{ pagination: { paginationModel: { pageSize: 10, page: 0 } } }}
              sx={{ border: "none" }}
            />
          </Box>
        )}
      </Paper>

      <Paper sx={{ p: 2, borderRadius: 3, border: `1px solid ${BRAND.border}`, boxShadow: BRAND.shadow }}>
        <Typography sx={{ fontSize: TEXT.md, fontWeight: 700, color: BRAND.dark, mb: 1.5 }}>
          Recent runs
        </Typography>
        <Box sx={{ width: "100%" }}>
          <DataGrid
            rows={runs.map((r, i) => ({ id: r.id ?? `evt-${i}`, ...r }))}
            columns={runColumns}
            loading={loading}
            autoHeight
            disableRowSelectionOnClick
            hideFooterSelectedRowCount
            pageSizeOptions={[10, 25]}
            initialState={{ pagination: { paginationModel: { pageSize: 10, page: 0 } } }}
            sx={{ border: "none" }}
          />
        </Box>
      </Paper>

      <ReportParamsDialog
        open={Boolean(paramsTarget)}
        reportType={paramsTarget?.row || null}
        format={paramsTarget?.format}
        onClose={() => setParamsTarget(null)}
        onSubmit={(values) => {
          const t = paramsTarget;
          setParamsTarget(null);
          if (!t) return;
          if (t.intent === "email") {
            setEmailParams(values);
            setEmailTarget(t.row);
          } else {
            handleRun(t.row.key, t.format, values);
          }
        }}
      />
      <EmailReportDialog
        open={Boolean(emailTarget)}
        reportType={emailTarget}
        params={emailParams}
        onClose={() => { setEmailTarget(null); setEmailParams(null); }}
        onResult={handleEmailResult}
      />
      <ScheduleReportDialog
        open={Boolean(scheduleTarget)}
        reportType={scheduleTarget}
        onClose={() => setScheduleTarget(null)}
        onCreated={() => {
          setSnackbar({ open: true, message: "Schedule created. First run on the 1st of next month.", severity: "success" });
          loadSchedules();
        }}
      />

      <BrandSnackbar
        open={snackbar.open}
        message={snackbar.message}
        severity={snackbar.severity}
        onClose={() => setSnackbar((s) => ({ ...s, open: false }))}
      />
    </Box>
  );
}
