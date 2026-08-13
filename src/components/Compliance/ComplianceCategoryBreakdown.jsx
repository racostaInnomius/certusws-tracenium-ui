// src/components/Compliance/ComplianceCategoryBreakdown.jsx
//
// Fleet-wide "Posture by category" — the fleet analogue of the per-device
// category grouping in the drawer. One row per catalog category with a pass-rate
// bar, pass/fail counts, high-severity fails, and how many devices are failing
// it. A category with failures EXPANDS in place to a drill-in: exactly which
// devices are failing it and which checks (getCategoryDevices).

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
  Collapse,
  IconButton,
  CircularProgress,
  Tooltip,
} from "@mui/material";
import CategoryOutlinedIcon from "@mui/icons-material/CategoryOutlined";
import BuildOutlinedIcon from "@mui/icons-material/BuildOutlined";
import ExpandMoreOutlinedIcon from "@mui/icons-material/ExpandMoreOutlined";
import ExpandLessOutlinedIcon from "@mui/icons-material/ExpandLessOutlined";
import DevicesOutlinedIcon from "@mui/icons-material/DevicesOutlined";
import { BRAND, ROLE } from "../../theme/brand";
import { severityMeta } from "../../theme/severity";
import { getCategorySummary, getCategoryDevices } from "../../api/compliance";
import { listFrom } from "../../api/shape";

function prettyCategory(c) {
  return String(c || "uncategorized").replace(/_/g, " ");
}

function rateColor(rate) {
  if (rate == null) return BRAND.gray;
  if (rate >= 90) return ROLE.positive;
  if (rate >= 70) return ROLE.caution;
  return ROLE.critical;
}

function sevChip(s) {
  // Canonical severity scale (theme/severity.js) — removes the hardcoded hex.
  return severityMeta(s);
}

function PassRateBar({ rate }) {
  const color = rateColor(rate);
  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 1, minWidth: 160 }}>
      <Box sx={{ position: "relative", flex: 1, height: 8, borderRadius: 4, bgcolor: BRAND.surfaceMuted, overflow: "hidden" }}>
        <Box sx={{ position: "absolute", inset: 0, width: `${rate == null ? 0 : rate}%`, bgcolor: color, borderRadius: 4 }} />
      </Box>
      <Typography sx={{ fontSize: 12, fontWeight: 700, color, minWidth: 34, textAlign: "right" }}>
        {rate == null ? "n/a" : `${rate}%`}
      </Typography>
    </Box>
  );
}

// Drill-in body: devices failing this category + their failing checks. Fetched
// lazily the first time the row is expanded.
function CategoryDrilldown({ category }) {
  const [state, setState] = React.useState({ loading: true, err: null, devices: [] });

  React.useEffect(() => {
    let cancelled = false;
    getCategoryDevices(category)
      .then((res) => {
        if (!cancelled) setState({ loading: false, err: null, devices: listFrom(res, { context: "categoryDevices" }) });
      })
      .catch((e) => {
        if (!cancelled) setState({ loading: false, err: e?.body?.message || e?.message || "Failed to load devices", devices: [] });
      });
    return () => {
      cancelled = true;
    };
  }, [category]);

  if (state.loading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", py: 2 }}>
        <CircularProgress size={20} sx={{ color: BRAND.teal }} />
      </Box>
    );
  }
  if (state.err) return <Box sx={{ py: 1.5, color: BRAND.alert?.error, fontSize: 12.5 }}>{state.err}</Box>;
  if (state.devices.length === 0) {
    return <Box sx={{ py: 1.5, color: BRAND.gray, fontSize: 12.5 }}>No devices are currently failing this category.</Box>;
  }

  return (
    <Box sx={{ py: 1 }}>
      <Stack direction="row" alignItems="center" spacing={0.75} sx={{ mb: 0.75 }}>
        <DevicesOutlinedIcon sx={{ fontSize: 15, color: BRAND.gray }} />
        <Typography sx={{ fontSize: 12, fontWeight: 800, color: BRAND.gray }}>
          {state.devices.length} device{state.devices.length === 1 ? "" : "s"} failing this category
        </Typography>
      </Stack>
      <Stack spacing={0.75}>
        {state.devices.map((d) => (
          <Box key={d.agentId} sx={{ border: `1px solid ${BRAND.border}`, borderRadius: 1, p: 1 }}>
            <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.5, flexWrap: "wrap", gap: 0.5 }}>
              <Typography sx={{ fontSize: 12.5, fontWeight: 700, color: BRAND.dark }}>
                {d.hostname || d.agentId}
              </Typography>
              {d.platform ? (
                <Chip size="small" label={d.platform} sx={{ height: 18, fontSize: 10, fontWeight: 700, bgcolor: BRAND.darkSoft, color: BRAND.dark }} />
              ) : null}
              <Typography sx={{ fontSize: 11.5, color: BRAND.gray }}>
                {d.failingChecks} failing
                {d.highSeverityFails ? ` · ${d.highSeverityFails} critical/high` : ""}
              </Typography>
            </Stack>
            <Stack direction="row" spacing={0.5} sx={{ flexWrap: "wrap", gap: 0.5 }}>
              {(d.checks || []).map((c) => {
                const m = sevChip(c.severity);
                return (
                  <Tooltip key={c.checkId} title={c.checkId} arrow>
                    <Chip size="small" label={c.title || c.checkId} sx={{ height: 20, fontSize: 10.5, fontWeight: 600, bgcolor: m.bg, color: m.fg }} />
                  </Tooltip>
                );
              })}
            </Stack>
          </Box>
        ))}
      </Stack>
    </Box>
  );
}

