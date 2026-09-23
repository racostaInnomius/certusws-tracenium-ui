// src/components/patch-management/RollbackPointsPanel.jsx
//
// Los puntos de restauración (snapshots pre-parche) vivos del tenant, y las
// tres decisiones sobre cada uno: AMPLIAR, LIBERAR y REVERTIR.
//
// ⚠️ POR QUÉ (22-sep-2026). Los snapshots de parches de SO no se veían en
// ninguna pantalla —sólo los de despliegues de Software Delivery, dentro de su
// detalle—, y la única acción posible era revertir. Uno de un parche fallido se
// conservaba para siempre: tres en T111 pasaban de 72 h sin que nadie lo
// supiera. El caso inverso tampoco tenía salida: un parche que rompe algo
// cuando se USA la aplicación, días después, ya no tenía a dónde volver.
//
// No se pinta nada si no hay puntos vivos: es una lista de cosas por decidir,
// no un panel permanente.

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
  FormControlLabel,
  Radio,
  RadioGroup,
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
import SectionPaper from "../common/SectionPaper";
import { BRAND, ROLE, TEXT } from "../../theme/brand";
import { formatDate } from "../../utils/format";
import {
  extendRollbackPoint,
  listRollbackPoints,
  releaseRollbackPoint,
  revertSnapshot,
} from "../../api/patchManagement";
import {
  RELEASE_REASONS,
  canExtend,
  canRelease,
  canRevert,
  deadlineText,
  defaultReleaseReason,
  extendChoices,
  isPastCap,
  revertWarning,
  stateMeta,
} from "./rollbackPoints";

// Relleno en ROLE.*, letra en BRAND.alert.*Text: el ámbar de relleno no llega
// a contraste como texto (1,4:1).
const TONE = {
  critical: { bg: ROLE.criticalSoft, fg: BRAND.alert.errorText },
  caution: { bg: ROLE.cautionSoft, fg: BRAND.alert.warningText },
  info: { bg: BRAND.tealSoft, fg: BRAND.tealText },
  neutral: { bg: BRAND.surfaceMuted, fg: BRAND.dark },
  muted: { bg: BRAND.surfaceMuted, fg: BRAND.gray },
};

function errMsg(err, fallback) {
  return err?.body?.message || err?.message || fallback;
}

