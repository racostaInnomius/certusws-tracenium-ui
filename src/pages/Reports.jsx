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
import VisibilityOutlinedIcon from "@mui/icons-material/VisibilityOutlined";
import PlayArrowOutlinedIcon from "@mui/icons-material/PlayArrowOutlined";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import BrandSnackbar from "../components/common/BrandSnackbar";
import { useConfirm } from "../components/common/ConfirmDialog";
import EmailReportDialog from "../components/Reports/EmailReportDialog";
import ReportParamsDialog from "../components/Reports/ReportParamsDialog";
import ScheduleReportDialog from "../components/Reports/ScheduleReportDialog";
import GrcConnectorPanel from "../components/Reports/GrcConnectorPanel";
import FleetHealthPreview from "../components/Reports/FleetHealthPreview";
import {
  getReportTypes, getReportRuns, runReport,
  listReportSchedules, updateReportSchedule, deleteReportSchedule, runReportScheduleNow, downloadReportRun,
} from "../api/reports";
import {
  describePeriod, formatWhen, recipientCount, runStatusColor, runStatusLabel, summarizeParams, triggerLabel, typeHasPeriod,
} from "../components/Reports/reportSchedules";
import { BRAND, TEXT } from "../theme/brand";
import { getSearchParam, updateSearchParams } from "../utils/browserState";

/**
 * Qué tipos saben enseñarse antes de generarse.
 *
 * Una vista previa NO es genérica: hay que saber qué significan los campos de
 * ese informe para pintar KPIs y una tendencia. Por eso es un registro por
 * clave y no una casilla en el catálogo — un tipo sin entrada aquí
 * simplemente no ofrece el botón, en vez de abrir un diálogo vacío.
 */
const PREVIEW_BY_KEY = {
  "global.fleet-health": FleetHealthPreview,
};

