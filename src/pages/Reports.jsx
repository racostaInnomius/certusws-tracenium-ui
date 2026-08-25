// src/pages/Reports.jsx
//
// ADR-0008 Fase F1a — "one door for every report". Catalog is entirely
// server-driven (GET /api/v1/reports/types): a tenant without a given
// plugin/role simply never sees that row, so there's no client-side
// gating logic to keep in sync with the backend.

import * as React from "react";
import { Box, Button, Paper, Typography } from "@mui/material";
import { DataGrid } from "@mui/x-data-grid";
import DownloadOutlinedIcon from "@mui/icons-material/DownloadOutlined";
import MailOutlineIcon from "@mui/icons-material/MailOutline";
import BrandSnackbar from "../components/common/BrandSnackbar";
import EmailReportDialog from "../components/Reports/EmailReportDialog";
import { getReportTypes, getReportRuns, runReport } from "../api/reports";
import { BRAND, TEXT } from "../theme/brand";

export default function Reports() {
  const [rows, setRows] = React.useState([]);
  const [runs, setRuns] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  // `${key}:${format}` while that specific button's download is in flight.
  const [runningKey, setRunningKey] = React.useState(null);
  const [snackbar, setSnackbar] = React.useState({ open: false, message: "", severity: "success" });
  const [emailTarget, setEmailTarget] = React.useState(null);

  const loadData = React.useCallback(async () => {
    setLoading(true);
    try {
      const [typesRes, runsRes] = await Promise.all([getReportTypes(), getReportRuns({ limit: 20 })]);
      setRows((typesRes.types || []).map((t) => ({ id: t.key, ...t })));
      setRuns(runsRes.runs || []);
    } catch (err) {
      setSnackbar({ open: true, message: err?.message || "Could not load reports.", severity: "error" });
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    loadData();
  }, [loadData]);

  const handleRun = async (key, format) => {
    setRunningKey(`${key}:${format}`);
    try {
      await runReport(key, format);
      // Refresh the history table so the run just kicked off shows up
      // without a manual reload.
      loadData();
    } catch (err) {
      setSnackbar({ open: true, message: err?.message || "Report failed.", severity: "error" });
    } finally {
      setRunningKey(null);
    }
  };

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
  };

  const typeColumns = [
    { field: "group", headerName: "Group", minWidth: 100 },
    { field: "label", headerName: "Report", minWidth: 220, flex: 1 },
    { field: "description", headerName: "Description", minWidth: 320, flex: 1.4 },
    {
      field: "actions",
      headerName: "Run now",
      minWidth: 260,
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
              onClick={() => handleRun(params.row.key, format)}
              sx={{ textTransform: "none" }}
            >
              {format.toUpperCase()}
            </Button>
          ))}
          <Button
            size="small"
            startIcon={<MailOutlineIcon />}
            onClick={() => setEmailTarget(params.row)}
            sx={{ textTransform: "none" }}
          >
            Email
          </Button>
        </Box>
      ),
    },
  ];

  const runColumns = [
    { field: "occurredAt", headerName: "When", minWidth: 190 },
    { field: "key", headerName: "Report", minWidth: 200, flex: 1 },
    { field: "format", headerName: "Format", minWidth: 90 },
    { field: "actor", headerName: "By", minWidth: 220, flex: 1 },
    { field: "outcome", headerName: "Outcome", minWidth: 100 },
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

      <Paper sx={{ p: 2, borderRadius: 3, border: `1px solid ${BRAND.border}`, boxShadow: BRAND.shadow }}>
        <Typography sx={{ fontSize: TEXT.md, fontWeight: 700, color: BRAND.dark, mb: 1.5 }}>
          Recent runs
        </Typography>
        <Box sx={{ width: "100%" }}>
          <DataGrid
            rows={runs.map((r, i) => ({ id: i, ...r }))}
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

      <EmailReportDialog
        open={Boolean(emailTarget)}
        reportType={emailTarget}
        onClose={() => setEmailTarget(null)}
        onResult={handleEmailResult}
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
