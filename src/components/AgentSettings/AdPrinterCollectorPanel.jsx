// src/components/AgentSettings/AdPrinterCollectorPanel.jsx
//
// ADR-0023 F2 — qué equipo de la flota lee Active Directory: las impresoras que los servidores de
// impresión publican en Active Directory.
//
// ⚠️ Un panel PROPIO y no un campo del formulario de la sección (D4): la
// elección es UNA por tenant y se guarda en su propia tabla, fuera de la política
// y de su modelo de overrides — el backend la deriva a la política del equipo al
// leer (lección del gateway de T111). Por eso guarda con su propio botón y sólo
// aparece en ámbito tenant, igual que la matriz de vistobueno de RCP/CDP.
//
// ⚠️ Ausencia ≠ cero: «nadie online» (missed), «el colector no está en un
// dominio» y «el dominio no publica impresoras» se dicen distinto.

import * as React from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import PrintOutlinedIcon from "@mui/icons-material/PrintOutlined";
import { BRAND, TEXT } from "../../theme/brand";
import { formatRelative } from "../../utils/format";
import { useConfirm } from "../common/ConfirmDialog";
import {
  clearAdPrinterCollector,
  getAdPrintersStatus,
  listAdPrinterCandidates,
  runAdPrintersNow,
  setAdPrinterCollector,
} from "../../api/adPrinters";
import {
  RUN_STATUS,
  apiErrorMessage,
  candidateLabel,
  describeRunError,
  lastReadSummary,
  shouldPoll,
} from "./adPrinterCollector";

const POLL_MS = 10_000;

function DeviceLine({ label, candidate, deviceId }) {
  return (
    <Stack direction="row" spacing={1} alignItems="center" sx={{ minWidth: 0 }}>
      <Typography sx={{ fontSize: TEXT.sm, color: "text.secondary", width: 64, flexShrink: 0 }}>{label}</Typography>
      {deviceId ? (
        <>
          <Typography sx={{ fontSize: TEXT.sm, fontWeight: 700, color: BRAND.dark }} noWrap>
            {candidate?.hostname || deviceId}
          </Typography>
          {candidate ? (
            <Chip
              size="small"
              label={candidate.online ? "Online" : "Offline"}
              sx={{
                height: 20,
                fontSize: TEXT.xs,
                fontWeight: 700,
                bgcolor: candidate.online ? BRAND.alert.successSoft : BRAND.surfaceMuted,
                color: candidate.online ? BRAND.alert.successText : BRAND.gray,
              }}
            />
          ) : (
            // Elegido pero ya no candidato: dado de baja o dejó de ser Windows.
            <Chip size="small" label="No longer eligible" sx={{ height: 20, fontSize: TEXT.xs, bgcolor: BRAND.alert.warningSoft, color: BRAND.alert.warningText }} />
          )}
          {candidate && !candidate.supported ? (
            <Chip size="small" label="Agent update needed" sx={{ height: 20, fontSize: TEXT.xs, bgcolor: BRAND.alert.warningSoft, color: BRAND.alert.warningText }} />
          ) : null}
        </>
      ) : (
        <Typography sx={{ fontSize: TEXT.sm, color: "text.disabled" }}>None</Typography>
      )}
    </Stack>
  );
}

