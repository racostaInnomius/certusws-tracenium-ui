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
    help: "No device reported the evidence this control needs, so it is neither met nor failed. The reason is shown under the control — usually the agent is not sending that value.",
  },
  // ⚠️ Distinto de "Not assessed", y la diferencia importa: aquél es un
  // control que SÍ medimos y no pudimos juzgar (falta el DATO); éste ni
  // siquiera lo miramos (falta el TRABAJO). Mezclarlos volvería a dejar
  // al cliente sin saber cuánto del estándar cubrimos de verdad.
  no_evidence: {
    label: "Not covered",
    fg: BRAND.gray,
    bg: "transparent",
    help: "Tracenium does not collect evidence for this control yet. It is part of the standard and counts against coverage — it is not a finding about your devices.",
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
    const c = { pass: 0, fail: 0, not_assessed: 0, no_evidence: 0, automatable_gap: 0 };
    for (const row of state.controls) {
      if (c[row.status] !== undefined) c[row.status] += 1;
      // De lo no cubierto, cuánto PODRÍA cubrirse. Un control manual no
      // lo cierra ningún agente; el resto es evidencia que aún no
      // recogemos, y ésa es la cifra sobre la que se puede trabajar.
      if (row.status === "no_evidence" && row.automated !== false) c.automatable_gap += 1;
    }
    return c;
  }, [state.controls]);

  const covered = state.controls.length - summary.no_evidence;
  const coveragePct = state.controls.length
    ? Math.round((covered / state.controls.length) * 100)
    : 0;

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
      {/* Dos frases, y en este orden a propósito.
          La primera es la que un cliente necesita antes de firmar:
          cuánto del estándar somos capaces de mirar siquiera. La segunda
          es el veredicto sobre esa parte. Enseñar sólo la segunda es lo
          que hacía que un 80% se leyera como "80% de CIS" cuando era el
          80% de un 2%. */}
      <Typography sx={{ fontSize: TEXT.sm, color: BRAND.dark, fontWeight: 700 }}>
        Tracenium covers {covered} of {state.controls.length} controls in this standard ({coveragePct}%)
      </Typography>
      {summary.no_evidence > 0 ? (
        <Typography sx={{ fontSize: TEXT.xs, color: BRAND.gray, mb: 1 }}>
          {summary.automatable_gap} of the {summary.no_evidence} uncovered controls are machine-checkable —
          evidence we do not collect yet. The rest need human review and no agent can close them.
        </Typography>
      ) : null}

      <Typography sx={{ fontSize: TEXT.sm, color: BRAND.dark, fontWeight: 700, mb: 1, mt: 1 }}>
        Of those {covered}: {summary.pass} met
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
            <TableRow key={row.controlId} hover sx={row.status === "no_evidence" ? { opacity: 0.55 } : undefined}>
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
                  {row.checks.length ? (
                    <Typography sx={{ fontSize: TEXT.xs, color: BRAND.gray, fontFamily: "monospace" }}>
                      {row.checks.map((c) => c.checkId).join(" · ")}
                    </Typography>
                  ) : (
                    <Typography sx={{ fontSize: TEXT.xs, color: BRAND.gray, fontStyle: "italic" }}>
                      {row.automated === false
                        ? "manual review — no agent can check this"
                        : "no check collects this yet"}
                    </Typography>
                  )}
                  {/* Por qué no se pudo evaluar. Sin esto "Not assessed"
                      se lee como un veredicto que Tracenium eligió, y es
                      lo contrario: evidencia que nunca llegó. El motivo
                      lo escribe el evaluador en cada hallazgo y hasta
                      ahora no salía a ninguna pantalla. */}
                  {row.notAssessedReasons?.length ? (
                    <Typography sx={{ fontSize: TEXT.xs, color: BRAND.alert?.warningText }}>
                      {row.notAssessedReasons.join(" · ")}
                    </Typography>
                  ) : null}
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
