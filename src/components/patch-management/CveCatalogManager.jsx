// src/components/patch-management/CveCatalogManager.jsx
//
// Manage the per-tenant CVE catalog: the products + affected version ranges +
// CVSS that detection crosses against installed software to surface vulnerable
// installs. Mirrors ThirdPartyCatalogManager.

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
  listCveCatalog,
  createCveCatalog,
  updateCveCatalog,
  deleteCveCatalog,
} from "../../api/patchManagement";
import CveCatalogDialog from "./CveCatalogDialog";
import { severityMeta } from "./cveSeverity";

function errMsg(err, fallback) {
  return err?.body?.message || err?.message || fallback;
}

function rangeLabel(it) {
  const lo = it.introducedVersion || "*";
  const hi = it.fixedVersion || "∞";
  return `${lo} → ${hi}`;
}

export default function CveCatalogManager({ canManage, notify }) {
  const [items, setItems] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [dialog, setDialog] = React.useState(null); // { mode, entry }
  const [submitting, setSubmitting] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await listCveCatalog();
      setItems(Array.isArray(res?.items) ? res.items : []);
    } catch (err) {
      notify?.("error", errMsg(err, "Failed to load CVE catalog"));
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
      if (dialog?.mode === "edit") await updateCveCatalog(dialog.entry.id, payload);
      else await createCveCatalog(payload);
      setDialog(null);
      notify?.("success", dialog?.mode === "edit" ? "CVE entry updated." : "CVE entry created.");
      await load();
    } catch (err) {
      notify?.("error", errMsg(err, "Save failed"));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (entry) => {
    try {
      await deleteCveCatalog(entry.id);
      notify?.("success", "CVE entry deleted.");
      await load();
    } catch (err) {
      notify?.("error", errMsg(err, "Delete failed"));
    }
  };

  return (
    <Box>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 2 }}>
        <Typography sx={{ fontSize: 13, color: BRAND.gray }}>
          Known CVEs this tenant tracks, mapped to a product + affected version range. Detection
          flags installed software whose version falls inside the range.
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
            Add CVE
          </Button>
        ) : null}
      </Box>

      {loading ? (
        <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
          <CircularProgress size={28} sx={{ color: BRAND.teal }} />
        </Box>
      ) : items.length === 0 ? (
        <Box sx={{ p: 4, textAlign: "center", color: BRAND.gray }}>
          No CVE entries yet. Add one to start matching installed software against known
          vulnerabilities.
        </Box>
      ) : (
        <Box sx={{ overflowX: "auto" }}>
          <Table size="small" sx={{ minWidth: 720 }}>
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 700, color: BRAND.dark }}>CVE</TableCell>
                <TableCell sx={{ fontWeight: 700, color: BRAND.dark }}>Software</TableCell>
                <TableCell sx={{ fontWeight: 700, color: BRAND.dark }}>Platform</TableCell>
                <TableCell sx={{ fontWeight: 700, color: BRAND.dark }}>Severity</TableCell>
                <TableCell sx={{ fontWeight: 700, color: BRAND.dark }}>Affected range</TableCell>
                <TableCell sx={{ fontWeight: 700, color: BRAND.dark }}>Fix package</TableCell>
                {canManage ? <TableCell align="right" sx={{ fontWeight: 700, color: BRAND.dark }}>Actions</TableCell> : null}
              </TableRow>
            </TableHead>
            <TableBody>
              {items.map((it) => {
                const m = severityMeta(it.cvssSeverity);
                return (
                  <TableRow key={it.id} hover sx={{ opacity: it.isActive ? 1 : 0.55 }}>
                    <TableCell>
                      <Typography sx={{ fontSize: 12.5, fontWeight: 700, color: BRAND.dark }}>{it.cveId}</Typography>
                      {it.cvssScore != null ? (
                        <Typography sx={{ fontSize: 11, color: BRAND.gray }}>CVSS {Number(it.cvssScore).toFixed(1)}</Typography>
                      ) : null}
                    </TableCell>
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
                      <Chip size="small" label={m.label} sx={{ height: 20, fontSize: 11, fontWeight: 800, bgcolor: m.bg, color: m.fg }} />
                    </TableCell>
                    <TableCell>
                      <Typography sx={{ fontSize: 12, fontFamily: "monospace", color: BRAND.dark }}>{rangeLabel(it)}</Typography>
                    </TableCell>
                    <TableCell>
                      {it.packageId == null ? (
                        <Typography sx={{ fontSize: 11, color: BRAND.gray, fontStyle: "italic" }}>none</Typography>
                      ) : (
                        <Typography sx={{ fontSize: 12, color: BRAND.dark }}>#{it.packageId}</Typography>
                      )}
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
                );
              })}
            </TableBody>
          </Table>
        </Box>
      )}

      <CveCatalogDialog
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
