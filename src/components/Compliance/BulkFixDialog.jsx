// src/components/Compliance/BulkFixDialog.jsx
//
// «Arregla estos N hallazgos en este equipo».
//
// La ficha de un equipo ya dejaba marcar varios hallazgos, pero el menú sólo
// servía para documentarlos (excepción, ack, estado). Arreglarlos era salir al
// hub y volver, uno por uno.
//
// Dos decisiones que hacen honesto el botón:
//
//   1. La selección se PARTE antes de pulsar: lo que se aplica desde aquí, lo
//      que sólo da fichero porque su clave está guardada, lo que es trabajo
//      manual y lo que ya no falla. Un «Apply all» que callara eso prometería
//      diez arreglos y haría seis.
//   2. Simular sigue siendo un botón aparte, no un paso obligatorio — la misma
//      regla que en el cajón de un solo fix. Aquí pesa más: son N escrituras
//      de una vez.
//
// El backend hace el resto de lo que importa: cada check pasa por sus propias
// guardas, y el que no se puede lanzar vuelve en `skipped` con su motivo en
// vez de tumbar a los demás.

import * as React from "react";
import {
  Alert, Box, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent,
  DialogTitle, Stack, Table, TableBody, TableCell, TableHead, TableRow, Typography,
} from "@mui/material";
import VisibilityOutlinedIcon from "@mui/icons-material/VisibilityOutlined";
import PlayCircleOutlineOutlinedIcon from "@mui/icons-material/PlayCircleOutlineOutlined";
import { BRAND, TEXT } from "../../theme/brand";
import { remediateBatch, getRemediationsBatch } from "../../api/patchManagement";
import { listFrom } from "../../api/shape";
import { bulkFixPlan, bulkFixSummary, batchFinished } from "./bulkFixPlan";
import { outcomeColors, outcomeTone } from "../patch-management/outcomeTone";
import RescanComplianceButton from "./RescanComplianceButton";

const POLL_MS = 5000;

/** Los conteos de una remediación, sin las casillas en cero. */
function countChips(counts) {
  return Object.entries(counts ?? {})
    .filter(([, v]) => Number(v) > 0)
    .map(([k, v]) => {
      // El color dice qué pasó (outcomeTone): verde aplicado, ámbar a falta
      // de reiniciar, teal ya cumplía, rojo falló. Antes todos en gris.
      const { bg, fg } = outcomeColors(k);
      return (
        <Chip
          key={k}
          size="small"
          data-tone={outcomeTone(k)}
          label={`${k.replace(/_/g, " ")}: ${v}`}
          sx={{ height: 20, fontSize: TEXT.xs, fontWeight: 700, bgcolor: bg, color: fg }}
        />
      );
    });
}

