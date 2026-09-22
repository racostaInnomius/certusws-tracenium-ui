// src/components/CryptoDiscovery/CdpRiskPanel.jsx
//
// Pestaña «Risk» de Crypto Discovery (ola 1.6 de CDP-VS-KEYFACTOR).
//
// Una pregunta: «¿qué certificados arreglo primero y por qué?». La lista
// viene ordenada por cifra desde el servidor; cada fila se despliega y
// enseña de dónde sale cada punto (factor, puntos, frase, referencia).
//
// ── Por qué el «¿cómo se calcula?» lee la API ────────────────────────
//
// Los pesos viven en risk.ts del backend y viajan en /risk/summary. Una
// copia aquí se desincroniza al primer recalibrado —y un operador que
// suma los puntos de una fila y no le cuadra con la tabla deja de creer la
// cifra entera—. Si el resumen no carga, la tabla NO se pinta con valores
// por defecto: se dice que no se pudo leer.
//
// ── Estado en la URL ─────────────────────────────────────────────────
//
// `rband` (banda mínima) y `rclass` (lente), como el resto del filtro de
// la página: la tira del Dashboard abre esta pestaña con la banda puesta y
// el enlace se puede compartir.

import * as React from "react";
import {
  Alert,
  AlertTitle,
  Box,
  Button,
  Chip,
  Collapse,
  IconButton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography
} from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import SectionPaper from "../common/SectionPaper";
import useCdpFilter from "../../hooks/useCdpFilter";
import { BRAND, TEXT, TEXT_MUTED } from "../../theme/brand";
import { getCdpRiskSummary, listCdpRiskTop } from "../../api/cdp";
import { BandCounts } from "./CdpRiskStrip";
import { RISK_BANDS_AT_RISK, bandMeta, bandRanges, factorLabel, riskSummaryState, weightLabel } from "./cdpRisk";

/** Cuántas filas se piden. El backend corta en 200. */
export const RISK_LIST_LIMIT = 100;

const CLASS_LABELS = { "end-entity": "End-entity", ca: "CA", all: "All" };
const fmt = (n) => Number(n ?? 0).toLocaleString();

function formatDate(value) {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString();
}

function BandChip({ band, score }) {
  const meta = bandMeta(band);
  return (
    <Chip
      size="small"
      label={score != null ? `${meta.label} · ${score}` : meta.label}
      sx={{ bgcolor: meta.bg, color: meta.fg, fontWeight: 700, fontSize: TEXT.xs, minWidth: 96 }}
    />
  );
}

