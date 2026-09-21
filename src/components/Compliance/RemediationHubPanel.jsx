// src/components/Compliance/RemediationHubPanel.jsx
//
// "¿Qué hago ahora?" — la pestaña que convierte la lista de hallazgos en una
// cola de trabajo.
//
// La rejilla de Posture responde QUÉ está mal, una fila por check. Esta
// responde QUÉ HACER: una fila por ACCIÓN, con los checks que cierra de una
// vez, los equipos que toca y el botón que la lanza. Tres filas de firewall
// aquí son un solo trabajo, porque las arregla el mismo handler.
//
// Lo que se enseña y por qué:
//   · «cierra N hallazgos en M equipos» — es el argumento para elegir esta y
//     no la siguiente. M son equipos DISTINTOS; cuando el backend no ha podido
//     calcularlos exactos lo dice con un «≥», en vez de enseñar una suma que
//     cuenta tres veces el mismo portátil.
//   · «nunca ejercido aquí» — 10 de los 12 handlers no se han ejecutado jamás
//     en esta instalación. Ofrecerlos sin decirlo sería vender una promesa que
//     nadie ha comprobado; por eso el primer paso es simular.
//   · el motivo cuando NO se puede pulsar: sin PMP no hay brazo ejecutor, y el
//     operador tiene que leer eso, no encontrarse una columna vacía.

import * as React from "react";
import {
  Alert, Box, Button, Chip, CircularProgress, Stack, Table, TableBody, TableCell,
  TableHead, TableRow, Tooltip, Typography,
} from "@mui/material";
import PlayArrowOutlinedIcon from "@mui/icons-material/PlayArrowOutlined";
import ScienceOutlinedIcon from "@mui/icons-material/ScienceOutlined";
import BuildOutlinedIcon from "@mui/icons-material/BuildOutlined";
import { BRAND, TEXT } from "../../theme/brand";
import SectionPaper from "../common/SectionPaper";
import { getRemediationHub } from "../../api/compliance";
import { remediate } from "../../api/patchManagement";

const SEVERITY_COLOR = {
  critical: "error",
  high: "error",
  medium: "warning",
  low: "default",
  info: "default",
};

/** El texto del bloqueo. Nunca se deja un botón muerto sin explicación. */
export function blockedReasonText(reason) {
  if (reason === "pmp_not_entitled") {
    return "Applying needs Patch Management, which is not in this tenant's plan. The finding is still tracked here.";
  }
  if (reason === "no_handler") {
    return "No automated fix: this one is remediated by hand. The catalog's guidance is below.";
  }
  return null;
}

/** «12 equipos» o «≥ 12 equipos» cuando el conteo exacto no se pudo resolver. */
export function devicesLabel(action) {
  const n = action.devices ?? 0;
  const unit = n === 1 ? "device" : "devices";
  return action.devicesExact ? `${n} ${unit}` : `≥ ${n} ${unit}`;
}

/**
 * «3 critical» cuando la acción toca equipos críticos por su grupo de activos.
 * null (no se pudo contar) y 0 no se pintan: ni «0 critical» —que afirmaría
 * algo que con null no se sabe— ni ruido cuando no hay ninguno.
 */
export function criticalDevicesLabel(action) {
  const n = action.criticalDevices;
  if (n == null || n <= 0) return null;
  return `${n} critical`;
}

