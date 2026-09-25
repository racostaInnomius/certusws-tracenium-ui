// src/components/Reports/AssetExecutivePreview.jsx
//
// Vista previa del «Asset Management Executive Report» (amp.asset-executive).
//
// ⚠️ Antes caía en GenericJsonPreview: el CIO —o quien fuera a mandárselo—
// veía un volcado de JSON (prod, 24-sep). Éste sabe qué significan los campos
// (ver asset-report.types.ts en el backend) y pinta lo que abre el documento:
// la flota reconciliada, cuánto de ella reporta al día, la composición y la
// higiene del registro.
//
// Mismas reglas que FleetHealthPreview:
//   · el JSON sale del MOTOR con `preview=1`: mirar no deja fila en
//     report_runs;
//   · generar NO ocurre aquí: `onGenerate(format)` es el handleRun de la
//     página, la única puerta que registra la ejecución.
//
// ⚠️ Ausente ≠ cero. Cada bloque del informe puede venir `null` (una fuente
// falló); aquí se dice «Not measured», nunca se pinta como 0.

import * as React from "react";
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
  Typography,
} from "@mui/material";
import CloseOutlinedIcon from "@mui/icons-material/CloseOutlined";
import PictureAsPdfOutlinedIcon from "@mui/icons-material/PictureAsPdfOutlined";
import TableChartOutlinedIcon from "@mui/icons-material/TableChartOutlined";
import { BRAND, TEXT } from "../../theme/brand";
import { previewReport } from "../../api/reports";

const dash = (v) => (v == null ? "—" : v);

function Kpi({ label, value, accent = BRAND.dark }) {
  return (
    <Box sx={{ flex: 1, minWidth: 100 }}>
      <Typography sx={{ fontSize: TEXT.xl, fontWeight: 800, color: accent, lineHeight: 1.1 }}>{value}</Typography>
      <Typography variant="caption" sx={{ color: BRAND.gray }}>{label}</Typography>
    </Box>
  );
}

function Section({ title, rows, missing = false }) {
  return (
    <Box sx={{ mb: 1.5 }}>
      <Typography sx={{ fontSize: TEXT.sm, fontWeight: 700, color: BRAND.dark, mb: 0.5 }}>{title}</Typography>
      {missing ? (
        <Typography sx={{ fontSize: TEXT.sm, color: BRAND.gray }}>Not measured — the source did not answer.</Typography>
      ) : rows.length === 0 ? (
        <Typography sx={{ fontSize: TEXT.sm, color: BRAND.gray }}>Nothing to report.</Typography>
      ) : (
        <Stack spacing={0.4}>
          {rows.map(([label, value]) => (
            <Stack key={label} direction="row" justifyContent="space-between" spacing={1}>
              <Typography sx={{ fontSize: TEXT.sm, color: "text.secondary", minWidth: 0 }} noWrap title={String(label)}>
                {label}
              </Typography>
              <Typography sx={{ fontSize: TEXT.sm, fontWeight: 600, color: BRAND.dark, flexShrink: 0 }}>{value}</Typography>
            </Stack>
          ))}
        </Stack>
      )}
    </Box>
  );
}

