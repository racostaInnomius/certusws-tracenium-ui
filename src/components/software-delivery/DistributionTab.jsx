// src/components/software-delivery/DistributionTab.jsx
//
// Distribution Phase B — manage LAN sites + distribution points.
//
//   Sites: named CIDR sets (+ optional tag override). A device belongs to a
//   site when its reported IP falls in any of the site's subnets.
//   Distribution points: an agent designated to cache + serve packages to its
//   site's peers. Deployments hold a site's installs until its DP prefetch
//   acks (fail-open to CDN on timeout).

import * as React from "react";
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Grid,
  IconButton,
  MenuItem,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import AddOutlinedIcon from "@mui/icons-material/AddOutlined";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import LanOutlinedIcon from "@mui/icons-material/LanOutlined";
import HubOutlinedIcon from "@mui/icons-material/HubOutlined";
import WarningAmberOutlinedIcon from "@mui/icons-material/WarningAmberOutlined";
import SummaryCard from "../common/SummaryCard";
import { BRAND, ROLE } from "../../theme/brand";
import {
  listSites,
  createSite,
  updateSite,
  deleteSite,
  listDistributionPoints,
  upsertDistributionPoint,
  deleteDistributionPoint,
} from "../../api/softwareDelivery";

const CIDR_RE = /^(\d{1,3}\.){3}\d{1,3}\/\d{1,2}$/;

