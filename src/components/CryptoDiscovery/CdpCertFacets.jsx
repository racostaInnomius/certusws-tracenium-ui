// src/components/CryptoDiscovery/CdpCertFacets.jsx
//
// Facetas de la lista de certificados (fase 1, pieza D).
//
// Cada faceta enseña sus valores CON conteo bajo el filtro actual, y un
// clic añade ese valor al filtro. Es lo que convierte la lista en un
// explorador: «¿cuántos de estos son RSA-2048? ¿y cuántos vienen de un
// keystore Java?» se responde mirando, no consultando.
//
// Repaso UI 2026-09-06: los conteos NO cuadraban con el total de la tabla
// porque /facets aplicaba otro recorte (sin lente entidad-final, sin
// búsqueda/estado/bandera/emisor) y contaba ocurrencias en vez de
// certificados. Ahora viajan TODOS los parámetros de la lista con
// `lens=list`, el backend los traduce con el mismo constructor que la
// lista, y se enseña `uniqueCerts` (vista por certificado) o `devices`
// (vista por equipo). Sumar los valores de una faceta da el total del pill.

import * as React from "react";
import { Box, Chip, Skeleton, Stack, Typography } from "@mui/material";
import { getCdpFacets } from "../../api/cdp";
import { BRAND, TEXT, TEXT_MUTED } from "../../theme/brand";

const FACETS = [
  { id: "source", label: "Source", by: ["source"], value: (r) => r.keys.source, select: (r) => ({ source: r.keys.source }),
    labels: { store: "OS store", "java-store": "Java keystore", listener: "TLS listener", file: "File on disk", nss: "NSS (Firefox)", probe: "Remote (probed)" } },
  { id: "key", label: "Key", by: ["key_algorithm", "key_size_bits"], value: (r) => `${r.keys.key_algorithm}-${r.keys.key_size_bits ?? "?"}`,
    select: (r) => ({ keyAlgorithm: r.keys.key_algorithm, keySizeBits: r.keys.key_size_bits }) },
  { id: "family", label: "Family", by: ["key_family"], value: (r) => r.keys.key_family, select: (r) => ({ family: r.keys.key_family }),
    labels: { quantum_broken: "Quantum-broken", pq_safe: "Post-quantum", hybrid: "Hybrid", unknown: "Unclassified" } },
  { id: "scope", label: "Scope", by: ["store_scope"], value: (r) => r.keys.store_scope, select: (r) => ({ scope: r.keys.store_scope }),
    labels: { machine: "Machine", user: "User", "system-roots": "System roots", network: "Network (probed)" } }
];

/** El filtro de la lista, entero, tal como lo manda la propia lista. */
export function facetFilterOf(filter) {
  const f = filter || {};
  const out = { lens: "list" };
  for (const k of ["search", "status", "flag", "issuer", "eku", "source", "scope", "storeName", "agentId", "keyAlgorithm", "keySizeBits", "family", "notAfterFrom", "notAfterTo"]) {
    if (f[k] != null && f[k] !== "" && f[k] !== false) out[k] = f[k];
  }
  for (const k of ["hasPrivateKey", "hasFlags", "includeRoots"]) {
    if (f[k] === true) out[k] = true;
  }
  return out;
}

export default function CdpCertFacets({ filter, onSelect, refreshNonce, view = "certs" }) {
  const [data, setData] = React.useState({});
  const [loading, setLoading] = React.useState(false);
  const key = JSON.stringify(facetFilterOf(filter));
  const count = (r) => (view === "devices" ? r.devices : r.uniqueCerts ?? r.certs);

  React.useEffect(() => {
    let alive = true;
    setLoading(true);
    const base = facetFilterOf(filter);
    Promise.all(FACETS.map((f) => getCdpFacets({ by: f.by, ...base, limit: 12 }).catch(() => null)))
      .then((results) => {
        if (!alive) return;
        const next = {};
        FACETS.forEach((f, i) => {
          next[f.id] = results[i]?.rows ?? null;
        });
        setData(next);
      })
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
    // `key` resume el filtro; `filter` cambia de identidad en cada render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, refreshNonce]);

  return (
    <Stack spacing={2} aria-label="Certificate facets">
      {FACETS.map((f) => {
        const rows = data[f.id];
        return (
          <Box key={f.id}>
            <Typography sx={{ fontSize: TEXT.xs, fontWeight: 700, color: TEXT_MUTED, textTransform: "uppercase", letterSpacing: ".06em", mb: 0.5 }}>
              {f.label}
            </Typography>
            {loading && !rows ? <Skeleton height={60} /> : null}
            {rows === null && !loading ? <Typography sx={{ fontSize: TEXT.xs, color: TEXT_MUTED }}>Couldn&apos;t load</Typography> : null}
            {rows && rows.length === 0 ? <Typography sx={{ fontSize: TEXT.xs, color: TEXT_MUTED }}>—</Typography> : null}
            <Stack spacing={0.25}>
              {(rows || [])
                .map((r) => ({ r, n: Number(count(r) ?? 0) }))
                .sort((a, b) => b.n - a.n)
                .map(({ r, n }, i) => {
                  const v = f.value(r);
                  const label = f.labels?.[v] ?? v ?? "—";
                  return (
                    <Box
                      key={`${String(v)}-${i}`}
                      role="button"
                      tabIndex={0}
                      aria-label={`${f.label} ${label}: ${n}`}
                      onClick={() => onSelect(f.select(r))}
                      onKeyDown={(e) => e.key === "Enter" && onSelect(f.select(r))}
                      sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", px: 0.75, py: 0.25, borderRadius: 0.5, cursor: "pointer", "&:hover": { bgcolor: BRAND.rowHover }, "&:focus-visible": { outline: `2px solid ${BRAND.tealText}` } }}
                    >
                      <Typography sx={{ fontSize: TEXT.sm, color: BRAND.dark, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</Typography>
                      <Chip size="small" label={n.toLocaleString()} sx={{ height: 18, fontSize: TEXT.xs, ml: 1, fontVariantNumeric: "tabular-nums" }} />
                    </Box>
                  );
                })}
            </Stack>
          </Box>
        );
      })}
      <Typography sx={{ fontSize: TEXT.xs, color: TEXT_MUTED }}>
        {view === "devices" ? "Devices" : "Certificates"} under the current filters, the same way the table counts them.
      </Typography>
    </Stack>
  );
}
