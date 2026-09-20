// src/components/discovery/CoveragePanel.jsx
//
// Cobertura: los equipos que Active Directory conoce, y cuáles no tienen
// agente.
//
// Vive en Asset Management porque responde a la pregunta de esta página —qué
// hay— sólo que desde el otro lado: hasta ahora sólo sabíamos de los equipos
// que ya tienen agente, que es justo la mitad que no dice qué falta.
//
// ⚠️ El número que manda es «sin agente»: equipos VIVOS, sin agente y que
// nadie ha descartado. El total de objetos de AD no dice nada por sí solo —un
// directorio de años arrastra cientos de fantasmas— y enseñarlo como si fuera
// el parque real sería la primera cifra falsa que alguien enseña a un cliente.
//
// ⚠️ Esta página REPARTE el paquete de instalación; no instala nada en remoto.

import * as React from "react";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  MenuItem,
  Paper,
  Select,
  Skeleton,
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
import TravelExploreOutlinedIcon from "@mui/icons-material/TravelExploreOutlined";
import { BRAND, ICON, TEXT, TEXT_MUTED } from "../../theme/brand";
import { severityMeta } from "../../theme/severity";
import { formatDate } from "../../utils/format";
import BrandSnackbar from "../common/BrandSnackbar";
import GoToReportButton from "../common/GoToReportButton";
import {
  getCoverage,
  getDiscoveryInstallPackage,
  runDiscoveryNow,
  setDiscoveryInstallState,
} from "../../api/discovery";
import { activitySignal, coverageCards, daysAgoText, runSummary, stateMeta } from "./coverageModel";
import InstallPackageDialog from "./InstallPackageDialog";

const RUN_ERRORS = {
  DISCOVERY_NO_COLLECTOR: "Choose the device that reads Active Directory first, in Agent Settings → Asset Management.",
  DISCOVERY_COLLECTOR_UNAVAILABLE: "Neither the collector nor its backup is online right now.",
  DISCOVERY_AGENT_TOO_OLD: "The collector needs a newer agent to read computer objects.",
  DISCOVERY_RUN_IN_PROGRESS: "A read is already running.",
  DEVICE_ENROLLMENT_UPPER_LIMIT_REACHED: "Your plan's device limit is reached, so no new enrollment code can be created.",
};

function errorText(err) {
  const code = err?.body?.error;
  return RUN_ERRORS[code] || err?.body?.message || err?.message || "Something went wrong";
}

function Cards({ summary }) {
  return (
    <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mb: 1.5 }}>
      {coverageCards(summary).map((c) => (
        <Tooltip key={c.key} title={c.hint}>
          <Paper
            elevation={0}
            sx={{
              px: 1.75,
              py: 1,
              minWidth: 128,
              borderRadius: 2,
              border: `1px solid ${c.emphasis ? BRAND.teal : BRAND.border}`,
              bgcolor: c.emphasis ? BRAND.tealSoft : "transparent",
            }}
          >
            <Typography sx={{ fontSize: TEXT.xl, fontWeight: 800, color: BRAND.dark, lineHeight: 1.1 }}>{c.value}</Typography>
            <Typography sx={{ fontSize: TEXT.xs, color: TEXT_MUTED }}>{c.label}</Typography>
          </Paper>
        </Tooltip>
      ))}
    </Box>
  );
}

function ActivityCell({ device }) {
  const signal = activitySignal(device);
  if (!signal.at) {
    return (
      <Tooltip title="Neither a sign-in nor a password rotation is recorded on the object.">
        <Typography sx={{ fontSize: TEXT.sm, color: TEXT_MUTED }}>No date in AD</Typography>
      </Tooltip>
    );
  }
  return (
    <Tooltip
      title={
        signal.source === "password"
          ? `Domain password rotated on ${formatDate(signal.at)}. A domain-joined machine rotates it by itself about every 30 days, so this is the stronger sign it is alive.`
          : `Last sign-in recorded on ${formatDate(signal.at)}. Active Directory replicates this one with up to 14 days of delay, so it can look older than it is.`
      }
    >
      <Box>
        <Typography sx={{ fontSize: TEXT.sm, color: BRAND.dark }}>{daysAgoText(signal.days)}</Typography>
        <Typography sx={{ fontSize: TEXT.xs, color: TEXT_MUTED }}>{signal.label}</Typography>
      </Box>
    </Tooltip>
  );
}

