// src/components/patch-management/FindingsPanel.jsx
//
// Patch Management v2 — content for the non-Patches tabs (TLS,
// SMB, Shares, Other). Renders, in order:
//   1. Sub-KPI strip — totals derived from the same `getFindings`
//      response so the strip and the grid never disagree.
//   2. Findings grid — one row per checkId, severity-sorted,
//      devicesAffected count, agent-remediable badge, last-detected.
//      Click a row → FindingDetailDrawer.
//
// Filters per tab are passed in by the page:
//   tls    → { category: "cryptography" }
//   smb    → { category: "network_sharing", checkIdContains: "smb" }
//   shares → { category: "network_sharing", checkIdContains: "share" }
//   other  → no category filter; the page passes a multi-category
//            shape via `categoryIn` (if provided we'd handle it by
//            firing N parallel requests — Phase 1 just uses the
//            single-`category` form by passing the largest bucket
//            and lets the operator filter further by checkId).
//
// The component is dumb-ish — it receives filter params, fetches,
// renders. Reload is exposed via `refreshNonce` so the parent can
// force a reload when an action elsewhere completes.

import * as React from "react";
import {
  Box,
  Stack,
  Typography,
  Chip,
  CircularProgress,
  Button,
  Tooltip,
} from "@mui/material";
import { DataGrid } from "@mui/x-data-grid";
import RefreshOutlinedIcon from "@mui/icons-material/RefreshOutlined";
import VerifiedOutlinedIcon from "@mui/icons-material/VerifiedOutlined";

import { BRAND, DATAGRID_SX } from "../../theme/brand";
import { severityMeta } from "../../theme/severity";
import SectionPaper from "../common/SectionPaper";
import { getFindings } from "../../api/patchManagement";
import FindingDetailDrawer from "./FindingDetailDrawer";
import { listFrom } from "../../api/shape";

function severityChip(severity) {
  // Canonical severity scale (theme/severity.js) — High was red (== Critical);
  // now orange and consistent with every other severity surface.
  const m = severityMeta(severity);
  const e = { bg: m.bg, color: m.fg };
  return (
    <Chip
      size="small"
      label={severity || "—"}
      sx={{ height: 20, fontSize: 11, fontWeight: 700, bgcolor: e.bg, color: e.color }}
    />
  );
}

function formatTime(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-US", {
    year: "2-digit", month: "short", day: "2-digit",
    hourCycle: "h23", hour: "2-digit", minute: "2-digit",
  });
}

const ZERO_TOTALS = {
  totalFindings: 0,
  distinctChecks: 0,
  devicesAffected: 0,
  bySeverity: { critical: 0, high: 0, medium: 0, low: 0, info: 0 },
  agentRemediable: 0,
};