/** El desglose de una fila: de dónde sale cada punto. */
export function FactorList({ factors }) {
  if (!Array.isArray(factors) || factors.length === 0) {
    // Una fila en esta lista tiene cifra ≥ 1, así que sin factores es un
    // dato raro del servidor: se dice en vez de enseñar una tabla vacía.
    return <Typography sx={{ fontSize: TEXT.sm, color: TEXT_MUTED }}>The server sent no factor breakdown for this certificate.</Typography>;
  }
  return (
    <Table size="small" aria-label="Risk factors">
      <TableHead>
        <TableRow>
          <TableCell sx={{ width: 70, fontSize: TEXT.xs, fontWeight: 700 }} align="right">Points</TableCell>
          <TableCell sx={{ fontSize: TEXT.xs, fontWeight: 700 }}>Factor</TableCell>
          <TableCell sx={{ fontSize: TEXT.xs, fontWeight: 700 }}>Why</TableCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {factors.map((f, i) => (
          <TableRow key={`${f.key}-${i}`}>
            <TableCell align="right" sx={{ fontVariantNumeric: "tabular-nums", fontWeight: 700, fontSize: TEXT.sm }}>+{f.points}</TableCell>
            <TableCell sx={{ fontSize: TEXT.sm }}>
              <Tooltip title={f.key} arrow>
                <span>{factorLabel(f.key)}</span>
              </Tooltip>
            </TableCell>
            <TableCell sx={{ fontSize: TEXT.sm }}>
              {f.why}
              {f.reference ? (
                <Chip size="small" variant="outlined" label={f.reference} sx={{ ml: 1, height: 20, fontSize: TEXT.xs }} />
              ) : null}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function RiskRow({ item, onOpenCertificate }) {
  const [open, setOpen] = React.useState(false);
  const name = item.subjectCN || `${String(item.fingerprint256 ?? "").slice(0, 16)}…`;
  const bodyId = `cdp-risk-${item.fingerprint256}`;
  const nFactors = Array.isArray(item.riskFactors) ? item.riskFactors.length : 0;
  return (
    <Box sx={{ borderBottom: `1px solid ${BRAND.border}`, py: 1 }} data-testid="risk-row">
      <Stack direction="row" spacing={1.5} alignItems="center" sx={{ minWidth: 0 }}>
        <IconButton
          size="small"
          aria-expanded={open}
          aria-controls={bodyId}
          aria-label={open ? `Hide factors for ${name}` : `Show factors for ${name}`}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
        </IconButton>
        <BandChip band={item.riskBand} score={item.riskScore} />
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography sx={{ fontWeight: 700, fontSize: TEXT.md, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</Typography>
          <Typography sx={{ fontSize: TEXT.xs, color: TEXT_MUTED }}>
            {item.issuerCN ? `Issued by ${item.issuerCN}` : "Unknown issuer"} · expires {formatDate(item.notAfter)} ·{" "}
            {fmt(item.occurrences)} occurrence{Number(item.occurrences) === 1 ? "" : "s"}
            {item.worstOn?.source ? ` · worst as ${item.worstOn.source}` : ""} · {nFactors} factor{nFactors === 1 ? "" : "s"}
          </Typography>
        </Box>
        {onOpenCertificate ? (
          <Button size="small" onClick={() => onOpenCertificate(item.fingerprint256)} sx={{ flexShrink: 0 }}>
            Details
          </Button>
        ) : null}
      </Stack>
      <Collapse in={open} id={bodyId} unmountOnExit>
        <Box sx={{ pl: { xs: 1, sm: 6 }, pr: 1, pt: 1 }}>
          <FactorList factors={item.riskFactors} />
        </Box>
      </Collapse>
    </Box>
  );
}

/**
 * «¿Cómo se calcula?». Todo sale del resumen: pesos y umbrales. Las parejas
 * «cada / máximo» (CA/B Forum, política) se leen juntas en la misma tabla.
 */
export function HowCalculated({ weights, bandThresholds }) {
  const [open, setOpen] = React.useState(false);
  const entries = weights && typeof weights === "object" ? Object.entries(weights) : [];
  const ranges = bandRanges(bandThresholds);
  const usable = entries.length > 0 && ranges.length > 0;
  return (
    <Box>
      <Button
        size="small"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="cdp-risk-how"
        endIcon={open ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
      >
        How is this calculated?
      </Button>
      <Collapse in={open} id="cdp-risk-how">
        <Box sx={{ pt: 1 }}>
          {!usable ? (
            // Sin pesos del servidor no se inventan unos: se dice.
            <Alert severity="warning">The server did not send its weights, so the calculation can&apos;t be shown.</Alert>
          ) : (
            <Stack spacing={1.5}>
              <Typography sx={{ fontSize: TEXT.sm, color: BRAND.dark }}>
                Each certificate gets the points of every factor that applies to it; the score is their sum, capped at 100. The same
                certificate on several devices takes its worst occurrence. There is no model behind it — these are the weights.
              </Typography>
              <Stack direction={{ xs: "column", md: "row" }} spacing={3} alignItems="flex-start">
                <Table size="small" aria-label="Risk weights" sx={{ maxWidth: 520 }}>
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ fontSize: TEXT.xs, fontWeight: 700 }}>Factor</TableCell>
                      <TableCell align="right" sx={{ fontSize: TEXT.xs, fontWeight: 700 }}>Points</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {entries.map(([k, v]) => (
                      <TableRow key={k}>
                        <TableCell sx={{ fontSize: TEXT.sm }}>{weightLabel(k)}</TableCell>
                        <TableCell align="right" sx={{ fontSize: TEXT.sm, fontVariantNumeric: "tabular-nums" }} data-testid={`weight-${k}`}>
                          {v}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <Table size="small" aria-label="Risk bands" sx={{ maxWidth: 280 }}>
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ fontSize: TEXT.xs, fontWeight: 700 }}>Band</TableCell>
                      <TableCell align="right" sx={{ fontSize: TEXT.xs, fontWeight: 700 }}>Score</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {ranges.map((r) => (
                      <TableRow key={r.band}>
                        <TableCell sx={{ fontSize: TEXT.sm }}>{bandMeta(r.band).label}</TableCell>
                        <TableCell align="right" sx={{ fontSize: TEXT.sm, fontVariantNumeric: "tabular-nums" }} data-testid={`band-${r.band}`}>
                          {r.range}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Stack>
            </Stack>
          )}
        </Box>
      </Collapse>
    </Box>
  );
}

export default function CdpRiskPanel({ refreshNonce, onOpenCertificate }) {
  const [filter, patchFilter] = useCdpFilter();
  const minBand = RISK_BANDS_AT_RISK.includes(filter.riskBand) ? filter.riskBand : "";
  const certClass = ["end-entity", "ca", "all"].includes(filter.riskClass) ? filter.riskClass : "end-entity";

  const [summary, setSummary] = React.useState(null);
  const [summaryError, setSummaryError] = React.useState(null);
  const [items, setItems] = React.useState(null);
  const [listError, setListError] = React.useState(null);

  // Dos peticiones, dos errores: si cae una, la otra sigue siendo cierta y
  // se dice exactamente qué parte no lo es.
  React.useEffect(() => {
    let alive = true;
    setSummaryError(null);
    getCdpRiskSummary({ certClass })
      .then((r) => alive && setSummary(r ?? null))
      .catch((err) => {
        if (!alive) return;
        setSummary(null);
        setSummaryError(err?.message || String(err));
      });
    return () => {
      alive = false;
    };
  }, [refreshNonce, certClass]);

  React.useEffect(() => {
    let alive = true;
    setItems(null);
    setListError(null);
    listCdpRiskTop({ limit: RISK_LIST_LIMIT, certClass, minBand: minBand || undefined })
      .then((r) => alive && setItems(Array.isArray(r?.items) ? r.items : []))
      .catch((err) => {
        if (!alive) return;
        setItems(null);
        setListError(err?.message || String(err));
      });
    return () => {
      alive = false;
    };
  }, [refreshNonce, certClass, minBand]);

  const s = riskSummaryState(summary);
  const minMeta = minBand ? bandMeta(minBand) : null;

  // Qué decir cuando la lista viene vacía depende del resumen: «nada por
  // encima de esta banda», «nada con riesgo» y «aún sin puntuar» son tres
  // frases distintas. Sin resumen (cayó) no se afirma nada sobre la flota.
  let emptyText = null;
  if (items && items.length === 0) {
    if (summaryError || !summary) emptyText = "No certificates returned. The band summary did not load, so this can't tell whether that means no risk or not scored yet.";
    else if (s.state === "unscored") emptyText = null; // lo explica el aviso de «no puntuado» de arriba
    else if (s.state === "empty") emptyText = "No certificates in this view yet.";
    else if (minBand) emptyText = `No certificates at ${minMeta.label.toLowerCase()} risk or above.`;
    else emptyText = "No scored certificate carries a risk factor.";
  }

  return (
    <Stack spacing={2}>
      <SectionPaper variant="panel" sx={{ p: { xs: 1.5, sm: 2 } }}>
        <Stack direction={{ xs: "column", md: "row" }} spacing={1.5} alignItems={{ xs: "stretch", md: "center" }} sx={{ mb: 1.5 }}>
          <ToggleButtonGroup
            size="small"
            exclusive
            value={certClass}
            aria-label="Certificate class"
            onChange={(_e, v) => {
              if (v) patchFilter({ riskClass: v === "end-entity" ? "" : v });
            }}
          >
            {Object.entries(CLASS_LABELS).map(([k, label]) => (
              <ToggleButton key={k} value={k}>{label}</ToggleButton>
            ))}
          </ToggleButtonGroup>
          <Typography sx={{ fontSize: TEXT.sm, color: TEXT_MUTED, flex: 1 }}>
            Click a band to list it and everything above it.
          </Typography>
          {minBand ? (
            <Chip
              size="small"
              label={`Showing: ${minMeta.label} and above`}
              onDelete={() => patchFilter({ riskBand: "" })}
              sx={{ bgcolor: BRAND.tealSoft, color: BRAND.tealText, fontWeight: 700 }}
            />
          ) : null}
        </Stack>

        {summaryError ? (
          <Alert severity="error">
            <AlertTitle>Couldn&apos;t load the band summary</AlertTitle>
            {summaryError} — the counts are missing because the request failed, not because there is no risk.
          </Alert>
        ) : !summary ? (
          <Typography sx={{ fontSize: TEXT.sm, color: TEXT_MUTED }}>Loading…</Typography>
        ) : s.state === "unscored" ? (
          <Alert severity="info">
            <AlertTitle>Not scored yet</AlertTitle>
            {fmt(s.total)} certificate{s.total === 1 ? " has" : "s have"} no score yet. Scores are computed by a periodic sweep on the
            server; a new tenant, or one whose database migration is still pending, shows everything here until that sweep runs.
            This is &quot;not measured&quot;, not &quot;no risk&quot;.
          </Alert>
        ) : (
          <Stack spacing={1}>
            <BandCounts bands={summary.bands} selected={minBand || null} onSelect={(band) => patchFilter({ riskBand: band === minBand ? "" : band })} />
            {s.unscored > 0 ? (
              <Typography sx={{ fontSize: TEXT.xs, color: TEXT_MUTED }}>
                {fmt(s.unscored)} not scored yet — they arrived after the last sweep and are not in any band.
              </Typography>
            ) : null}
            {Array.isArray(summary.factors) && summary.factors.length > 0 ? (
              <Stack direction="row" spacing={0.75} sx={{ flexWrap: "wrap", rowGap: 0.75, alignItems: "center" }} aria-label="Most common factors">
                <Typography sx={{ fontSize: TEXT.xs, color: TEXT_MUTED, textTransform: "uppercase", letterSpacing: ".06em" }}>Most common</Typography>
                {summary.factors.slice(0, 8).map((f) => (
                  <Chip
                    key={f.key}
                    size="small"
                    variant="outlined"
                    label={`${factorLabel(f.key)} · ${fmt(f.certificates)}`}
                    sx={{ fontSize: TEXT.xs, height: 22 }}
                  />
                ))}
              </Stack>
            ) : null}
          </Stack>
        )}

        <Box sx={{ mt: 1.5 }}>
          {summary ? <HowCalculated weights={summary.weights} bandThresholds={summary.bandThresholds} /> : null}
        </Box>
      </SectionPaper>

      <SectionPaper variant="panel" sx={{ p: { xs: 1.5, sm: 2 } }}>
        <Typography component="h3" sx={{ fontSize: TEXT.lg, fontWeight: 700, color: BRAND.dark, m: 0, mb: 1 }}>
          Riskiest certificates
        </Typography>
        {listError ? (
          <Alert severity="error">
            <AlertTitle>Couldn&apos;t load the list</AlertTitle>
            {listError} — the list is empty because the request failed, not because nothing is at risk.
          </Alert>
        ) : items === null ? (
          <Typography sx={{ fontSize: TEXT.sm, color: TEXT_MUTED }}>Loading…</Typography>
        ) : items.length === 0 ? (
          emptyText ? <Typography sx={{ fontSize: TEXT.sm, color: TEXT_MUTED }}>{emptyText}</Typography> : null
        ) : (
          <Box>
            {items.map((item) => (
              <RiskRow key={item.fingerprint256} item={item} onOpenCertificate={onOpenCertificate} />
            ))}
            {items.length >= RISK_LIST_LIMIT ? (
              <Typography sx={{ fontSize: TEXT.xs, color: TEXT_MUTED, mt: 1 }}>
                Showing the top {fmt(RISK_LIST_LIMIT)}. Pick a higher band to narrow the list.
              </Typography>
            ) : null}
          </Box>
        )}
      </SectionPaper>
    </Stack>
  );
}
