// src/components/software-delivery/UninstallTab.jsx
//
// ADR-0019 F2 — la pestaña «Uninstall» de Software Delivery.
//
// ⚠️ ES UNA PESTAÑA Y NO UN BOTÓN, porque ya se intentó lo otro y no se
// encontró. El criterio del owner, dado tras el mismo problema en Asset
// Management: «todo lo nuevo construido amerita un tab y vista propia».
//
// El despliegue que sale de aquí es un despliegue normal de SDP: aparece en
// «Deployments», se sigue ahí, se cancela ahí y hereda la ventana de
// mantenimiento y el guardia de equipos dados de baja. Esta pestaña es la
// PUERTA, no un módulo paralelo.

import * as React from "react";
import { Alert, Box, Typography } from "@mui/material";
import SectionPaper from "../common/SectionPaper";
import { BRAND, TEXT } from "../../theme/brand";
import UninstallFlow from "./UninstallFlow";

export default function UninstallTab({ canManage, notify, refreshNonce = 0, onDispatched }) {
  if (!canManage) {
    // Se dice por qué, en vez de enseñar una pestaña vacía. Un panel en blanco
    // se lee como «está roto»; esto se lee como «te falta permiso».
    return (
      <SectionPaper variant="panel" sx={{ p: 3 }}>
        <Alert severity="info">
          Uninstalling software requires the Software Delivery permission. Ask a
          tenant administrator for it.
        </Alert>
      </SectionPaper>
    );
  }

  return (
    <SectionPaper variant="panel" sx={{ p: 3 }}>
      <Box sx={{ mb: 2.5 }}>
        <Typography sx={{ fontSize: TEXT.md, color: BRAND.gray }}>
          Remove software that inventory found on the fleet and that should not
          be there — even if it was never published as a catalog package.
        </Typography>
      </Box>
      <UninstallFlow notify={notify} refreshNonce={refreshNonce} onDone={onDispatched} />
    </SectionPaper>
  );
}