export default function AdPrinterCollectorPanel() {
  const confirm = useConfirm();
  const [status, setStatus] = React.useState(null);
  const [candidates, setCandidates] = React.useState(null);
  const [loadError, setLoadError] = React.useState(null);
  const [editing, setEditing] = React.useState(false);
  const [primary, setPrimary] = React.useState("");
  const [secondary, setSecondary] = React.useState("");
  const [busy, setBusy] = React.useState("");
  const [message, setMessage] = React.useState(null);

  const load = React.useCallback(async () => {
    try {
      const [s, c] = await Promise.all([getAdPrintersStatus(), listAdPrinterCandidates()]);
      setStatus(s);
      setCandidates(Array.isArray(c?.candidates) ? c.candidates : []);
      setLoadError(null);
    } catch (e) {
      setLoadError(apiErrorMessage(e, "Could not load the collector."));
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  // Mientras la última corrida esté en curso, se vuelve a preguntar: el resultado
  // llega en segundos (314 ms de consulta en T111) y un panel quieto diría
  // "Running" para siempre.
  React.useEffect(() => {
    if (!shouldPoll(status)) return undefined;
    const t = setTimeout(() => {
      getAdPrintersStatus().then(setStatus).catch(() => {});
    }, POLL_MS);
    return () => clearTimeout(t);
  }, [status]);

  const byId = React.useMemo(() => new Map((candidates || []).map((c) => [c.deviceId, c])), [candidates]);
  const collector = status?.collector || null;
  const minAgent = status?.minAgentVersion || "";
  const showForm = editing || (!collector && status !== null);
  const summary = lastReadSummary(status);
  const runs = Array.isArray(status?.runs) ? status.runs.slice(0, 5) : [];
  const running = runs[0]?.status === "running";

  function startEdit() {
    setPrimary(collector?.primaryDeviceId || "");
    setSecondary(collector?.secondaryDeviceId || "");
    setMessage(null);
    setEditing(true);
  }

  async function save() {
    setBusy("save");
    setMessage(null);
    try {
      await setAdPrinterCollector({ primaryDeviceId: primary, secondaryDeviceId: secondary || null });
      setEditing(false);
      setMessage({ severity: "success", text: "Collector saved. The first read runs within the next scheduling cycle, or use Run now." });
      await load();
    } catch (e) {
      setMessage({ severity: "error", text: apiErrorMessage(e, "Could not save the collector.") });
    } finally {
      setBusy("");
    }
  }

  async function remove() {
    const ok = await confirm({
      title: "Stop reading printers from Active Directory?",
      body: "No device will read the directory anymore. The printers already read stay in the Printers tab until they are read again.",
      confirmText: "Remove collector",
      danger: true,
    });
    if (!ok) return;
    setBusy("remove");
    setMessage(null);
    try {
      await clearAdPrinterCollector();
      await load();
    } catch (e) {
      setMessage({ severity: "error", text: apiErrorMessage(e, "Could not remove the collector.") });
    } finally {
      setBusy("");
    }
  }

  async function runNow() {
    setBusy("run");
    setMessage(null);
    try {
      await runAdPrintersNow();
    } catch (e) {
      // Un 409 por nadie online deja su corrida `missed` en la lista: se recarga
      // igualmente para que se vea.
      setMessage({ severity: "warning", text: apiErrorMessage(e, "Could not start the read.") });
    } finally {
      await load();
      setBusy("");
    }
  }

  return (
    <Paper elevation={0} sx={{ p: 2, borderRadius: 2, border: `1px solid ${BRAND.border}` }} data-testid="ad-printer-collector-panel">
      <Stack direction="row" spacing={1} alignItems="flex-start">
        <PrintOutlinedIcon sx={{ color: BRAND.tealText, mt: 0.25 }} fontSize="small" />
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography variant="subtitle2" sx={{ color: BRAND.dark, fontWeight: 700 }}>
            Reading Active Directory
          </Typography>
          <Typography sx={{ fontSize: TEXT.sm, color: "text.secondary" }}>
            One Windows device of the fleet reads the directory once a day with its own machine account, and it reads
            two things: the print queues your print servers publish — including servers without the agent and queues
            nobody has connected to yet — and the computer objects, which is what Coverage in Asset Management uses to
            tell you which computers have no agent. Pick a device that stays on and is joined to the domain; the backup
            is used only when the primary is offline.
          </Typography>
        </Box>
      </Stack>

      {loadError ? <Alert severity="error" sx={{ mt: 2 }}>{loadError}</Alert> : null}
      {status === null && !loadError ? (
        <Box sx={{ display: "flex", justifyContent: "center", py: 2 }}>
          <CircularProgress size={22} sx={{ color: BRAND.teal }} />
        </Box>
      ) : null}
      {message ? <Alert severity={message.severity} sx={{ mt: 2 }}>{message.text}</Alert> : null}

      {status !== null && showForm ? (
        candidates && candidates.length === 0 ? (
          <Alert severity="info" sx={{ mt: 2 }}>
            There is no Windows device in this fleet to read the directory from. Enroll one that is joined to the domain.
          </Alert>
        ) : (
          <Stack spacing={2} sx={{ mt: 2 }}>
            <TextField
              select
              size="small"
              label="Primary device"
              value={primary}
              onChange={(e) => setPrimary(e.target.value)}
              helperText="Reads the directory every day when it is online."
            >
              {(candidates || []).map((c) => (
                <MenuItem key={c.deviceId} value={c.deviceId}>
                  {candidateLabel(c, minAgent)}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              select
              size="small"
              label="Backup device (optional)"
              value={secondary}
              onChange={(e) => setSecondary(e.target.value)}
              helperText="Used only when the primary is offline. With neither online the read is recorded as missed and retried in 2 hours."
            >
              <MenuItem value="">None</MenuItem>
              {(candidates || [])
                .filter((c) => c.deviceId !== primary)
                .map((c) => (
                  <MenuItem key={c.deviceId} value={c.deviceId}>
                    {candidateLabel(c, minAgent)}
                  </MenuItem>
                ))}
            </TextField>
            <Stack direction="row" spacing={1} justifyContent="flex-end">
              {collector ? (
                <Button size="small" onClick={() => setEditing(false)} disabled={busy === "save"} sx={{ textTransform: "none" }}>
                  Cancel
                </Button>
              ) : null}
              <Button
                size="small"
                variant="contained"
                onClick={save}
                disabled={!primary || busy === "save"}
                sx={{ textTransform: "none", fontWeight: 700, bgcolor: BRAND.teal, "&:hover": { bgcolor: BRAND.tealText } }}
              >
                {busy === "save" ? "Saving…" : "Save collector"}
              </Button>
            </Stack>
          </Stack>
        )
      ) : null}

      {status !== null && collector && !editing ? (
        <Stack spacing={0.75} sx={{ mt: 2 }}>
          <DeviceLine label="Primary" candidate={byId.get(collector.primaryDeviceId)} deviceId={collector.primaryDeviceId} />
          <DeviceLine label="Backup" candidate={collector.secondaryDeviceId ? byId.get(collector.secondaryDeviceId) : null} deviceId={collector.secondaryDeviceId} />
          <Stack direction="row" spacing={1} justifyContent="flex-end" sx={{ pt: 1 }}>
            <Button size="small" onClick={remove} disabled={Boolean(busy)} sx={{ textTransform: "none", color: BRAND.alert.errorText }}>
              Remove
            </Button>
            <Button size="small" onClick={startEdit} disabled={Boolean(busy)} sx={{ textTransform: "none" }}>
              Change
            </Button>
            <Button
              size="small"
              variant="contained"
              onClick={runNow}
              disabled={Boolean(busy) || running}
              sx={{ textTransform: "none", fontWeight: 700, bgcolor: BRAND.teal, "&:hover": { bgcolor: BRAND.tealText } }}
            >
              {busy === "run" ? "Starting…" : running ? "Reading…" : "Run now"}
            </Button>
          </Stack>
        </Stack>
      ) : null}

      {status !== null && (collector || runs.length > 0) ? (
        <Box sx={{ mt: 2, pt: 1.5, borderTop: `1px solid ${BRAND.border}` }}>
          <Typography sx={{ fontSize: TEXT.sm, fontWeight: 700, color: BRAND.dark }}>
            {summary ? `${summary.text} · read ${formatRelative(summary.finishedAt)}` : "Not read yet"}
          </Typography>
          {runs.length > 0 ? (
            <Stack spacing={0.5} sx={{ mt: 1 }}>
              {runs.map((r) => {
                const st = RUN_STATUS[r.status] || { label: r.status, color: BRAND.gray, bg: BRAND.surfaceMuted };
                const who = r.deviceId ? byId.get(r.deviceId)?.hostname || r.deviceId : null;
                const detail =
                  r.status === "complete"
                    ? `${r.queuesCount ?? 0} queues · ${r.domain}${r.dcUsed ? ` · via ${r.dcUsed}` : ""}`
                    : describeRunError(r.error);
                return (
                  <Stack key={r.runId} direction="row" spacing={1} alignItems="center" sx={{ minWidth: 0 }}>
                    <Chip size="small" label={st.label} sx={{ height: 20, minWidth: 72, fontSize: TEXT.xs, fontWeight: 700, bgcolor: st.bg, color: st.color }} />
                    <Typography sx={{ fontSize: TEXT.xs, color: "text.secondary", width: 64, flexShrink: 0 }}>
                      {formatRelative(r.startedAt)}
                    </Typography>
                    {who ? (
                      <Typography sx={{ fontSize: TEXT.xs, color: BRAND.dark, fontWeight: 600, flexShrink: 0 }}>{who}</Typography>
                    ) : null}
                    {detail ? (
                      <Typography sx={{ fontSize: TEXT.xs, color: "text.secondary" }} noWrap title={detail}>
                        {detail}
                      </Typography>
                    ) : null}
                  </Stack>
                );
              })}
            </Stack>
          ) : null}
        </Box>
      ) : null}
    </Paper>
  );
}
