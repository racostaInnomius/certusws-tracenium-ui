// src/components/inventory/SoftwareInsightCards.jsx
//
// Las cuatro tarjetas de Software Inventory. Sustituyen a cuatro contadores
// (equipos, registros, nombres, editores) que no decían si algo iba bien o
// mal: cada una responde una pregunta y termina en una acción.
//
// Datos: GET /dashboard/software-inventory/insights (software-insights.service
// en el backend). Cada bloque puede venir vacío por su cuenta —sin Patch
// Management no hay exposición a CVE— y la tarjeta lo DICE en vez de un cero.

import * as React from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  InputAdornment,
  Link,
  Paper,
  Stack,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import ArrowForwardRoundedIcon from "@mui/icons-material/ArrowForwardRounded";
import AutoAwesomeMosaicRoundedIcon from "@mui/icons-material/AutoAwesomeMosaicRounded";
import BugReportRoundedIcon from "@mui/icons-material/BugReportRounded";
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import SettingsRemoteRoundedIcon from "@mui/icons-material/SettingsRemoteRounded";
import UpdateRoundedIcon from "@mui/icons-material/UpdateRounded";
import { BRAND, ICON, ROLE, TEXT } from "../../theme/brand";
import { SOFTWARE_ACCENTS } from "../../theme/chartPalette";
import { formatDate } from "../../utils/format";

const fmt = (n) => Number(n || 0).toLocaleString("en-US");
const shortDay = (iso) => formatDate(iso, { month: "short", day: "numeric" });

function InsightCard({ tone, icon: Icon, title, value, qualifier, children, action, onAction, loading }) {
  // El ámbar de `caution` es un relleno pálido: como icono sobre su propio
  // tinte no se ve. Ahí el icono va con el tono de texto.
  const iconColor = tone === ROLE.caution ? BRAND.alert.warningText : tone;
  return (
    <Paper
      elevation={0}
      sx={{
        p: 2,
        width: "100%",
        borderRadius: 3,
        border: `1px solid ${BRAND.border}`,
        borderTop: `3px solid ${tone}`,
        boxShadow: BRAND.shadow,
        display: "flex",
        flexDirection: "column",
      }}
    >
      <Stack direction="row" spacing={1} alignItems="center">
        <Box sx={{ width: 28, height: 28, borderRadius: 1.5, display: "grid", placeItems: "center", bgcolor: `${tone}1F` }}>
          <Icon sx={{ fontSize: ICON.lg, color: iconColor }} />
        </Box>
        <Typography sx={{ fontWeight: 700, color: BRAND.dark, fontSize: TEXT.base }}>{title}</Typography>
      </Stack>
      <Stack direction="row" alignItems="baseline" spacing={1} sx={{ mt: 1.5 }}>
        <Typography sx={{ fontSize: TEXT["3xl"], fontWeight: 800, lineHeight: 1, color: BRAND.dark }}>
          {loading ? "…" : value}
        </Typography>
        {!loading && qualifier ? (
          <Typography sx={{ fontSize: TEXT.sm, color: "text.secondary", fontWeight: 600 }}>{qualifier}</Typography>
        ) : null}
      </Stack>
      <Box sx={{ mt: 1.25, flex: 1 }}>{loading ? null : children}</Box>
      {action && onAction && !loading ? (
        <Button
          size="small"
          onClick={onAction}
          endIcon={<ArrowForwardRoundedIcon sx={{ fontSize: ICON.md }} />}
          sx={{ mt: 1, alignSelf: "flex-start", px: 0, minWidth: 0, color: BRAND.tealText, fontWeight: 700, textTransform: "none" }}
        >
          {action}
        </Button>
      ) : null}
    </Paper>
  );
}

const Line = ({ children, strong = false, color }) => (
  <Typography sx={{ fontSize: TEXT.sm, color: color || "text.secondary", fontWeight: strong ? 700 : 400, lineHeight: 1.5 }}>
    {children}
  </Typography>
);

// ── Diálogos ─────────────────────────────────────────────────────────

