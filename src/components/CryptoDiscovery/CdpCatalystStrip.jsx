// src/components/CryptoDiscovery/CdpCatalystStrip.jsx
//
// «Ya tienes certificados con firma post-cuántica» — y son los nuestros.
//
// ── Por qué existe ───────────────────────────────────────────────────
//
// La identidad mTLS del agente pasó a ser híbrida catalyst (ADR-0015), y
// el propio discovery la encuentra en los almacenes: la hoja del equipo,
// la CA emisora y la raíz. Para un cliente sin proyecto PQC ése es el
// primer certificado post-cuántico que verá en su vida, y la página no lo
// decía en ninguna parte.
//
// ── Por qué NO sale por la vía normal ────────────────────────────────
//
// Un catalyst tiene `key_family = quantum_broken` A PROPÓSITO: lo que
// valida el certificado hoy es su mitad clásica, porque las pilas
// desplegadas ignoran las extensiones catalyst por no críticas. Así que
// filtrar por familia jamás lo encuentra, y el KPI de «quantum-broken»
// lo sigue contando — correctamente. Esta tira es la única puerta, y por
// eso dice en voz alta las dos mitades de la verdad.
//
// ── Qué NO hace ──────────────────────────────────────────────────────
//
// No se pinta si no hay ninguno. Un cartel de logro a cero en el tenant
// de un cliente que aún no ha migrado no es promoción: es ruido.

import * as React from "react";
import { Box, Button, Stack, Typography } from "@mui/material";
import ShieldMoonOutlinedIcon from "@mui/icons-material/ShieldMoonOutlined";
import SectionPaper from "../common/SectionPaper";
import { BRAND, TEXT, TEXT_MUTED } from "../../theme/brand";

const fmt = (n) => (n == null ? "—" : Number(n).toLocaleString());

/**
 * @param {{certificates:number, devices:number, anchors:number}|null} pqAlt
 *        Bloque `pqAltSignature` de GET /api/v1/cdp/dashboard.
 * @param {(filter:object, opts?:object) => void} onDrillDown
 */
export default function CdpCatalystStrip({ pqAlt, onDrillDown }) {
  const certificates = Number(pqAlt?.certificates ?? 0);
  if (!certificates) return null;

  const devices = Number(pqAlt?.devices ?? 0);
  const anchors = Number(pqAlt?.anchors ?? 0);

  return (
    <SectionPaper>
      <Stack direction={{ xs: "column", md: "row" }} spacing={2} sx={{ alignItems: { md: "center" } }}>
        <Box sx={{ minWidth: 260 }}>
          <Stack direction="row" spacing={1} alignItems="center">
            <ShieldMoonOutlinedIcon fontSize="small" sx={{ color: BRAND.tealText }} />
            <Typography sx={{ fontSize: TEXT.xl, fontWeight: 700, color: BRAND.dark }}>
              Post-quantum alternative signature
            </Typography>
          </Stack>
          <Stack direction="row" spacing={1.25} alignItems="baseline" sx={{ mt: 0.5 }}>
            <Typography
              component="span"
              sx={{ fontSize: TEXT["5xl"], fontWeight: 800, lineHeight: 1, color: BRAND.tealText }}
              aria-label="Certificates with a post-quantum alternative signature"
            >
              {fmt(certificates)}
            </Typography>
            <Typography component="span" sx={{ fontSize: TEXT.md, color: TEXT_MUTED }}>
              {certificates === 1 ? "certificate" : "certificates"}
              {devices > 0 ? ` on ${fmt(devices)} ${devices === 1 ? "device" : "devices"}` : ""}
            </Typography>
          </Stack>
        </Box>

        <Box sx={{ flex: 1 }}>
          <Typography sx={{ fontSize: TEXT.sm, color: BRAND.dark }}>
            {anchors > 0
              ? `${fmt(anchors)} of them are trust anchors: the chain your devices already trust is hybrid, not just one leaf.`
              : "These certificates carry an ML-DSA-65 signature alongside their classical one."}
          </Typography>
          {/*
            La letra pequeña NO es un descargo de responsabilidad: es la
            razón por la que estos mismos certificados siguen contando como
            quantum-broken tres centímetros más arriba. Sin ella, los dos
            números de la portada se contradicen.
          */}
          <Typography sx={{ mt: 0.5, fontSize: TEXT.xs, color: TEXT_MUTED }}>
            They still count as quantum-broken above, and that is correct: what validates them today is the classical
            half, because deployed TLS stacks ignore the alternative one. The post-quantum half is what makes them
            verifiable once those stacks catch up.
          </Typography>
        </Box>

        <Button
          size="small"
          variant="outlined"
          onClick={() => onDrillDown?.({ catalyst: true }, { replace: true })}
          sx={{ alignSelf: { xs: "flex-start", md: "center" }, whiteSpace: "nowrap" }}
        >
          See which ones
        </Button>
      </Stack>
    </SectionPaper>
  );
}
