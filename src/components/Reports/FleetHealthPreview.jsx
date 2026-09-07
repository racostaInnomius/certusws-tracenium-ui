// src/components/Reports/FleetHealthPreview.jsx
//
// Vista previa del Fleet Health Report — resumen ejecutivo de un tenant
// (composición de flota, postura de seguridad, licenciamiento, actividad del
// periodo) con tira de KPIs, tendencia y el cambio respecto al periodo
// anterior.
//
// Vivía en Overview como `FleetReportDialog` y traía sus PROPIOS botones de
// CSV y PDF, que descargaban por `/api/v1/fleet-report`: el fichero salía y no
// quedaba fila en `report_runs`. Eso es lo que se quitó, no la pantalla.
//
// Ahora:
//   * el JSON de la vista previa se pide POR EL MOTOR
//     (`/reports/global.fleet-health/run?format=json`), el mismo endpoint que
//     todo lo demás — no hay una segunda ruta que mantener ni que se olvide de
//     un permiso;
//   * los botones no descargan aquí: llaman a `onGenerate(format, params)`, que
//     es el `handleRun` de la página de Reports. Una sola puerta de salida, y
//     el periodo elegido viaja con ella para que el fichero cubra lo que se
//     está mirando.
//
// Abrir la vista previa NO deja fila en `report_runs`: `previewReport` marca
// la petición con `preview=1` y el backend se salta el ledger. Ese ledger es
// de los ficheros que SALEN —de él cuelgan la re-entrega y el SHA-256—, y una
// fila sin fichero que re-entregar entierra a las que sí lo tienen. El evento
// de auditoría sí queda: mirar es una acción con actor y momento.

import * as React from "react";
import { scoreBandRole } from "../../theme/scoreBands";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import CloseOutlinedIcon from "@mui/icons-material/CloseOutlined";
import PictureAsPdfOutlinedIcon from "@mui/icons-material/PictureAsPdfOutlined";
import TableChartOutlinedIcon from "@mui/icons-material/TableChartOutlined";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import { BRAND, TEXT } from "../../theme/brand";
import { previewReport } from "../../api/reports";

function ymd(d) {
  return d.toISOString().slice(0, 10);
}
function rangeForDays(days) {
  const to = new Date();
  const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);
  return { from: ymd(from), to: ymd(to) };
}

const dash = (v) => (v == null ? "—" : v);
const pctText = (v) => (v == null ? "—" : `${v}%`);

function Kpi({ label, value, accent = BRAND.dark }) {
  return (
    <Box sx={{ flex: 1, minWidth: 100 }}>
      <Typography sx={{ fontSize: TEXT.xl, fontWeight: 800, color: accent, lineHeight: 1.1 }}>{value}</Typography>
      <Typography variant="caption" sx={{ color: BRAND.gray }}>{label}</Typography>
    </Box>
  );
}

function SectionRows({ title, rows }) {
  if (!rows.length) return null;
  return (
    <Box sx={{ mb: 1.5 }}>
      <Typography sx={{ fontSize: TEXT.sm, fontWeight: 700, color: BRAND.dark, mb: 0.5 }}>{title}</Typography>
      <Stack spacing={0.4}>
        {rows.map(([label, value]) => (
          <Stack key={label} direction="row" justifyContent="space-between" sx={{ fontSize: TEXT.sm }}>
            <Typography sx={{ fontSize: TEXT.sm, color: "text.secondary" }}>{label}</Typography>
            <Typography sx={{ fontSize: TEXT.sm, fontWeight: 600, color: BRAND.dark }}>{value}</Typography>
          </Stack>
        ))}
      </Stack>
    </Box>
  );
}

