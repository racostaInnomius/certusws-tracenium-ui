// src/components/CryptoDiscovery/CdpSourceChips.jsx
//
// Las fichas de estado de las fuentes de Crypto Discovery → Settings
// (2026-09-14). Nacieron como un «mapa» aparte en lo alto de la pestaña;
// el usuario lo vio como información duplicada de las secciones de abajo,
// y tenía razón: ahora viven en la CABECERA de cada sección, que se
// pliega y despliega. Plegada, la pestaña se lee como el mapa; abierta,
// se configura. El cálculo vive en cdpSources.js; aquí solo se pinta.

import * as React from "react";
import { Box, Chip, Stack, Tooltip } from "@mui/material";
import { BRAND, TEXT, TEXT_MUTED } from "../../theme/brand";

const STATE = {
  reporting: { text: "reporting", bg: BRAND.alert.successSoft, fg: BRAND.alert.successText, dot: BRAND.alert.success },
  configured: { text: "configured · nothing yet", bg: BRAND.alert.warningSoft, fg: BRAND.alert.warningText, dot: BRAND.alert.warning },
  failed: { text: "failing", bg: BRAND.alert.errorSoft, fg: BRAND.alert.errorText, dot: BRAND.alert.error },
  disabled: { text: "disabled", bg: "transparent", fg: TEXT_MUTED, dot: "#C7CBD1" },
  unconfigured: { text: "not connected", bg: "transparent", fg: TEXT_MUTED, dot: "#E4E7EC" },
  unavailable: { text: "not available yet", bg: "transparent", fg: TEXT_MUTED, dot: "transparent" },
  // ADR-0026. Ni «failing» —no ha fallado nada— ni «not connected», que
  // borraría el trabajo que el cliente ya hizo: esto está configurado y
  // conserva lo que trajo; lo único que no ocurre es el refresco.
  // 25-sep: con el mismo punto gris que «not connected» y el estado sólo en
  // el tooltip, en T111 vCenter, las sondas y la CA parecían no conectados
  // mientras el sunburst enseñaba sus datos. Ahora lo dice la ficha.
  frozen: { text: "frozen · needs CDP Coverage", bg: "transparent", fg: BRAND.dark, dot: BRAND.teal, suffix: "frozen" }
};

export function SourceChip({ source, onClick }) {
  const st = STATE[source.state] ?? STATE.unconfigured;
  const outlined = source.state === "disabled" || source.state === "unconfigured" || source.state === "unavailable" || source.state === "frozen";
  return (
    <Tooltip title={<Box sx={{ fontSize: TEXT.xs }}><strong>{source.label}</strong> — {st.text}. {source.detail}</Box>} arrow>
      <Chip
        size="small"
        clickable={!!onClick}
        onClick={onClick}
        role="button"
        aria-label={`${source.label}: ${st.text}`}
        icon={<Box component="span" sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: st.dot, border: source.state === "unavailable" ? `1px dashed ${TEXT_MUTED}` : "none", ml: "6px !important" }} />}
        label={st.suffix ? `${source.label} · ${st.suffix}` : source.label}
        variant={outlined ? "outlined" : "filled"}
        sx={{
          height: 24,
          fontSize: TEXT.xs,
          fontWeight: source.state === "reporting" ? 700 : 500,
          bgcolor: st.bg,
          color: st.fg,
          borderStyle: source.state === "unavailable" ? "dashed" : "solid",
          borderColor: outlined ? BRAND.border : "transparent",
          "& .MuiChip-label": { pl: 0.75 }
        }}
      />
    </Tooltip>
  );
}

/** Una fila de fichas, una por fuente de la sección. `onClick(source)`. */
export default function SourceChips({ sources, onClick }) {
  return (
    <Stack direction="row" spacing={0.75} sx={{ flexWrap: "wrap", rowGap: 0.75 }}>
      {(sources ?? []).map((s) => (
        <SourceChip key={s.key} source={s} onClick={onClick ? () => onClick(s) : undefined} />
      ))}
    </Stack>
  );
}