function SiteDialog({ open, site, onClose, onSaved, notify }) {
  const [name, setName] = React.useState("");
  const [subnetsRaw, setSubnetsRaw] = React.useState("");
  const [tag, setTag] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setName(site?.name ?? "");
    setSubnetsRaw((site?.matchSubnets ?? []).join("\n"));
    setTag(site?.matchTag ?? "");
    setSaving(false);
  }, [open, site]);

  const subnets = React.useMemo(
    () => subnetsRaw.split(/[\s,;\n]+/).map((s) => s.trim()).filter(Boolean),
    [subnetsRaw]
  );
  const badSubnet = subnets.find((s) => !CIDR_RE.test(s));
  const canSave = !saving && name.trim() && subnets.length > 0 && !badSubnet;

  const save = async () => {
    setSaving(true);
    try {
      const payload = { name: name.trim(), matchSubnets: subnets, matchTag: tag.trim() || null };
      if (site?.id) await updateSite(site.id, payload);
      else await createSite(payload);
      onSaved?.();
    } catch (err) {
      notify?.("error", err?.body?.message || err?.message || "Failed to save site");
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle sx={{ fontWeight: 800, color: BRAND.dark }}>
        {site?.id ? "Edit site" : "New site"}
      </DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2} sx={{ mt: 0.5 }}>
          <TextField size="small" label="Name" value={name} onChange={(e) => setName(e.target.value)} fullWidth />
          <TextField
            size="small"
            label="Subnets (CIDR)"
            value={subnetsRaw}
            onChange={(e) => setSubnetsRaw(e.target.value)}
            multiline
            minRows={3}
            fullWidth
            error={Boolean(badSubnet)}
            helperText={
              badSubnet
                ? `Invalid CIDR: ${badSubnet}`
                : "One per line, e.g. 10.1.0.0/16 — devices whose IP falls inside belong to this site."
            }
          />
          <TextField
            size="small"
            label="Tag override (optional)"
            value={tag}
            onChange={(e) => setTag(e.target.value)}
            fullWidth
            helperText="Devices carrying this tag join the site regardless of IP."
          />
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={onClose} disabled={saving} sx={{ textTransform: "none", color: BRAND.gray }}>
          Cancel
        </Button>
        <Button
          onClick={save}
          disabled={!canSave}
          variant="contained"
          sx={{ textTransform: "none", fontWeight: 700, bgcolor: BRAND.teal, "&:hover": { bgcolor: BRAND.tealHover } }}
        >
          {saving ? "Saving…" : "Save"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function DpDialog({ open, sites, onClose, onSaved, notify }) {
  const [siteId, setSiteId] = React.useState("");
  const [agentId, setAgentId] = React.useState("");
  const [lanUrl, setLanUrl] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setSiteId(sites.length > 0 ? String(sites[0].id) : "");
    setAgentId("");
    setLanUrl("");
    setSaving(false);
  }, [open, sites]);

  const canSave = !saving && siteId && agentId.trim() && (!lanUrl.trim() || /^https:\/\//i.test(lanUrl.trim()));

  const save = async () => {
    setSaving(true);
    try {
      await upsertDistributionPoint({
        siteId: Number(siteId),
        agentId: agentId.trim(),
        lanUrl: lanUrl.trim() || null,
      });
      onSaved?.();
    } catch (err) {
      notify?.("error", err?.body?.message || err?.message || "Failed to save distribution point");
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle sx={{ fontWeight: 800, color: BRAND.dark }}>Designate distribution point</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2} sx={{ mt: 0.5 }}>
          <TextField select size="small" label="Site" value={siteId} onChange={(e) => setSiteId(e.target.value)} fullWidth>
            {sites.map((s) => (
              <MenuItem key={s.id} value={String(s.id)}>
                {s.name}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            size="small"
            label="Agent ID"
            value={agentId}
            onChange={(e) => setAgentId(e.target.value)}
            fullWidth
            helperText="Prefer an always-on, wired, disk-roomy device on this site's LAN."
          />
          <TextField
            size="small"
            label="LAN URL override (optional)"
            value={lanUrl}
            onChange={(e) => setLanUrl(e.target.value)}
            fullWidth
            error={Boolean(lanUrl.trim()) && !/^https:\/\//i.test(lanUrl.trim())}
            helperText="Blank = computed from the device's reported IP (https://<ip>:47821)."
          />
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={onClose} disabled={saving} sx={{ textTransform: "none", color: BRAND.gray }}>
          Cancel
        </Button>
        <Button
          onClick={save}
          disabled={!canSave}
          variant="contained"
          sx={{ textTransform: "none", fontWeight: 700, bgcolor: BRAND.teal, "&:hover": { bgcolor: BRAND.tealHover } }}
        >
          {saving ? "Saving…" : "Save"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export default function DistributionTab({ canManage, notify }) {
  const [loading, setLoading] = React.useState(true);
  const [sites, setSites] = React.useState([]);
  const [dps, setDps] = React.useState([]);
  const [siteDialog, setSiteDialog] = React.useState({ open: false, site: null });
  const [dpDialogOpen, setDpDialogOpen] = React.useState(false);

  const reload = React.useCallback(async () => {
    setLoading(true);
    try {
      const [s, d] = await Promise.all([listSites(), listDistributionPoints()]);
      setSites(Array.isArray(s?.items) ? s.items : []);
      setDps(Array.isArray(d?.items) ? d.items : []);
    } catch (err) {
      notify?.("error", err?.body?.message || err?.message || "Failed to load distribution config");
    } finally {
      setLoading(false);
    }
  }, [notify]);

  React.useEffect(() => {
    reload();
  }, [reload]);

  const removeSite = async (site) => {
    try {
      await deleteSite(site.id);
      notify?.("success", `Site "${site.name}" deleted`);
      reload();
    } catch (err) {
      notify?.("error", err?.body?.message || err?.message || "Failed to delete site");
    }
  };

  const removeDp = async (dp) => {
    try {
      await deleteDistributionPoint(dp.id);
      notify?.("success", `Distribution point ${dp.agentId} removed`);
      reload();
    } catch (err) {
      notify?.("error", err?.body?.message || err?.message || "Failed to remove distribution point");
    }
  };

  const siteName = (id) => sites.find((s) => s.id === id)?.name ?? `#${id}`;

  // Coverage is the number worth surfacing: a site with no active DP has its
  // devices downloading from CDN/origin instead of the LAN, which is bandwidth
  // being paid for twice. Both lists are already loaded, so this is a join in
  // memory — no extra request.
  const coverage = React.useMemo(() => {
    const activeDpSiteIds = new Set(
      dps.filter((dp) => dp.status === "active").map((dp) => dp.siteId)
    );
    const activeSites = sites.filter((s) => s.isActive);
    const covered = activeSites.filter((s) => activeDpSiteIds.has(s.id));
    const staleCutoff = Date.now() - 24 * 60 * 60 * 1000;
    const staleDps = dps.filter(
      (dp) => dp.lastSeenAt && Date.parse(dp.lastSeenAt) < staleCutoff
    ).length;
    return {
      totalSites: sites.length,
      activeSites: activeSites.length,
      totalDps: dps.length,
      activeDps: dps.filter((dp) => dp.status === "active").length,
      uncovered: activeSites.length - covered.length,
      staleDps,
      uncoveredSiteIds: new Set(
        activeSites.filter((s) => !activeDpSiteIds.has(s.id)).map((s) => s.id)
      ),
    };
  }, [sites, dps]);

  if (loading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
        <CircularProgress size={26} sx={{ color: BRAND.teal }} />
      </Box>
    );
  }

  return (
    <Stack spacing={3}>
      {/* Coverage KPIs */}
      <Grid container spacing={2}>
        <Grid size={{ xs: 12, sm: 4 }}>
          <SummaryCard
            title="Sites"
            value={coverage.totalSites}
            icon={<LanOutlinedIcon fontSize="small" />}
            titleHint="LAN sites defined by subnet (or tag override)."
            sx={{ height: "100%" }}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 4 }}>
          <SummaryCard
            title="Distribution points"
            value={coverage.totalDps}
            icon={<HubOutlinedIcon fontSize="small" />}
            accent={ROLE.positive}
            tint={ROLE.positiveSoft}
            titleHint={
              coverage.staleDps > 0
                ? `${coverage.activeDps} active. ${coverage.staleDps} have not reported in over 24h.`
                : `${coverage.activeDps} active.`
            }
            sx={{ height: "100%" }}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 4 }}>
          <SummaryCard
            title="Sites without a DP"
            value={coverage.uncovered}
            icon={<WarningAmberOutlinedIcon fontSize="small" />}
            accent={coverage.uncovered > 0 ? ROLE.caution : ROLE.positive}
            tint={coverage.uncovered > 0 ? ROLE.cautionSoft : ROLE.positiveSoft}
            titleHint="Devices at these sites download from the CDN or origin instead of the LAN."
            sx={{ height: "100%" }}
          />
        </Grid>
      </Grid>

      {/* Sites */}
      <Box>
        <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
          <Stack direction="row" spacing={1} alignItems="center">
            <LanOutlinedIcon fontSize="small" sx={{ color: BRAND.teal }} />
            <Typography sx={{ fontWeight: 800, color: BRAND.dark }}>Sites</Typography>
          </Stack>
          {canManage ? (
            <Button
              size="small"
              startIcon={<AddOutlinedIcon />}
              onClick={() => setSiteDialog({ open: true, site: null })}
              sx={{ textTransform: "none", fontWeight: 700, color: BRAND.teal }}
            >
              Add site
            </Button>
          ) : null}
        </Stack>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Name</TableCell>
              <TableCell>Subnets</TableCell>
              <TableCell>Tag</TableCell>
              <TableCell align="right" />
            </TableRow>
          </TableHead>
          <TableBody>
            {sites.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4}>
                  <Typography sx={{ fontSize: 13, color: BRAND.gray, py: 1 }}>
                    No sites yet — define one to enable LAN distribution for its devices.
                  </Typography>
                </TableCell>
              </TableRow>
            ) : (
              sites.map((s) => (
                <TableRow
                  key={s.id}
                  sx={{
                    opacity: s.isActive ? 1 : 0.5,
                    // Flag the actionable case: an active site with no DP is
                    // bandwidth being spent on the WAN unnecessarily.
                    bgcolor: coverage.uncoveredSiteIds.has(s.id)
                      ? BRAND.alert?.warningSoft
                      : "transparent",
                  }}
                >
                  <TableCell sx={{ fontWeight: 600 }}>{s.name}</TableCell>
                  <TableCell>
                    <Stack direction="row" spacing={0.5} flexWrap="wrap">
                      {s.matchSubnets.map((c) => (
                        <Chip key={c} size="small" label={c} sx={{ fontFamily: "monospace", fontSize: 11 }} />
                      ))}
                    </Stack>
                  </TableCell>
                  <TableCell>{s.matchTag || "—"}</TableCell>
                  <TableCell align="right">
                    {canManage ? (
                      <>
                        <Tooltip title="Edit">
                          <IconButton aria-label="Edit distribution site" size="small" onClick={() => setSiteDialog({ open: true, site: s })}>
                            <EditOutlinedIcon fontSize="inherit" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Delete">
                          <IconButton aria-label="Remove site" size="small" onClick={() => removeSite(s)}>
                            <DeleteOutlineIcon fontSize="inherit" />
                          </IconButton>
                        </Tooltip>
                      </>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Box>

      {/* Distribution points */}
      <Box>
        <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
          <Typography sx={{ fontWeight: 800, color: BRAND.dark }}>Distribution points</Typography>
          {canManage ? (
            <Button
              size="small"
              startIcon={<AddOutlinedIcon />}
              onClick={() => setDpDialogOpen(true)}
              disabled={sites.length === 0}
              sx={{ textTransform: "none", fontWeight: 700, color: BRAND.teal }}
            >
              Designate DP
            </Button>
          ) : null}
        </Stack>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Agent</TableCell>
              <TableCell>Site</TableCell>
              <TableCell>LAN URL</TableCell>
              <TableCell>Status</TableCell>
              <TableCell align="right" />
            </TableRow>
          </TableHead>
          <TableBody>
            {dps.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5}>
                  <Typography sx={{ fontSize: 13, color: BRAND.gray, py: 1 }}>
                    No distribution points. Packages download from CDN/origin on every device.
                  </Typography>
                </TableCell>
              </TableRow>
            ) : (
              dps.map((dp) => (
                <TableRow key={dp.id}>
                  <TableCell sx={{ fontFamily: "monospace", fontSize: 12 }}>{dp.agentId}</TableCell>
                  <TableCell>{siteName(dp.siteId)}</TableCell>
                  <TableCell sx={{ fontFamily: "monospace", fontSize: 12 }}>
                    {dp.lanUrl || "auto (device IP:47821)"}
                  </TableCell>
                  <TableCell>
                    <Chip
                      size="small"
                      label={dp.status}
                      sx={{
                        fontWeight: 700,
                        bgcolor: dp.status === "active" ? BRAND.tealSoft : BRAND.darkSoft,
                        color: dp.status === "active" ? BRAND.tealText : BRAND.dark,
                      }}
                    />
                  </TableCell>
                  <TableCell align="right">
                    {canManage ? (
                      <Tooltip title="Remove">
                        <IconButton aria-label="Remove distribution point" size="small" onClick={() => removeDp(dp)}>
                          <DeleteOutlineIcon fontSize="inherit" />
                        </IconButton>
                      </Tooltip>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Box>

      <SiteDialog
        open={siteDialog.open}
        site={siteDialog.site}
        onClose={() => setSiteDialog({ open: false, site: null })}
        onSaved={() => {
          setSiteDialog({ open: false, site: null });
          notify?.("success", "Site saved");
          reload();
        }}
        notify={notify}
      />
      <DpDialog
        open={dpDialogOpen}
        sites={sites}
        onClose={() => setDpDialogOpen(false)}
        onSaved={() => {
          setDpDialogOpen(false);
          notify?.("success", "Distribution point saved");
          reload();
        }}
        notify={notify}
      />
    </Stack>
  );
}