// Fase C — mode chip + quick actions per row when the host page hands a
// `baselineBridge` ({ modeForCategory, onSetAuto, onConfigure }). Null
// bridge (USER role, policy fetch failed, standalone usage) renders the
// pre-bridge table untouched.
const MODE_CHIP = {
  auto: { label: "auto", title: "The agent fixes drift in this category automatically." },
  "report-only": { label: "report-only", title: "Drift is detected and reported, never fixed. Click the wrench to enable auto-remediation." },
  off: { label: "off", title: "The mapped baseline capabilities are disabled." },
};

function BaselineCell({ row, bridge }) {
  if (!bridge) return null;
  const info = bridge.modeForCategory(row.category);
  if (!info) {
    // Category has no mapped capability (e.g. antimalware, patching) —
    // em-dash, not an empty cell, so the column reads as "not
    // configurable" rather than "broken".
    return (
      <TableCell align="right">
        <Typography sx={{ fontSize: 13, color: BRAND.gray }}>—</Typography>
      </TableCell>
    );
  }
  const meta = MODE_CHIP[info.mode] ?? MODE_CHIP["report-only"];
  const canAuto = info.autoUpgradable.length > 0;
  return (
    <TableCell align="right" onClick={(e) => e.stopPropagation()}>
      <Stack direction="row" spacing={0.5} justifyContent="flex-end" alignItems="center">
        <Tooltip title={`${meta.title} Capabilities: ${info.capabilities.map((c) => c.label).join(", ")}`} arrow>
          <Chip
            size="small"
            label={meta.label}
            onClick={bridge.onConfigure}
            clickable
            sx={{
              height: 20,
              fontSize: 10.5,
              fontWeight: 700,
              bgcolor: info.mode === "auto" ? BRAND.tealSoft : info.mode === "off" ? BRAND.surfaceMuted : BRAND.darkSoft,
              color: info.mode === "auto" ? BRAND.tealText : info.mode === "off" ? BRAND.gray : BRAND.dark,
            }}
          />
        </Tooltip>
        {canAuto && row.failed > 0 ? (
          <Tooltip title={`Set ${info.autoUpgradable.map((c) => c.label).join(", ")} to auto-remediate`} arrow>
            <IconButton
              aria-label={`Enable auto-remediation for ${row.category}`}
              size="small"
              onClick={() => bridge.onSetAuto(row.category)}
            >
              <BuildOutlinedIcon sx={{ fontSize: 15 }} />
            </IconButton>
          </Tooltip>
        ) : null}
      </Stack>
    </TableCell>
  );
}

