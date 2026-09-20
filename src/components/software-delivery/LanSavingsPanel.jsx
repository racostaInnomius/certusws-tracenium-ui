// src/components/software-delivery/LanSavingsPanel.jsx
//
// Cuánto ancho de banda de WAN ahorran los puntos de distribución.
//
// ── Qué cambió y por qué (20-sep) ────────────────────────────────────────
//
// Este panel enseñaba DOS PORCENTAJES —«84% de los updates de agente», «100%
// de las instalaciones»— cada uno con su denominador. Era honesto y no
// contestaba la pregunta del cliente. Decisión del owner: por dónde pasó cada
// versión del agente no le aporta nada; lo que compra es el ahorro de línea.
//
// Un porcentaje no es una magnitud: el 84% de una cifra que nadie enseña no
// dice si se ahorraron 2 GB o 200. Ahora el titular son los BYTES, y los
// porcentajes quedan donde deben — como el detalle que explica el titular.
//
// ── Qué es exacto y qué es hipótesis ─────────────────────────────────────
//
// Los bytes son reales: tamaño del fichero que se descargó × descargas
// servidas (el tamaño del software sale del snapshot del despliegue; el del
// agente, del binario publicado).
//
// ⚠️ LA HIPÓTESIS ES EL CONTRAFACTUAL: sin punto de distribución, cada una de
// esas descargas habría cruzado la WAN una vez. Es lo que hace el agente
// cuando no hay DP, pero sigue siendo una hipótesis y la pantalla lo dice con
// un «≈» y una frase. Un número redondo sin esa nota se lee como una factura.
//
// ⚠️ SIN DP CONFIGURADO NO SE ENSEÑA UN CERO. Se enseña lo que SÍ cruzó la
// WAN, que es exactamente lo que un DP habría evitado: el mismo dato, leído
// como oportunidad en vez de como logro.

import * as React from "react";
import { Box, Stack, Tooltip, Typography } from "@mui/material";

import SectionPaper from "../common/SectionPaper";
import { BRAND, ROLE, TEXT } from "../../theme/brand";
import { formatBytes } from "../../utils/format";

/**
 * Lo que la tarjeta necesita decir, a partir de la respuesta del backend.
 *
 * Puro: el porcentaje y la elección del titular son donde se puede mentir sin
 * dar error.
 */
export function savingsSummary(savings) {
  const lan = savings?.lan ?? { downloads: 0, bytes: 0 };
  const wan = savings?.wan ?? { downloads: 0, bytes: 0 };
  const downloads = Number(lan.downloads ?? 0) + Number(wan.downloads ?? 0);
  const bytes = Number(lan.bytes ?? 0) + Number(wan.bytes ?? 0);
  const hasDp = Number(savings?.activeDistributionPoints ?? 0) > 0;

  return {
    hasDp,
    downloads,
    lanDownloads: Number(lan.downloads ?? 0),
    wanDownloads: Number(wan.downloads ?? 0),
    savedBytes: Number(lan.bytes ?? 0),
    wanBytes: Number(wan.bytes ?? 0),
    // Sobre BYTES, no sobre descargas: un .msi de 165 MB y un parche de 2 MB
    // no son la misma descarga, y el panel habla de ancho de banda.
    lanShare: bytes > 0 ? Math.round((Number(lan.bytes ?? 0) / bytes) * 100) : 0,
    unpriced: Number(savings?.unpricedDownloads ?? 0),
    windowDays: Number(savings?.windowDays ?? 0),
  };
}

