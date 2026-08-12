// src/msp/MspBilling.jsx
//
// F4 — usage billing view. Month picker → per-MSP groups, each with its
// per-client month-end enrolled-device count and amount (count × the MSP's
// unit rate). Grand totals on top; CSV export of the whole run. Vendor
// sees all MSPs; an MSP operator sees their own.

import * as React from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import ArrowBackOutlinedIcon from "@mui/icons-material/ArrowBackOutlined";
import ReceiptLongOutlinedIcon from "@mui/icons-material/ReceiptLongOutlined";
import FileDownloadOutlinedIcon from "@mui/icons-material/FileDownloadOutlined";
import PageHeader from "../components/common/PageHeader";
import SectionPaper from "../components/common/SectionPaper";
import { BRAND } from "../theme/brand";
import { fetchBilling, downloadBilling } from "./mspApi";

function currentMonth() {
  return new Date().toISOString().slice(0, 7);
}
function money(cents, currency) {
  if (cents == null) return "—";
  return `${(cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
}

export default function MspBilling({ onClose }) {
  const [period, setPeriod] = React.useState(currentMonth());
  const [run, setRun] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [exporting, setExporting] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const resp = await fetchBilling({ period });
      setRun(resp?.billing ?? null);
    } catch (err) {
      setError(err?.message || "Could not load billing.");
      setRun(null);
    } finally {
      setLoading(false);
    }
  }, [period]);

  React.useEffect(() => {
    load();
  }, [load]);

  const doExport = React.useCallback(async () => {
    setExporting(true);
    setError("");
    try {
      await downloadBilling({ period });
    } catch (err) {
      setError(err?.message || "Could not export CSV.");
    } finally {
      setExporting(false);
    }
  }, [period]);

  const gt = run?.grandTotal;

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1200, mx: "auto" }}>
      <PageHeader
        title="Billing"
        subtitle="Managed-device usage per client, measured at month-end. Rates are set per partner in its settings."
        icon={<ReceiptLongOutlinedIcon />}
        actions={
          <Stack direction="row" spacing={1} alignItems="center">
            {onClose ? (
              <Button size="small" startIcon={<ArrowBackOutlinedIcon />} onClick={onClose} sx={{ color: BRAND.gray, textTransform: "none" }}>
                Back
              </Button>
            ) : null}
            <TextField
              type="month"
              size="small"
              label="Period"
              value={period}
              onChange={(e) => setPeriod(e.target.value || currentMonth())}
              InputLabelProps={{ shrink: true }}
              sx={{ width: 160 }}
            />
            <Button
              size="small"
              variant="outlined"
              startIcon={<FileDownloadOutlinedIcon />}
              disabled={exporting || !run || run.msps.length === 0}
              onClick={doExport}
              sx={{ textTransform: "none", borderColor: BRAND.teal, color: BRAND.tealText }}
            >
              {exporting ? "…" : "CSV"}
            </Button>
          </Stack>
        }
      />

      {error ? <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError("")}>{error}</Alert> : null}

      {/* Grand totals */}
      {gt ? (
        <SectionPaper variant="panel" sx={{ mb: 2 }}>
          <Stack direction="row" spacing={3} sx={{ flexWrap: "wrap", gap: 2 }}>
            {[
              ["Partners", gt.msps],
              ["Clients", gt.clients],
              ["Managed devices", gt.devices],
              ["Total", money(gt.amountCents, run.msps[0]?.currency || "USD")],
            ].map(([label, value]) => (
              <Box key={label}>
                <Typography sx={{ fontSize: 22, fontWeight: 800, color: BRAND.dark, lineHeight: 1.1 }}>{value}</Typography>
                <Typography variant="caption" sx={{ color: BRAND.gray }}>{label}</Typography>
              </Box>
            ))}
          </Stack>
        </SectionPaper>
      ) : null}

      {loading ? (
        <Stack alignItems="center" sx={{ py: 8 }}>
          <CircularProgress size={28} sx={{ color: BRAND.teal }} />
        </Stack>
      ) : !run || run.msps.length === 0 ? (
        <SectionPaper variant="panel">
          <Typography sx={{ color: BRAND.gray, textAlign: "center", py: 4 }}>
            No billable partners for {period}.
          </Typography>
        </SectionPaper>
      ) : (
        <Stack spacing={2}>
          {run.msps.map((g) => (
            <SectionPaper key={g.mspId} variant="panel" sx={{ p: 0, overflow: "hidden" }}>
              <Stack direction="row" alignItems="center" spacing={1} sx={{ px: 2, py: 1.5, borderBottom: `1px solid ${BRAND.border}` }}>
                <Typography sx={{ fontWeight: 800, color: BRAND.dark, flex: 1 }}>
                  {g.mspName || `MSP ${g.mspId}`}
                </Typography>
                {g.unitPriceCents == null ? (
                  <Chip label="no rate set" size="small" sx={{ bgcolor: BRAND.alert.warningSoft, color: BRAND.alert.warning, fontWeight: 700 }} />
                ) : (
                  <Chip label={`${money(g.unitPriceCents, g.currency)} / device`} size="small" sx={{ bgcolor: BRAND.tealSoft, color: BRAND.tealText, fontWeight: 700 }} />
                )}
                <Typography sx={{ fontWeight: 800, color: BRAND.dark }}>
                  {money(g.totals.amountCents, g.currency)}
                </Typography>
              </Stack>
              <Box sx={{ overflowX: "auto" }}>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ fontWeight: 700, color: BRAND.gray }}>Client</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700, color: BRAND.gray }}>Devices</TableCell>
                      <TableCell sx={{ fontWeight: 700, color: BRAND.gray }}>Measured</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700, color: BRAND.gray }}>Amount</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {g.clients.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} sx={{ color: BRAND.gray }}>No clients under this partner.</TableCell>
                      </TableRow>
                    ) : (
                      g.clients.map((c) => (
                        <TableRow key={c.clientId} hover>
                          <TableCell sx={{ color: BRAND.dark, fontWeight: 600 }}>{c.name || `Tenant ${c.clientId}`}</TableCell>
                          <TableCell align="right" sx={{ color: BRAND.dark }}>{c.deviceCount}</TableCell>
                          <TableCell sx={{ color: BRAND.gray }}>{c.snapshotDate || "—"}</TableCell>
                          <TableCell align="right" sx={{ color: BRAND.dark }}>{money(c.amountCents, g.currency)}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </Box>
            </SectionPaper>
          ))}
        </Stack>
      )}
    </Box>
  );
}
