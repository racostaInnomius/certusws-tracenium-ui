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
  ToggleButton,
  ToggleButtonGroup,
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
  // Los "Audit …" de CIS: el benchmark pide comparar contra la política
  // del sitio, no hay valor correcto. Tracenium adjunta lo que leyó y una
  // persona decide. Nunca cuenta como cumplido ni como fallo.
  review: {
    label: "Needs review",
    fg: BRAND.alert?.warningText,
    bg: BRAND.alert?.warningSoft,
    help: "The standard asks a person to compare this setting with your policy. Tracenium attaches what it read on the device; it never passes or fails on its own.",
  },
  // Guarda `when` no cumplida en todos los equipos del alcance: un
  // control de controlador de dominio en un workstation, un control de
  // GDM sin GDM instalado. No es un hueco de evidencia.
  not_applicable: {
    label: "Not applicable",
    fg: BRAND.gray,
    bg: "transparent",
    help: "This control does not apply to the devices in scope (for example a domain-controller control on a workstation). It is not missing evidence.",
  },
  // Un criterio de SOC 2 / ISO que es gobierno, RRHH, proveedores…: lo
  // evidencian políticas y registros, no un equipo. No es un hueco de
  // Tracenium y no cuenta contra la cobertura; la plataforma GRC del
  // cliente es quien lo sostiene.
  organizational: {
    label: "Organizational",
    fg: BRAND.gray,
    bg: "transparent",
    help: "Evidenced through policies, procedures and records, not through device telemetry. No endpoint software can measure it; your GRC platform holds this evidence. It does not count against device coverage.",
  },
  no_evidence: {
    label: "Not covered",
    fg: BRAND.gray,
    bg: "transparent",
    help: "Tracenium does not collect evidence for this control yet. It is part of the standard and counts against coverage — it is not a finding about your devices.",
  },
};

/** Evidencia capturada → texto legible, una línea por clave. */
function formatEvidence(ev) {
  if (!ev || typeof ev !== "object") return "";
  return Object.entries(ev)
    .filter(([k]) => k !== "note")
    .map(([k, v]) => `${k}: ${v === null || v === undefined ? "—" : typeof v === "object" ? JSON.stringify(v) : String(v)}`)
    .join("\n");
}

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

// Baselines de 800-53. Un cliente responde por la suya, no por los 1.014
// controles; Moderate es la que piden FedRAMP y la mayoría de contratos, y
// es la vista por defecto. "All" enseña el catálogo entero.
const BASELINES = ["low", "moderate", "high"];
const DEFAULT_BASELINE = "moderate";

