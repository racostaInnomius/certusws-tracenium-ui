// src/components/patch-management/RiskScoreCell.jsx
//
// El score 0–1000 en la tabla, con su explicación al pasar por encima.
//
// La columna de CVSS ya estaba, y por sí sola no ordena nada: hay miles de
// CVEs con 9,8 y nadie puede empezar por todos. Esta dice por cuál empezar,
// y —sobre todo— POR QUÉ, porque un número que no se puede explicar no se usa
// para decidir: se discute.
//
// Dos ausencias que se dicen en vez de disfrazarse:
//
//   · sin CVSS ni KEV no hay score: «not scored», no un 0. Un 0 es una
//     afirmación («esto no importa») que nadie ha hecho.
//   · sin EPSS el número sigue siendo válido pero está menos informado, y se
//     marca. Un CVE recién publicado todavía no tiene probabilidad, y eso no
//     lo hace menos peligroso.

import * as React from "react";
import { Box, Chip, Stack, Tooltip, Typography } from "@mui/material";
import { BRAND, TEXT } from "../../theme/brand";

const BAND_COLOR = {
  critical: "error",
  high: "error",
  medium: "warning",
  low: "default",
};

/** Lo que compone el número, en palabras. */
export function explain(item) {
  if (item?.riskScore == null) {
    return "Not scored: this CVE has no CVSS base score and is not on the CISA KEV list.";
  }
  const parts = [];
  if (item.cvssScore != null) parts.push(`CVSS ${Number(item.cvssScore).toFixed(1)}`);
  if (item.epss != null) {
    const pct = (Number(item.epss) * 100).toFixed(1);
    const percentile = item.epssPercentile != null
      ? ` (higher than ${(Number(item.epssPercentile) * 100).toFixed(0)}% of all CVEs)`
      : "";
    parts.push(`${pct}% chance of exploitation in the next 30 days${percentile}`);
  } else {
    // Decirlo importa: es la diferencia entre «improbable» y «todavía no lo
    // sabemos», y sólo una de las dos justifica bajarlo en la cola.
    parts.push("no EPSS score yet for this CVE");
  }
  if (item.knownExploited) {
    parts.push(
      item.kevOverdue
        ? "actively exploited and past its CISA due date — this outranks everything else"
        : "actively exploited (CISA KEV), which outranks any CVSS score"
    );
  }
  return parts.join(" · ");
}

export default function RiskScoreCell({ item }) {
  const scored = item?.riskScore != null;
  return (
    <Tooltip title={explain(item)}>
      <Box sx={{ display: "inline-block" }}>
        <Stack direction="row" spacing={0.5} alignItems="baseline">
          <Typography
            sx={{
              fontSize: TEXT.md,
              fontWeight: 800,
              color: scored ? BRAND.dark : BRAND.gray,
            }}
          >
            {scored ? item.riskScore : "—"}
          </Typography>
          {scored ? (
            <Typography sx={{ fontSize: TEXT.xs, color: BRAND.gray }}>/1000</Typography>
          ) : null}
        </Stack>
        {scored ? (
          <Chip
            size="small"
            color={BAND_COLOR[item.riskBand] ?? "default"}
            label={item.riskBand}
            sx={{ height: 16, fontSize: TEXT.xs, fontWeight: 700, mt: 0.2 }}
          />
        ) : (
          <Typography sx={{ fontSize: TEXT.xs, color: BRAND.gray }}>not scored</Typography>
        )}
        {scored && item.epss == null ? (
          <Typography sx={{ fontSize: TEXT.xs, color: BRAND.gray, display: "block" }}>
            no EPSS yet
          </Typography>
        ) : null}
      </Box>
    </Tooltip>
  );
}
