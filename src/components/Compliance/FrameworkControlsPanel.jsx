// src/components/Compliance/FrameworkControlsPanel.jsx
//
// Los controles de UN framework, uno por fila, con cuántos equipos lo
// cumplen, lo incumplen y en cuántos no se pudo evaluar.
//
// Por qué existe: todo lo demás en esta página responde "qué está mal".
// Un auditor pregunta lo contrario — "enséñame los controles que SÍ
// cumples" — y el producto no tenía respuesta, aunque la evidencia
// llevaba ahí desde siempre (los hallazgos abiertos guardan
// status='pass'). La columna "156 / 362" lo empeoraba: parecía una
// respuesta y era una suma de evaluaciones de toda la flota.
//
// Se carga bajo demanda, al desplegar la fila del framework: son datos
// que casi nadie mira en la primera pantalla y no merecen pagar el
// coste de la carga inicial de la portada.

import * as React from "react";
import {
  Box,
  Chip,
  CircularProgress,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
} from "@mui/material";

import { getFrameworkControls } from "../../api/compliance";
import { BRAND, ROLE, TEXT } from "../../theme/brand";

// El veredicto de un control, y por qué cada palabra.
//
// "Not assessed" NO es un estado intermedio ni un aprobado con dudas: es
// la ausencia de evidencia, y en un informe de auditoría no puede
// convertirse en "cumple" por el camino. Se pinta neutro, no verde.
const STATUS_META = {
  pass: {
    label: "Met",
    fg: ROLE.positive,
    bg: BRAND.alert?.successSoft,
    help: "No device fails any of this control's checks, and at least one passes.",
  },
  fail: {
    label: "Not met",
    fg: ROLE.critical,
    bg: BRAND.alert?.errorSoft,
    help: "At least one device fails a check behind this control.",
  },
  not_assessed: {
    label: "Not assessed",
    fg: BRAND.gray,
    bg: BRAND.darkSoft,
    help: "No device produced usable evidence for this control — it is neither met nor failed.",
  },
};

function StatusChip({ status }) {
  const meta = STATUS_META[status] || STATUS_META.not_assessed;
  return (
    <Tooltip title={meta.help} arrow placement="top">
      <Chip
        size="small"
        label={meta.label}
        sx={{
          height: 20,
          fontSize: TEXT.xs,
          fontWeight: 700,
          bgcolor: meta.bg,
          color: meta.fg,
          cursor: "help",
        }}
      />
    </Tooltip>
  );
}

