// src/components/software-delivery/PackageProvenanceDrawer.jsx
//
// De dónde salió este paquete y qué se comprobó de él.
//
// POR QUÉ ESTO NO ES UNA PESTAÑA (fase 3b)
//
// El veredicto de firma y los datos extraídos del binario vivían dentro de la
// pestaña "AI Intake", como si fueran una sección de la página. No lo son: son
// la PROCEDENCIA de un paquete concreto, y la pregunta que contestan —"¿de
// dónde salió esto y quién lo verificó?"— se hace mirando una fila del
// catálogo, no navegando a otro sitio.
//
// ⚠️ SE ABRE PARA TODAS LAS FILAS, TAMBIÉN LAS QUE NO TIENEN PROCEDENCIA.
//
// Un paquete creado desde una URL no pasó por el pipeline: no hay veredicto,
// ni firma, ni datos extraídos, porque un operador tecleó esos valores. Ese
// vacío es la respuesta, y decirlo es más útil que esconder el botón — el chip
// "Unverified" de la fila avisa, y esto explica exactamente qué significa.

import * as React from "react";
import { Box, Chip, Drawer, IconButton, Stack, Typography } from "@mui/material";
import CloseOutlinedIcon from "@mui/icons-material/CloseOutlined";
import AutoAwesomeOutlinedIcon from "@mui/icons-material/AutoAwesomeOutlined";

import { BRAND, TEXT } from "../../theme/brand";
import IntakeVerdictBanner from "./IntakeVerdictBanner";
import IntakeProposalBanner from "./IntakeProposalBanner";

function Section({ title, children }) {
  return (
    <Box sx={{ mt: 3 }}>
      <Typography sx={{ fontSize: TEXT.sm, fontWeight: 800, color: BRAND.gray, textTransform: "uppercase", letterSpacing: 0.4 }}>
        {title}
      </Typography>
      <Box sx={{ mt: 1 }}>{children}</Box>
    </Box>
  );
}

/** Un dato leído del binario. `null` se dice, no se esconde. */
function Fact({ label, value }) {
  const empty = value === null || value === undefined || value === "";
  return (
    <Stack direction="row" spacing={1} sx={{ py: 0.5, alignItems: "baseline" }}>
      <Typography sx={{ fontSize: TEXT.sm, color: BRAND.gray, minWidth: 132, flexShrink: 0 }}>
        {label}
      </Typography>
      <Typography
        sx={{
          fontSize: TEXT.sm,
          color: empty ? BRAND.gray : BRAND.dark,
          fontStyle: empty ? "italic" : "normal",
          fontFamily: label === "SHA-256" || label === "Product code" ? "monospace" : "inherit",
          wordBreak: "break-all",
        }}
      >
        {/* ⚠️ "not extracted" y "" no son lo mismo: el primero dice que el
            pipeline miró y no encontró, que es información sobre el binario. */}
        {empty ? "not extracted" : String(value)}
      </Typography>
    </Stack>
  );
}

