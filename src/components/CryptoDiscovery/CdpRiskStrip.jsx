// src/components/CryptoDiscovery/CdpRiskStrip.jsx
//
// La tira de riesgo del Dashboard (ola 1.6): cuántos certificados hay en
// cada banda, y un clic lleva a la pestaña Risk con esa banda puesta.
//
// ── Cuatro respuestas que no se pueden confundir ─────────────────────
//
//   · «no pude leerlo»  — error de la API: se dice, y NO se pinta nada que
//     parezca un cero. Lección del repo: «no hay» ≠ «no pude leer».
//   · «aún no puntuado» — hay certificados pero ninguno tiene cifra
//     (migración 20261021 sin aplicar o primer barrido sin correr). Un
//     tenant así NO está limpio; está sin medir.
//   · «sin riesgo»      — puntuados y ninguno con factores.
//   · las bandas        — lo normal.
//
// Pide su propio resumen: si cae, cae sola y el resto del Dashboard sigue.

import * as React from "react";
import { Alert, Box, Button, ButtonBase, Stack, Typography } from "@mui/material";
import GppMaybeOutlinedIcon from "@mui/icons-material/GppMaybeOutlined";
import SectionPaper from "../common/SectionPaper";
import { BRAND, TEXT, TEXT_MUTED } from "../../theme/brand";
import { getCdpRiskSummary } from "../../api/cdp";
import { RISK_BANDS_AT_RISK, bandMeta, riskSummaryState } from "./cdpRisk";

const fmt = (n) => Number(n ?? 0).toLocaleString();

/**
 * Una casilla por banda. Las bandas con lista debajo (critical…low) son
 * botones; «none» y «unscored» no, porque no tienen lista que abrir: la
 * pestaña Risk sólo enseña certificados con cifra ≥ 1.
 */
export function BandCounts({ bands, onSelect, selected = null, showUnscored = true }) {
  const keys = [...RISK_BANDS_AT_RISK, "none", ...(showUnscored && Number(bands?.unscored ?? 0) > 0 ? ["unscored"] : [])];
  return (
    <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", rowGap: 1 }} role="list" aria-label="Certificates by risk band">
      {keys.map((band) => {
        const meta = bandMeta(band);
        const value = Number(bands?.[band] ?? 0);
        const clickable = Boolean(onSelect) && RISK_BANDS_AT_RISK.includes(band);
        const isSel = selected === band;
        const body = (
          <Box
            sx={{
              px: 1.5,
              py: 0.75,
              minWidth: 92,
              borderRadius: 1.5,
              bgcolor: meta.bg,
              border: `1px ${meta.dashed ? "dashed" : "solid"} ${isSel ? meta.fg : BRAND.border}`,
              textAlign: "left"
            }}
          >
            <Typography sx={{ fontSize: TEXT.xs, fontWeight: 700, color: meta.fg, textTransform: "uppercase", letterSpacing: ".05em" }}>
              {meta.label}
            </Typography>
            <Typography sx={{ fontSize: TEXT.xl, fontWeight: 800, color: meta.fg, lineHeight: 1.2, fontVariantNumeric: "tabular-nums" }}>
              {fmt(value)}
            </Typography>
          </Box>
        );
        const label = `${meta.label}: ${fmt(value)} certificate${value === 1 ? "" : "s"}`;
        return (
          <Box role="listitem" key={band}>
            {clickable ? (
              <ButtonBase
                onClick={() => onSelect(band)}
                aria-label={label}
                aria-pressed={selected != null ? isSel : undefined}
                sx={{ borderRadius: 1.5, "&:focus-visible": { outline: `2px solid ${BRAND.teal}`, outlineOffset: 2 } }}
              >
                {body}
              </ButtonBase>
            ) : (
              <Box aria-label={label}>{body}</Box>
            )}
          </Box>
        );
      })}
    </Stack>
  );
}

/**
 * @param refreshNonce  el botón Refresh de la página
 * @param onOpenBand    (band|null) => void — abre la pestaña Risk (null = sin banda)
 */
export default function CdpRiskStrip({ refreshNonce, onOpenBand }) {
  const [summary, setSummary] = React.useState(null);
  const [error, setError] = React.useState(null);

  React.useEffect(() => {
    let alive = true;
    setError(null);
    getCdpRiskSummary()
      .then((r) => alive && setSummary(r ?? null))
      .catch((err) => {
        if (!alive) return;
        // Se borra lo anterior: enseñar las bandas de la carga vieja bajo un
        // Refresh que falló sería presentar como actual algo que no lo es.
        setSummary(null);
        setError(err?.message || String(err));
      });
    return () => {
      alive = false;
    };
  }, [refreshNonce]);

  const s = riskSummaryState(summary);

  let body;
  if (error) {
    body = (
      <Alert severity="error">
        Couldn&apos;t load risk scores: {error}. This says nothing about the certificates themselves — use Refresh to retry.
      </Alert>
    );
  } else if (!summary) {
    body = <Typography sx={{ fontSize: TEXT.sm, color: TEXT_MUTED }}>Loading…</Typography>;
  } else if (s.state === "empty") {
    body = <Typography sx={{ fontSize: TEXT.sm, color: TEXT_MUTED }}>No end-entity certificates reported yet.</Typography>;
  } else if (s.state === "unscored") {
    body = (
      <Alert severity="info">
        Not scored yet: {fmt(s.total)} certificate{s.total === 1 ? " is" : "s are"} waiting for the first risk sweep. Scores are
        computed periodically on the server; until then this is &quot;not measured&quot;, not &quot;no risk&quot;.
      </Alert>
    );
  } else {
    body = (
      <Stack spacing={1}>
        <BandCounts bands={summary.bands} onSelect={(band) => onOpenBand?.(band)} />
        {s.state === "clean" ? (
          <Typography sx={{ fontSize: TEXT.sm, color: BRAND.alert.successText }}>
            No scored certificate carries a risk factor.
          </Typography>
        ) : null}
        {s.unscored > 0 ? (
          <Typography sx={{ fontSize: TEXT.xs, color: TEXT_MUTED }}>
            {fmt(s.unscored)} not scored yet — they arrived after the last sweep and are not counted in any band.
          </Typography>
        ) : null}
      </Stack>
    );
  }

  return (
    <SectionPaper>
      <Stack direction={{ xs: "column", md: "row" }} spacing={2} sx={{ alignItems: { md: "center" } }}>
        <Box sx={{ minWidth: 220 }}>
          <Stack direction="row" spacing={1} alignItems="center">
            <GppMaybeOutlinedIcon fontSize="small" sx={{ color: BRAND.tealText }} />
            <Typography component="h3" sx={{ fontSize: TEXT.xl, fontWeight: 700, color: BRAND.dark, m: 0 }}>
              Certificate risk
            </Typography>
          </Stack>
          <Typography sx={{ fontSize: TEXT.xs, color: TEXT_MUTED, mt: 0.5 }}>
            End-entity certificates by their worst score. Every point comes from a named factor.
          </Typography>
        </Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>{body}</Box>
        <Button
          size="small"
          variant="outlined"
          onClick={() => onOpenBand?.(null)}
          sx={{ alignSelf: { xs: "flex-start", md: "center" }, whiteSpace: "nowrap" }}
        >
          Open risk list
        </Button>
      </Stack>
    </SectionPaper>
  );
}
