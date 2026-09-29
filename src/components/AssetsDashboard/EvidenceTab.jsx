// src/components/AssetsDashboard/EvidenceTab.jsx
//
// ADR-0032 F3 — pestaña «Troubleshooting» de la ficha del equipo: capturar el
// estado de AHORA, y leer lo capturado. (El `value` de la pestaña sigue siendo
// `evidence`, y por eso el fichero conserva el nombre: lo que cambió es el
// rótulo, para que el orden alfabético la deje al final y no entre lo que se
// mira a diario.)
//
// Lo que la pantalla dice sin que nadie pregunte:
//   · que las sesiones, los procesos y la red sólo existen mientras la máquina
//     está encendida — el momento de pulsar es ANTES de reiniciar;
//   · la hora del EQUIPO, con su desfase, y un aviso si no coincide con el de
//     quien mira (una hora de diferencia ya estuvo a punto de fechar mal un
//     incidente real);
//   · qué contiene el paquete ANTES de descargarlo, y que la descarga queda a
//     nombre de quien la hace;
//   · el motivo de cada ausencia: un colector que no pudo correr se nombra, no
//     desaparece de la lista.
//
// ⚠️ DOS PERMISOS. `evidence_capture` para pedir, `evidence_read` para ver y
// descargar. Quien sólo tiene el primero puede disparar la captura en mitad de
// una incidencia sin poder llevarse el fichero.

import * as React from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
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
import { BRAND, ROLE, TEXT, TEXT_MUTED } from "../../theme/brand";
import {
  artifactTally,
  canDelete,
  canDownload,
  captureHint,
  captureStatusMeta,
  deviceCapturedAt,
  downloadWarning,
  formatBytes,
  triggerLabel,
} from "./evidenceView";
import {
  createEvidenceCapture,
  deleteEvidenceCapture,
  evidenceArtifactUrl,
  evidenceReportUrl,
  getEvidenceCapture,
  getEvidenceCollectors,
  listEvidenceCaptures,
  setEvidenceHold,
} from "../../api/evidence";

const TONE = {
  positive: { fg: BRAND.alert.successText, bg: ROLE.positiveSoft },
  caution: { fg: BRAND.alert.warningText, bg: ROLE.cautionSoft },
  critical: { fg: BRAND.alert.errorText, bg: ROLE.criticalSoft },
  info: { fg: BRAND.tealText, bg: BRAND.tealSoft },
  muted: { fg: TEXT_MUTED, bg: BRAND.darkSoft },
};

function StatusChip({ status }) {
  const meta = captureStatusMeta(status);
  const tone = TONE[meta.tone] ?? TONE.muted;
  return (
    <Tooltip title={meta.hint} arrow>
      <Chip size="small" label={meta.label} sx={{ height: 22, fontSize: TEXT.xs, fontWeight: 700, bgcolor: tone.bg, color: tone.fg }} />
    </Tooltip>
  );
}

/** La hora del equipo, con su desfase y el aviso si no es la de quien mira. */
function CapturedAt({ capture }) {
  const when = deviceCapturedAt(capture);
  if (!when.text) return <Typography sx={{ fontSize: TEXT.sm, color: TEXT_MUTED }}>—</Typography>;
  return (
    <Box>
      <Typography sx={{ fontSize: TEXT.sm, color: BRAND.dark }}>
        {when.text} {when.offset ? <Box component="span" sx={{ color: TEXT_MUTED }}>({when.offset})</Box> : null}
      </Typography>
      {when.differsFromOperator ? (
        <Typography sx={{ fontSize: TEXT.xs, color: BRAND.alert.warningText }}>
          device time — not your timezone
        </Typography>
      ) : null}
    </Box>
  );
}

