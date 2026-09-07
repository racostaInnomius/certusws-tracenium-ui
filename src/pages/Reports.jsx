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
//
// ── U1 del rediseño (docs/analysis/reports-page-2026-09.md) ──────────
//
// Cabecera canónica y CUATRO PESTAÑAS, donde había cuatro Paper apilados en un
// scroll. Cada pestaña contesta una pregunta distinta:
//
//   Catalog    ¿qué puedo sacar?      ← la puerta de los once botones "Report"
//   Schedules  ¿qué sale solo?
//   History    ¿qué salió, quién se lo llevó, y es el fichero que firmé?
//   Settings   ¿por dónde sale hacia fuera? (claves de API, destinos GRC)
//
// El contenido de cada una es EL MISMO de antes: U1 sólo cambia el contenedor.
// El rediseño de cada tabla llega en U2-U4, y mezclarlo aquí habría hecho
// imposible ver qué rompió qué.
//
// Esta página era la única del menú sin `PageHeader` —y por tanto sin control
// de refresco— justo cuando pasó a ser el destino de once páginas.

import * as React from "react";
import { Box, Button, Chip, Grid, IconButton, Menu, MenuItem, Stack, Switch, Tab, Tabs, TextField, Tooltip, Typography } from "@mui/material";
import { DataGrid } from "@mui/x-data-grid";
import DownloadOutlinedIcon from "@mui/icons-material/DownloadOutlined";
import SendOutlinedIcon from "@mui/icons-material/SendOutlined";
import SummarizeOutlinedIcon from "@mui/icons-material/SummarizeOutlined";
import ListAltOutlinedIcon from "@mui/icons-material/ListAltOutlined";
import HistoryOutlinedIcon from "@mui/icons-material/HistoryOutlined";
import SettingsOutlinedIcon from "@mui/icons-material/SettingsOutlined";
import EventRepeatOutlinedIcon from "@mui/icons-material/EventRepeatOutlined";
import PlayArrowOutlinedIcon from "@mui/icons-material/PlayArrowOutlined";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import AddOutlinedIcon from "@mui/icons-material/AddOutlined";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import BrandSnackbar from "../components/common/BrandSnackbar";
import PageHeader from "../components/common/PageHeader";
import SectionPaper from "../components/common/SectionPaper";
import RefreshControl, { useAutoRefresh } from "../components/common/RefreshControl";
import { useConfirm } from "../components/common/ConfirmDialog";
import EmailReportDialog from "../components/Reports/EmailReportDialog";
import ReportParamsDialog from "../components/Reports/ReportParamsDialog";
import ScheduleReportDialog from "../components/Reports/ScheduleReportDialog";
import GrcConnectorPanel from "../components/Reports/GrcConnectorPanel";
import ReportTypeCard from "../components/Reports/ReportTypeCard";
import FleetHealthPreview from "../components/Reports/FleetHealthPreview";
import {
  getReportTypes, getReportRuns, runReport,
  listReportSchedules, updateReportSchedule, deleteReportSchedule, runReportScheduleNow, downloadReportRun,
  listGrcTargets, deliverRunToGrcTarget, listGrcDeliveries,
} from "../api/reports";
import {
  describeDelivery, describePeriod, formatBytes, formatWhen, recipientCount,
  runStatusColor, runStatusLabel, summarizeParams, summarizeRunParams, triggerLabel, typeHasPeriod,
} from "../components/Reports/reportSchedules";
import { deliveryColor } from "../components/Reports/grcConnector";
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

// Las cuatro pestañas por nombre. Se guardan en la URL para que los once
// botones "Report" de las otras páginas puedan apuntar a la que toque, y para
// que recargar no devuelva siempre al catálogo.
const TAB = { catalog: 0, schedules: 1, history: 2, settings: 3 };
const TAB_BY_NAME = { catalog: 0, schedules: 1, history: 2, settings: 3 };
const NAME_BY_TAB = ["catalog", "schedules", "history", "settings"];