export default function FleetHealthPreview({ open, onClose, reportKey, onGenerate, generating = "" }) {
  const [days, setDays] = React.useState(30);
  const [report, setReport] = React.useState(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState("");

  const load = React.useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const resp = await previewReport(reportKey, rangeForDays(days));
      setReport(resp?.report ?? null);
    } catch (err) {
      setError(err?.message || "Could not load the report.");
      setReport(null);
    } finally {
      setLoading(false);
    }
  }, [days, reportKey]);

  React.useEffect(() => {
    if (open) load();
  }, [open, load]);

  // Generar NO se hace aquí: se delega en la página, que es quien pasa por el
  // motor y refresca el historial. El periodo que se está mirando viaja con
  // la petición — un PDF que cubriera otro rango que la pantalla sería una
  // trampa silenciosa.
  const generate = React.useCallback(
    (fmt) => onGenerate?.(fmt, rangeForDays(days)),
    [onGenerate, days]
  );

  const k = report?.kpis || {};
  const composition = report?.composition || {};
  const security = report?.security || {};
  const licensing = report?.licensing || {};
  const activity = report?.activity || {};
  const trend = report?.trend || [];
  const deltas = report?.deltas || {};

  const compositionRows = [
    ...(composition.osPlatform || []).map((r) => [`OS — ${r.platform}`, r.count]),
    ...(composition.topManufacturers || []).slice(0, 3).map((r) => [`Manufacturer — ${r.manufacturer}`, r.count]),
  ];
  const securityRows = [
    ...(security.complianceBySeverity
      ? [
          ["Findings — critical", security.complianceBySeverity.critical],
          ["Findings — high", security.complianceBySeverity.high],
        ]
      : []),
    ...(security.patchSeverity
      ? [["Missing patches — critical", security.patchSeverity.critical]]
      : []),
    ...(security.certsExpiring ? [["Certs expiring (30d)", security.certsExpiring.d30]] : []),
  ];
  const licensingRows = [
    ["Used / plan limit", `${dash(licensing.used)} / ${dash(licensing.maxDevices)}`],
    ["Next anniversary", dash(licensing.nextAnniversary)],
  ];
  const activityRows = [
    ...(activity.jobsRun ? [["Jobs run", `${activity.jobsRun.total} (${activity.jobsRun.failed} failed)`]] : []),
    ...(activity.softwareDeployed
      ? [["Software deployments", activity.softwareDeployed.attempted]]
      : []),
    ...(activity.remoteSupportSessions
      ? [["Remote support sessions", activity.remoteSupportSessions.total]]
      : []),
  ];

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ display: "flex", alignItems: "center", gap: 1, pr: 1 }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontWeight: 800, color: BRAND.dark }} noWrap>
            {report?.tenant?.name || "Fleet health report"}
          </Typography>
          <Typography variant="caption" sx={{ color: BRAND.gray }}>
            Fleet health report
          </Typography>
        </Box>
        <ToggleButtonGroup size="small" exclusive value={days} onChange={(_, v) => v && setDays(v)}>
          <ToggleButton value={30} sx={{ textTransform: "none" }}>30d</ToggleButton>
          <ToggleButton value={90} sx={{ textTransform: "none" }}>90d</ToggleButton>
        </ToggleButtonGroup>
        <IconButton aria-label="Close" onClick={onClose} size="small" sx={{ color: BRAND.gray }}>
          <CloseOutlinedIcon fontSize="small" />
        </IconButton>
      </DialogTitle>

      <DialogContent>
        {error ? <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError("")}>{error}</Alert> : null}

        {loading ? (
          <Stack alignItems="center" sx={{ py: 6 }}>
            <CircularProgress size={26} sx={{ color: BRAND.teal }} />
          </Stack>
        ) : !report ? (
          <Typography sx={{ color: BRAND.gray, py: 4, textAlign: "center" }}>No report data.</Typography>
        ) : (
          <>
            {/* KPI strip */}
            <Stack direction="row" spacing={2} sx={{ mb: 2, flexWrap: "wrap", gap: 1 }}>
              <Kpi label="Devices" value={dash(k.devices)} />
              <Kpi label="Online" value={pctText(k.onlinePct)} accent={BRAND.teal} />
              <Kpi label="Compliance" value={pctText(k.compliancePct)} accent={scoreBandRole(k.compliancePct) ?? BRAND.dark} />
              <Kpi label="Patch compliant" value={pctText(k.patchCompliantPct)} accent={scoreBandRole(k.patchCompliantPct) ?? BRAND.dark} />
              <Kpi label="License usage" value={pctText(k.licenseUtilizationPct)} />
              <Kpi label="Open alerts" value={dash(k.openAlerts)} accent={k.openAlerts ? BRAND.alert.warning : BRAND.alert.success} />
            </Stack>

            {/* Trend chart */}
            <Box sx={{ height: 220, mb: 1 }}>
              {trend.length === 0 ? (
                <Stack alignItems="center" justifyContent="center" sx={{ height: "100%" }}>
                  <Typography variant="body2" sx={{ color: BRAND.gray }}>
                    No daily history for this window yet. Trends appear once the roll-up has run for a few days.
                  </Typography>
                </Stack>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={trend} margin={{ top: 8, right: 12, bottom: 4, left: -8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={BRAND.border} />
                    <XAxis dataKey="date" tick={{ fontSize: TEXT.xs, fill: BRAND.gray }} minTickGap={24} />
                    <YAxis yAxisId="left" tick={{ fontSize: TEXT.xs, fill: BRAND.gray }} />
                    <YAxis yAxisId="right" orientation="right" domain={[0, 100]} tick={{ fontSize: TEXT.xs, fill: BRAND.gray }} />
                    <Tooltip />
                    <Legend wrapperStyle={{ fontSize: TEXT.sm }} />
                    <Line yAxisId="left" type="monotone" dataKey="deviceCount" name="Devices" stroke={BRAND.teal} strokeWidth={2} dot={false} />
                    <Line yAxisId="right" type="monotone" dataKey="compliancePct" name="Compliance %" stroke={BRAND.alert.success} strokeWidth={2} dot={false} connectNulls />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </Box>

            <Typography variant="body2" sx={{ color: BRAND.gray, mb: 1.5 }}>
              {deltas.from
                ? `Over ${deltas.from} → ${deltas.to}: devices ${deltas.devices >= 0 ? "+" : ""}${deltas.devices ?? "—"}, compliance ${deltas.compliancePct == null ? "—" : `${deltas.compliancePct >= 0 ? "+" : ""}${deltas.compliancePct}%`}.`
                : "Not enough history yet to compute a change."}
            </Typography>

            <Divider sx={{ mb: 1.5 }} />

            {/* Fleet composition / security / licensing / activity */}
            <Stack direction={{ xs: "column", sm: "row" }} spacing={3} sx={{ mb: 1 }}>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <SectionRows title="Fleet composition" rows={compositionRows} />
                <SectionRows title="Security posture" rows={securityRows} />
              </Box>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <SectionRows title="Licensing" rows={licensingRows} />
                <SectionRows title="Activity this period" rows={activityRows} />
              </Box>
            </Stack>

            {/* Generar el fichero — por el motor, no desde aquí. */}
            <Stack
              direction={{ xs: "column", sm: "row" }}
              justifyContent="space-between"
              alignItems={{ xs: "stretch", sm: "center" }}
              spacing={1}
            >
              <Typography variant="caption" sx={{ color: BRAND.gray }}>
                Generating records the run in this tenant's report history, with the file's SHA-256.
              </Typography>
              <Stack direction="row" justifyContent="flex-end" spacing={1}>
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={<TableChartOutlinedIcon />}
                  disabled={Boolean(generating)}
                  onClick={() => generate("csv")}
                  // Nombre accesible ESTABLE: el rótulo pasa a "…" mientras se
                  // genera, y sin esto el botón deja de tener nombre justo
                  // cuando alguien con lector de pantalla querría saber qué
                  // está ocurriendo.
                  aria-label="Generate CSV"
                  sx={{ textTransform: "none", borderColor: BRAND.teal, color: BRAND.tealText }}
                >
                  {generating === "csv" ? "…" : "CSV"}
                </Button>
                <Button
                  size="small"
                  variant="contained"
                  startIcon={<PictureAsPdfOutlinedIcon />}
                  disabled={Boolean(generating)}
                  onClick={() => generate("pdf")}
                  aria-label="Generate PDF"
                  sx={{ textTransform: "none", fontWeight: 800, bgcolor: BRAND.teal, "&:hover": { bgcolor: BRAND.tealHover } }}
                >
                  {generating === "pdf" ? "…" : "PDF"}
                </Button>
              </Stack>
            </Stack>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