export default function LanSavingsPanel({ loading, savings, failed }) {
  const s = React.useMemo(() => savingsSummary(savings), [savings]);

  if (failed) {
    // ⚠️ Un panel que se esfuma es indistinguible de uno sin datos: ya nos pasó
    // con este mismo, que salió a producción enseñando 9 eventos mientras el DP
    // servía cuatrocientas descargas.
    return (
      <SectionPaper variant="card" sx={{ p: 2 }}>
        <Typography sx={{ fontWeight: 800, color: BRAND.dark, fontSize: TEXT.base }}>
          Bandwidth saved by distribution points
        </Typography>
        <Typography sx={{ fontSize: TEXT.md, color: BRAND.alert.warningText, mt: 0.5 }}>
          Couldn’t load download sources. The rest of the page is unaffected.
        </Typography>
      </SectionPaper>
    );
  }

  if (loading) {
    return (
      <SectionPaper variant="card" sx={{ p: 2 }}>
        <Typography sx={{ fontSize: TEXT.md, color: BRAND.gray }}>Loading…</Typography>
      </SectionPaper>
    );
  }

  if (s.downloads === 0) {
    return (
      <SectionPaper variant="card" sx={{ p: 2 }}>
        <Typography sx={{ fontWeight: 800, color: BRAND.dark, fontSize: TEXT.base }}>
          Bandwidth saved by distribution points
        </Typography>
        <Typography sx={{ fontSize: TEXT.md, color: BRAND.gray, mt: 0.5 }}>
          No downloads in this window, so there is nothing to compare yet.
        </Typography>
      </SectionPaper>
    );
  }

  return (
    <SectionPaper variant="card" sx={{ p: 2 }}>
      <Stack direction="row" justifyContent="space-between" alignItems="flex-start" flexWrap="wrap" gap={1}>
        <Box>
          <Typography sx={{ fontWeight: 800, color: BRAND.dark, fontSize: TEXT.base }}>
            {s.hasDp ? "Bandwidth saved by distribution points" : "Bandwidth that crossed the WAN"}
          </Typography>
          <Typography sx={{ fontSize: TEXT.sm, color: BRAND.gray }}>
            Agent updates and software installs · last {s.windowDays} days
          </Typography>
        </Box>
        <Box sx={{ textAlign: "right" }}>
          <Typography
            sx={{
              fontSize: 28,
              fontWeight: 800,
              lineHeight: 1.1,
              color: s.hasDp ? BRAND.tealText : BRAND.alert.warningText,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {s.hasDp ? `≈ ${formatBytes(s.savedBytes)}` : formatBytes(s.wanBytes)}
          </Typography>
          <Typography sx={{ fontSize: TEXT.sm, color: BRAND.gray }}>
            {s.hasDp ? "not downloaded over the WAN" : "downloaded from the internet"}
          </Typography>
        </Box>
      </Stack>

      {/* Una barra, no dos: el reparto es el detalle del titular, no otro KPI. */}
      <Box sx={{ display: "flex", height: 16, borderRadius: 0.5, overflow: "hidden", mt: 1.5, bgcolor: BRAND.surfaceMuted }}>
        <Tooltip title={`From a distribution point: ${s.lanDownloads} download${s.lanDownloads === 1 ? "" : "s"}`}>
          <Box sx={{ width: `${s.lanShare}%`, bgcolor: ROLE.neutral }} />
        </Tooltip>
        <Tooltip title={`From the internet: ${s.wanDownloads} download${s.wanDownloads === 1 ? "" : "s"}`}>
          <Box sx={{ width: `${100 - s.lanShare}%`, bgcolor: BRAND.gray }} />
        </Tooltip>
      </Box>

      <Stack direction="row" spacing={2} sx={{ mt: 0.75, flexWrap: "wrap", rowGap: 0.25 }}>
        <Typography sx={{ fontSize: TEXT.sm, color: BRAND.gray }}>
          {s.lanShare}% of the bytes came from the LAN
        </Typography>
        <Typography sx={{ fontSize: TEXT.sm, color: BRAND.gray }}>
          {s.lanDownloads} of {s.downloads} downloads
        </Typography>
        {/* Lo que no se pudo valorar se dice: un total preciso construido sobre
            huecos silenciosos es peor que un total con su nota. */}
        {s.unpriced > 0 ? (
          <Tooltip title="Their package is no longer published, or the device is not in the inventory, so their size is unknown.">
            <Typography sx={{ fontSize: TEXT.sm, color: BRAND.gray }}>
              {s.unpriced} not counted
            </Typography>
          </Tooltip>
        ) : null}
      </Stack>

      <Typography sx={{ fontSize: TEXT.sm, color: BRAND.gray, mt: 1 }}>
        {s.hasDp
          ? "Estimated: every LAN download is one trip over the WAN that didn’t happen."
          : "With a distribution point in each site, most of this would stay on the LAN."}
      </Typography>
    </SectionPaper>
  );
}