export default function FrameworkControlsPanel({ framework, assetGroupId, agentId, reloadKey }) {
  const [state, setState] = React.useState({ loading: true, error: null, controls: [] });
  const [baseline, setBaseline] = React.useState(DEFAULT_BASELINE);
  React.useEffect(() => { setBaseline(DEFAULT_BASELINE); }, [framework]);

  React.useEffect(() => {
    if (!framework) return undefined;
    let alive = true;
    setState({ loading: true, error: null, controls: [] });
    getFrameworkControls({ framework, assetGroupId: assetGroupId || undefined, agentId: agentId || undefined })
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
  }, [framework, assetGroupId, agentId, reloadKey]);

  // Sólo los estándares con baselines (800-53) enseñan el selector; el
  // filtro es local porque las baselines viajan en cada fila.
  const hasBaselines = React.useMemo(() => state.controls.some((r) => Array.isArray(r.baselines)), [state.controls]);
  const visible = React.useMemo(
    () => (hasBaselines && baseline !== "all" ? state.controls.filter((r) => Array.isArray(r.baselines) && r.baselines.includes(baseline)) : state.controls),
    [state.controls, hasBaselines, baseline]
  );

  const summary = React.useMemo(() => {
    const c = { pass: 0, fail: 0, review: 0, not_assessed: 0, not_applicable: 0, no_evidence: 0, organizational: 0, automatable_gap: 0 };
    for (const row of visible) {
      if (c[row.status] !== undefined) c[row.status] += 1;
      // De lo no cubierto, cuánto PODRÍA cubrirse. Un control manual no
      // lo cierra ningún agente; el resto es evidencia que aún no
      // recogemos, y ésa es la cifra sobre la que se puede trabajar.
      if (row.status === "no_evidence" && row.automated !== false) c.automatable_gap += 1;
    }
    return c;
  }, [visible]);

  // Los organizativos no entran en el denominador: no son controles que
  // un software pueda cubrir, así que "cobertura" se mide sobre el resto.
  const deviceEvidenceable = visible.length - summary.organizational;
  const covered = deviceEvidenceable - summary.no_evidence;
  const coveragePct = deviceEvidenceable
    ? Math.round((covered / deviceEvidenceable) * 100)
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
      {hasBaselines ? (
        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
          <Typography sx={{ fontSize: TEXT.xs, color: BRAND.gray, fontWeight: 700, textTransform: "uppercase" }}>Baseline</Typography>
          <ToggleButtonGroup size="small" exclusive value={baseline} onChange={(_, v) => { if (v) setBaseline(v); }} aria-label="Baseline">
            {BASELINES.map((b) => (
              <ToggleButton key={b} value={b} sx={{ textTransform: "capitalize", fontSize: TEXT.xs, py: 0.25 }}>{b}</ToggleButton>
            ))}
            <ToggleButton value="all" sx={{ fontSize: TEXT.xs, py: 0.25 }}>All</ToggleButton>
          </ToggleButtonGroup>
          <Typography sx={{ fontSize: TEXT.xs, color: BRAND.gray }}>
            {baseline === "all" ? `${visible.length} controls` : `${visible.length} controls in the ${baseline} baseline`}
          </Typography>
        </Stack>
      ) : null}
      <Typography sx={{ fontSize: TEXT.sm, color: BRAND.dark, fontWeight: 700 }}>
        {summary.organizational > 0
          ? `Tracenium covers ${covered} of the ${deviceEvidenceable} device-evidenceable controls in this ${hasBaselines && baseline !== "all" ? "baseline" : "standard"} (${coveragePct}%)`
          : `Tracenium covers ${covered} of ${visible.length} controls in this ${hasBaselines && baseline !== "all" ? "baseline" : "standard"} (${coveragePct}%)`}
      </Typography>
      {summary.organizational > 0 ? (
        <Typography sx={{ fontSize: TEXT.xs, color: BRAND.gray, mb: 0.5 }}>
          The other {summary.organizational} are organizational: evidenced through policies, procedures and records, not devices. They live in your GRC platform, not here.
        </Typography>
      ) : null}
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
          {summary.review > 0 ? ` · ${summary.review} need review` : ""}
          {summary.not_applicable > 0 ? ` · ${summary.not_applicable} not applicable` : ""}
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
            {agentId ? null : (
              <TableCell align="right" sx={{ fontWeight: 700, color: BRAND.dark }}>N/A</TableCell>
            )}
          </TableRow>
        </TableHead>
        <TableBody>
          {visible.map((row) => (
            <TableRow key={row.controlId} hover sx={row.status === "no_evidence" || row.status === "not_applicable" || row.status === "organizational" ? { opacity: 0.55 } : undefined}>
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
                      {row.status === "organizational"
                        ? "policies, procedures and records — not device telemetry"
                        : row.automated === false
                          ? "manual review — no agent can check this"
                          : "no check collects this yet"}
                    </Typography>
                  )}
                  {/* Por qué no se pudo evaluar. Sin esto "Not assessed"
                      se lee como un veredicto que Tracenium eligió, y es
                      lo contrario: evidencia que nunca llegó. El motivo
                      lo escribe el evaluador en cada hallazgo y hasta
                      ahora no salía a ninguna pantalla. */}
                  {row.notAssessedReasons?.length && row.status !== "not_applicable" && row.status !== "review" ? (
                    <Typography sx={{ fontSize: TEXT.xs, color: BRAND.alert?.warningText }}>
                      {row.notAssessedReasons.join(" · ")}
                    </Typography>
                  ) : null}
                  {/* Lo que leyó el agente para que la persona decida. Con
                      un equipo es exacto; con un grupo es la muestra de uno. */}
                  {row.status === "review" && row.reviewEvidence ? (
                    <Typography
                      component="pre"
                      data-testid={`review-evidence-${row.controlId}`}
                      sx={{ fontSize: TEXT.xs, color: BRAND.dark, fontFamily: "monospace", whiteSpace: "pre-wrap", m: 0, mt: 0.5, p: 0.75, bgcolor: BRAND.darkSoft, borderRadius: 1, maxHeight: 160, overflow: "auto" }}
                    >
                      {(agentId ? "" : "sample from one device\n") + formatEvidence(row.reviewEvidence)}
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
              {agentId ? null : (
                <TableCell align="right" sx={{ color: BRAND.gray }}>
                  {row.devicesNotApplicable ?? 0}
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Box>
  );
}
