// src/msp/ClientReportDialog.jsx
//
// F4 — per-client service report in a dialog. Shows the current KPI strip,
// a device + compliance trend (Recharts), the window deltas, and export
// buttons (PDF / CSV). Opened from a client row in MspAdmin.

import * as React from "react";
import { scoreBandRole } from "../theme/scoreBands";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogContent,
  DialogTitle,
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
import { BRAND, TEXT } from "../theme/brand";
import { fetchClientReport, downloadClientReport } from "./mspApi";

function ymd(d) {
  return d.toISOString().slice(0, 10);
}
function rangeForDays(days) {
  const to = new Date();
  const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);
  return { from: ymd(from), to: ymd(to) };
}

function Kpi({ label, value, accent = BRAND.dark }) {
  return (
    <Box sx={{ flex: 1, minWidth: 92 }}>
      <Typography sx={{ fontSize: TEXT["2xl"], fontWeight: 800, color: accent, lineHeight: 1.1 }}>{value}</Typography>
      <Typography variant="caption" sx={{ color: BRAND.gray }}>{label}</Typography>
    </Box>
  );
}

const dash = (v) => (v == null ? "—" : v);

export default function ClientReportDialog({ open, clientId, clientName, onClose }) {
  const [days, setDays] = React.useState(30);
  const [report, setReport] = React.useState(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState("");
  const [downloading, setDownloading] = React.useState("");

  const load = React.useCallback(async () => {
    if (!clientId) return;
    setLoading(true);
    setError("");
    try {
      const range = rangeForDays(days);
      const resp = await fetchClientReport(clientId, range);
      setReport(resp?.report ?? null);
    } catch (err) {
      setError(err?.message || "Could not load the report.");
      setReport(null);
    } finally {
      setLoading(false);
    }
  }, [clientId, days]);

  React.useEffect(() => {
    if (open) load();
  }, [open, load]);

  const doDownload = React.useCallback(async (fmt) => {
    setDownloading(fmt);
    setError("");
    try {
      await downloadClientReport(clientId, fmt, rangeForDays(days));
    } catch (err) {
      setError(err?.message || `Could not export ${fmt.toUpperCase()}.`);
    } finally {
      setDownloading("");
    }
  }, [clientId, days]);

  const cur = report?.current || {};
  const trend = report?.trend || [];
  const deltas = report?.deltas || {};

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ display: "flex", alignItems: "center", gap: 1, pr: 1 }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontWeight: 800, color: BRAND.dark }} noWrap>
            {clientName || `Client ${clientId}`}
          </Typography>
          <Typography variant="caption" sx={{ color: BRAND.gray }}>
            Service report{report?.msp?.name ? ` · ${report.msp.name}` : ""}
          </Typography>
        </Box>
        <ToggleButtonGroup
          size="small"
          exclusive
          value={days}
          onChange={(_, v) => v && setDays(v)}
        >
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
              <Kpi label="Devices" value={dash(cur.deviceCount)} />
              <Kpi label="Online" value={cur.onlinePct == null ? "—" : `${cur.onlinePct}%`} accent={BRAND.teal} />
              <Kpi label="Open alerts" value={dash(cur.openAlerts)} accent={cur.openAlerts ? BRAND.alert.warning : BRAND.alert.success} />
              <Kpi
                label="Compliance"
                value={cur.compliancePct == null ? "—" : `${cur.compliancePct}%`}
                accent={scoreBandRole(cur.compliancePct) ?? BRAND.dark}
              />
            </Stack>

            {/* Trend chart */}
            <Box sx={{ height: 260, mb: 1 }}>
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

            {/* Deltas + exports */}
            <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" alignItems={{ sm: "center" }} spacing={1.5}>
              <Typography variant="body2" sx={{ color: BRAND.gray }}>
                {deltas.from
                  ? `Over ${deltas.from} → ${deltas.to}: devices ${deltas.devices >= 0 ? "+" : ""}${deltas.devices ?? "—"}, compliance ${deltas.compliancePct == null ? "—" : `${deltas.compliancePct >= 0 ? "+" : ""}${deltas.compliancePct}%`}.`
                  : "Not enough history yet to compute a change."}
              </Typography>
              <Stack direction="row" spacing={1}>
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
            </Stack>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