function CategoryRow({ row, baselineBridge }) {
  const [open, setOpen] = React.useState(false);
  const expandable = row.failed > 0;
  return (
    <>
      <TableRow
        hover
        sx={{ cursor: expandable ? "pointer" : "default", "& > *": { borderBottom: open ? "none" : undefined } }}
        onClick={expandable ? () => setOpen((v) => !v) : undefined}
      >
        <TableCell sx={{ width: 34, pr: 0 }}>
          {expandable ? (
            <IconButton aria-label="Toggle category" size="small" onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}>
              {open ? <ExpandLessOutlinedIcon fontSize="small" /> : <ExpandMoreOutlinedIcon fontSize="small" />}
            </IconButton>
          ) : null}
        </TableCell>
        <TableCell>
          <Typography sx={{ fontSize: 13, fontWeight: 700, color: BRAND.dark, textTransform: "capitalize" }}>
            {prettyCategory(row.category)}
          </Typography>
          {row.notApplicable ? <Typography sx={{ fontSize: 11, color: BRAND.gray }}>{row.notApplicable} n/a</Typography> : null}
        </TableCell>
        <TableCell>
          <PassRateBar rate={row.passRate} />
        </TableCell>
        <TableCell align="right">
          <Typography sx={{ fontSize: 13, color: ROLE.positive, fontWeight: 700 }}>{row.passed}</Typography>
        </TableCell>
        <TableCell align="right">
          <Typography sx={{ fontSize: 13, color: row.failed ? ROLE.critical : BRAND.gray, fontWeight: 700 }}>{row.failed}</Typography>
        </TableCell>
        <TableCell align="right">
          {row.highSeverityFails ? (
            <Tooltip title="Failing checks at critical or high severity" arrow>
              <Chip size="small" label={row.highSeverityFails} sx={{ height: 20, fontSize: 11, fontWeight: 800, bgcolor: BRAND.alert?.errorSoft, color: BRAND.alert?.error }} />
            </Tooltip>
          ) : (
            <Typography sx={{ fontSize: 13, color: BRAND.gray }}>0</Typography>
          )}
        </TableCell>
        <TableCell align="right">
          <Typography sx={{ fontSize: 13, color: row.devicesFailing ? BRAND.dark : BRAND.gray }}>
            {row.devicesFailing}
            {row.devices ? <Typography component="span" sx={{ fontSize: 11, color: BRAND.gray }}> / {row.devices}</Typography> : null}
          </Typography>
        </TableCell>
        <BaselineCell row={row} bridge={baselineBridge} />
      </TableRow>
      {expandable ? (
        <TableRow>
          <TableCell colSpan={baselineBridge ? 8 : 7} sx={{ py: 0, borderBottom: open ? `1px solid ${BRAND.border}` : "none" }}>
            <Collapse in={open} timeout="auto" unmountOnExit>
              <Box sx={{ pl: 5, pr: 2 }}>{open ? <CategoryDrilldown category={row.category} /> : null}</Box>
            </Collapse>
          </TableCell>
        </TableRow>
      ) : null}
    </>
  );
}

export default function ComplianceCategoryBreakdown({ reloadKey, baselineBridge = null }) {
  const [rows, setRows] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [err, setErr] = React.useState(null);

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setErr(null);
    getCategorySummary()
      .then((res) => {
        if (!cancelled) setRows(listFrom(res, { context: "categoryRows" }));
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
            Fleet pass rate per control category. Click a category with failures to see which devices fail it.
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
        <Box sx={{ py: 3, textAlign: "center", color: BRAND.gray, fontSize: 13 }}>No compliance findings reported yet.</Box>
      ) : (
        <Box sx={{ overflowX: "auto" }}>
          <Table size="small" sx={{ minWidth: 700 }}>
            <TableHead>
              <TableRow>
                <TableCell sx={{ width: 34 }} />
                <TableCell sx={{ fontWeight: 700, color: BRAND.dark }}>Category</TableCell>
                <TableCell sx={{ fontWeight: 700, color: BRAND.dark, width: 200 }}>Pass rate</TableCell>
                <TableCell align="right" sx={{ fontWeight: 700, color: BRAND.dark }}>Passed</TableCell>
                <TableCell align="right" sx={{ fontWeight: 700, color: BRAND.dark }}>Failed</TableCell>
                <TableCell align="right" sx={{ fontWeight: 700, color: BRAND.dark }}>Critical/High</TableCell>
                <TableCell align="right" sx={{ fontWeight: 700, color: BRAND.dark }}>Devices failing</TableCell>
                {baselineBridge ? (
                  <TableCell align="right" sx={{ fontWeight: 700, color: BRAND.dark }}>Baseline</TableCell>
                ) : null}
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((r) => (
                <CategoryRow key={r.category} row={r} baselineBridge={baselineBridge} />
              ))}
            </TableBody>
          </Table>
        </Box>
      )}
    </Paper>
  );
}
