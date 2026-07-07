// src/components/patch-management/ThirdPartyPanel.jsx
//
// Third-party patching: the fleet rollup of outdated third-party software. Each
// row is a catalog entry with how many devices run an older version than the
// catalog's latest, and a one-click "Remediate" that deploys the entry's linked
// SDP package to exactly those devices.

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
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from "@mui/material";
import RefreshOutlinedIcon from "@mui/icons-material/RefreshOutlined";
import UpgradeOutlinedIcon from "@mui/icons-material/UpgradeOutlined";
import { BRAND } from "../../theme/brand";
import { getThirdPartyFleetFindings, remediateThirdParty } from "../../api/patchManagement";

function errMsg(err, fallback) {
  return err?.body?.message || err?.message || fallback;
}

export default function ThirdPartyPanel({ canManage, notify }) {
  const [items, setItems] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [confirm, setConfirm] = React.useState(null); // the entry pending remediation
  const [submitting, setSubmitting] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await getThirdPartyFleetFindings();
      setItems(Array.isArray(res?.items) ? res.items : []);
    } catch (err) {
      notify?.("error", errMsg(err, "Failed to load third-party findings"));
    } finally {
      setLoading(false);
    }
  }, [notify]);

  React.useEffect(() => {
    load();
  }, [load]);

  const doRemediate = async () => {
    if (!confirm) return;
    setSubmitting(true);
    try {
      const res = await remediateThirdParty(confirm.catalogId);
      setConfirm(null);
      if (res?.deployed) {
        notify?.("success", `Deploying ${confirm.title} update to ${res.deviceCount} device(s).`);
      } else {
        notify?.("info", `No devices are currently outdated for ${confirm.title}.`);
      }
      await load();
    } catch (err) {
      notify?.("error", errMsg(err, "Remediation failed"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Box>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 2 }}>
        <Typography sx={{ fontSize: 13, color: BRAND.gray }}>
          Outdated third-party software across the fleet, matched against your catalog. Remediate
          deploys the linked package to the affected devices.
        </Typography>
        <Box sx={{ flex: 1 }} />
        <Button onClick={load} startIcon={<RefreshOutlinedIcon />} sx={{ textTransform: "none", color: BRAND.gray }}>
          Refresh
        </Button>
      </Box>

      {loading ? (
        <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
          <CircularProgress size={28} sx={{ color: BRAND.teal }} />
        </Box>
      ) : items.length === 0 ? (
        <Box sx={{ p: 4, textAlign: "center", color: BRAND.gray }}>
          No outdated third-party software detected. Entries appear here once an installed version
          falls behind a catalog entry's latest version.
        </Box>
      ) : (
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell sx={{ fontWeight: 700, color: BRAND.dark }}>Software</TableCell>
              <TableCell sx={{ fontWeight: 700, color: BRAND.dark }}>Platform</TableCell>
              <TableCell sx={{ fontWeight: 700, color: BRAND.dark }}>Outdated devices</TableCell>
              <TableCell sx={{ fontWeight: 700, color: BRAND.dark }}>Latest version</TableCell>
              <TableCell align="right" sx={{ fontWeight: 700, color: BRAND.dark }}>Action</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {items.map((it) => (
              <TableRow key={it.catalogId} hover>
                <TableCell>
                  <Typography sx={{ fontSize: 13, fontWeight: 700, color: BRAND.dark }}>{it.title}</Typography>
                </TableCell>
                <TableCell>
                  <Chip
                    size="small"
                    label={it.platform}
                    sx={{ height: 20, fontSize: 11, fontWeight: 700, bgcolor: BRAND.darkSoft, color: BRAND.dark }}
                  />
                </TableCell>
                <TableCell>
                  <Chip
                    size="small"
                    label={it.outdatedDeviceCount}
                    sx={{
                      height: 20,
                      fontSize: 11,
                      fontWeight: 700,
                      bgcolor: BRAND.alert?.warningSoft,
                      color: BRAND.alert?.warning,
                    }}
                  />
                </TableCell>
                <TableCell>
                  <Typography sx={{ fontSize: 12, fontFamily: "monospace", color: BRAND.dark }}>
                    {it.latestVersion}
                  </Typography>
                </TableCell>
                <TableCell align="right">
                  {it.packageId == null ? (
                    <Chip
                      size="small"
                      label="No package linked"
                      sx={{ height: 20, fontSize: 11, bgcolor: BRAND.darkSoft, color: BRAND.gray }}
                    />
                  ) : canManage ? (
                    <Button
                      size="small"
                      startIcon={<UpgradeOutlinedIcon />}
                      onClick={() => setConfirm(it)}
                      sx={{ textTransform: "none", fontWeight: 700, color: BRAND.teal, "&:hover": { color: BRAND.tealHover } }}
                    >
                      Remediate
                    </Button>
                  ) : (
                    <Typography sx={{ fontSize: 11, color: BRAND.gray, fontStyle: "italic" }}>—</Typography>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <Dialog open={Boolean(confirm)} onClose={() => (submitting ? null : setConfirm(null))} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 800, color: BRAND.dark }}>Remediate {confirm?.title}?</DialogTitle>
        <DialogContent>
          <Typography sx={{ fontSize: 14, color: BRAND.dark }}>
            This deploys the linked package to update {confirm?.title} to{" "}
            <strong>{confirm?.latestVersion}</strong> on the{" "}
            <strong>{confirm?.outdatedDeviceCount}</strong> outdated device(s).
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={() => setConfirm(null)} disabled={submitting} sx={{ textTransform: "none", color: BRAND.gray }}>
            Cancel
          </Button>
          <Button
            onClick={doRemediate}
            disabled={submitting}
            variant="contained"
            sx={{ textTransform: "none", fontWeight: 700, bgcolor: BRAND.teal, "&:hover": { bgcolor: BRAND.tealHover } }}
          >
            {submitting ? "Deploying…" : "Deploy update"}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
