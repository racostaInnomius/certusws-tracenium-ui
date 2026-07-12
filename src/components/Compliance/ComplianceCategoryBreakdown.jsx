// src/components/Compliance/ComplianceCategoryBreakdown.jsx
//
// Fleet-wide "Posture by category" — the fleet analogue of the per-device
// category grouping in the drawer. One row per catalog category (firewall,
// crypto, network_hardening, patching, …) with a pass-rate bar, pass/fail
// counts, high-severity fails, and how many devices are failing it. Worst
// categories first (the backend sorts by high-severity fails, then fails).

import * as React from "react";
import {
  Box,
  Paper,
  Stack,
  Typography,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  Chip,
  CircularProgress,
  Tooltip,
} from "@mui/material";
import CategoryOutlinedIcon from "@mui/icons-material/CategoryOutlined";
import { BRAND, ROLE } from "../../theme/brand";
import { getCategorySummary } from "../../api/compliance";

function prettyCategory(c) {
  return String(c || "uncategorized").replace(/_/g, " ");
}

function rateColor(rate) {
  if (rate == null) return BRAND.gray;
  if (rate >= 90) return ROLE.positive;
  if (rate >= 70) return ROLE.caution;
  return ROLE.critical;
}

function PassRateBar({ rate }) {
  const color = rateColor(rate);
  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 1, minWidth: 160 }}>
      <Box sx={{ position: "relative", flex: 1, height: 8, borderRadius: 4, bgcolor: BRAND.surfaceMuted, overflow: "hidden" }}>
        <Box
          sx={{
            position: "absolute",
            inset: 0,
            width: `${rate == null ? 0 : rate}%`,
            bgcolor: color,
            borderRadius: 4,
          }}
        />
      </Box>
      <Typography sx={{ fontSize: 12, fontWeight: 700, color, minWidth: 34, textAlign: "right" }}>
        {rate == null ? "n/a" : `${rate}%`}
      </Typography>
    </Box>
  );
}

export default function ComplianceCategoryBreakdown({ reloadKey }) {
  const [rows, setRows] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [err, setErr] = React.useState(null);

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setErr(null);
    getCategorySummary()
      .then((res) => {
        if (!cancelled) setRows(Array.isArray(res?.items) ? res.items : []);
      })
      .catch((e) => {
        if (!cancelled) setErr(e?.body?.message || e?.message || "Failed to load category posture");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  return (
    <Paper elevation={0} sx={{ p: 2, borderRadius: 2, border: `1px solid ${BRAND.border}` }}>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1.5 }}>
        <CategoryOutlinedIcon sx={{ color: BRAND.teal, fontSize: 20 }} />
        <Box>
          <Typography sx={{ fontSize: 15, fontWeight: 800, color: BRAND.dark }}>Posture by category</Typography>
          <Typography sx={{ fontSize: 12, color: BRAND.gray }}>
            Fleet pass rate per control category. Pass rate is over evaluated (pass + fail) findings.
          </Typography>
        </Box>
      </Stack>

      {loading ? (
        <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
          <CircularProgress size={24} sx={{ color: BRAND.teal }} />
        </Box>
      ) : err ? (
        <Box sx={{ py: 3, textAlign: "center", color: BRAND.alert?.error, fontSize: 13 }}>{err}</Box>
      ) : rows.length === 0 ? (
        <Box sx={{ py: 3, textAlign: "center", color: BRAND.gray, fontSize: 13 }}>
          No compliance findings reported yet.
        </Box>
      ) : (
        <Box sx={{ overflowX: "auto" }}>
          <Table size="small" sx={{ minWidth: 680 }}>
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 700, color: BRAND.dark }}>Category</TableCell>
                <TableCell sx={{ fontWeight: 700, color: BRAND.dark, width: 200 }}>Pass rate</TableCell>
                <TableCell align="right" sx={{ fontWeight: 700, color: BRAND.dark }}>Passed</TableCell>
                <TableCell align="right" sx={{ fontWeight: 700, color: BRAND.dark }}>Failed</TableCell>
                <TableCell align="right" sx={{ fontWeight: 700, color: BRAND.dark }}>Critical/High</TableCell>
                <TableCell align="right" sx={{ fontWeight: 700, color: BRAND.dark }}>Devices failing</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.category} hover>
                  <TableCell>
                    <Typography sx={{ fontSize: 13, fontWeight: 700, color: BRAND.dark, textTransform: "capitalize" }}>
                      {prettyCategory(r.category)}
                    </Typography>
                    {r.notApplicable ? (
                      <Typography sx={{ fontSize: 11, color: BRAND.gray }}>{r.notApplicable} n/a</Typography>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    <PassRateBar rate={r.passRate} />
                  </TableCell>
                  <TableCell align="right">
                    <Typography sx={{ fontSize: 13, color: ROLE.positive, fontWeight: 700 }}>{r.passed}</Typography>
                  </TableCell>
                  <TableCell align="right">
                    <Typography sx={{ fontSize: 13, color: r.failed ? ROLE.critical : BRAND.gray, fontWeight: 700 }}>
                      {r.failed}
                    </Typography>
                  </TableCell>
                  <TableCell align="right">
                    {r.highSeverityFails ? (
                      <Tooltip title="Failing checks at critical or high severity" arrow>
                        <Chip
                          size="small"
                          label={r.highSeverityFails}
                          sx={{ height: 20, fontSize: 11, fontWeight: 800, bgcolor: BRAND.alert?.errorSoft, color: BRAND.alert?.error }}
                        />
                      </Tooltip>
                    ) : (
                      <Typography sx={{ fontSize: 13, color: BRAND.gray }}>0</Typography>
                    )}
                  </TableCell>
                  <TableCell align="right">
                    <Typography sx={{ fontSize: 13, color: r.devicesFailing ? BRAND.dark : BRAND.gray }}>
                      {r.devicesFailing}
                      {r.devices ? <Typography component="span" sx={{ fontSize: 11, color: BRAND.gray }}> / {r.devices}</Typography> : null}
                    </Typography>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Box>
      )}
    </Paper>
  );
}