export default function PackageProvenanceDrawer({ open, onClose, pkg, intake }) {
  const facts = intake?.facts || {};
  const signals = Array.isArray(intake?.detectionSignals) ? intake.detectionSignals : [];

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      PaperProps={{ sx: { width: { xs: "100%", md: 620 }, p: 3 } }}
    >
      <Stack direction="row" spacing={2} sx={{ alignItems: "flex-start" }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontSize: TEXT.lg, fontWeight: 800, color: BRAND.dark }}>
            Provenance
          </Typography>
          <Typography sx={{ fontSize: TEXT.md, color: BRAND.gray, mt: 0.5 }}>
            {pkg?.name}
            {pkg?.version ? ` · ${pkg.version}` : ""}
          </Typography>
        </Box>
        <IconButton onClick={onClose} aria-label="Close provenance" size="small">
          <CloseOutlinedIcon fontSize="small" />
        </IconButton>
      </Stack>

      {!intake ? (
        // ⚠️ La ausencia ES la respuesta. Este paquete entró por la vía de URL:
        // se validó la FORMA de los campos (plataforma en el enum, 64 hex) y
        // nada más. Nadie comprobó que el archivo esté firmado, que el hash
        // corresponda a lo que sirve esa URL, ni que los argumentos funcionen.
        <Box
          sx={{
            mt: 3,
            p: 2,
            borderRadius: 1,
            bgcolor: BRAND.darkSoft,
            border: `1px solid ${BRAND.border}`,
          }}
        >
          <Typography sx={{ fontSize: TEXT.md, fontWeight: 700, color: BRAND.dark }}>
            No analysis on record
          </Typography>
          <Typography sx={{ fontSize: TEXT.sm, color: BRAND.gray, mt: 0.5 }}>
            This package was added from a URL, so an operator supplied its hash and
            install arguments by hand. Nothing verified the file is signed, that the
            hash matches what the URL serves, or that the arguments work. Upload the
            installer instead to get a verified record.
          </Typography>
        </Box>
      ) : (
        <>
          {/* Sin encabezado propio: IntakeVerdictBanner ya se titula
              "Security verdict". Ponerle una sección encima repetía la misma
              palabra dos veces en dos tipografías distintas. */}
          <Box sx={{ mt: 3 }}>
            <IntakeVerdictBanner intake={intake} />
          </Box>

          <Section title="Proposed install configuration">
            {intake.proposedConfig ? (
              <IntakeProposalBanner intake={intake} />
            ) : (
              // ⚠️ ESTE ESTADO ERA INVISIBLE Y ES EL 100% DE PRODUCCIÓN HOY.
              //
              // `IntakeProposalBanner` devuelve null sin propuesta, así que un
              // panel que sólo lo montara no diría nada — y el motivo del fallo
              // vive en `ai_error`, que hasta ahora sólo se veía consultando la
              // base de datos. Los cuatro intakes que existen en producción
              // fallaron así, y el operador acabó tecleando los argumentos sin
              // saber por qué no se los habían propuesto.
              <Box
                sx={{
                  p: 1.5,
                  borderRadius: 1,
                  bgcolor: BRAND.alert?.warningSoft,
                  border: `1px solid ${BRAND.border}`,
                }}
              >
                <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                  <AutoAwesomeOutlinedIcon fontSize="small" sx={{ color: BRAND.alert?.warningText }} />
                  <Typography sx={{ fontSize: TEXT.md, fontWeight: 700, color: BRAND.dark }}>
                    No configuration was proposed
                  </Typography>
                </Stack>
                <Typography sx={{ fontSize: TEXT.sm, color: BRAND.dark, mt: 0.5 }}>
                  The file was verified, but the analysis step did not return a
                  configuration — the install arguments on this package were entered
                  by hand.
                </Typography>
                {intake.aiError ? (
                  <Typography
                    sx={{ fontSize: TEXT.xs, color: BRAND.gray, mt: 1, fontFamily: "monospace", wordBreak: "break-word" }}
                  >
                    {intake.aiError}
                  </Typography>
                ) : null}
              </Box>
            )}
          </Section>

          <Section title="Read from the binary">
            <Fact label="File" value={intake.filename} />
            <Fact label="SHA-256" value={intake.sha256} />
            <Fact
              label="Size"
              value={
                intake.sizeBytes == null
                  ? null
                  : `${(Number(intake.sizeBytes) / (1024 * 1024)).toFixed(1)} MiB`
              }
            />
            <Fact label="Installer engine" value={facts.installerType} />
            <Fact label="Product code" value={facts.productCode} />
            <Fact label="Name" value={facts.name} />
            <Fact label="Vendor" value={facts.vendor} />
            <Fact label="Version" value={facts.version} />
            <Fact label="Platform" value={facts.platform} />
            <Fact label="Format" value={facts.format} />
            <Fact label="Detection hint" value={facts.detectionHint} />
          </Section>

          {signals.length ? (
            <Section title="Detection signals">
              <Stack direction="row" spacing={0.5} sx={{ flexWrap: "wrap", gap: 0.5 }}>
                {signals.map((s) => (
                  <Chip
                    key={s}
                    size="small"
                    label={s}
                    sx={{ height: 22, fontSize: TEXT.xs, bgcolor: BRAND.darkSoft, color: BRAND.dark }}
                  />
                ))}
              </Stack>
            </Section>
          ) : null}
        </>
      )}
    </Drawer>
  );
}