export default function AssetExecutivePreview({ open, onClose, reportKey, reportLabel, formats = [], onGenerate, generating = "" }) {
  const [report, setReport] = React.useState(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState("");

  React.useEffect(() => {
    if (!open || !reportKey) return undefined;
    let vivo = true;
    setLoading(true);
    setError("");
    previewReport(reportKey)
      .then((r) => vivo && setReport(r?.report ?? null))
      .catch((e) => {
        if (!vivo) return;
        setError(e?.message || "Could not load the preview.");
        setReport(null);
      })
      .finally(() => vivo && setLoading(false));
    return () => {
      vivo = false;
    };
  }, [open, reportKey]);

  const pop = report?.population ?? {};
  const fresh = report?.freshness ?? null;
  const comp = report?.composition ?? null;
  const hyg = report?.hygiene ?? null;
  const change = report?.change ?? null;
  const sw = report?.software ?? null;

  const compositionRows = comp
    ? [
        ["Physical", comp.physical],
        ["Virtual", comp.virtual],
        ...(comp.unknownVirtualization ? [["Not declared physical or virtual", comp.unknownVirtualization]] : []),
        ...(comp.byPlatform || []).map((r) => [`Platform — ${r.platform}`, r.count]),
      ]
    : [];
  const agentRows = (report?.agentVersions || []).map((r) => [`Agent ${r.version}`, r.count]);
  const osRows = (report?.osVersions || []).slice(0, 6).map((r) => [`${r.name} ${r.build}`.trim(), r.count]);
  const softwareRows = sw
    ? [
        ["Titles", sw.titles],
        ["Publishers", sw.publishers],
        ["Titles on a single device", sw.singleDevice],
      ]
    : [];
  const hygieneRows = hyg
    ? [
        ...(hyg.overduePurge?.length ? [["Overdue for purge", hyg.overduePurge.length]] : []),
        ...(hyg.awaitingPurge?.length ? [["Retired, awaiting purge", hyg.awaitingPurge.length]] : []),
        ...(hyg.enrolledNeverReported?.length ? [["Enrolled, never reported", hyg.enrolledNeverReported.length]] : []),
      ]
    : [];
  const changeRows = change
    ? [
        ["Enrolled this month", change.enrolled?.length ?? 0],
        ["Retired this month", change.decommissioned?.length ?? 0],
      ]
    : [];

  // Sólo los formatos que el tipo ofrece: el JSON es el de la propia vista previa.
  const puede = (f) => formats.length === 0 || formats.includes(f);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ display: "flex", alignItems: "center", gap: 1, pr: 1 }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontWeight: 800, color: BRAND.dark }} noWrap>
            {report?.tenant?.name || reportLabel || "Asset Management executive report"}
          </Typography>
          <Typography variant="caption" sx={{ color: BRAND.gray }}>
            {reportLabel || "Asset Management executive report"}
            {report?.period?.month ? ` · ${report.period.month}` : ""} · Preview — nothing is generated yet
          </Typography>
        </Box>
        <IconButton aria-label="Close" onClick={onClose} size="small" sx={{ color: BRAND.gray }}>
          <CloseOutlinedIcon fontSize="small" />
        </IconButton>
      </DialogTitle>

      <DialogContent>
        {error ? <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert> : null}

        {loading ? (
          <Stack alignItems="center" sx={{ py: 6 }}>
            <CircularProgress size={26} sx={{ color: BRAND.teal }} />
          </Stack>
        ) : !report ? (
          <Typography sx={{ color: BRAND.gray, py: 4, textAlign: "center" }}>No preview data.</Typography>
        ) : (
          <>
            {report._warnings?.length ? (
              <Alert severity="warning" sx={{ mb: 2 }}>
                Some sections could not be measured: {report._warnings.join(", ")}.
              </Alert>
            ) : null}

            {/* La reconciliación: con lo que abre el documento. */}
            <Stack direction="row" spacing={2} sx={{ mb: 2, flexWrap: "wrap", gap: 1 }}>
              <Kpi label="Fleet" value={dash(pop.fleet)} />
              <Kpi label="Reporting inventory" value={dash(pop.reportingInventory)} />
              <Kpi label="Seen in 24 h" value={dash(fresh?.last24h)} accent={BRAND.teal} />
              <Kpi label="Seen in 7 days" value={dash(fresh?.last7d)} />
              <Kpi
                label="Silent > 30 days"
                value={dash(fresh?.stale)}
                accent={fresh?.stale ? BRAND.alert.warningText : BRAND.dark}
              />
              <Kpi
                label="Never reported"
                value={dash(fresh?.neverReported)}
                accent={fresh?.neverReported ? BRAND.alert.warningText : BRAND.dark}
              />
            </Stack>

            <Divider sx={{ mb: 1.5 }} />

            <Stack direction={{ xs: "column", sm: "row" }} spacing={3} sx={{ mb: 1 }}>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Section title="Composition" rows={compositionRows} missing={!comp} />
                <Section title="Operating systems" rows={osRows} missing={report.osVersions == null} />
                <Section title="Agent versions" rows={agentRows} missing={report.agentVersions == null} />
              </Box>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Section title="Register hygiene" rows={hygieneRows} missing={!hyg} />
                <Section title="Change this month" rows={changeRows} missing={!change} />
                <Section title="Software estate" rows={softwareRows} missing={!sw} />
              </Box>
            </Stack>

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
                {puede("csv") ? (
                  <Button
                    size="small"
                    variant="outlined"
                    startIcon={<TableChartOutlinedIcon />}
                    disabled={Boolean(generating)}
                    onClick={() => onGenerate?.("csv")}
                    aria-label="Generate CSV"
                    sx={{ textTransform: "none", borderColor: BRAND.teal, color: BRAND.tealText }}
                  >
                    {generating === "csv" ? "…" : "CSV"}
                  </Button>
                ) : null}
                {puede("pdf") ? (
                  <Button
                    size="small"
                    variant="contained"
                    startIcon={<PictureAsPdfOutlinedIcon />}
                    disabled={Boolean(generating)}
                    onClick={() => onGenerate?.("pdf")}
                    aria-label="Generate PDF"
                    sx={{ textTransform: "none", fontWeight: 800, bgcolor: BRAND.teal, "&:hover": { bgcolor: BRAND.tealHover } }}
                  >
                    {generating === "pdf" ? "…" : "PDF"}
                  </Button>
                ) : null}
              </Stack>
            </Stack>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