export default function FindingsPanel({
  // Display
  _tabKey,        // "tls" | "smb" | "shares" | "other"  (used only for friendly labels)
  // Filters passed to /findings
  category,
  checkIdContains,
  // Capability
  canManage,
  // Side-effects
  notify,
  // Refresh trigger from parent (bumps when a remediation lands)
  refreshNonce = 0,
}) {
  const [items, setItems] = React.useState([]);
  const [totals, setTotals] = React.useState(ZERO_TOTALS);
  const [loading, setLoading] = React.useState(true);

  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const [drawerFinding, setDrawerFinding] = React.useState(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (category) params.category = category;
      if (checkIdContains) params.checkIdContains = checkIdContains;
      const res = await getFindings(params);
      setItems(listFrom(res, { context: "patchFindings" }));
      setTotals(res?.totals ?? ZERO_TOTALS);
    } catch (err) {
      // PMP_PLUGIN_DISABLED → backend 403; the page-level banner
      // already explains; here we silently zero out so the operator
      // sees an empty state rather than a stack trace.
      const code = err?.body?.error;
      if (code === "PMP_PLUGIN_DISABLED") {
        setItems([]);
        setTotals(ZERO_TOTALS);
      } else {
        notify?.("error", err?.body?.message || err?.message || "Failed to load findings");
      }
    } finally {
      setLoading(false);
    }
  }, [category, checkIdContains, notify]);

  React.useEffect(() => {
    load();
  }, [load, refreshNonce]);

  const columns = React.useMemo(() => [
    {
      field: "severity",
      headerName: "Severity",
      width: 110,
      renderCell: (p) => severityChip(p.row.severity),
    },
    {
      field: "title",
      headerName: "Check",
      flex: 1.4,
      minWidth: 280,
      renderCell: (p) => (
        <Box sx={{ minWidth: 0 }}>
          <Typography sx={{ fontSize: 13, fontWeight: 700, color: BRAND.dark }}>
            {p.row.title || p.row.checkId}
          </Typography>
          <Typography sx={{ fontSize: 11, color: BRAND.gray, fontFamily: "monospace" }}>
            {p.row.checkId}
          </Typography>
        </Box>
      ),
    },
    {
      field: "devicesAffected",
      headerName: "Devices",
      width: 100,
      renderCell: (p) => (
        <Typography sx={{ fontSize: 13, fontWeight: 700, color: BRAND.dark }}>
          {p.row.devicesAffected}
        </Typography>
      ),
    },
    {
      field: "agentRemediable",
      headerName: "Auto-fix",
      width: 100,
      renderCell: (p) =>
        p.row.agentRemediable ? (
          <Tooltip title="The agent has a click-to-fix handler for this check">
            <Chip
              size="small"
              icon={<VerifiedOutlinedIcon style={{ fontSize: 13 }} />}
              label="ready"
              sx={{
                height: 20,
                fontSize: 11,
                fontWeight: 700,
                bgcolor: BRAND.alert?.successSoft,
                color: BRAND.alert?.success,
              }}
            />
          </Tooltip>
        ) : (
          <Tooltip title="No auto-fix handler yet — see remediation steps in the drawer for manual procedure">
            <Chip
              size="small"
              label="manual"
              sx={{
                height: 20,
                fontSize: 11,
                fontWeight: 700,
                bgcolor: BRAND.darkSoft,
                color: BRAND.gray,
              }}
            />
          </Tooltip>
        ),
    },
    {
      field: "remediationSummary",
      headerName: "Remediation",
      flex: 1.2,
      minWidth: 240,
      renderCell: (p) => {
        const text = p.row.remediationSummary;
        if (!text) return <Typography sx={{ fontSize: 12, color: BRAND.gray }}>—</Typography>;
        return (
          <Tooltip title={text} placement="left">
            <Typography
              sx={{
                fontSize: 12, color: BRAND.dark,
                whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
              }}
            >
              {text}
            </Typography>
          </Tooltip>
        );
      },
    },
    {
      field: "lastDetectedUtc",
      headerName: "Last detected",
      width: 130,
      renderCell: (p) => (
        <Typography sx={{ fontSize: 11, color: BRAND.gray }}>
          {formatTime(p.row.lastDetectedUtc)}
        </Typography>
      ),
    },
  ], []);

  // Convert to grid rows.
  const rows = items.map((it) => ({ id: it.checkId, ...it }));

  // ── Sub-KPI strip ───────────────────────────────────────────────
  // Renders only when we actually have something to show — empty
  // tabs collapse to just the "no findings" empty state below.
  const hasFindings = totals.totalFindings > 0 || items.length > 0;

  return (
    <Box>
      {hasFindings ? (
        <Stack
          direction="row"
          spacing={1}
          sx={{ mb: 1.5, flexWrap: "wrap", gap: 1 }}
        >
          <Chip
            size="small"
            label={`Distinct checks: ${totals.distinctChecks}`}
            sx={{ fontWeight: 700, bgcolor: BRAND.darkSoft, color: BRAND.dark }}
          />
          <Chip
            size="small"
            label={`Devices affected: ${totals.devicesAffected}`}
            sx={{ fontWeight: 700, bgcolor: BRAND.darkSoft, color: BRAND.dark }}
          />
          {totals.bySeverity.critical > 0 ? (
            <Chip
              size="small"
              label={`Critical: ${totals.bySeverity.critical}`}
              sx={{ fontWeight: 700, bgcolor: BRAND.alert?.errorSoft, color: BRAND.alert?.error }}
            />
          ) : null}
          {totals.bySeverity.high > 0 ? (
            <Chip
              size="small"
              label={`High: ${totals.bySeverity.high}`}
              sx={{ fontWeight: 700, bgcolor: BRAND.alert?.errorSoft, color: BRAND.alert?.error }}
            />
          ) : null}
          {totals.bySeverity.medium > 0 ? (
            <Chip
              size="small"
              label={`Medium: ${totals.bySeverity.medium}`}
              sx={{ fontWeight: 700, bgcolor: BRAND.alert?.warningSoft, color: BRAND.alert?.warning }}
            />
          ) : null}
          {totals.agentRemediable > 0 ? (
            <Chip
              size="small"
              label={`Auto-fix ready: ${totals.agentRemediable}`}
              sx={{ fontWeight: 700, bgcolor: BRAND.alert?.successSoft, color: BRAND.alert?.success }}
            />
          ) : null}
          <Box sx={{ flex: 1 }} />
          <Button
            size="small"
            startIcon={<RefreshOutlinedIcon />}
            onClick={load}
            disabled={loading}
            sx={{ textTransform: "none", color: BRAND.gray }}
          >
            {loading ? "Loading…" : "Refresh"}
          </Button>
        </Stack>
      ) : null}

      <SectionPaper variant="card" sx={{ p: 0 }}>
        {loading && items.length === 0 ? (
          <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
            <CircularProgress size={28} sx={{ color: BRAND.teal }} />
          </Box>
        ) : items.length === 0 ? (
          <Box sx={{ p: 5, textAlign: "center", color: BRAND.gray }}>
            <Typography variant="body2" sx={{ fontWeight: 700, color: BRAND.dark, mb: 0.5 }}>
              No open findings in this category
            </Typography>
            <Typography variant="body2">
              Either every device is compliant, or no agent in this tenant has reported the relevant compliance facts yet.
            </Typography>
          </Box>
        ) : (
          <DataGrid
            rows={rows}
            columns={columns}
            density="compact"
            disableRowSelectionOnClick
            pageSizeOptions={[10, 25, 50]}
            initialState={{ pagination: { paginationModel: { pageSize: 25 } } }}
            sx={{
              ...DATAGRID_SX,
              "& .MuiDataGrid-row:hover": { cursor: "pointer" },
            }}
            autoHeight
            onRowClick={(p) => {
              setDrawerFinding(p.row);
              setDrawerOpen(true);
            }}
          />
        )}
      </SectionPaper>

      <FindingDetailDrawer
        open={drawerOpen}
        finding={drawerFinding}
        canManage={canManage}
        notify={notify}
        onClose={() => setDrawerOpen(false)}
        onChanged={load}
      />
    </Box>
  );
}
