// src/components/CryptoDiscovery/CdpSourcesMap.jsx
//
// El mapa de fuentes de Crypto Discovery → Settings (2026-09-14): una fila
// por sector del sunburst, con una ficha por fuente que dice si ya reporta,
// si está configurada y muda, si falló o si no está conectada. Cada ficha
// baja a la sección de la página donde esa fuente se configura. El cálculo
// vive en cdpSources.js; aquí solo se pinta.

import * as React from "react";
import { Box, Chip, Stack, Tooltip, Typography } from "@mui/material";
import { BRAND, TEXT, TEXT_MUTED } from "../../theme/brand";
import { sectorAnchor, sourcesByBase } from "./cdpSources";

const STATE = {
  reporting: { text: "reporting", bg: BRAND.alert.successSoft, fg: BRAND.alert.successText, dot: BRAND.alert.success },
  configured: { text: "configured · nothing yet", bg: BRAND.alert.warningSoft, fg: BRAND.alert.warningText, dot: BRAND.alert.warning },
  failed: { text: "failing", bg: BRAND.alert.errorSoft, fg: BRAND.alert.errorText, dot: BRAND.alert.error },
  disabled: { text: "disabled", bg: "transparent", fg: TEXT_MUTED, dot: "#C7CBD1" },
  unconfigured: { text: "not connected", bg: "transparent", fg: TEXT_MUTED, dot: "#E4E7EC" },
  unavailable: { text: "not available yet", bg: "transparent", fg: TEXT_MUTED, dot: "transparent" }
};

function SourceChip({ source, onGo }) {
  const st = STATE[source.state] ?? STATE.unconfigured;
  const outlined = source.state === "disabled" || source.state === "unconfigured" || source.state === "unavailable";
  return (
    <Tooltip title={<Box sx={{ fontSize: TEXT.xs }}><strong>{source.label}</strong> — {st.text}. {source.detail}</Box>} arrow>
      <Chip
        size="small"
        clickable={!!onGo}
        onClick={onGo}
        role="button"
        aria-label={`${source.label}: ${st.text}`}
        icon={<Box component="span" sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: st.dot, border: source.state === "unavailable" ? `1px dashed ${TEXT_MUTED}` : "none", ml: "6px !important" }} />}
        label={source.label}
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

/**
 * @param {object} props
 * @param {object} props.data   entrada de `sourcesByBase` (facets, assets, connectors, adcs, cdp)
 * @param {boolean} props.loading
 */
export default function CdpSourcesMap({ data, loading = false }) {
  const bases = React.useMemo(() => sourcesByBase(data ?? {}), [data]);
  const go = (baseKey) => () => {
    const el = typeof document !== "undefined" ? document.getElementById(sectorAnchor(baseKey)) : null;
    if (el && typeof el.scrollIntoView === "function") el.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  return (
    <Stack spacing={1} aria-busy={loading} sx={{ opacity: loading ? 0.6 : 1, transition: "opacity 200ms ease" }}>
      {bases.map((b) => (
        <Stack key={b.key} direction={{ xs: "column", md: "row" }} spacing={{ xs: 0.5, md: 2 }} alignItems={{ md: "flex-start" }} sx={{ py: 0.75, borderTop: b.parent ? "none" : `1px dashed ${BRAND.border}`, pl: b.parent ? 2.5 : 0 }}>
          <Box sx={{ minWidth: b.parent ? 180 : 200, maxWidth: { md: b.parent ? 180 : 200 } }}>
            {/* Una sección que cuelga de otra (Windows CA dentro de On-prem)
                va sangrada y con el nombre de su padre delante. */}
            <Typography sx={{ fontWeight: 700, fontSize: TEXT.md, color: BRAND.dark, lineHeight: 1.2 }}>{b.parent ? `↳ ${b.label}` : b.label}</Typography>
            <Typography sx={{ fontSize: TEXT.xs, color: TEXT_MUTED }}>
              {b.reporting} of {b.total} reporting
            </Typography>
          </Box>
          <Stack direction="row" spacing={0.75} sx={{ flexWrap: "wrap", rowGap: 0.75, flex: 1 }}>
            {b.sources.map((s) => (
              <SourceChip key={s.key} source={s} onGo={go(b.key)} />
            ))}
          </Stack>
        </Stack>
      ))}
    </Stack>
  );
}