export default function FrameworkControlsPanel({ framework, assetGroupId, reloadKey }) {
  const [state, setState] = React.useState({ loading: true, error: null, controls: [] });

  React.useEffect(() => {
    if (!framework) return undefined;
    let alive = true;
    setState({ loading: true, error: null, controls: [] });
    getFrameworkControls({ framework, assetGroupId: assetGroupId || undefined })
      .then((res) => {
        if (!alive) return;
        setState({
          loading: false,
          error: null,
          controls: Array.isArray(res?.controls) ? res.controls : [],
        });
      })
      .catch((err) => {
        if (!alive) return;
        // Un panel que falla se dice, no se deja en blanco: un hueco mudo
        // aquí se lee como "no hay controles", que es lo contrario.
        setState({
          loading: false,
          error: err?.body?.message || err?.message || "Could not load the controls for this framework.",
          controls: [],
        });
      });
    return () => {
      alive = false;
    };
  }, [framework, assetGroupId, reloadKey]);

  const summary = React.useMemo(() => {
    const c = { pass: 0, fail: 0, not_assessed: 0 };
    for (const row of state.controls) {
      if (c[row.status] !== undefined) c[row.status] += 1;
    }
    return c;
  }, [state.controls]);

  if (state.loading) {
    return (
      <Box sx={{ display: "grid", placeItems: "center", py: 3 }}>
        <CircularProgress size={20} sx={{ color: BRAND.teal }} />
      </Box>
    );
  }

  if (state.error) {
    return (
      <Typography sx={{ fontSize: TEXT.sm, color: BRAND.alert?.errorText, py: 2 }} role="alert">
        {state.error}
      </Typography>
    );
  }

  if (state.controls.length === 0) {
    return (
      <Typography sx={{ fontSize: TEXT.sm, color: BRAND.gray, py: 2 }}>
        No catalog checks are mapped to this framework yet, so there is nothing to report against it.
      </Typography>
    );
  }

  return (
    <Box sx={{ py: 1.5 }}>
      {/* El titular del panel es la frase que el auditor quiere oír, y
          va antes de la tabla para que no haya que contarla a ojo. */}
      <Typography sx={{ fontSize: TEXT.sm, color: BRAND.dark, fontWeight: 700, mb: 1 }}>
        {summary.pass} of {state.controls.length} controls met
        <Box component="span" sx={{ fontWeight: 400, color: BRAND.gray }}>
          {summary.fail > 0 ? ` · ${summary.fail} not met` : ""}
          {summary.not_assessed > 0 ? ` · ${summary.not_assessed} not assessed` : ""}
        </Box>
      </Typography>

      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell sx={{ fontWeight: 700, color: BRAND.dark }}>Control</TableCell>
            <TableCell sx={{ fontWeight: 700, color: BRAND.dark }}>Status</TableCell>
            <TableCell align="right" sx={{ fontWeight: 700, color: BRAND.dark }}>Devices met</TableCell>
            <TableCell align="right" sx={{ fontWeight: 700, color: BRAND.dark }}>Devices failing</TableCell>
            <TableCell align="right" sx={{ fontWeight: 700, color: BRAND.dark }}>Not assessed</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {state.controls.map((row) => (
            <TableRow key={row.controlId} hover>
              <TableCell>
                <Stack spacing={0.25}>
                  <Stack direction="row" spacing={0.75} alignItems="center" sx={{ flexWrap: "wrap" }}>
                    <Typography sx={{ fontSize: TEXT.sm, fontWeight: 700, color: BRAND.dark, fontFamily: "monospace" }}>
                      {row.controlId}
                    </Typography>
                    {/* CIS levels (L1/L2) and STIG severities (CAT I/II/III)
                        are meaningful; NIST "baseline" is noise, so it is
                        only rendered when it says something. */}
                    {row.controlLevel && !/^(baseline|core)$/i.test(row.controlLevel) ? (
                      <Chip
                        size="small"
                        label={row.controlLevel}
                        sx={{ height: 16, fontSize: TEXT.xs, fontWeight: 700, bgcolor: BRAND.darkSoft, color: BRAND.dark }}
                      />
                    ) : null}
                  </Stack>
                  {row.controlTitle ? (
                    <Typography sx={{ fontSize: TEXT.sm, color: BRAND.dark }}>
                      {row.controlTitle}
                    </Typography>
                  ) : null}
                  {/* Qué evidencia sostiene el veredicto. Sin esto el
                      operador no puede discutir un "Not met" ni el
                      auditor comprobarlo. */}
                  <Typography sx={{ fontSize: TEXT.xs, color: BRAND.gray, fontFamily: "monospace" }}>
                    {row.checks.map((c) => c.checkId).join(" · ")}
                  </Typography>
                </Stack>
              </TableCell>
              <TableCell>
                <StatusChip status={row.status} />
              </TableCell>
              <TableCell align="right" sx={{ color: row.devicesPassing ? ROLE.positive : BRAND.gray, fontWeight: 700 }}>
                {row.devicesPassing}
              </TableCell>
              <TableCell align="right" sx={{ color: row.devicesFailing ? ROLE.critical : BRAND.gray, fontWeight: 700 }}>
                {row.devicesFailing}
              </TableCell>
              <TableCell align="right" sx={{ color: BRAND.gray }}>
                {row.devicesNotAssessed}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Box>
  );
}
