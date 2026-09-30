// src/components/CryptoDiscovery/CertFlagSummary.jsx
//
// La columna «Flags» de la lista de certificados en UNA línea (30-sep).
// Antes era una píldora por bandera con el identificador crudo
// (`weak_sig`, `long_validity`…): con tres banderas la celda partía en dos
// o tres filas, las píldoras se montaban unas sobre otras y la fila crecía
// sin avisar. Ahora: la bandera más grave con un nombre para personas, un
// «+N» si hay más, y la lista entera en el tooltip.

import * as React from "react";
import { Box, Tooltip, Typography } from "@mui/material";
import { BRAND, TEXT, TEXT_MUTED } from "../../theme/brand";

/**
 * De más a menos grave. Las primeras rompen algo HOY (revocado, cadena que
 * el propio equipo rechaza, clave o firma débil, clave compartida); las
 * últimas son higiene.
 */
const ORDER = [
  "revoked",
  "chain_untrusted",
  "weak_key",
  "weak_sig",
  "shared_private_key",
  "store_chain_bad_signature",
  "chain_incomplete",
  "store_chain_incomplete",
  "reused_key",
  "nonstandard_root",
  "self_signed_leaf",
  "long_validity"
];
const SEVERE = new Set(ORDER.slice(0, 6));

/** Nombre corto para la celda; el largo va en el tooltip. */
export const FLAG_SHORT = {
  revoked: "Revoked",
  chain_untrusted: "Untrusted chain",
  weak_key: "Weak key",
  weak_sig: "Weak signature",
  shared_private_key: "Shared key",
  store_chain_bad_signature: "Bad chain signature",
  chain_incomplete: "Incomplete chain",
  store_chain_incomplete: "Issuer missing",
  reused_key: "Reused key",
  nonstandard_root: "Nonstandard root",
  self_signed_leaf: "Self-signed leaf",
  long_validity: "Long validity"
};

const rank = (f) => {
  const i = ORDER.indexOf(f);
  return i < 0 ? ORDER.length : i;
};

/** Las banderas ordenadas por gravedad (las desconocidas, al final). */
export function sortFlags(flags) {
  return [...new Set(Array.isArray(flags) ? flags : [])].sort((a, b) => rank(a) - rank(b));
}

export default function CertFlagSummary({ flags, labels = {} }) {
  const sorted = sortFlags(flags);
  if (sorted.length === 0) return null;
  const [top, ...rest] = sorted;
  const severe = SEVERE.has(top);
  return (
    <Tooltip
      arrow
      title={
        <Box component="ul" sx={{ m: 0, pl: 2, fontSize: TEXT.xs }}>
          {sorted.map((f) => (
            <li key={f}>{labels[f] ?? FLAG_SHORT[f] ?? f}</li>
          ))}
        </Box>
      }
    >
      <Box
        aria-label={`Flags: ${sorted.map((f) => FLAG_SHORT[f] ?? f).join(", ")}`}
        sx={{ display: "flex", alignItems: "center", gap: 0.75, minWidth: 0, maxWidth: "100%", height: "100%" }}
      >
        <Box component="span" sx={{ width: 8, height: 8, borderRadius: "50%", flexShrink: 0, bgcolor: severe ? BRAND.alert.error : BRAND.alert.warning }} />
        <Typography component="span" noWrap sx={{ fontSize: TEXT.sm, fontWeight: severe ? 600 : 400, color: severe ? BRAND.alert.errorText : BRAND.dark, minWidth: 0 }}>
          {FLAG_SHORT[top] ?? top}
        </Typography>
        {rest.length > 0 ? (
          <Typography component="span" sx={{ fontSize: TEXT.xs, color: TEXT_MUTED, flexShrink: 0 }}>
            +{rest.length}
          </Typography>
        ) : null}
      </Box>
    </Tooltip>
  );
}
