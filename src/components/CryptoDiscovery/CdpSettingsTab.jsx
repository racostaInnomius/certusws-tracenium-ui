// src/components/CryptoDiscovery/CdpSettingsTab.jsx
//
// Repaso UI 2026-09-05: todo lo que se CONFIGURA para usar Crypto
// Discovery vive en una pestaña, «Settings». Antes estaba repartido: la
// matriz de aprobación en «Access policy», los conectores y el import de
// CBOM dentro de un panel de lectura en Explore, y el escaneo del agente
// en la página Policies. Un operador que quería «conectar Key Vault» tenía
// que saber que eso se hacía debajo de una tabla de activos.
//
// Regla: aquí se configura, en las otras pestañas se mira. Explore sigue
// enseñando lo que los conectores traen; desde allí un enlace vuelve aquí.

import * as React from "react";
import { Box, Button, Stack, Typography } from "@mui/material";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import SectionPaper from "../common/SectionPaper";
import AccessPolicyMatrix from "../common/AccessPolicyMatrix";
import CdpConnectorsPanel from "./CdpConnectorsPanel";
import { CbomImportForm } from "./CbomAssetsPanel";
import { BRAND, TEXT } from "../../theme/brand";

function SectionTitle({ children, sub }) {
  return (
    <Box sx={{ mb: 1.5 }}>
      <Typography sx={{ fontWeight: 700, fontSize: TEXT.base, color: BRAND.dark }}>{children}</Typography>
      {sub ? <Typography sx={{ fontSize: TEXT.sm, color: BRAND.dark, opacity: 0.8 }}>{sub}</Typography> : null}
    </Box>
  );
}

export default function CdpSettingsTab({ refreshNonce, onSourcesChanged }) {
  return (
    <Stack spacing={2}>
      <SectionPaper>
        <SectionTitle sub="Read-only pulls from vaults, clouds, clusters, CAs and public CT logs, plus CycloneDX files from scanners. What they bring shows up in Explore → Outside your devices and as one system each in the roadmap.">
          Sources outside your devices
        </SectionTitle>
        <CdpConnectorsPanel refreshNonce={refreshNonce} onChanged={onSourcesChanged} embedded />
        <Box sx={{ mt: 2.5, pt: 2, borderTop: `1px dashed ${BRAND.border}` }}>
          <Typography sx={{ fontWeight: 700, fontSize: TEXT.md, color: BRAND.dark, mb: 0.5 }}>Import a CBOM</Typography>
          <CbomImportForm onImported={onSourcesChanged} />
        </Box>
      </SectionPaper>

      <SectionPaper>
        <SectionTitle sub="What the agents scan on each device — interval, Java keystore and certificate file paths, TLS listener ports, remote probe targets and the AD CS reader — is part of the agent policy, so it is set per policy and per device group.">
          Scan policy (agents)
        </SectionTitle>
        <Button component="a" href="?page=policies" size="small" variant="outlined" endIcon={<OpenInNewIcon fontSize="small" />}>
          Open Policies → Crypto Discovery
        </Button>
      </SectionPaper>

      <SectionPaper>
        {/* ADR-0009 phase 2 keeps ONE approval matrix for every privileged
            capability; the cdp.* rows are rendered here so this screen holds
            everything an operator configures for Crypto Discovery. */}
        <AccessPolicyMatrix
          prefix="cdp."
          title="Privileged access policy"
          description="Which crypto discovery capabilities need a second person’s approval before they can be used. Installing a certificate and distrusting a trust anchor both change what a machine will accept."
        />
      </SectionPaper>
    </Stack>
  );
}