export default function RollbackPointsPanel({ canManage, notify, refreshNonce = 0 }) {
  const [points, setPoints] = React.useState([]);
  const [loaded, setLoaded] = React.useState(false);
  const [dialog, setDialog] = React.useState(null); // { kind, point }
  const [submitting, setSubmitting] = React.useState(false);
  const [dialogError, setDialogError] = React.useState(null);
  const [reason, setReason] = React.useState("validated");
  const [note, setNote] = React.useState("");
  const [until, setUntil] = React.useState("");

  const load = React.useCallback(async () => {
    try {
      const res = await listRollbackPoints();
      setPoints(Array.isArray(res?.points) ? res.points : []);
    } catch {
      // Un fallo al listar no puede tapar la página de parches; el panel
      // simplemente no aparece (y el aviso por alerta sigue funcionando).
      setPoints([]);
    } finally {
      setLoaded(true);
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load, refreshNonce]);

  const open = (kind, point) => {
    setDialog({ kind, point });
    setDialogError(null);
    setReason(defaultReleaseReason(point.state));
    setNote("");
    setUntil(extendChoices(point)[0]?.untilIso ?? "");
  };
  const close = () => (submitting ? null : setDialog(null));

  const act = async () => {
    if (!dialog) return;
    const { kind, point } = dialog;
    const host = point.hostname || point.deviceId;
    setSubmitting(true);
    setDialogError(null);
    try {
      if (kind === "release") {
        await releaseRollbackPoint(point.id, { reason, note: note.trim() || undefined });
        notify?.("success", `Released the rollback point for ${host}. It is removed on the next retention pass.`);
      } else if (kind === "extend") {
        const res = await extendRollbackPoint(point.id, until);
        notify?.(
          "success",
          `Kept the rollback point for ${host} until ${formatDate(res?.until ?? until)}${res?.capped ? " — the limit for this gateway" : ""}.`
        );
      } else if (kind === "revert") {
        await revertSnapshot(point.id);
        notify?.("info", `Reverting ${host} to its pre-patch snapshot. The gateway runs it in vCenter now.`);
      }
      setDialog(null);
      await load();
    } catch (err) {
      // El motivo DENTRO del diálogo, donde se está mirando — no en un aviso
      // de esquina que se va solo (la lección del «Deploy fix» de CVE).
      setDialogError(errMsg(err, "The action could not be completed."));
    } finally {
      setSubmitting(false);
    }
  };

  if (!loaded || points.length === 0) return null;

  const pending = points.filter((p) => p.state === "needs_decision" || p.state === "awaiting_reboot").length;

  return (
    <SectionPaper variant="panel" sx={{ p: { xs: 1.5, sm: 2 }, mb: 2 }}>
      <Stack direction="row" alignItems="baseline" spacing={1} sx={{ mb: 0.5, flexWrap: "wrap" }}>
        <Typography sx={{ fontSize: TEXT.lg, fontWeight: 800, color: BRAND.dark }}>Rollback points</Typography>
        {pending > 0 ? (
          <Chip
            size="small"
            label={`${pending} waiting for a decision`}
            sx={{ height: 20, fontSize: TEXT.xs, fontWeight: 700, bgcolor: ROLE.criticalSoft, color: BRAND.alert.errorText }}
          />
        ) : null}
      </Stack>
      <Typography sx={{ fontSize: TEXT.sm, color: "text.secondary", mb: 1.5 }}>
        Pre-patch VM snapshots. A snapshot is not a backup: its delta grows with every write and slows the datastore,
        so each one can be kept at most as long as its gateway allows (72 h by default, 7 days at most).
      </Typography>

      <Table size="small" aria-label="Rollback points">
        <TableHead>
          <TableRow>
            <TableCell sx={{ fontWeight: 700 }}>Server</TableCell>
            <TableCell sx={{ fontWeight: 700 }}>Taken</TableCell>
            <TableCell sx={{ fontWeight: 700 }}>Status</TableCell>
            <TableCell sx={{ fontWeight: 700 }}>When</TableCell>
            <TableCell align="right" sx={{ fontWeight: 700 }}>Actions</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {points.map((p) => {
            const meta = stateMeta(p.state);
            const tone = TONE[meta.tone] ?? TONE.neutral;
            const pastCap = p.state !== "released" && isPastCap(p);
            return (
              <TableRow key={p.id}>
                <TableCell>
                  <Typography sx={{ fontSize: TEXT.sm, fontWeight: 700, color: BRAND.dark }}>{p.hostname || p.deviceId}</Typography>
                  {p.deploymentId ? (
                    <Typography sx={{ fontSize: TEXT.xs, color: "text.secondary" }}>Software deployment #{p.deploymentId}</Typography>
                  ) : null}
                  {/* ⚠️ UN SNAPSHOT, UNA FILA. Cuando un parche falla y se
                      relanza, el reintento comparte este punto de retorno: son
                      varios trabajos sobre el MISMO snapshot de vCenter. Antes
                      cada intento salía como una fila propia, así que el panel
                      enseñaba dos veces el mismo punto —con la fecha del
                      segundo, que no era la de la toma— y liberar uno borraba
                      el otro. */}
                  {p.protectedJobs > 1 ? (
                    <Typography sx={{ fontSize: TEXT.xs, color: "text.secondary" }}>
                      Protects {p.protectedJobs} patch runs — one snapshot, one decision
                    </Typography>
                  ) : null}
                </TableCell>
                <TableCell sx={{ fontSize: TEXT.sm }}>{formatDate(p.takenAt)}</TableCell>
                <TableCell>
                  <Tooltip title={meta.hint} arrow>
                    <Chip size="small" label={meta.label} sx={{ height: 22, fontSize: TEXT.xs, fontWeight: 700, bgcolor: tone.bg, color: tone.fg }} />
                  </Tooltip>
                </TableCell>
                <TableCell>
                  <Typography sx={{ fontSize: TEXT.sm, color: pastCap ? BRAND.alert.errorText : BRAND.dark, fontWeight: pastCap ? 700 : 400 }}>
                    {deadlineText(p)}
                  </Typography>
                  {pastCap ? (
                    <Typography sx={{ fontSize: TEXT.xs, color: BRAND.alert.errorText }}>
                      Past the {p.maxHoldHours} h limit — decide now
                    </Typography>
                  ) : null}
                </TableCell>
                <TableCell align="right">
                  {canManage ? (
                    <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                      {canExtend(p) ? (
                        <Button size="small" onClick={() => open("extend", p)} sx={{ textTransform: "none", fontWeight: 700, color: BRAND.tealText }}>
                          Extend
                        </Button>
                      ) : null}
                      {canRelease(p) ? (
                        <Button size="small" onClick={() => open("release", p)} sx={{ textTransform: "none", fontWeight: 700, color: BRAND.tealText }}>
                          Release
                        </Button>
                      ) : null}
                      {canRevert(p) ? (
                        <Button size="small" onClick={() => open("revert", p)} sx={{ textTransform: "none", fontWeight: 700, color: BRAND.alert.errorText }}>
                          Revert
                        </Button>
                      ) : null}
                    </Stack>
                  ) : (
                    <Typography sx={{ fontSize: TEXT.xs, color: BRAND.gray, fontStyle: "italic" }}>—</Typography>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      <Dialog open={Boolean(dialog)} onClose={close} maxWidth="sm" fullWidth>
        {dialog ? (
          <>
            <DialogTitle sx={{ fontWeight: 800, color: BRAND.dark }}>
              {dialog.kind === "release" && `Release the rollback point for ${dialog.point.hostname || dialog.point.deviceId}?`}
              {dialog.kind === "extend" && `Keep the rollback point for ${dialog.point.hostname || dialog.point.deviceId} longer`}
              {dialog.kind === "revert" && `Revert ${dialog.point.hostname || dialog.point.deviceId} to its pre-patch snapshot?`}
            </DialogTitle>
            <DialogContent>
              {dialog.kind === "release" ? (
                <>
                  <Typography sx={{ fontSize: TEXT.base, color: BRAND.dark, mb: 1.5 }}>
                    The snapshot is removed on the next retention pass and there is no way back to it. Say why — it goes
                    to the audit log.
                    {dialog.point.protectedJobs > 1
                      ? ` This is the only rollback point for ${dialog.point.protectedJobs} patch runs on this server, including the earliest one.`
                      : ""}
                  </Typography>
                  <RadioGroup value={reason} onChange={(e) => setReason(e.target.value)}>
                    {RELEASE_REASONS.map((r) => (
                      <FormControlLabel
                        key={r.value}
                        value={r.value}
                        control={<Radio size="small" />}
                        label={
                          <Box sx={{ py: 0.5 }}>
                            <Typography sx={{ fontSize: TEXT.md, fontWeight: 700, color: BRAND.dark }}>{r.label}</Typography>
                            <Typography sx={{ fontSize: TEXT.sm, color: "text.secondary" }}>{r.description}</Typography>
                          </Box>
                        }
                      />
                    ))}
                  </RadioGroup>
                  <TextField
                    label="Note (optional)"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    fullWidth
                    multiline
                    minRows={2}
                    size="small"
                    inputProps={{ maxLength: 500 }}
                    sx={{ mt: 1.5 }}
                  />
                </>
              ) : null}

              {dialog.kind === "extend" ? (
                <>
                  <Typography sx={{ fontSize: TEXT.base, color: BRAND.dark, mb: 1.5 }}>
                    Useful when the patch has to be validated by using the application. The limit for this gateway is{" "}
                    <strong>{dialog.point.maxHoldHours} h</strong> after the snapshot was taken ({formatDate(dialog.point.maxUntil)}).
                  </Typography>
                  <RadioGroup value={until} onChange={(e) => setUntil(e.target.value)}>
                    {extendChoices(dialog.point).map((c) => (
                      <FormControlLabel
                        key={c.untilIso}
                        value={c.untilIso}
                        control={<Radio size="small" />}
                        label={
                          <Typography sx={{ fontSize: TEXT.md, color: BRAND.dark }}>
                            {c.label} <Box component="span" sx={{ color: "text.secondary" }}>— until {formatDate(c.untilIso)}</Box>
                          </Typography>
                        }
                      />
                    ))}
                  </RadioGroup>
                </>
              ) : null}

              {dialog.kind === "revert" ? (
                <Alert severity="warning" sx={{ fontSize: TEXT.sm }}>
                  {revertWarning(dialog.point)}
                </Alert>
              ) : null}

              {dialogError ? (
                <Alert severity="error" role="alert" sx={{ mt: 2 }}>
                  {dialogError}
                </Alert>
              ) : null}
            </DialogContent>
            <DialogActions sx={{ px: 3, py: 2 }}>
              <Button onClick={close} disabled={submitting} sx={{ textTransform: "none", color: BRAND.gray }}>
                Cancel
              </Button>
              <Button
                onClick={act}
                disabled={submitting || (dialog.kind === "extend" && !until)}
                variant="contained"
                startIcon={submitting ? <CircularProgress size={14} sx={{ color: "inherit" }} /> : null}
                sx={{
                  textTransform: "none",
                  fontWeight: 700,
                  bgcolor: dialog.kind === "revert" ? BRAND.alert.errorText : BRAND.teal,
                  "&:hover": { bgcolor: dialog.kind === "revert" ? BRAND.alert.errorText : BRAND.tealHover },
                }}
              >
                {dialog.kind === "release" && "Release snapshot"}
                {dialog.kind === "extend" && "Keep it longer"}
                {dialog.kind === "revert" && "Revert to snapshot"}
              </Button>
            </DialogActions>
          </>
        ) : null}
      </Dialog>
    </SectionPaper>
  );
}