export default function Reports() {
  const confirm = useConfirm();
  const [rows, setRows] = React.useState([]);
  const [runs, setRuns] = React.useState([]);
  const [schedules, setSchedules] = React.useState([]);
  // ¿Puede esta sesión administrar programaciones? Lo dice el SERVIDOR, no un
  // rol leído aquí: en una sesión MSP el rol efectivo sobre el cliente activo
  // no es el de `auth.role`, y duplicar esa resolución en el portal es cómo se
  // termina enseñando un botón que siempre da 403 (o escondiéndoselo a quien
  // sí puede). El 403 del listado es la respuesta a la pregunta.
  const [canSchedule, setCanSchedule] = React.useState(true);
  const [loading, setLoading] = React.useState(true);
  // `${key}:${format}` while that specific button's download is in flight.
  const [runningKey, setRunningKey] = React.useState(null);
  const [busyScheduleId, setBusyScheduleId] = React.useState(null);
  const [snackbar, setSnackbar] = React.useState({ open: false, message: "", severity: "success" });
  const [emailTarget, setEmailTarget] = React.useState(null);
  const [scheduleTarget, setScheduleTarget] = React.useState(null);
  const [previewTarget, setPreviewTarget] = React.useState(null); // fila del catálogo
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
      setCanSchedule(true);
    } catch (err) {
      setSchedules([]);
      // 403 ≠ "no hay ninguna". Puede haber programaciones y esta sesión no
      // tener por qué verlas; decir "No schedules yet" sería mentir.
      if (err?.status === 403) setCanSchedule(false);
    }
  }, []);

  /**
   * `silent` para las recargas que siguen a una acción del usuario.
   *
   * Sin él, cada "Run now", cada borrado y cada envío ponía las TRES tablas
   * en estado de carga: la página entera parpadeaba para refrescar una fila.
   * El spinner tiene sentido al entrar, cuando de verdad no hay nada que
   * mirar; después estorba y hace perder el sitio.
   */
  const loadData = React.useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    try {
      const [typesRes, runsRes] = await Promise.all([getReportTypes(), getReportRuns({ limit: 20 })]);
      setRows((typesRes.types || []).map((t) => ({ id: t.key, ...t })));
      setRuns(runsRes.runs || []);
      await loadSchedules();
    } catch (err) {
      setSnackbar({ open: true, message: err?.message || "Could not load reports.", severity: "error" });
    } finally {
      if (!silent) setLoading(false);
    }
  }, [loadSchedules]);

  React.useEffect(() => {
    loadData();
  }, [loadData]);

  const typeByKey = React.useMemo(() => Object.fromEntries(rows.map((r) => [r.key, r])), [rows]);

  const handleRun = React.useCallback(async (key, format, params) => {
    setRunningKey(`${key}:${format}`);
    try {
      await runReport(key, format, params);
      // Refresh the history table so the run just kicked off shows up
      // without a manual reload. En silencio: es una recarga, no una entrada.
      loadData({ silent: true });
    } catch (err) {
      setSnackbar({ open: true, message: err?.message || "Report failed.", severity: "error" });
    } finally {
      setRunningKey(null);
    }
  }, [loadData]);

  /**
   * Llegada desde otra página con un informe ya elegido (`?reportKey=`).
   *
   * Lo usa el botón "Report" de Overview. Antes abría ahí mismo un diálogo
   * propio que descargaba por `/api/v1/fleet-report`: el fichero salía, pero
   * NO quedaba constancia. `report_runs` es el ledger que contesta "¿quién se
   * llevó qué y cuándo?" —y de donde cuelgan la re-entrega y el hash del
   * artefacto—, así que un export que lo esquiva es una copia sin trazabilidad
   * circulando por ahí. Ahora se genera por el motor, como cualquier otro.
   *
   * Se PIDE CONFIRMACIÓN en vez de disparar al aterrizar: generar un informe
   * no es gratis (arma el PDF entero) y deja una fila con el nombre de quien
   * lo pidió. Que un clic en otra página produzca eso sin preguntar convierte
   * un enlace en un botón de acción a distancia.
   */
  const preselectDoneRef = React.useRef(false);
  React.useEffect(() => {
    if (preselectDoneRef.current) return;
    const wanted = getSearchParam("reportKey", "");
    if (!wanted) return;
    // Esperar al catálogo: sin él no se sabe si el tipo existe, qué formatos
    // admite ni cómo se llama en la confirmación.
    if (loading || rows.length === 0) return;

    preselectDoneRef.current = true;
    // El parámetro se consume: si se queda en la URL, cada recarga vuelve a
    // preguntar por un informe que el operador ya decidió.
    updateSearchParams({ reportKey: "", reportFormat: "" });

    const row = typeByKey[wanted];
    if (!row) {
      // El catálogo sólo trae lo que esta sesión puede ver (el backend filtra
      // por plugin y por rol), así que "no está" significa "no te toca" —
      // decirlo es mejor que un silencio que se lee como que la app se colgó.
      setSnackbar({
        open: true,
        message: `"${wanted}" is not available for this tenant or for your role.`,
        severity: "warning",
      });
      return;
    }

    const formats = Array.isArray(row.formats) ? row.formats : [];
    const wantedFormat = getSearchParam("reportFormat", "");
    const format = formats.includes(wantedFormat) ? wantedFormat : (formats.includes("pdf") ? "pdf" : formats[0]);
    if (!format) return;

    (async () => {
      const ok = await confirm({
        title: `Generate "${row.label}"?`,
        body:
          `It will be built now as ${String(format).toUpperCase()} and downloaded.\n\n` +
          "The run is recorded in this tenant's report history with your name, the time and the file's SHA-256, so it can be re-sent or verified later.",
        confirmText: `Generate ${String(format).toUpperCase()}`,
      });
      if (!ok) return;
      // Un tipo con parámetros los pide primero: confirmarlo no es lo mismo
      // que saber sobre qué periodo o framework se quiere.
      if (row.params?.length) {
        setParamsTarget({ row, format, intent: "run" });
        return;
      }
      handleRun(row.key, format);
    })();
  }, [confirm, handleRun, loading, rows, typeByKey]);


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
  const handleDeleteSchedule = async (s) => {
    // Borrar una programación se lleva por delante sus destinatarios y sus
    // destinos GRC, y no hay deshacer. Un clic era suficiente.
    const ok = await confirm({
      title: "Delete this schedule?",
      body:
        `“${typeByKey[s.reportKey]?.label || s.reportKey}” stops being generated and sent.\n\n` +
        "Its recipients and GRC destinations go with it. Reports already generated stay in the history.",
      confirmText: "Delete schedule",
      danger: true,
    });
    if (!ok) return;
    return withSchedule(s.id, () => deleteReportSchedule(s.id), "Schedule deleted.");
  };
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
          {PREVIEW_BY_KEY[params.row.key] ? (
            <Button
              size="small"
              startIcon={<VisibilityOutlinedIcon />}
              onClick={() => setPreviewTarget(params.row)}
              sx={{ textTransform: "none" }}
            >
              Preview
            </Button>
          ) : null}
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
          {canSchedule ? (
            <Button
              size="small"
              startIcon={<EventRepeatOutlinedIcon />}
              onClick={() => setScheduleTarget(params.row)}
              sx={{ textTransform: "none" }}
            >
              Schedule
            </Button>
          ) : null}
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
    {
      field: "key",
      headerName: "Report",
      minWidth: 200,
      flex: 1,
      // `scp.evidence-pack` es un identificador nuestro. El catálogo de
      // arriba ya trae la etiqueta legible; se cae a la key sólo si el tipo
      // desapareció del registro, y entonces la key es la respuesta honesta.
      valueGetter: (_v, row) => typeByKey[row.key]?.label || row.key,
    },
    { field: "format", headerName: "Format", minWidth: 80, valueFormatter: (v) => String(v || "").toUpperCase() },
    { field: "trigger", headerName: "Via", minWidth: 100, valueFormatter: (v) => triggerLabel(v) },
    { field: "actor", headerName: "By", minWidth: 200, flex: 1 },
    {
      field: "outcome",
      headerName: "Outcome",
      minWidth: 260,
      // El motivo del fallo y el hash estaban SÓLO en un tooltip. Un hash que
      // hay que descubrir pasando el ratón no sirve para verificar nada, y un
      // error que no se ve se lee como "no pasó nada". Van debajo del chip.
      renderCell: (params) => (
        <Box sx={{ display: "flex", flexDirection: "column", justifyContent: "center", height: "100%", py: 0.5, minWidth: 0 }}>
          <Chip
            size="small"
            label={runStatusLabel(params.row.outcome)}
            color={runStatusColor(params.row.outcome)}
            variant="outlined"
            sx={{ alignSelf: "flex-start" }}
          />
          {params.row.error ? (
            <Typography variant="caption" sx={{ color: BRAND.alert?.errorText || "error.main", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={params.row.error}>
              {params.row.error}
            </Typography>
          ) : params.row.sha256 ? (
            <Typography variant="caption" sx={{ color: BRAND.gray, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: TEXT.xs, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={`SHA-256 ${params.row.sha256}`}>
              {params.row.sha256.slice(0, 16)}…
            </Typography>
          ) : null}
        </Box>
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
            aria-label="Report catalog"
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
            {canSchedule
              ? 'No schedules yet. Use "Schedule" on a catalog row to get a report every month.'
              : "Schedules are managed by this tenant's administrators. There may be some running; this account cannot see them."}
          </Typography>
        ) : (
          <Box sx={{ width: "100%" }}>
            <DataGrid
              aria-label="Schedules"
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

      <Paper sx={{ p: 2, mb: 3, borderRadius: 3, border: `1px solid ${BRAND.border}`, boxShadow: BRAND.shadow }}>
        <Typography sx={{ fontSize: TEXT.md, fontWeight: 700, color: BRAND.dark, mb: 0.5 }}>
          GRC connector
        </Typography>
        <Typography sx={{ fontSize: TEXT.sm, color: BRAND.gray, mb: 1.5 }}>
          Let Vanta, Drata or any GRC platform pull the evidence-pack JSON, or push each scheduled run to it.
        </Typography>
        <GrcConnectorPanel onNotify={({ message, severity }) => setSnackbar({ open: true, message, severity })} />
      </Paper>

      <Paper sx={{ p: 2, borderRadius: 3, border: `1px solid ${BRAND.border}`, boxShadow: BRAND.shadow }}>
        <Typography sx={{ fontSize: TEXT.md, fontWeight: 700, color: BRAND.dark, mb: 1.5 }}>
          Recent runs
        </Typography>
        <Box sx={{ width: "100%" }}>
          <DataGrid
            aria-label="Recent runs"
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

      {/* Vista previa del tipo seleccionado. Se monta sólo cuando hay uno
          elegido para no arrastrar Recharts en cada render de la página. */}
      {previewTarget && PREVIEW_BY_KEY[previewTarget.key]
        ? React.createElement(PREVIEW_BY_KEY[previewTarget.key], {
            open: true,
            reportKey: previewTarget.key,
            onClose: () => setPreviewTarget(null),
            generating: String(runningKey || "").startsWith(`${previewTarget.key}:`)
              ? String(runningKey).split(":")[1]
              : "",
            // Generar desde la vista previa pasa por el MISMO `handleRun` que
            // los botones del catálogo: una sola puerta, un solo sitio donde
            // queda registrada la ejecución.
            onGenerate: (format, params) => handleRun(previewTarget.key, format, params),
          })
        : null}

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
