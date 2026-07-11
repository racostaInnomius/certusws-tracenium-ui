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
import CloudSyncOutlinedIcon from "@mui/icons-material/CloudSyncOutlined";
import GppMaybeOutlinedIcon from "@mui/icons-material/GppMaybeOutlined";
import { BRAND } from "../../theme/brand";
import {
  listCveCatalog,
  createCveCatalog,
  updateCveCatalog,
  deleteCveCatalog,
  triggerNvdSync,
  getNvdSyncStatus,
  triggerKevSync,
  getKevSyncStatus,
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

function timeAgo(iso) {
  if (!iso) return "";
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  const mins = Math.round((Date.now() - t) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const h = Math.round(mins / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

// One-line summary of the last/current NVD sync for the toolbar.
function syncStatusText(s) {
  if (!s || s.status === "idle") return "Never synced from NVD.";
  if (s.status === "running") return "NVD sync running…";
  if (s.status === "failed") return `Last NVD sync failed ${timeAgo(s.finishedAt)}${s.error ? `: ${s.error}` : ""}`;
  // completed
  const c = s.summary || {};
  const parts = [
    `${c.cvesUpserted ?? 0} CVE${(c.cvesUpserted ?? 0) === 1 ? "" : "s"} from ${c.productsQueried ?? 0} product${(c.productsQueried ?? 0) === 1 ? "" : "s"}`,
  ];
  if (c.productsTruncated) parts.push(`(capped at ${c.productsQueried} of ${c.productsInFleet})`);
  return `Last NVD sync ${timeAgo(s.finishedAt)} · ${parts.join(" ")}`;
}

// One-line summary of the last/current CISA KEV refresh (global catalog).
function kevStatusText(s) {
  if (!s || s.status === "idle") return "KEV catalog not synced yet.";
  if (s.status === "running") return "Refreshing CISA KEV catalog…";
  if (s.status === "failed") return `Last KEV refresh failed ${timeAgo(s.finishedAt)}${s.error ? `: ${s.error}` : ""}`;
  const c = s.summary || {};
  const ver = c.catalogVersion ? ` (catalog ${c.catalogVersion})` : "";
  return `KEV catalog refreshed ${timeAgo(s.finishedAt)} · ${c.upserted ?? 0} entries${ver}`;
}

export default function CveCatalogManager({ canManage, notify }) {
  const [items, setItems] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [dialog, setDialog] = React.useState(null); // { mode, entry }
  const [submitting, setSubmitting] = React.useState(false);
  const [syncStatus, setSyncStatus] = React.useState(null);
  const [syncing, setSyncing] = React.useState(false);
  const [kevStatus, setKevStatus] = React.useState(null);
  const [kevSyncing, setKevSyncing] = React.useState(false);

  const loadStatus = React.useCallback(async () => {
    try {
      const res = await getNvdSyncStatus();
      setSyncStatus(res?.status ?? null);
      return res?.status ?? null;
    } catch {
      return null; // status is best-effort; don't nag the operator
    }
  }, []);

  const loadKevStatus = React.useCallback(async () => {
    try {
      const res = await getKevSyncStatus();
      setKevStatus(res?.status ?? null);
      return res?.status ?? null;
    } catch {
      return null;
    }
  }, []);

  // Poll the sync status while a run is in flight so "running" flips to
  // "completed" without a manual refresh; refetch the catalog when it finishes.
  React.useEffect(() => {
    if (syncStatus?.status !== "running") return undefined;
    let cancelled = false;
    const id = setInterval(async () => {
      const s = await loadStatus();
      if (!cancelled && s && s.status !== "running") {
        clearInterval(id);
        load();
      }
    }, 8000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [syncStatus?.status, loadStatus]); // eslint-disable-line react-hooks/exhaustive-deps

  // Same polling for the KEV refresh (global catalog); no catalog refetch needed
  // since KEV enriches exposure, not this catalog list.
  React.useEffect(() => {
    if (kevStatus?.status !== "running") return undefined;
    let cancelled = false;
    const id = setInterval(async () => {
      const s = await loadKevStatus();
      if (!cancelled && s && s.status !== "running") clearInterval(id);
    }, 8000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [kevStatus?.status, loadKevStatus]);

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
    loadStatus();
    loadKevStatus();
  }, [load, loadStatus, loadKevStatus]);

  const handleSync = async () => {
    setSyncing(true);
    try {
      await triggerNvdSync({});
      notify?.("success", "NVD sync started — this can take a few minutes for a large fleet.");
      await loadStatus(); // flips the panel to "running" + kicks off polling
    } catch (err) {
      if (err?.status === 409 || err?.body?.error === "NVD_SYNC_ALREADY_RUNNING") {
        notify?.("info", "An NVD sync is already running for this tenant.");
        await loadStatus();
      } else {
        notify?.("error", errMsg(err, "Failed to start NVD sync"));
      }
    } finally {
      setSyncing(false);
    }
  };

  const handleKevSync = async () => {
    setKevSyncing(true);
    try {
      await triggerKevSync();
      notify?.("success", "CISA KEV catalog refresh started.");
      await loadKevStatus();
    } catch (err) {
      if (err?.status === 409 || err?.body?.error === "KEV_SYNC_ALREADY_RUNNING") {
        notify?.("info", "A KEV refresh is already running.");
        await loadKevStatus();
      } else {
        notify?.("error", errMsg(err, "Failed to start KEV refresh"));
      }
    } finally {
      setKevSyncing(false);
    }
  };

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
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}>
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
            onClick={handleSync}
            disabled={syncing || syncStatus?.status === "running"}
            startIcon={
              syncStatus?.status === "running" || syncing ? (
                <CircularProgress size={16} sx={{ color: BRAND.gray }} />
              ) : (
                <CloudSyncOutlinedIcon />
              )
            }
            sx={{ textTransform: "none", fontWeight: 700, color: BRAND.teal }}
          >
            {syncStatus?.status === "running" ? "Syncing…" : "Sync from NVD"}
          </Button>
        ) : null}
        {canManage ? (
          <Button
            onClick={handleKevSync}
            disabled={kevSyncing || kevStatus?.status === "running"}
            startIcon={
              kevStatus?.status === "running" || kevSyncing ? (
                <CircularProgress size={16} sx={{ color: BRAND.gray }} />
              ) : (
                <GppMaybeOutlinedIcon />
              )
            }
            sx={{ textTransform: "none", fontWeight: 700, color: BRAND.teal }}
          >
            {kevStatus?.status === "running" ? "Refreshing…" : "Refresh KEV"}
          </Button>
        ) : null}
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

      {/* NVD sync status line */}
      <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, mb: 0.5 }}>
        <CloudSyncOutlinedIcon sx={{ fontSize: 14, color: syncStatus?.status === "failed" ? BRAND.alert?.error : BRAND.gray }} />
        <Typography sx={{ fontSize: 12, color: syncStatus?.status === "failed" ? BRAND.alert?.error : BRAND.gray }}>
          {syncStatusText(syncStatus)}
        </Typography>
      </Box>

      {/* CISA KEV refresh status line (global catalog) */}
      <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, mb: 2 }}>
        <GppMaybeOutlinedIcon sx={{ fontSize: 14, color: kevStatus?.status === "failed" ? BRAND.alert?.error : BRAND.gray }} />
        <Typography sx={{ fontSize: 12, color: kevStatus?.status === "failed" ? BRAND.alert?.error : BRAND.gray }}>
          {kevStatusText(kevStatus)}
        </Typography>
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