export default function CoveragePanel({ refreshNonce = 0, canManage = false, onNavigate = null }) {
  const [data, setData] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState("");
  const [snack, setSnack] = React.useState(null);
  const [query, setQuery] = React.useState("");
  const [state, setState] = React.useState("all");
  const [onlyGap, setOnlyGap] = React.useState(true);
  const [selected, setSelected] = React.useState(() => new Set());
  const [pkg, setPkg] = React.useState(null);

  const notify = React.useCallback((severity, message) => setSnack({ severity, message }), []);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      setData(await getCoverage());
    } catch (err) {
      setData(null);
      notify("error", errorText(err));
    } finally {
      setLoading(false);
    }
  }, [notify]);

  React.useEffect(() => {
    load();
  }, [load, refreshNonce]);

  const devices = React.useMemo(() => (Array.isArray(data?.devices) ? data.devices : []), [data]);
  const rows = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return devices.filter((d) => {
      if (onlyGap && (d.matchedAgentId || d.installState === "ignored")) return false;
      if (state !== "all" && d.state !== state) return false;
      if (q && !String(d.hostname).toLowerCase().includes(q) && !String(d.dnsHostname ?? "").toLowerCase().includes(q)) return false;
      return true;
    });
  }, [devices, onlyGap, state, query]);

  const selectable = rows.filter((d) => !d.matchedAgentId);
  const keysOf = (list) => list.map((d) => ({ source: d.source, sourceKey: d.sourceKey }));
  const chosen = selectable.filter((d) => selected.has(d.sourceKey));

  const toggle = (key) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const run = async () => {
    setBusy("run");
    try {
      await runDiscoveryNow();
      notify("success", "Reading Active Directory. The list updates when the collector answers.");
      await load();
    } catch (err) {
      notify("error", errorText(err));
      await load();
    } finally {
      setBusy("");
    }
  };

  const mark = async (installState) => {
    setBusy(installState);
    try {
      const res = await setDiscoveryInstallState(keysOf(chosen), installState);
      notify("success", `${res?.changed ?? 0} device${res?.changed === 1 ? "" : "s"} updated.`);
      setSelected(new Set());
      await load();
    } catch (err) {
      notify("error", errorText(err));
    } finally {
      setBusy("");
    }
  };

  const openPackage = async () => {
    setBusy("package");
    try {
      const res = await getDiscoveryInstallPackage(keysOf(chosen));
      setPkg(res?.package ?? null);
      setSelected(new Set());
      await load();
    } catch (err) {
      notify("error", errorText(err));
    } finally {
      setBusy("");
    }
  };

  const lastRun = Array.isArray(data?.runs) ? data.runs[0] : null;
  const summaryLine = runSummary(lastRun);

  return (
    <Paper elevation={0} sx={{ p: 2, borderRadius: 2, border: `1px solid ${BRAND.border}` }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1, flexWrap: "wrap" }}>
        <TravelExploreOutlinedIcon sx={{ color: BRAND.teal, fontSize: ICON.lg }} />
        <Box sx={{ minWidth: 0 }}>
          <Typography sx={{ fontWeight: 800, color: BRAND.dark, fontSize: TEXT.base }}>Coverage</Typography>
          <Typography sx={{ fontSize: TEXT.xs, color: TEXT_MUTED }}>
            The computers Active Directory knows about, and which of them have no agent.
          </Typography>
        </Box>
        <Box sx={{ flex: 1 }} />
        {canManage ? (
          <>
            {/* El documento que se enseña al incorporar un cliente o en una
                auditoría. No lo genera aquí: lleva a Reports, que es donde
                queda registrado con su hash. */}
            <GoToReportButton
              onNavigate={onNavigate}
              reportKey="amp.coverage"
              tooltip="Coverage report: what exists, what is managed, and what is not being counted"
            />
            <Button
              size="small"
              variant="outlined"
              onClick={run}
              disabled={Boolean(busy)}
              startIcon={busy === "run" ? <CircularProgress size={14} /> : null}
            >
              Look now
            </Button>
          </>
        ) : null}
      </Box>

      {loading ? (
        <Skeleton variant="rounded" height={180} />
      ) : data?.available === false ? (
        <Alert severity="info">
          Coverage is not enabled on this server yet.
        </Alert>
      ) : (
        <>
          <Cards summary={data?.summary} />

          <Alert severity={summaryLine.tone === "warning" ? "warning" : "info"} sx={{ mb: 1.5 }}>
            {summaryLine.text}
            {lastRun?.startedAt ? ` · ${formatDate(lastRun.startedAt)}` : ""}
          </Alert>

          {(data?.summary?.total ?? 0) === 0 ? (
            <Typography sx={{ fontSize: TEXT.sm, color: TEXT_MUTED, p: 2, textAlign: "center" }}>
              Nothing read yet. The device that reads Active Directory is the one chosen in
              Agent Settings → Asset Management, and it reads once a day.
            </Typography>
          ) : (
            <>
              <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1, flexWrap: "wrap" }}>
                <Button
                  size="small"
                  variant={onlyGap ? "contained" : "outlined"}
                  onClick={() => setOnlyGap((v) => !v)}
                >
                  {onlyGap ? "Showing what is missing" : "Showing everything"}
                </Button>
                <Select size="small" value={state} onChange={(e) => setState(e.target.value)} sx={{ minWidth: 150 }} inputProps={{ "aria-label": "Filter by state" }}>
                  <MenuItem value="all">Any state</MenuItem>
                  <MenuItem value="active">Active</MenuItem>
                  <MenuItem value="dormant">Inactive</MenuItem>
                  <MenuItem value="stale">Stale</MenuItem>
                  <MenuItem value="disabled">Disabled</MenuItem>
                </Select>
                <TextField
                  size="small"
                  placeholder="Search computer"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  inputProps={{ "aria-label": "Search computers" }}
                  sx={{ minWidth: 200 }}
                />
                <Box sx={{ flex: 1 }} />
                {canManage && chosen.length > 0 ? (
                  <Stack direction="row" spacing={1}>
                    <Button size="small" variant="contained" onClick={openPackage} disabled={Boolean(busy)}>
                      Get install package ({chosen.length})
                    </Button>
                    <Button size="small" onClick={() => mark("ignored")} disabled={Boolean(busy)}>
                      Never install
                    </Button>
                  </Stack>
                ) : null}
              </Box>

              <Box sx={{ overflowX: "auto" }}>
                <Table size="small" sx={{ minWidth: 760 }}>
                  <TableHead>
                    <TableRow>
                      <TableCell padding="checkbox">
                        {canManage ? (
                          <Checkbox
                            size="small"
                            inputProps={{ "aria-label": "Select every computer without an agent" }}
                            checked={selectable.length > 0 && chosen.length === selectable.length}
                            indeterminate={chosen.length > 0 && chosen.length < selectable.length}
                            onChange={(e) => setSelected(e.target.checked ? new Set(selectable.map((d) => d.sourceKey)) : new Set())}
                          />
                        ) : null}
                      </TableCell>
                      <TableCell sx={{ fontWeight: 700, color: BRAND.dark }}>Computer</TableCell>
                      <TableCell sx={{ fontWeight: 700, color: BRAND.dark }}>State</TableCell>
                      <TableCell sx={{ fontWeight: 700, color: BRAND.dark }}>Operating system</TableCell>
                      <TableCell sx={{ fontWeight: 700, color: BRAND.dark }}>Last sign of life</TableCell>
                      <TableCell sx={{ fontWeight: 700, color: BRAND.dark }}>Agent</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {rows.map((d) => {
                      const meta = stateMeta(d.state);
                      const sev = severityMeta(meta.severity);
                      return (
                        <TableRow key={`${d.source}|${d.sourceKey}`} hover>
                          <TableCell padding="checkbox">
                            {canManage && !d.matchedAgentId ? (
                              <Checkbox
                                size="small"
                                inputProps={{ "aria-label": `Select ${d.hostname}` }}
                                checked={selected.has(d.sourceKey)}
                                onChange={() => toggle(d.sourceKey)}
                              />
                            ) : null}
                          </TableCell>
                          <TableCell>
                            <Typography sx={{ fontSize: TEXT.md, fontWeight: 700, color: BRAND.dark }}>{d.hostname}</Typography>
                            {d.dnsHostname ? (
                              <Typography sx={{ fontSize: TEXT.xs, color: TEXT_MUTED }}>{d.dnsHostname}</Typography>
                            ) : null}
                          </TableCell>
                          <TableCell>
                            <Tooltip title={meta.help}>
                              <Chip size="small" label={meta.label} sx={{ height: 20, fontSize: TEXT.xs, fontWeight: 700, bgcolor: sev.bg, color: sev.fg }} />
                            </Tooltip>
                          </TableCell>
                          <TableCell>
                            <Typography sx={{ fontSize: TEXT.sm, color: BRAND.dark }}>{d.os || "—"}</Typography>
                          </TableCell>
                          <TableCell>
                            <ActivityCell device={d} />
                          </TableCell>
                          <TableCell>
                            {d.matchedAgentId ? (
                              <Chip size="small" label="With agent" sx={{ height: 20, fontSize: TEXT.xs, fontWeight: 700, bgcolor: severityMeta("low").bg, color: severityMeta("low").fg }} />
                            ) : d.installState === "ignored" ? (
                              <Tooltip title={d.installNote || "Somebody decided this one never gets an agent."}>
                                <Chip size="small" label="Never install" sx={{ height: 20, fontSize: TEXT.xs, fontWeight: 700, bgcolor: BRAND.darkSoft, color: BRAND.dark }} />
                              </Tooltip>
                            ) : d.installState === "invited" ? (
                              <Tooltip title="Somebody took the install package. It turns into “with agent” on its own, when the agent checks in.">
                                <Chip size="small" label="Invited" sx={{ height: 20, fontSize: TEXT.xs, fontWeight: 700, bgcolor: severityMeta("medium").bg, color: severityMeta("medium").fg }} />
                              </Tooltip>
                            ) : (
                              <Chip size="small" label="No agent" sx={{ height: 20, fontSize: TEXT.xs, fontWeight: 700, bgcolor: severityMeta("high").bg, color: severityMeta("high").fg }} />
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </Box>

              {rows.length === 0 ? (
                <Typography sx={{ fontSize: TEXT.sm, color: TEXT_MUTED, p: 2, textAlign: "center" }}>
                  {onlyGap ? "Every active computer in Active Directory has an agent." : "No computer matches."}
                </Typography>
              ) : null}
            </>
          )}
        </>
      )}

      <InstallPackageDialog open={Boolean(pkg)} pkg={pkg} onClose={() => setPkg(null)} notify={notify} />
      <BrandSnackbar
        open={Boolean(snack)}
        severity={snack?.severity}
        message={snack?.message}
        onClose={() => setSnack(null)}
      />
    </Paper>
  );
}
