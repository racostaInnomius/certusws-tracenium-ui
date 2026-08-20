// src/components/Overview/FleetReportDialog.jsx
//
// Fleet Health Report — cross-domain, single-tenant executive summary
// (fleet composition, security posture, licensing, period activity).
// Structurally copies src/msp/ClientReportDialog.jsx (KPI strip + trend
// chart + CSV/PDF export buttons, 30d/90d period toggle), extended with
// a 6-tile KPI strip instead of 4 and extra label/value sections for
// the domains ClientReport doesn't cover.

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
import { BRAND } from "../../theme/brand";
import { fetchFleetReport, downloadFleetReport } from "../../api/fleetReport";

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
      <Typography sx={{ fontSize: 20, fontWeight: 800, color: accent, lineHeight: 1.1 }}>{value}</Typography>
      <Typography variant="caption" sx={{ color: BRAND.gray }}>{label}</Typography>
    </Box>
  );
}

function SectionRows({ title, rows }) {
  if (!rows.length) return null;
  return (
    <Box sx={{ mb: 1.5 }}>
      <Typography sx={{ fontSize: 12, fontWeight: 700, color: BRAND.dark, mb: 0.5 }}>{title}</Typography>
      <Stack spacing={0.4}>
        {rows.map(([label, value]) => (
          <Stack key={label} direction="row" justifyContent="space-between" sx={{ fontSize: 12.5 }}>
            <Typography sx={{ fontSize: 12.5, color: "text.secondary" }}>{label}</Typography>
            <Typography sx={{ fontSize: 12.5, fontWeight: 600, color: BRAND.dark }}>{value}</Typography>
          </Stack>
        ))}
      </Stack>
    </Box>
  );
}

export default function FleetReportDialog({ open, onClose }) {
  const [days, setDays] = React.useState(30);
  const [report, setReport] = React.useState(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState("");
  const [downloading, setDownloading] = React.useState("");

  const load = React.useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const range = rangeForDays(days);
      const resp = await fetchFleetReport(range);
      setReport(resp?.report ?? null);
    } catch (err) {
      setError(err?.message || "Could not load the report.");
      setReport(null);
    } finally {
      setLoading(false);
    }
  }, [days]);

  React.useEffect(() => {
    if (open) load();
  }, [open, load]);

  const doDownload = React.useCallback(async (fmt) => {
    setDownloading(fmt);
    setError("");
    try {
      await downloadFleetReport(fmt, rangeForDays(days));
    } catch (err) {
      setError(err?.message || `Could not export ${fmt.toUpperCase()}.`);
    } finally {
      setDownloading("");
    }
  }, [days]);

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
                    <XAxis dataKey="date" tick={{ fontSize: 11, fill: BRAND.gray }} minTickGap={24} />
                    <YAxis yAxisId="left" tick={{ fontSize: 11, fill: BRAND.gray }} />
                    <YAxis yAxisId="right" orientation="right" domain={[0, 100]} tick={{ fontSize: 11, fill: BRAND.gray }} />
                    <Tooltip />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
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

            {/* Exports */}
            <Stack direction={{ xs: "column", sm: "row" }} justifyContent="flex-end" spacing={1}>
              <Button
                size="small"
                variant="outlined"
                startIcon={<TableChartOutlinedIcon />}
                disabled={Boolean(downloading)}
                onClick={() => doDownload("csv")}
                sx={{ textTransform: "none", borderColor: BRAND.teal, color: BRAND.tealText }}
              >
                {downloading === "csv" ? "…" : "CSV"}
              </Button>
              <Button
                size="small"
                variant="contained"
                startIcon={<PictureAsPdfOutlinedIcon />}
                disabled={Boolean(downloading)}
                onClick={() => doDownload("pdf")}
                sx={{ textTransform: "none", fontWeight: 800, bgcolor: BRAND.teal, "&:hover": { bgcolor: BRAND.tealHover } }}
              >
                {downloading === "pdf" ? "…" : "PDF"}
              </Button>
            </Stack>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
