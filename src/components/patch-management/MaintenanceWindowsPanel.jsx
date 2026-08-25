// src/components/patch-management/MaintenanceWindowsPanel.jsx
//
// Manage the tenant's maintenance windows — the weekly spans during which patch
// and software deployments are allowed to dispatch. No windows = unrestricted
// (deployments go out immediately), so an empty list shows that plainly.

import * as React from "react";
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import AddOutlinedIcon from "@mui/icons-material/AddOutlined";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import DeleteOutlineOutlinedIcon from "@mui/icons-material/DeleteOutlineOutlined";
import RefreshOutlinedIcon from "@mui/icons-material/RefreshOutlined";
import { BRAND, TEXT } from "../../theme/brand";
import {
  listMaintenanceWindows,
  createMaintenanceWindow,
  updateMaintenanceWindow,
  deleteMaintenanceWindow,
} from "../../api/patchManagement";
import MaintenanceWindowDialog from "./MaintenanceWindowDialog";
import { minutesToHHMM } from "./maintenanceWindowTime";
import { listFrom } from "../../api/shape";

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// "Mon–Fri" for a contiguous run, else "Mon, Wed, Fri".
function formatDays(days) {
  const sorted = [...(days || [])].sort((a, b) => a - b);
  if (sorted.length === 0) return "—";
  if (sorted.length === 7) return "Every day";
  const contiguous = sorted.every((d, i) => i === 0 || d === sorted[i - 1] + 1);
  if (contiguous && sorted.length > 2) return `${DAY_LABELS[sorted[0]]}–${DAY_LABELS[sorted[sorted.length - 1]]}`;
  return sorted.map((d) => DAY_LABELS[d]).join(", ");
}

function formatTimeRange(startMinute, durationMinutes) {
  const end = (startMinute + durationMinutes) % 1440;
  const crosses = startMinute + durationMinutes >= 1440;
  return `${minutesToHHMM(startMinute)}–${minutesToHHMM(end)}${crosses ? " (+1d)" : ""}`;
}

function errMsg(err, fallback) {
  return err?.body?.message || err?.message || fallback;
}

export default function MaintenanceWindowsPanel({ canManage, notify }) {
  const [items, setItems] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [dialog, setDialog] = React.useState(null); // { mode, entry }
  const [submitting, setSubmitting] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await listMaintenanceWindows();
      setItems(listFrom(res, { context: "maintenanceWindows" }));
    } catch (err) {
      notify?.("error", errMsg(err, "Failed to load maintenance windows"));
    } finally {
      setLoading(false);
    }
  }, [notify]);

  React.useEffect(() => {
    load();
  }, [load]);

  const handleSubmit = async (payload) => {
    setSubmitting(true);
    try {
      if (dialog?.mode === "edit") await updateMaintenanceWindow(dialog.entry.id, payload);
      else await createMaintenanceWindow(payload);
      setDialog(null);
      notify?.("success", dialog?.mode === "edit" ? "Window updated." : "Window created.");
      await load();
    } catch (err) {
      notify?.("error", errMsg(err, "Save failed"));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (entry) => {
    try {
      await deleteMaintenanceWindow(entry.id);
      notify?.("success", "Window deleted.");
      await load();
    } catch (err) {
      notify?.("error", errMsg(err, "Delete failed"));
    }
  };

  return (
    <Box>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 2 }}>
        <Typography sx={{ fontSize: TEXT.md, color: BRAND.gray }}>
          When deployments are allowed to dispatch. With no windows, deployments go out immediately.
        </Typography>
        <Box sx={{ flex: 1 }} />
        <Button onClick={load} startIcon={<RefreshOutlinedIcon />} sx={{ textTransform: "none", color: BRAND.gray }}>
          Refresh
        </Button>
        {canManage ? (
          <Button
            onClick={() => setDialog({ mode: "create", entry: null })}
            startIcon={<AddOutlinedIcon />}
            variant="contained"
            sx={{ textTransform: "none", fontWeight: 700, bgcolor: BRAND.teal, "&:hover": { bgcolor: BRAND.tealHover } }}
          >
            Add window
          </Button>
        ) : null}
      </Box>

      {loading ? (
        <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
          <CircularProgress size={28} sx={{ color: BRAND.teal }} />
        </Box>
      ) : items.length === 0 ? (
        <Box sx={{ p: 4, textAlign: "center", color: BRAND.gray }}>
          No maintenance windows — deployments dispatch immediately. Add a window to restrict them to
          off-hours.
        </Box>
      ) : (
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell sx={{ fontWeight: 700, color: BRAND.dark }}>Name</TableCell>
              <TableCell sx={{ fontWeight: 700, color: BRAND.dark }}>Days</TableCell>
              <TableCell sx={{ fontWeight: 700, color: BRAND.dark }}>Time</TableCell>
              <TableCell sx={{ fontWeight: 700, color: BRAND.dark }}>Timezone</TableCell>
              <TableCell sx={{ fontWeight: 700, color: BRAND.dark }}>Status</TableCell>
              {canManage ? <TableCell align="right" sx={{ fontWeight: 700, color: BRAND.dark }}>Actions</TableCell> : null}
            </TableRow>
          </TableHead>
          <TableBody>
            {items.map((it) => (
              <TableRow key={it.id} hover sx={{ opacity: it.enabled ? 1 : 0.55 }}>
                <TableCell><Typography sx={{ fontSize: TEXT.md, fontWeight: 700, color: BRAND.dark }}>{it.name}</Typography></TableCell>
                <TableCell><Typography sx={{ fontSize: TEXT.md, color: BRAND.dark }}>{formatDays(it.daysOfWeek)}</Typography></TableCell>
                <TableCell><Typography sx={{ fontSize: TEXT.sm, fontFamily: "monospace", color: BRAND.dark }}>{formatTimeRange(it.startMinute, it.durationMinutes)}</Typography></TableCell>
                <TableCell><Typography sx={{ fontSize: TEXT.sm, color: BRAND.gray }}>{it.timezone}</Typography></TableCell>
                <TableCell>
                  <Chip
                    size="small"
                    label={it.enabled ? "Enabled" : "Disabled"}
                    sx={{
                      height: 20, fontSize: TEXT.xs, fontWeight: 700,
                      bgcolor: it.enabled ? BRAND.alert?.successSoft : BRAND.darkSoft,
                      color: it.enabled ? BRAND.alert?.success : BRAND.gray,
                    }}
                  />
                </TableCell>
                {canManage ? (
                  <TableCell align="right">
                    <Button size="small" onClick={() => setDialog({ mode: "edit", entry: it })} sx={{ minWidth: 0, color: BRAND.gray, "&:hover": { color: BRAND.dark } }}>
                      <EditOutlinedIcon fontSize="small" />
                    </Button>
                    <Button size="small" onClick={() => handleDelete(it)} sx={{ minWidth: 0, color: BRAND.gray, "&:hover": { color: BRAND.alert?.error } }}>
                      <DeleteOutlineOutlinedIcon fontSize="small" />
                    </Button>
                  </TableCell>
                ) : null}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <MaintenanceWindowDialog
        open={Boolean(dialog)}
        mode={dialog?.mode}
        window={dialog?.entry}
        submitting={submitting}
        onClose={() => (submitting ? null : setDialog(null))}
        onSubmit={handleSubmit}
      />
    </Box>
  );
}