function a11yProps(index) {
  return { id: `reports-tab-${index}`, "aria-controls": `reports-tabpanel-${index}` };
}

const TAB_SX = {
  textTransform: "none",
  fontWeight: 700,
  minHeight: 62,
  color: "text.secondary",
  "&.Mui-selected": { color: BRAND.dark },
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
  // Programación que se está EDITANDO. El tipo se resuelve del catálogo: la
  // fila guarda su `reportKey`, y el diálogo necesita el tipo entero para
  // saber qué params pedir.
  const [editingSchedule, setEditingSchedule] = React.useState(null);
  // Menú de "New schedule": una programación es SIEMPRE de un tipo, así que lo
  // primero que hay que elegir es cuál. Abrir el diálogo sin tipo dejaría un
  // formulario que no sabe qué params pedir.
  const [newScheduleAnchor, setNewScheduleAnchor] = React.useState(null);
  const [previewTarget, setPreviewTarget] = React.useState(null); // fila del catálogo
  // Types that declare `params` ask for them first (ReportParamsDialog);
  // `paramsTarget` remembers what to do once the operator confirms.
  const [paramsTarget, setParamsTarget] = React.useState(null); // { row, format, intent: "run" | "email" }
  const [emailParams, setEmailParams] = React.useState(null);

  // Pestaña activa, persistida en la URL (`?reportsTab=`). Un enlace desde
  // otra página puede así abrir la que corresponda, y una recarga no devuelve
  // al catálogo perdiendo el sitio.
  const [activeTab, setActiveTab] = React.useState(
    () => TAB_BY_NAME[getSearchParam("reportsTab", "catalog")] ?? TAB.catalog
  );
  /**
   * Historial: filtros y página, resueltos por el SERVIDOR.
   *
   * Filtrar en el cliente sobre lo que ya se trajo funciona hasta el primer
   * tenant con volumen, y entonces miente: la tabla dice "no hay nada" cuando
   * lo que pasa es que lo buscado quedó fuera de la página descargada.
   */
  const [runFilter, setRunFilter] = React.useState({
    key: "", status: "", trigger: "", actor: "", from: "", to: "",
  });
  const [runsPage, setRunsPage] = React.useState({ page: 0, pageSize: 25 });
  const [runsTotal, setRunsTotal] = React.useState(0);
  const [runsLoading, setRunsLoading] = React.useState(false);
  /**
   * Destinos GRC, para poder RE-ENTREGAR un run desde el historial.
   *
   * ⚠️ `deliverRunToGrcTarget` llevaba desde E4 en la capa de API sin un solo
   * consumidor: la re-entrega manual —que es justo lo que la migración de la
   * forma de `params` (R0.2) vino a habilitar— no tenía dónde pulsarse. El
   * backend estaba listo y probado; faltaba el botón.
   *
   * Se traga su error: es aditivo. Un tenant sin conector GRC simplemente no
   * ve la opción, y eso no puede tumbar el historial.
   */
  const [grcTargets, setGrcTargets] = React.useState([]);
  const [redeliverAnchor, setRedeliverAnchor] = React.useState(null); // { el, run }
  /**
   * Entregas GRC indexadas por run.
   *
   * `grc_deliveries.run_id` existe desde E4 y nadie lo cruzaba: las entregas
   * vivían sueltas en el panel del conector, así que mirando un run no había
   * forma de saber si llegó a su destino. Un informe generado y no entregado
   * se lee igual que uno entregado, que es justo lo que no puede pasar.
   *
   * Se piden en UNA llamada y se indexan, en vez de una por fila: veinticinco
   * peticiones para pintar una columna es cómo se degrada una tabla.
   */
  const [deliveriesByRun, setDeliveriesByRun] = React.useState({});
  const patchRunFilter = React.useCallback((delta) => {
    setRunFilter((f) => ({ ...f, ...delta }));
    // Cambiar un filtro vuelve a la primera página: quedarse en la 4 de un
    // resultado que ahora tiene 2 enseña una tabla vacía sin motivo visible.
    setRunsPage((p) => ({ ...p, page: 0 }));
  }, []);

  const handleTabChange = React.useCallback((_e, next) => {
    setActiveTab(next);
    updateSearchParams({ reportsTab: NAME_BY_TAB[next] });
  }, []);

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
  /**
   * El historial va por su cuenta: depende de los filtros y de la página, y
   * recargarlo entero cada vez que cambia un filtro pondría también el
   * catálogo en estado de carga.
   */
  const loadRuns = React.useCallback(async () => {
    setRunsLoading(true);
    try {
      const res = await getReportRuns({
        limit: runsPage.pageSize,
        offset: runsPage.page * runsPage.pageSize,
        ...runFilter,
      });
      setRuns(res?.runs || []);
      // Las entregas de ESTA página, en una sola petición. Aditivo: un tenant
      // sin conector GRC no tiene entregas y la columna queda vacía, lo que no
      // puede tumbar el historial.
      listGrcDeliveries({ limit: 200 })
        .then((d) => {
          const porRun = {};
          for (const del of d?.deliveries || []) {
            if (del.runId == null) continue;
            (porRun[del.runId] ||= []).push(del);
          }
          setDeliveriesByRun(porRun);
        })
        .catch(() => setDeliveriesByRun({}));
      // `total` es el de LA CONSULTA. Sin él el paginador no sabe cuántas
      // páginas hay y el operador no sabe si lo que busca quedó fuera.
      setRunsTotal(Number(res?.total ?? 0));
    } catch (err) {
      setSnackbar({ open: true, message: err?.message || "Could not load the history.", severity: "error" });
    } finally {
      setRunsLoading(false);
    }
  }, [runFilter, runsPage.page, runsPage.pageSize]);

  React.useEffect(() => {
    loadRuns();
  }, [loadRuns]);


  const loadData = React.useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    try {
      const typesRes = await getReportTypes();
      setRows((typesRes.types || []).map((t) => ({ id: t.key, ...t })));
      await loadRuns();
      await loadSchedules();
    } catch (err) {
      setSnackbar({ open: true, message: err?.message || "Could not load reports.", severity: "error" });
    } finally {
      if (!silent) setLoading(false);
    }
  }, [loadRuns, loadSchedules]);

  React.useEffect(() => {
    loadData();
  }, [loadData]);

  /**
   * Refresco de página.
   *
   * `loadData({silent})` ya recarga las TRES fuentes propias (catálogo,
   * historial y programaciones). El panel de GRC carga por su cuenta, así que
   * recibe un nonce: sin él, refrescar con la pestaña de Settings delante no
   * haría nada, que es la trampa que este control tiene en toda la app —
   * el botón se comporta igual tanto si recarga como si no.
   *
   * (La caché de GETs la tira `RefreshControl` antes de llamar aquí; sin eso
   * `httpGetJson` serviría lo mismo que ya tenía durante 60 s.)
   */
  const [refreshNonce, setRefreshNonce] = React.useState(0);
  const [refreshing, setRefreshing] = React.useState(false);
  const refreshAll = React.useCallback(async () => {
    setRefreshing(true);
    setRefreshNonce((n) => n + 1);
    try {
      await loadData({ silent: true });
    } finally {
      setRefreshing(false);
    }
  }, [loadData]);
  const [refreshSeconds, setRefreshSeconds] = useAutoRefresh(refreshAll, "reportsAutoRefresh");

  React.useEffect(() => {
    let vivo = true;
    listGrcTargets()
      .then((r) => vivo && setGrcTargets((r?.targets || []).filter((t) => t.enabled)))
      .catch(() => vivo && setGrcTargets([]));
    return () => { vivo = false; };
  }, [refreshNonce]);


  const typeByKey = React.useMemo(() => Object.fromEntries(rows.map((r) => [r.key, r])), [rows]);

  /**
   * El catálogo, agrupado por el `group` que ya manda el servidor.
   *
   * Se pintaba como una COLUMNA DE TEXTO en una tabla — un dato que sólo sirve
   * para agrupar, ocupando ancho en cada fila y sin agrupar nada.
   */
  const catalogGroups = React.useMemo(() => {
    const porGrupo = new Map();
    for (const r of rows) {
      const g = r.group || "Other";
      if (!porGrupo.has(g)) porGrupo.set(g, []);
      porGrupo.get(g).push(r);
    }
    return [...porGrupo.entries()];
  }, [rows]);

  /**
   * El último run de cada tipo, para enseñarlo en su tarjeta.
   *
   * Sale del historial que la página ya tiene: es la pregunta que se hace
   * ANTES de generar —"¿no lo habrá sacado ya alguien esta mañana?"— y estaba
   * a dos pantallas.
   *
   * ⚠️ Es el último de la PÁGINA cargada del historial, no el último absoluto.
   * Con el historial filtrado puede no ser el más reciente de todos; se
   * prefiere eso a una consulta por tipo sólo para pintar una línea.
   */
  const lastRunByKey = React.useMemo(() => {
    const porTipo = {};
    for (const r of runs) if (r.key && !porTipo[r.key]) porTipo[r.key] = r;
    return porTipo;
  }, [runs]);

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
    updateSearchParams({ reportKey: "", reportFormat: "", reportParams: "" });

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

    // Parámetros que manda quien enlaza (el framework seleccionado en
    // Security Compliance, por ejemplo). Si vienen rotos se ignoran: mejor
    // generar el informe con su alcance por defecto que no generar nada.
    let linkedParams = null;
    try {
      const raw = getSearchParam("reportParams", "");
      if (raw) linkedParams = JSON.parse(raw);
    } catch {
      linkedParams = null;
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
      if (row.params?.length && !linkedParams) {
        setParamsTarget({ row, format, intent: "run" });
        return;
      }
      handleRun(row.key, format, linkedParams || undefined);
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
      await loadRuns();
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

  const handleRedeliver = async (run, target) => {
    setRedeliverAnchor(null);
    try {
      const res = await deliverRunToGrcTarget(target.id, run.id);
      const r = res?.result;
      if (r && r.status !== "ok") {
        throw new Error(r.error || `Delivery failed (HTTP ${r.httpStatus ?? "?"})`);
      }
      setSnackbar({ open: true, message: `Re-delivered to "${target.label}".`, severity: "success" });
    } catch (err) {
      setSnackbar({ open: true, message: err?.message || "Re-delivery failed.", severity: "error" });
    }
  };

  const handleDownloadRun = async (run) => {
    try {
      await downloadReportRun(run);
    } catch (err) {
      setSnackbar({ open: true, message: err?.message || "Download failed.", severity: "error" });
    }
  };

  /*
   * Aquí estaba `typeColumns`: el catálogo era un DataGrid con el grupo como
   * columna de texto y hasta CINCO botones en la celda de acciones. Ahora son
   * tarjetas agrupadas (`ReportTypeCard`), donde los formatos respiran y cabe
   * el último run — la pregunta que se hace ANTES de generar otro.
   */

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
      minWidth: 150,
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
          <Tooltip title="Edit schedule">
            <span>
              <IconButton
                size="small"
                aria-label={`Edit schedule ${params.row.id}`}
                disabled={busyScheduleId === params.row.id}
                onClick={() => setEditingSchedule(params.row)}
              >
                <EditOutlinedIcon fontSize="small" />
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
    {
      field: "trigger",
      headerName: "Via",
      minWidth: 130,
      // De qué programación salió, no sólo "schedule". Un historial que dice
      // "programado" y no CUÁL obliga a adivinar cuando hay más de una.
      renderCell: (params) => (
        <Box sx={{ display: "flex", flexDirection: "column", justifyContent: "center", height: "100%", minWidth: 0 }}>
          <Typography sx={{ fontSize: TEXT.sm }}>{triggerLabel(params.row.trigger)}</Typography>
          {params.row.scheduleId ? (
            <Typography variant="caption" sx={{ color: BRAND.gray }}>
              #{params.row.scheduleId}
            </Typography>
          ) : null}
        </Box>
      ),
    },
    {
      field: "actor",
      headerName: "By",
      minWidth: 190,
      flex: 0.8,
      // A quién llegó, debajo de quién lo pidió: son la misma pregunta vista
      // desde los dos lados, y el dato ya viajaba en el DTO sin pintarse.
      renderCell: (params) => (
        <Box sx={{ display: "flex", flexDirection: "column", justifyContent: "center", height: "100%", minWidth: 0 }}>
          <Typography sx={{ fontSize: TEXT.sm, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {params.row.actor || "—"}
          </Typography>
          {describeDelivery(params.row) ? (
            <Typography variant="caption" sx={{ color: BRAND.gray }}>
              {describeDelivery(params.row)}
            </Typography>
          ) : null}
        </Box>
      ),
    },
    {
      field: "params",
      headerName: "Scope",
      minWidth: 190,
      flex: 0.9,
      sortable: false,
      // Con qué alcance se generó. Dos evidence packs del mismo tipo y el
      // mismo día pueden cubrir framework y periodo distintos: sin esto son
      // dos filas idénticas.
      valueGetter: (_v, row) => summarizeRunParams(row.params) || "—",
    },
    {
      field: "bytes",
      headerName: "Size",
      minWidth: 90,
      valueGetter: (_v, row) => formatBytes(row.bytes) || "—",
    },
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
      field: "grc",
      headerName: "GRC",
      minWidth: 110,
      sortable: false,
      // Un informe generado y NO entregado se leía igual que uno entregado.
      // `grc_deliveries.run_id` existía desde E4 y nadie lo cruzaba.
      renderCell: (params) => {
        const dels = deliveriesByRun[params.row.id] || [];
        if (dels.length === 0) return null;
        const fallidas = dels.filter((d) => d.status === "failed");
        const peor = fallidas[0] || dels[0];
        return (
          <Tooltip
            title={dels
              .map((d) => `${d.status}${d.error ? ` · ${d.error}` : ""}${d.httpStatus ? ` · HTTP ${d.httpStatus}` : ""}`)
              .join("\n")}
          >
            <Chip
              size="small"
              variant="outlined"
              color={deliveryColor(peor.status)}
              label={dels.length > 1 ? `${peor.status} ·${dels.length}` : peor.status}
            />
          </Tooltip>
        );
      },
    },
    {
      field: "download",
      headerName: "",
      minWidth: 100,
      sortable: false,
      filterable: false,
      renderCell: (params) => (
        <Box sx={{ display: "flex", gap: 0.25 }}>
          {params.row.downloadable ? (
            <Tooltip title="Download archived copy">
              <IconButton size="small" aria-label="Download archived copy" onClick={() => handleDownloadRun(params.row)}>
                <DownloadOutlinedIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          ) : null}
          {/* Re-entregar a un destino GRC. Sólo cuando hay destinos y el run
              tiene id: un run de una lista sin id no se puede referenciar. */}
          {grcTargets.length > 0 && params.row.id ? (
            <Tooltip title="Re-deliver to a GRC destination">
              <IconButton
                size="small"
                aria-label={`Re-deliver run ${params.row.id}`}
                onClick={(e) => setRedeliverAnchor({ el: e.currentTarget, run: params.row })}
              >
                <SendOutlinedIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          ) : null}
        </Box>
      ),
    },
  ];

  return (
    <Box sx={{ px: { xs: 2, sm: 0.5 }, py: { xs: 2, sm: 0.5 }, minWidth: 0 }}>
      <PageHeader
        title="Reports"
        subtitle="Generate, schedule and trace every report this tenant produces."
        icon={<SummarizeOutlinedIcon />}
        actions={
          <RefreshControl
            refreshSeconds={refreshSeconds}
            onRefreshSecondsChange={setRefreshSeconds}
            onRefresh={refreshAll}
            loading={loading || refreshing}
          />
        }
      />

      <SectionPaper variant="panel" sx={{ mb: 2, p: 0, overflow: "hidden" }}>
        <Tabs
          value={activeTab}
          onChange={handleTabChange}
          variant="scrollable"
          scrollButtons="auto"
          sx={{
            px: { xs: 1, sm: 2 },
            minHeight: 62,
            "& .MuiTabs-indicator": { height: 3, borderRadius: 999, backgroundColor: BRAND.teal },
          }}
        >
          {/* El orden es el del recorrido: qué puedo sacar → qué sale solo →
              qué salió → por dónde sale hacia fuera. */}
          <Tab icon={<ListAltOutlinedIcon fontSize="small" />} iconPosition="start" label="Catalog" {...a11yProps(TAB.catalog)} sx={TAB_SX} />
          <Tab icon={<EventRepeatOutlinedIcon fontSize="small" />} iconPosition="start" label="Schedules" {...a11yProps(TAB.schedules)} sx={TAB_SX} />
          <Tab icon={<HistoryOutlinedIcon fontSize="small" />} iconPosition="start" label="History" {...a11yProps(TAB.history)} sx={TAB_SX} />
          <Tab icon={<SettingsOutlinedIcon fontSize="small" />} iconPosition="start" label="Settings" {...a11yProps(TAB.settings)} sx={TAB_SX} />
        </Tabs>
      </SectionPaper>

      {activeTab === TAB.catalog ? (
        <SectionPaper variant="panel" sx={{ p: 2 }} role="tabpanel" id={`reports-tabpanel-${TAB.catalog}`} aria-labelledby={`reports-tab-${TAB.catalog}`}>
          <Typography sx={{ fontSize: TEXT.sm, color: BRAND.gray, mb: 1.5 }}>
            Everything this tenant can generate. Each run is recorded in the history with its
            SHA-256, whoever ran it and the scope it covered.
          </Typography>
          {loading && rows.length === 0 ? (
            <Typography sx={{ fontSize: TEXT.sm, color: BRAND.gray }}>Loading…</Typography>
          ) : rows.length === 0 ? (
            /* Un catálogo vacío tiene una causa concreta, y decirla ahorra un
               ticket: el servidor filtra por plugin y por rol, así que "no hay
               nada" significa "este tenant no tiene ningún plugin que produzca
               informes, o tu rol no alcanza ninguno". */
            <Typography sx={{ fontSize: TEXT.sm, color: BRAND.gray }} data-testid="catalog-empty">
              No reports available for this tenant. The catalog is filtered by the plugins the
              tenant has enabled and by your role — ask an administrator if you expected one here.
            </Typography>
          ) : (
            catalogGroups.map(([grupo, tipos]) => (
              <Box key={grupo} sx={{ mb: 3 }}>
                <Typography sx={{ fontSize: TEXT.sm, fontWeight: 800, color: BRAND.dark, mb: 1 }}>
                  {grupo}
                </Typography>
                <Grid container spacing={2} alignItems="stretch">
                  {tipos.map((t) => (
                    <Grid key={t.key} size={{ xs: 12, sm: 6, lg: 4 }}>
                      <ReportTypeCard
                        type={t}
                        lastRun={lastRunByKey[t.key] || null}
                        runningFormat={
                          String(runningKey || "").startsWith(`${t.key}:`)
                            ? String(runningKey).split(":")[1]
                            : ""
                        }
                        canPreview={Boolean(PREVIEW_BY_KEY[t.key])}
                        canSchedule={canSchedule}
                        onRun={(format) =>
                          t.params?.length
                            ? setParamsTarget({ row: t, format, intent: "run" })
                            : handleRun(t.key, format)
                        }
                        onPreview={() => setPreviewTarget(t)}
                        onEmail={() =>
                          t.params?.length
                            ? setParamsTarget({ row: t, format: t.formats?.[0], intent: "email" })
                            : setEmailTarget(t)
                        }
                        onSchedule={() => setScheduleTarget(t)}
                      />
                    </Grid>
                  ))}
                </Grid>
              </Box>
            ))
          )}
        </SectionPaper>
      ) : null}

      {activeTab === TAB.schedules ? (
        <SectionPaper variant="panel" sx={{ p: 2 }} role="tabpanel" id={`reports-tabpanel-${TAB.schedules}`} aria-labelledby={`reports-tab-${TAB.schedules}`}>
          {/* "New schedule" AQUÍ, además de en la tarjeta del catálogo. Quien
              entra a gestionar programaciones no tiene por qué adivinar que se
              crean desde otra pestaña. */}
          <Stack direction="row" justifyContent="space-between" alignItems="flex-start" sx={{ mb: 1.5, gap: 2 }}>
            <Typography sx={{ fontSize: TEXT.sm, color: BRAND.gray }}>
              Monthly on the 1st. Each run is archived with its SHA-256 and emailed to its recipients.
            </Typography>
            {canSchedule ? (
              <Button
                size="small"
                startIcon={<AddOutlinedIcon />}
                onClick={(e) => setNewScheduleAnchor(e.currentTarget)}
                sx={{ textTransform: "none", flexShrink: 0 }}
              >
                New schedule
              </Button>
            ) : null}
          </Stack>
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
        </SectionPaper>
      ) : null}

      {activeTab === TAB.history ? (
        <SectionPaper variant="panel" sx={{ p: 2 }} role="tabpanel" id={`reports-tabpanel-${TAB.history}`} aria-labelledby={`reports-tab-${TAB.history}`}>
          <Typography sx={{ fontSize: TEXT.sm, color: BRAND.gray, mb: 1.5 }}>
            Every report this tenant produced, however it was triggered. The archived copy is the
            exact bytes whose SHA-256 is on record.
          </Typography>
          {/* ── Filtros ──────────────────────────────────────────────────
              En su propia fila y no en la cabecera: son un conjunto, y
              mezclarlos con los verbos de la página fue lo que hizo ilegible
              la cabecera de Security Compliance.

              Los aplica el SERVIDOR. Filtrar aquí sobre lo ya descargado
              funciona hasta el primer tenant con volumen, y entonces la tabla
              dice "no hay nada" cuando lo que pasa es que lo buscado quedó
              fuera de la página. */}
          <Stack direction="row" spacing={1} sx={{ mb: 1.5, flexWrap: "wrap", rowGap: 1 }}>
            <TextField
              select size="small" label="Report" value={runFilter.key}
              onChange={(e) => patchRunFilter({ key: e.target.value })}
              sx={{ minWidth: 190 }} inputProps={{ "aria-label": "Filter by report" }}
            >
              <MenuItem value="">All reports</MenuItem>
              {rows.map((r) => <MenuItem key={r.key} value={r.key}>{r.label}</MenuItem>)}
            </TextField>
            <TextField
              select size="small" label="Outcome" value={runFilter.status}
              onChange={(e) => patchRunFilter({ status: e.target.value })}
              sx={{ minWidth: 150 }} inputProps={{ "aria-label": "Filter by outcome" }}
            >
              <MenuItem value="">Any outcome</MenuItem>
              <MenuItem value="ok">Generated</MenuItem>
              <MenuItem value="sent">Sent</MenuItem>
              <MenuItem value="not_sent">Not sent</MenuItem>
              <MenuItem value="failed">Failed</MenuItem>
            </TextField>
            <TextField
              select size="small" label="Via" value={runFilter.trigger}
              onChange={(e) => patchRunFilter({ trigger: e.target.value })}
              sx={{ minWidth: 140 }} inputProps={{ "aria-label": "Filter by trigger" }}
            >
              <MenuItem value="">Any origin</MenuItem>
              <MenuItem value="manual">Manual</MenuItem>
              <MenuItem value="schedule">Scheduled</MenuItem>
              <MenuItem value="email">Email</MenuItem>
            </TextField>
            <TextField
              size="small" label="Actor" value={runFilter.actor}
              onChange={(e) => patchRunFilter({ actor: e.target.value })}
              placeholder="ana@…" sx={{ minWidth: 160 }} inputProps={{ "aria-label": "Filter by actor" }}
            />
            <TextField
              size="small" type="date" label="From" value={runFilter.from}
              onChange={(e) => patchRunFilter({ from: e.target.value })}
              InputLabelProps={{ shrink: true }} sx={{ minWidth: 150 }} inputProps={{ "aria-label": "From date" }}
            />
            <TextField
              size="small" type="date" label="To" value={runFilter.to}
              onChange={(e) => patchRunFilter({ to: e.target.value })}
              InputLabelProps={{ shrink: true }} sx={{ minWidth: 150 }} inputProps={{ "aria-label": "To date" }}
            />
            {Object.values(runFilter).some(Boolean) ? (
              <Button size="small" onClick={() => { setRunFilter({ key: "", status: "", trigger: "", actor: "", from: "", to: "" }); setRunsPage((p) => ({ ...p, page: 0 })); }} sx={{ textTransform: "none" }}>
                Clear filters
              </Button>
            ) : null}
          </Stack>

          <Box sx={{ width: "100%" }}>
            <DataGrid
              aria-label="Recent runs"
              rows={runs.map((r, i) => ({ id: r.id ?? `evt-${i}`, ...r }))}
              columns={runColumns}
              loading={runsLoading}
              autoHeight
              disableRowSelectionOnClick
              hideFooterSelectedRowCount
              // Paginación EN SERVIDOR: `rowCount` es el total de la consulta,
              // no el de las filas que hay en memoria.
              paginationMode="server"
              rowCount={runsTotal}
              paginationModel={runsPage}
              onPaginationModelChange={setRunsPage}
              pageSizeOptions={[25, 50, 100]}
              sx={{ border: "none" }}
            />
          </Box>
        </SectionPaper>
      ) : null}

      {activeTab === TAB.settings ? (
        <SectionPaper variant="panel" sx={{ p: 2 }} role="tabpanel" id={`reports-tabpanel-${TAB.settings}`} aria-labelledby={`reports-tab-${TAB.settings}`}>
          <Typography sx={{ fontSize: TEXT.sm, color: BRAND.gray, mb: 1.5 }}>
            Let Vanta, Drata or any GRC platform pull the evidence-pack JSON, or push each scheduled
            run to it.
          </Typography>
          <GrcConnectorPanel
            refreshNonce={refreshNonce}
            onNotify={({ message, severity }) => setSnackbar({ open: true, message, severity })}
          />
        </SectionPaper>
      ) : null}

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

      {/* Elegir el tipo antes de programar. */}
      <Menu
        open={Boolean(newScheduleAnchor)}
        anchorEl={newScheduleAnchor}
        onClose={() => setNewScheduleAnchor(null)}
      >
        {rows.map((r) => (
          <MenuItem
            key={r.key}
            onClick={() => { setNewScheduleAnchor(null); setScheduleTarget(r); }}
          >
            {r.label}
          </MenuItem>
        ))}
      </Menu>

      {/* Menú de re-entrega: un destino por línea, por su NOMBRE. "1 destino"
          no dice si es el bueno cuando hay tres. */}
      <Menu
        open={Boolean(redeliverAnchor)}
        anchorEl={redeliverAnchor?.el || null}
        onClose={() => setRedeliverAnchor(null)}
      >
        {grcTargets.map((t) => (
          <MenuItem key={t.id} onClick={() => handleRedeliver(redeliverAnchor.run, t)}>
            {t.label}
          </MenuItem>
        ))}
      </Menu>

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
        open={Boolean(scheduleTarget) || Boolean(editingSchedule)}
        reportType={scheduleTarget || typeByKey[editingSchedule?.reportKey] || null}
        schedule={editingSchedule}
        onClose={() => { setScheduleTarget(null); setEditingSchedule(null); }}
        onCreated={() => {
          setSnackbar({ open: true, message: "Schedule created. First run on the 1st of next month.", severity: "success" });
          loadSchedules();
        }}
        onUpdated={() => {
          setSnackbar({ open: true, message: "Schedule updated.", severity: "success" });
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