export default function EvidenceTab({ agentId, canCapture = false, canRead = false }) {
  const [catalog, setCatalog] = React.useState([]);
  const [captures, setCaptures] = React.useState([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState(null);
  const [notice, setNotice] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  const [detail, setDetail] = React.useState(null);
  const [holdFor, setHoldFor] = React.useState(null);
  const [holdReason, setHoldReason] = React.useState("");
  const [reason, setReason] = React.useState("");

  const load = React.useCallback(() => {
    if (!agentId || !canRead) return undefined;
    let alive = true;
    setLoading(true);
    setError(null);
    listEvidenceCaptures({ deviceId: agentId })
      .then((res) => alive && setCaptures(Array.isArray(res?.captures) ? res.captures : []))
      .catch((err) => alive && setError(err?.body?.message || err?.message || "Could not load evidence packages."))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [agentId, canRead]);

  React.useEffect(() => load(), [load]);

  React.useEffect(() => {
    if (!canCapture) return undefined;
    let alive = true;
    getEvidenceCollectors()
      .then((res) => alive && setCatalog(Array.isArray(res?.collectors) ? res.collectors : []))
      .catch(() => alive && setCatalog([]));
    return () => {
      alive = false;
    };
  }, [canCapture]);

  async function capture() {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await createEvidenceCapture({ deviceId: agentId, reason: reason.trim() || undefined });
      setReason("");
      setNotice("Capture requested. The package arrives in a few minutes.");
      load();
    } catch (err) {
      // El backend distingue «no está conectado» de «el agente es viejo», y
      // esa diferencia importa en mitad de una incidencia: una se resuelve
      // esperando y la otra no.
      setError(err?.body?.message || err?.message || "Could not request the capture.");
    } finally {
      setBusy(false);
    }
  }

  async function openDetail(captureId) {
    setError(null);
    try {
      const res = await getEvidenceCapture(captureId);
      setDetail(res?.capture ?? null);
    } catch (err) {
      setError(err?.body?.message || err?.message || "Could not open that package.");
    }
  }

  async function saveHold() {
    setBusy(true);
    try {
      await setEvidenceHold(holdFor.captureId, holdReason.trim() || null);
      setHoldFor(null);
      setHoldReason("");
      load();
    } catch (err) {
      setError(err?.body?.message || err?.message || "Could not change the hold.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(capture) {
    setBusy(true);
    try {
      await deleteEvidenceCapture(capture.captureId);
      if (detail?.captureId === capture.captureId) setDetail(null);
      load();
    } catch (err) {
      setError(err?.body?.message || err?.message || "Could not delete that package.");
    } finally {
      setBusy(false);
    }
  }

  if (!canRead && !canCapture) {
    return (
      <Alert severity="info" sx={{ fontSize: TEXT.sm }}>
        Evidence capture needs the Evidence permissions. Ask an administrator.
      </Alert>
    );
  }

  return (
    <Box>
      <Typography sx={{ fontSize: TEXT.sm, color: "text.secondary", mb: 1.5 }}>
        {captureHint(catalog)}
      </Typography>

      {canCapture ? (
        <Stack direction="row" spacing={1.5} sx={{ mb: 2, flexWrap: "wrap", rowGap: 1, alignItems: "center" }}>
          <TextField
            size="small"
            label="Why (optional)"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            sx={{ minWidth: 280 }}
            inputProps={{ maxLength: 500 }}
          />
          <Button variant="contained" onClick={capture} disabled={busy || !agentId}>
            Capture evidence
          </Button>
        </Stack>
      ) : null}

      {notice ? <Alert severity="success" sx={{ mb: 1.5, fontSize: TEXT.sm }} onClose={() => setNotice(null)}>{notice}</Alert> : null}
      {error ? <Alert severity="error" sx={{ mb: 1.5, fontSize: TEXT.sm }} onClose={() => setError(null)}>{error}</Alert> : null}

      {!canRead ? (
        <Alert severity="info" sx={{ fontSize: TEXT.sm }}>
          You can request a capture, but reading the package needs the Evidence download permission.
        </Alert>
      ) : loading ? (
        <Stack alignItems="center" sx={{ py: 4 }}><CircularProgress size={24} /></Stack>
      ) : captures.length === 0 ? (
        <Typography sx={{ fontSize: TEXT.sm, color: TEXT_MUTED }}>
          No evidence has been captured from this device.
        </Typography>
      ) : (
        <Table size="small" aria-label="Evidence packages">
          <TableHead>
            <TableRow>
              <TableCell sx={{ fontWeight: 700 }}>Captured (device time)</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Status</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Why</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Size</TableCell>
              <TableCell align="right" sx={{ fontWeight: 700 }}>Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {captures.map((c) => (
              <TableRow key={c.captureId} hover>
                <TableCell><CapturedAt capture={c} /></TableCell>
                <TableCell>
                  <Stack direction="row" spacing={0.5} alignItems="center">
                    <StatusChip status={c.status} />
                    {c.heldReason ? (
                      <Tooltip title={`Held: ${c.heldReason}`} arrow>
                        <Chip size="small" label="Held" sx={{ height: 22, fontSize: TEXT.xs, bgcolor: BRAND.cyanSoft, color: BRAND.cyanText }} />
                      </Tooltip>
                    ) : null}
                  </Stack>
                </TableCell>
                <TableCell>
                  <Typography sx={{ fontSize: TEXT.sm, color: BRAND.dark }}>{c.reason || triggerLabel(c.trigger)}</Typography>
                  <Typography sx={{ fontSize: TEXT.xs, color: TEXT_MUTED }}>{c.requestedBy || "system"}</Typography>
                </TableCell>
                <TableCell sx={{ fontSize: TEXT.sm }}>
                  {c.artifactCount} file{c.artifactCount === 1 ? "" : "s"} · {formatBytes(c.totalBytes)}
                </TableCell>
                <TableCell align="right">
                  <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                    <Button size="small" onClick={() => openDetail(c.captureId)} sx={{ textTransform: "none" }}>
                      Open
                    </Button>
                    {canCapture ? (
                      <Button size="small" onClick={() => { setHoldFor(c); setHoldReason(c.heldReason || ""); }} sx={{ textTransform: "none" }}>
                        {c.heldReason ? "Hold…" : "Hold"}
                      </Button>
                    ) : null}
                    {canCapture ? (
                      <Tooltip title={canDelete(c) ? "" : "Release the hold first"} arrow>
                        <span>
                          <Button
                            size="small"
                            disabled={!canDelete(c) || busy}
                            onClick={() => remove(c)}
                            sx={{ textTransform: "none", color: BRAND.alert.errorText }}
                          >
                            Delete
                          </Button>
                        </span>
                      </Tooltip>
                    ) : null}
                  </Stack>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {/* ── El paquete ─────────────────────────────────────────────── */}
      <Dialog open={Boolean(detail)} onClose={() => setDetail(null)} maxWidth="md" fullWidth>
        {detail ? (
          <>
            <DialogTitle sx={{ fontWeight: 800, color: BRAND.dark }}>Evidence package</DialogTitle>
            <DialogContent>
              <Stack direction="row" spacing={2} sx={{ mb: 1.5, flexWrap: "wrap", rowGap: 1, alignItems: "center" }}>
                <StatusChip status={detail.status} />
                <CapturedAt capture={detail} />
                <Typography sx={{ fontSize: TEXT.sm, color: TEXT_MUTED }}>{triggerLabel(detail.trigger)}</Typography>
              </Stack>

              {(() => {
                const tally = artifactTally(detail.artifacts || []);
                return (
                  <Typography sx={{ fontSize: TEXT.sm, color: BRAND.dark, mb: 1 }}>
                    {tally.ok} collected · {formatBytes(tally.bytes)}
                    {tally.failed ? ` · ${tally.failed} could not be collected` : ""}
                    {tally.skipped ? ` · ${tally.skipped} not applicable to this platform` : ""}
                  </Typography>
                );
              })()}

              {downloadWarning(detail.artifacts || []) ? (
                <Alert severity="warning" sx={{ fontSize: TEXT.sm, mb: 1.5 }}>
                  {downloadWarning(detail.artifacts || [])}
                </Alert>
              ) : null}

              <Divider sx={{ mb: 1 }} />

              <Table size="small" aria-label="Artifacts">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 700 }}>File</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Size</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>SHA-256</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700 }}>&nbsp;</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {(detail.artifacts || []).map((a) => (
                    <TableRow key={a.name}>
                      <TableCell>
                        <Typography sx={{ fontSize: TEXT.sm, fontWeight: 700, color: BRAND.dark }}>{a.name}</Typography>
                        <Typography sx={{ fontSize: TEXT.xs, color: TEXT_MUTED }}>
                          {a.label || a.collector}
                          {/* El motivo de la ausencia se enseña: un hueco sin
                              explicación se lee como «ahí no había nada». */}
                          {a.status !== "ok" && a.detail ? ` — ${a.detail}` : ""}
                        </Typography>
                      </TableCell>
                      <TableCell sx={{ fontSize: TEXT.sm }}>{a.status === "ok" ? formatBytes(a.bytes) : "—"}</TableCell>
                      <TableCell>
                        <Typography sx={{ fontFamily: "monospace", fontSize: TEXT.xs, color: TEXT_MUTED }}>
                          {a.sha256 ? `${a.sha256.slice(0, 16)}…` : "—"}
                        </Typography>
                      </TableCell>
                      <TableCell align="right">
                        {canDownload(a) ? (
                          <Button
                            size="small"
                            href={evidenceArtifactUrl(detail.captureId, a.name)}
                            sx={{ textTransform: "none" }}
                          >
                            Download
                          </Button>
                        ) : (
                          <Chip size="small" label={a.status} sx={{ height: 20, fontSize: TEXT.xs, bgcolor: BRAND.darkSoft, color: TEXT_MUTED }} />
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </DialogContent>
            <DialogActions>
              {/* El informe del paquete, desde donde se está mirando (D9). El
                  mismo documento está en la página de Reports, que es donde
                  alguien lo busca semanas después sin recordar el equipo;
                  aquí se ofrece porque ya se sabe cuál es. Es un enlace, no
                  una descarga silenciosa: pasa por el backend, que apunta la
                  exportación a nombre de quien la pide. */}
              <Button
                size="small"
                href={evidenceReportUrl(detail.captureId, "pdf")}
                sx={{ textTransform: "none", mr: "auto" }}
              >
                Report (PDF)
              </Button>
              <Button onClick={() => setDetail(null)} sx={{ textTransform: "none" }}>Close</Button>
            </DialogActions>
          </>
        ) : null}
      </Dialog>

      {/* ── Retención por incidencia ───────────────────────────────── */}
      <Dialog open={Boolean(holdFor)} onClose={() => setHoldFor(null)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontWeight: 800, color: BRAND.dark }}>Hold this package for an incident</DialogTitle>
        <DialogContent>
          <Typography sx={{ fontSize: TEXT.sm, color: BRAND.dark, mb: 1.5 }}>
            While it is held, retention will not remove it and it cannot be deleted. Leave the reason empty to release
            the hold.
          </Typography>
          <TextField
            autoFocus
            fullWidth
            size="small"
            label="Reason (e.g. ticket number)"
            value={holdReason}
            onChange={(e) => setHoldReason(e.target.value)}
            inputProps={{ maxLength: 300 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setHoldFor(null)} sx={{ textTransform: "none" }}>Cancel</Button>
          <Button variant="contained" onClick={saveHold} disabled={busy} sx={{ textTransform: "none" }}>
            {holdReason.trim() ? "Hold" : "Release hold"}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