export default function RemediationHubPanel({ reloadKey, onToast, canManage = false }) {
  const [data, setData] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(null);
  const [busyKey, setBusyKey] = React.useState(null);

  const load = React.useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      setData(await getRemediationHub({ limit: 200 }));
    } catch (e) {
      setError(e?.body?.error || e?.message || "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => { load(); }, [load, reloadKey]);

  // Simular primero, aplicar después: son dos pulsaciones distintas a
  // propósito. `dry_run` lee el estado y dice qué cambiaría sin tocar nada —
  // con handlers que nunca se han ejercido aquí, es la diferencia entre
  // descubrirlo en un equipo y descubrirlo en doce.
  const run = async (action, mode) => {
    setBusyKey(`${action.key}:${mode}`);
    try {
      const res = await remediate({ checkId: action.checkIds[0], mode });
      onToast?.(
        mode === "dry_run"
          ? `Simulation queued for ${action.title} — nothing changed yet.`
          : `Remediation queued for ${action.title}.`,
        "success"
      );
      return res;
    } catch (e) {
      onToast?.(e?.body?.error || e?.message || "Could not queue the job", "error");
    } finally {
      setBusyKey(null);
    }
  };

  if (loading && !data) {
    return (
      <SectionPaper variant="panel" sx={{ p: 3 }}>
        <Stack direction="row" spacing={1.5} alignItems="center">
          <CircularProgress size={18} />
          <Typography sx={{ color: "text.secondary" }}>Grouping findings into actions…</Typography>
        </Stack>
      </SectionPaper>
    );
  }

  if (error) {
    return (
      <SectionPaper variant="panel" sx={{ p: 3 }}>
        <Alert severity="error">{error}</Alert>
      </SectionPaper>
    );
  }

  const actions = data?.actions ?? [];
  const totals = data?.totals ?? {};

  return (
    <Stack spacing={2}>
      <SectionPaper variant="panel" sx={{ p: 2 }}>
        <Stack direction="row" spacing={3} flexWrap="wrap" alignItems="baseline">
          <Box>
            <Typography sx={{ fontSize: TEXT.xl, fontWeight: 800, color: BRAND.dark }}>
              {totals.actions ?? 0}
            </Typography>
            <Typography sx={{ fontSize: TEXT.sm, color: "text.secondary" }}>actions</Typography>
          </Box>
          <Box>
            <Typography sx={{ fontSize: TEXT.xl, fontWeight: 800, color: BRAND.teal }}>
              {totals.findingsFixableNow ?? 0}
            </Typography>
            <Typography sx={{ fontSize: TEXT.sm, color: "text.secondary" }}>
              findings one click away
            </Typography>
          </Box>
          <Box>
            <Typography sx={{ fontSize: TEXT.xl, fontWeight: 800, color: BRAND.dark }}>
              {totals.manual ?? 0}
            </Typography>
            <Typography sx={{ fontSize: TEXT.sm, color: "text.secondary" }}>need a person</Typography>
          </Box>
        </Stack>
      </SectionPaper>

      {data && data.pmpEntitled === false ? (
        <Alert severity="info">
          This plan does not include Patch Management, so nothing can be applied from here. The
          grouping below still shows what would be fixed, and by which action.
        </Alert>
      ) : null}

      <SectionPaper variant="panel" sx={{ p: 0 }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Action</TableCell>
              <TableCell>Severity</TableCell>
              <TableCell>Closes</TableCell>
              <TableCell>Platforms</TableCell>
              <TableCell align="right">Run</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {actions.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5}>
                  <Typography sx={{ color: "text.secondary", p: 2 }}>
                    Nothing open to act on.
                  </Typography>
                </TableCell>
              </TableRow>
            ) : null}
            {actions.map((a) => {
              const blocked = blockedReasonText(a.applyBlockedReason);
              return (
                <TableRow key={a.key} hover>
                  <TableCell sx={{ maxWidth: 380 }}>
                    <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                      {a.kind === "agent" ? (
                        <BuildOutlinedIcon fontSize="small" sx={{ color: BRAND.teal }} />
                      ) : null}
                      <Typography sx={{ fontWeight: 700, fontSize: TEXT.base }}>{a.title}</Typography>
                      {a.checkIds.length > 1 ? (
                        <Tooltip title={a.checkIds.join(", ")}>
                          <Chip size="small" variant="outlined" label={`${a.checkIds.length} checks`} />
                        </Tooltip>
                      ) : null}
                      {a.kind === "agent" && !a.verifiedAt ? (
                        <Tooltip title="This fix has never been exercised on this installation. Simulate it on one device before applying it to the fleet.">
                          <Chip size="small" color="warning" variant="outlined" label="never exercised here" />
                        </Tooltip>
                      ) : null}
                    </Stack>
                    {blocked ? (
                      <Typography sx={{ fontSize: TEXT.sm, color: "text.secondary", mt: 0.5 }}>
                        {blocked}
                      </Typography>
                    ) : a.remediationSummary ? (
                      <Typography sx={{ fontSize: TEXT.sm, color: "text.secondary", mt: 0.5 }}>
                        {a.remediationSummary}
                      </Typography>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    <Chip
                      size="small"
                      label={a.severity ?? "—"}
                      color={SEVERITY_COLOR[a.severity] ?? "default"}
                    />
                  </TableCell>
                  <TableCell>
                    <Typography sx={{ fontSize: TEXT.sm }}>
                      {a.findings} finding{a.findings === 1 ? "" : "s"}
                    </Typography>
                    <Typography sx={{ fontSize: TEXT.sm, color: "text.secondary" }}>
                      {devicesLabel(a)}
                    </Typography>
                    {criticalDevicesLabel(a) ? (
                      <Tooltip title="Devices in an asset group marked Critical. Among actions of equal severity, these go first.">
                        <Chip
                          size="small"
                          label={criticalDevicesLabel(a)}
                          sx={{ mt: 0.5, bgcolor: BRAND.alert.errorSoft, color: BRAND.alert.errorText, fontWeight: 700 }}
                        />
                      </Tooltip>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    <Typography sx={{ fontSize: TEXT.sm, color: "text.secondary" }}>
                      {a.platforms?.length ? a.platforms.join(", ") : "—"}
                    </Typography>
                  </TableCell>
                  <TableCell align="right">
                    <Stack direction="row" spacing={1} justifyContent="flex-end">
                      <Button
                        size="small"
                        variant="outlined"
                        startIcon={<ScienceOutlinedIcon />}
                        disabled={!a.canApply || !canManage || busyKey === `${a.key}:dry_run`}
                        onClick={() => run(a, "dry_run")}
                        sx={{ textTransform: "none" }}
                      >
                        Simulate
                      </Button>
                      <Button
                        size="small"
                        variant="contained"
                        startIcon={<PlayArrowOutlinedIcon />}
                        disabled={!a.canApply || !canManage || busyKey === `${a.key}:apply`}
                        onClick={() => run(a, "apply")}
                        sx={{ textTransform: "none", bgcolor: BRAND.teal, "&:hover": { bgcolor: BRAND.tealHover } }}
                      >
                        Apply
                      </Button>
                    </Stack>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </SectionPaper>
    </Stack>
  );
}