function RemoteAccessDialog({ open, onClose, remote, canAdminister, onSaveAuthorized }) {
  const [authorized, setAuthorized] = React.useState(() => new Set(remote?.authorizedKeys ?? []));
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState("");
  React.useEffect(() => {
    if (open) {
      setAuthorized(new Set(remote?.authorizedKeys ?? []));
      setError("");
    }
  }, [open, remote]);

  const editable = canAdminister && remote?.settingsAvailable;
  const dirty =
    [...authorized].sort().join(",") !== [...(remote?.authorizedKeys ?? [])].sort().join(",");

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      await onSaveAuthorized?.([...authorized]);
      onClose();
    } catch (e) {
      setError(e?.message || "Could not save the authorized tools.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle sx={{ fontWeight: 800 }}>Remote-access tools</DialogTitle>
      <DialogContent dividers>
        <Typography sx={{ fontSize: TEXT.sm, color: "text.secondary", mb: 2 }}>
          Tools that let someone control a device from outside. Mark the ones your team uses as authorized: they stay
          listed but stop counting as unapproved.
        </Typography>
        {canAdminister && !remote?.settingsAvailable ? (
          <Alert severity="info" sx={{ mb: 2 }}>
            Authorizing tools isn't available on this server yet. Everything below counts as unapproved until it is.
          </Alert>
        ) : null}
        {error ? <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert> : null}
        <Table size="small" aria-label="remote-access tools">
          <TableHead>
            <TableRow>
              <TableCell sx={{ fontWeight: 800 }}>Tool</TableCell>
              <TableCell sx={{ fontWeight: 800 }}>Devices</TableCell>
              <TableCell sx={{ fontWeight: 800 }}>Authorized</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {(remote?.tools ?? []).map((t) => (
              <TableRow key={t.key} sx={{ verticalAlign: "top" }}>
                <TableCell sx={{ fontWeight: 700, color: BRAND.dark, whiteSpace: "nowrap" }}>
                  {t.label}
                  <Typography sx={{ fontSize: TEXT.xs, color: "text.secondary" }}>{fmt(t.devices)} devices</Typography>
                </TableCell>
                <TableCell>
                  <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5 }}>
                    {t.hosts.map((h) => (
                      <Chip key={h} size="small" label={h} sx={{ height: 22, fontSize: TEXT.xs }} />
                    ))}
                  </Box>
                </TableCell>
                <TableCell>
                  <Switch
                    size="small"
                    checked={authorized.has(t.key)}
                    disabled={!editable}
                    // `slotProps.input`: el Switch de MUI 7 ignora `inputProps`.
                    slotProps={{ input: { "aria-label": `${t.label} is authorized` } }}
                    onChange={(e) => {
                      const next = new Set(authorized);
                      if (e.target.checked) next.add(t.key);
                      else next.delete(t.key);
                      setAuthorized(next);
                    }}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {!canAdminister ? (
          <Typography sx={{ fontSize: TEXT.xs, color: "text.secondary", mt: 1.5 }}>
            Only tenant admins and owners can change which tools are authorized.
          </Typography>
        ) : null}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{editable ? "Cancel" : "Close"}</Button>
        {editable ? (
          <Button variant="contained" disabled={!dirty || saving} onClick={save}>
            {saving ? "Saving…" : "Save"}
          </Button>
        ) : null}
      </DialogActions>
    </Dialog>
  );
}

function RareAppsDialog({ open, onClose, rare }) {
  const [q, setQ] = React.useState("");
  const items = rare?.items ?? [];
  const needle = q.trim().toLowerCase();
  const shown = needle
    ? items.filter((i) => i.label.toLowerCase().includes(needle) || i.hosts.some((h) => h.toLowerCase().includes(needle)))
    : items;
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle sx={{ fontWeight: 800 }}>Rare apps</DialogTitle>
      <DialogContent dividers>
        <Typography sx={{ fontSize: TEXT.sm, color: "text.secondary", mb: 1.5 }}>
          Applications installed on {rare?.maxDevices ?? 2} devices or fewer — newest first. Unmanaged installs, trials and
          unwanted software tend to live here.
        </Typography>
        <TextField
          size="small"
          fullWidth
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search an app or a device"
          inputProps={{ "aria-label": "Search rare apps" }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchRoundedIcon sx={{ fontSize: ICON.md, color: "text.secondary" }} />
              </InputAdornment>
            ),
          }}
          sx={{ mb: 1.5 }}
        />
        <Table size="small" stickyHeader aria-label="rare apps">
          <TableHead>
            <TableRow>
              <TableCell sx={{ fontWeight: 800 }}>Application</TableCell>
              <TableCell sx={{ fontWeight: 800 }}>Installed on</TableCell>
              <TableCell sx={{ fontWeight: 800, whiteSpace: "nowrap" }}>First seen</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {shown.map((i) => (
              <TableRow key={i.label} hover>
                <TableCell sx={{ fontWeight: 700, color: BRAND.dark }}>{i.label}</TableCell>
                <TableCell>{i.hosts.join(", ")}</TableCell>
                <TableCell sx={{ whiteSpace: "nowrap" }}>{formatDate(i.firstSeenAt)}</TableCell>
              </TableRow>
            ))}
            {shown.length === 0 ? (
              <TableRow>
                <TableCell colSpan={3} sx={{ color: "text.secondary", textAlign: "center", py: 3 }}>
                  No rare apps match “{q.trim()}”.
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
        {items.length < (rare?.apps ?? 0) ? (
          <Typography sx={{ fontSize: TEXT.xs, color: "text.secondary", mt: 1 }}>
            Showing the {fmt(items.length)} most recent of {fmt(rare.apps)}.
          </Typography>
        ) : null}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}

function StaleDevicesDialog({ open, onClose, freshness, onOpenDevice }) {
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle sx={{ fontWeight: 800 }}>Devices without a recent software inventory</DialogTitle>
      <DialogContent dividers>
        <Typography sx={{ fontSize: TEXT.sm, color: "text.secondary", mb: 1.5 }}>
          No software inventory in the last {freshness?.staleAfterDays ?? 7} days. What they have installed today is
          unknown — their row in every chart is out of date.
        </Typography>
        <Table size="small" aria-label="stale devices">
          <TableHead>
            <TableRow>
              <TableCell sx={{ fontWeight: 800 }}>Device</TableCell>
              <TableCell sx={{ fontWeight: 800 }}>Last software inventory</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {(freshness?.stale ?? []).map((d) => (
              <TableRow key={d.agentId}>
                <TableCell>
                  {onOpenDevice ? (
                    <Link component="button" onClick={() => onOpenDevice(d.agentId)} sx={{ fontWeight: 700 }}>
                      {d.hostname}
                    </Link>
                  ) : (
                    d.hostname
                  )}
                </TableCell>
                <TableCell>{d.lastReportedAt ? formatDate(d.lastReportedAt) : "Never"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}

// ── Tarjetas ─────────────────────────────────────────────────────────

export default function SoftwareInsightCards({
  insights,
  loading = false,
  error = "",
  canAdminister = false,
  onOpenVulnerabilities,
  onOpenDevice,
  onSaveAuthorized,
}) {
  const [dialog, setDialog] = React.useState(null);
  const close = () => setDialog(null);

  if (error && !insights) {
    return (
      <Alert severity="warning" sx={{ borderRadius: 3 }}>
        {error}
      </Alert>
    );
  }

  const fleet = insights?.fleetDevices ?? 0;
  const vuln = insights?.vulnerable ?? null;
  const vulnUnavailable = insights?.vulnerableUnavailable ?? null;
  const remote = insights?.remoteAccess;
  const unauthorizedTools = (remote?.tools ?? []).filter((t) => !t.authorized);
  const authorizedTools = (remote?.tools ?? []).filter((t) => t.authorized);
  const rare = insights?.rareApps;
  const fresh = insights?.freshness;
  const stale = fresh?.stale ?? [];

  return (
    <>
      <Box
        sx={{
          display: "grid",
          gap: 2,
          gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr", lg: "repeat(4, minmax(0, 1fr))" },
        }}
      >
        <InsightCard
          tone={vuln && vuln.affectedDevices > 0 ? ROLE.critical : ROLE.positive}
          icon={BugReportRoundedIcon}
          title="Vulnerable software"
          loading={loading}
          value={vuln ? fmt(vuln.affectedDevices) : "—"}
          qualifier={vuln ? `of ${fmt(fleet)} devices` : null}
          action={vuln ? "Open Vulnerabilities" : null}
          onAction={onOpenVulnerabilities}
        >
          {vuln ? (
            <>
              {vuln.knownExploited > 0 ? (
                <Line strong color={BRAND.alert.errorText}>
                  {fmt(vuln.knownExploited)} actively exploited (KEV)
                  {vuln.kevOverdue > 0
                    ? vuln.kevOverdue === vuln.knownExploited
                      ? " — all past due"
                      : ` — ${fmt(vuln.kevOverdue)} past due`
                    : ""}
                </Line>
              ) : (
                <Line strong color={BRAND.dark}>None actively exploited (KEV)</Line>
              )}
              <Line>
                {fmt(vuln.critical)} critical · {fmt(vuln.high)} high CVEs in installed apps
              </Line>
              {vuln.notEvaluableCves > 0 ? (
                <Line>{fmt(vuln.notEvaluableCves)} CVEs can't be judged: no version range in the catalog</Line>
              ) : null}
            </>
          ) : vulnUnavailable === "not_entitled" ? (
            <Line>Exposure to known CVEs is measured by Patch Management, which this tenant doesn't have.</Line>
          ) : (
            <Line>Couldn't compute the CVE exposure right now.</Line>
          )}
        </InsightCard>

        <InsightCard
          tone={remote?.unauthorizedDevices > 0 ? ROLE.attention : ROLE.positive}
          icon={SettingsRemoteRoundedIcon}
          title="Unapproved remote access"
          loading={loading}
          value={fmt(remote?.unauthorizedDevices)}
          qualifier="devices"
          action={(remote?.tools ?? []).length > 0 ? "See devices" : null}
          onAction={() => setDialog("remote")}
        >
          {unauthorizedTools.length > 0 ? (
            <Box sx={{ mb: 0.5 }}>
              {unauthorizedTools.map((t) => (
                <Chip
                  key={t.key}
                  size="small"
                  label={`${t.label} · ${t.devices}`}
                  sx={{ height: 22, fontSize: TEXT.xs, fontWeight: 700, bgcolor: ROLE.attentionSoft, color: BRAND.dark, mr: 0.5, mb: 0.5 }}
                />
              ))}
            </Box>
          ) : (
            <Line strong color={BRAND.dark}>No unapproved remote-access tools</Line>
          )}
          {authorizedTools.length > 0 ? (
            <Line>
              {authorizedTools.map((t) => `${t.label} (${t.devices})`).join(", ")}{" "}
              {authorizedTools.length === 1 ? "is" : "are"} authorized and not counted.
            </Line>
          ) : null}
        </InsightCard>

        <InsightCard
          tone={SOFTWARE_ACCENTS.rare}
          icon={AutoAwesomeMosaicRoundedIcon}
          title="Rare apps"
          loading={loading}
          value={fmt(rare?.apps)}
          qualifier={`on only 1–${rare?.maxDevices ?? 2} devices`}
          action={rare?.apps > 0 ? "Review the list" : null}
          onAction={() => setDialog("rare")}
        >
          {rare?.apps > 0 ? (
            <>
              <Line strong color={BRAND.dark}>
                {fmt(rare.singleDevice)} on a single device · spread over {fmt(rare.devices)} devices
              </Line>
              <Line>Newest: {rare.items.slice(0, 5).map((i) => i.label).join(", ")}</Line>
            </>
          ) : (
            <Line>Every app is on at least {(rare?.maxDevices ?? 2) + 1} devices.</Line>
          )}
        </InsightCard>

        <InsightCard
          tone={stale.length > 0 ? ROLE.caution : ROLE.positive}
          icon={UpdateRoundedIcon}
          title="Inventory freshness"
          loading={loading}
          value={fmt(fresh?.upToDate)}
          qualifier={`of ${fmt(fresh?.fleetDevices)} up to date`}
          action={stale.length > 0 ? `See the ${stale.length === 1 ? "device" : `${stale.length} devices`}` : null}
          onAction={() => setDialog("stale")}
        >
          {stale.length > 0 ? (
            <>
              <Line strong color={BRAND.dark}>
                {stale.length} {stale.length === 1 ? "hasn't" : "haven't"} reported software in over{" "}
                {fresh.staleAfterDays} days
              </Line>
              {stale.slice(0, 3).map((d) => (
                <Line key={d.agentId}>
                  {d.hostname} · {d.lastReportedAt ? `since ${shortDay(d.lastReportedAt)}` : "never reported"}
                </Line>
              ))}
            </>
          ) : (
            <Line>Every device reported its software in the last {fresh?.staleAfterDays ?? 7} days.</Line>
          )}
        </InsightCard>
      </Box>

      <RemoteAccessDialog
        open={dialog === "remote"}
        onClose={close}
        remote={remote}
        canAdminister={canAdminister}
        onSaveAuthorized={onSaveAuthorized}
      />
      <RareAppsDialog open={dialog === "rare"} onClose={close} rare={rare} />
      <StaleDevicesDialog
        open={dialog === "stale"}
        onClose={close}
        freshness={fresh}
        onOpenDevice={
          onOpenDevice
            ? (id) => {
                close();
                onOpenDevice(id);
              }
            : null
        }
      />
    </>
  );
}
