// src/components/patch-management/ThirdPartyCatalogManager.jsx
//
// Manage the third-party software catalog: the per-tenant list of products with
// their latest version + optional remediation package. Detection crosses this
// against installed software. Entries created from an approved SDP package are
// marked `sdp_intake` (and auto-refreshed); operators can also add manual ones.

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
import { BRAND } from "../../theme/brand";
import {
  listThirdPartyCatalog,
  createThirdPartyCatalog,
  updateThirdPartyCatalog,
  deleteThirdPartyCatalog,
} from "../../api/patchManagement";
import CatalogDialog from "./CatalogDialog";
import { listFrom } from "../../api/shape";

function errMsg(err, fallback) {
  return err?.body?.message || err?.message || fallback;
}

export default function ThirdPartyCatalogManager({ canManage, notify }) {
  const [items, setItems] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [dialog, setDialog] = React.useState(null); // { mode, entry }
  const [submitting, setSubmitting] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await listThirdPartyCatalog();
      setItems(listFrom(res, { context: "thirdPartyCatalog" }));
    } catch (err) {
      notify?.("error", errMsg(err, "Failed to load catalog"));
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
      if (dialog?.mode === "edit") await updateThirdPartyCatalog(dialog.entry.id, payload);
      else await createThirdPartyCatalog(payload);
      setDialog(null);
      notify?.("success", dialog?.mode === "edit" ? "Catalog entry updated." : "Catalog entry created.");
      await load();
    } catch (err) {
      notify?.("error", errMsg(err, "Save failed"));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (entry) => {
    try {
      await deleteThirdPartyCatalog(entry.id);
      notify?.("success", "Catalog entry deleted.");
      await load();
    } catch (err) {
      notify?.("error", errMsg(err, "Delete failed"));
    }
  };

  return (
    <Box>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 2 }}>
        <Typography sx={{ fontSize: 13, color: BRAND.gray }}>
          The software this tenant tracks for third-party patching. Detection compares installed
          versions against each entry's latest version.
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
            Add entry
          </Button>
        ) : null}
      </Box>

      {loading ? (
        <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
          <CircularProgress size={28} sx={{ color: BRAND.teal }} />
        </Box>
      ) : items.length === 0 ? (
        <Box sx={{ p: 4, textAlign: "center", color: BRAND.gray }}>
          No catalog entries yet. Add one, or approve a package in Software Delivery to populate it
          automatically.
        </Box>
      ) : (
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell sx={{ fontWeight: 700, color: BRAND.dark }}>Software</TableCell>
              <TableCell sx={{ fontWeight: 700, color: BRAND.dark }}>Platform</TableCell>
              <TableCell sx={{ fontWeight: 700, color: BRAND.dark }}>Latest</TableCell>
              <TableCell sx={{ fontWeight: 700, color: BRAND.dark }}>Package</TableCell>
              <TableCell sx={{ fontWeight: 700, color: BRAND.dark }}>Source</TableCell>
              {canManage ? <TableCell align="right" sx={{ fontWeight: 700, color: BRAND.dark }}>Actions</TableCell> : null}
            </TableRow>
          </TableHead>
          <TableBody>
            {items.map((it) => (
              <TableRow key={it.id} hover sx={{ opacity: it.isActive ? 1 : 0.55 }}>
                <TableCell>
                  <Typography sx={{ fontSize: 13, fontWeight: 700, color: BRAND.dark }}>{it.title}</Typography>
                  {it.publisher ? (
                    <Typography sx={{ fontSize: 11, color: BRAND.gray }}>{it.publisher}</Typography>
                  ) : null}
                </TableCell>
                <TableCell>
                  <Chip size="small" label={it.platform} sx={{ height: 20, fontSize: 11, fontWeight: 700, bgcolor: BRAND.darkSoft, color: BRAND.dark }} />
                </TableCell>
                <TableCell>
                  <Typography sx={{ fontSize: 12, fontFamily: "monospace", color: BRAND.dark }}>{it.latestVersion}</Typography>
                </TableCell>
                <TableCell>
                  {it.packageId == null ? (
                    <Typography sx={{ fontSize: 11, color: BRAND.gray, fontStyle: "italic" }}>none</Typography>
                  ) : (
                    <Typography sx={{ fontSize: 12, color: BRAND.dark }}>#{it.packageId}</Typography>
                  )}
                </TableCell>
                <TableCell>
                  <Chip
                    size="small"
                    label={it.source === "sdp_intake" ? "SDP" : "Manual"}
                    sx={{
                      height: 20,
                      fontSize: 11,
                      fontWeight: 700,
                      bgcolor: it.source === "sdp_intake" ? BRAND.tealSoft : BRAND.darkSoft,
                      color: it.source === "sdp_intake" ? BRAND.tealText : BRAND.gray,
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

      <CatalogDialog
        open={Boolean(dialog)}
        mode={dialog?.mode}
        entry={dialog?.entry}
        submitting={submitting}
        onClose={() => (submitting ? null : setDialog(null))}
        onSubmit={handleSubmit}
      />
    </Box>
  );
}