export default function BulkFixDialog({
  open,
  findings,          // los hallazgos seleccionados
  deviceId,
  hostname = null,
  canManage = false,
  // Pedir el escaneo al acabar (capacidad `jobs`): así se VE si los fixes
  // cerraron sus hallazgos, en vez de esperar al ciclo programado.
  canRescan = false,
  // macOS: añadir a la política macOS de la organización y bajar su perfil.
  // null = sin permiso de Device Management.
  onAddToMacPolicy = null,
  onDownloadMacProfile = null,
  onClose,
  onChanged,         // el llamante recarga la ficha cuando algo se ha lanzado
  notify,
}) {
  const plan = React.useMemo(() => bulkFixPlan(findings), [findings]);
  const [submitting, setSubmitting] = React.useState(false);
  const [mode, setMode] = React.useState(null);       // 'dry_run' | 'apply'
  const [items, setItems] = React.useState([]);        // remediaciones del lote
  const [skipped, setSkipped] = React.useState([]);
  const [addingToPolicy, setAddingToPolicy] = React.useState(false);
  const titleOf = React.useMemo(() => {
    const m = new Map();
    for (const f of findings ?? []) if (f?.checkId && !m.has(f.checkId)) m.set(f.checkId, f.title || f.checkId);
    return m;
  }, [findings]);

  React.useEffect(() => {
    if (!open) { setMode(null); setItems([]); setSkipped([]); setSubmitting(false); }
  }, [open]);

  const ids = items.map((r) => r.id).filter(Boolean);
  const idsKey = ids.join(",");

  // Sondeo del lote entero: una llamada por vuelta, y se para en cuanto todas
  // las remediaciones han terminado.
  React.useEffect(() => {
    if (!idsKey) return undefined;
    let stop = false;
    const tick = async () => {
      try {
        const res = await getRemediationsBatch(idsKey.split(",").map(Number));
        const fresh = listFrom(res, { context: "bulkFixBatch" });
        if (!stop && fresh.length) setItems(fresh);
      } catch {
        // El sondeo es informativo: un fallo puntual no rompe el diálogo ni
        // cancela nada — el trabajo sigue en el equipo.
      }
    };
    tick();
    const id = setInterval(() => {
      if (batchFinished(items)) return;
      tick();
    }, POLL_MS);
    return () => { stop = true; clearInterval(id); };
    // `items` se lee dentro; depender de él relanzaría el efecto en cada vuelta.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey]);

  const fire = async (theMode) => {
    if (!canManage || plan.checkIds.length === 0 || !deviceId) return;
    setSubmitting(true);
    try {
      const res = await remediateBatch({ checkIds: plan.checkIds, deviceIds: [deviceId], mode: theMode });
      setMode(theMode);
      setItems(listFrom(res, { context: "bulkFixCreate" }));
      setSkipped(Array.isArray(res?.skipped) ? res.skipped : []);
      onChanged?.();
    } catch (err) {
      notify?.({
        severity: "error",
        message: err?.body?.message || err?.body?.error || err?.message || "The batch could not be started",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const launched = items.length > 0;

  return (
    <Dialog open={Boolean(open)} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ fontWeight: 800 }}>
        Apply fixes{hostname ? ` on ${hostname}` : ""}
      </DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          <Typography sx={{ fontSize: TEXT.sm, color: BRAND.gray }} data-testid="bulk-fix-summary">
            {bulkFixSummary(plan) || "Nothing selected."}
          </Typography>

          {plan.profile.length ? (
            <Alert severity="info">
              <Typography sx={{ fontSize: TEXT.sm }}>
                {`${plan.profile.length} of the selected findings are settings macOS only enforces through a configuration profile. They go into the organization's macOS policy, and Macs get them with the organization's profile — installed by hand or from your MDM.`}
              </Typography>
              {onAddToMacPolicy ? (
                <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
                  <Button
                    size="small"
                    variant="outlined"
                    disabled={addingToPolicy}
                    onClick={async () => {
                      setAddingToPolicy(true);
                      try {
                        await onAddToMacPolicy(plan.profileIntents);
                      } finally {
                        setAddingToPolicy(false);
                      }
                    }}
                    sx={{ textTransform: "none", fontWeight: 700 }}
                  >
                    {`Add ${plan.profileIntents.length} setting${plan.profileIntents.length === 1 ? "" : "s"} to the macOS policy`}
                  </Button>
                  {onDownloadMacProfile ? (
                    <Button size="small" onClick={() => onDownloadMacProfile()} sx={{ textTransform: "none", fontWeight: 700 }}>
                      Download the organization's profile
                    </Button>
                  ) : null}
                </Stack>
              ) : (
                <Typography sx={{ fontSize: TEXT.xs, mt: 0.5 }}>
                  Someone with Device Management access can add them to the organization's macOS policy.
                </Typography>
              )}
            </Alert>
          ) : null}

          {plan.guarded.length || plan.manual.length ? (
            <Alert severity="info">
              {plan.guarded.length ? `${plan.guarded.length} of the selected findings are guarded: they have a fix, but a person applies it after reading why — never in bulk. ` : ""}
              {plan.manual.length ? `${plan.manual.length} ${plan.manual.length === 1 ? "has" : "have"} no automated fix at all. ` : ""}
              They stay out of this batch.
            </Alert>
          ) : null}

          {!launched ? (
            <Box>
              <Typography sx={{ fontSize: TEXT.sm, fontWeight: 700, color: BRAND.dark, mb: 0.5 }}>
                What would run ({plan.checkIds.length})
              </Typography>
              <Stack spacing={0.5}>
                {plan.applicable.map((f) => (
                  <Typography key={f.checkId} sx={{ fontSize: TEXT.sm, color: BRAND.gray }}>
                    · {f.title || f.checkId}
                  </Typography>
                ))}
              </Stack>
            </Box>
          ) : (
            <Box>
              <Typography sx={{ fontSize: TEXT.sm, color: BRAND.gray, mb: 1 }}>
                {mode === "dry_run" ? "Dry-run" : "Apply"} · {items.length} remediation{items.length === 1 ? "" : "s"}
                {batchFinished(items) ? " · finished" : " · running…"}
              </Typography>
              <Table size="small" data-testid="bulk-fix-progress">
                <TableHead>
                  <TableRow>
                    <TableCell>Fix</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell>Result</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {items.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell sx={{ fontSize: TEXT.sm }}>{titleOf.get(r.checkId) || r.checkId}</TableCell>
                      <TableCell sx={{ fontSize: TEXT.sm }}>{r.status}</TableCell>
                      <TableCell>
                        <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>{countChips(r.counts)}</Stack>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Box>
          )}

          {skipped.length ? (
            <Alert severity="warning" data-testid="bulk-fix-skipped">
              <Typography sx={{ fontSize: TEXT.sm, fontWeight: 700 }}>
                {skipped.length} could not be launched:
              </Typography>
              {skipped.map((s) => (
                <Typography key={s.checkId} sx={{ fontSize: TEXT.sm }}>
                  · {titleOf.get(s.checkId) || s.checkId} — {s.message}
                </Typography>
              ))}
            </Alert>
          ) : null}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}>
        {launched ? (
          // Ya lanzado: cerrar es lo esperado (principal, a la derecha y con
          // el foco); reescanear es la opción, a la izquierda.
          <>
            {mode === "apply" && canRescan && batchFinished(items) ? (
              <RescanComplianceButton
                agentId={deviceId}
                label="Rescan to confirm"
                variant="outlined"
                size="medium"
                onToast={notify}
                onFinished={() => onChanged?.()}
              />
            ) : null}
            <Box sx={{ flex: 1 }} />
            <Button variant="contained" autoFocus onClick={onClose} sx={{ textTransform: "none", fontWeight: 700 }}>
              Close
            </Button>
          </>
        ) : (
          <>
            <Button onClick={onClose} sx={{ textTransform: "none" }}>Close</Button>
            <Box sx={{ flex: 1 }} />
          </>
        )}
        {!launched ? (
          <>
            <Button
              variant="contained"
              startIcon={submitting && mode === "dry_run" ? <CircularProgress size={14} sx={{ color: BRAND.surface }} /> : <VisibilityOutlinedIcon />}
              disabled={submitting || !canManage || plan.checkIds.length === 0}
              onClick={() => fire("dry_run")}
              sx={{ textTransform: "none", fontWeight: 700, bgcolor: BRAND.teal, "&:hover": { bgcolor: BRAND.tealHover } }}
            >
              Dry-run {plan.checkIds.length}
            </Button>
            <Button
              variant="outlined"
              startIcon={submitting && mode === "apply" ? <CircularProgress size={14} /> : <PlayCircleOutlineOutlinedIcon />}
              disabled={submitting || !canManage || plan.checkIds.length === 0}
              onClick={() => fire("apply")}
              sx={{ textTransform: "none", fontWeight: 700 }}
            >
              Apply {plan.checkIds.length}
            </Button>
          </>
        ) : null}
      </DialogActions>
    </Dialog>
  );
}
