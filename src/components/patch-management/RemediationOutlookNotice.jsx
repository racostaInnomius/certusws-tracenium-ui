// src/components/patch-management/RemediationOutlookNotice.jsx
//
// Lo que de verdad pasa al aplicar un arreglo de COMPLIANCE (patch_remediate),
// encima de sus botones.
//
// ⚠️ 2-oct, validando en prod (T111): este drawer enseñaba ActionOutlookNotice,
// que es el de INSTALAR PARCHES, y para un arreglo decía tres cosas falsas:
//   · «Held until 09:00 PM» — las puertas de ventana y de snapshot
//     (patch-job-gate) son sólo de `patch_install`; un arreglo sale ya.
//   · «11 of 54 devices will be snapshotted in vCenter first» — no se toma
//     ningún snapshot para un arreglo.
//   · «Not reversible. Applying this cannot be undone from here.» — un arreglo
//     guarda el valor que reemplazó y se revierte desde la ficha del equipo
//     (remediation-revert.ts).
// Lanzado por una persona, sale al momento (regla acordada en ADR-0037: la
// ventana es para lo que lanza una automatización). Sin consulta al backend:
// nada de esto depende del equipo elegido.

import * as React from "react";
import { Box, Stack, Typography } from "@mui/material";
import ScheduleOutlinedIcon from "@mui/icons-material/ScheduleOutlined";
import CameraAltOutlinedIcon from "@mui/icons-material/CameraAltOutlined";
import UndoOutlinedIcon from "@mui/icons-material/UndoOutlined";
import { BRAND, TEXT } from "../../theme/brand";

function Line({ icon, children, tone }) {
  return (
    <Stack direction="row" spacing={1} alignItems="flex-start">
      <Box sx={{ color: tone ?? BRAND.gray, display: "flex", pt: "1px" }}>{icon}</Box>
      <Typography sx={{ fontSize: TEXT.sm, color: tone ?? BRAND.dark }}>{children}</Typography>
    </Stack>
  );
}

export default function RemediationOutlookNotice() {
  return (
    <Box
      data-testid="remediation-outlook"
      sx={{
        border: `1px solid ${BRAND.border}`,
        borderLeft: `3px solid ${BRAND.teal}`,
        borderRadius: 1,
        bgcolor: BRAND.surfaceMuted,
        p: 1.5,
        display: "grid",
        gap: 0.75,
      }}
    >
      <Line icon={<ScheduleOutlinedIcon fontSize="small" />}>
        Goes out now: each device gets it as soon as it is online. Fixes you apply from here are not held for a maintenance window.
      </Line>
      <Line icon={<CameraAltOutlinedIcon fontSize="small" />}>No vCenter snapshot is taken for a configuration fix.</Line>
      <Line icon={<UndoOutlinedIcon fontSize="small" />} tone={BRAND.tealText}>
        Can be undone: each fix records the value it replaced, and «Fixes applied from Tracenium» in the device detail reverts it.
      </Line>
    </Box>
  );
}
