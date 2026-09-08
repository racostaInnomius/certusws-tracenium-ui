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
import { Alert, Box, Button, Chip, Stack, Typography } from "@mui/material";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import SectionPaper from "../common/SectionPaper";
import CdpConnectorsPanel from "./CdpConnectorsPanel";
import { CbomImportForm } from "./CbomAssetsPanel";
import CdpRemoteProbes from "./CdpRemoteProbes";
import { listCdpAdcsSources } from "../../api/cdp";
import { BRAND, TEXT, TEXT_MUTED } from "../../theme/brand";

const fmt = (n) => (n == null ? "—" : Number(n).toLocaleString());
const when = (iso) => (iso ? new Date(iso).toLocaleString() : "never");

/**
 * Lectores AD CS (repaso 2026-09-06). El conector no es un conector: es
 * el agente instalado EN la CA, leyendo su base con certutil cuando la
 * policy lo pide. Por eso no se da de alta aquí; aquí se VE si funciona:
 * qué CA reportó, hasta qué RequestID llegó, si la cabecera de certutil
 * se reconoció, cuántas filas no se pudieron leer y si la última lectura
 * se cortó por presupuesto. Es lo que permite validar el lector sin
 * entrar al servidor.
 */
function AdcsReaders({ refreshNonce }) {
  const [sources, setSources] = React.useState(null);
  const [error, setError] = React.useState(null);
  React.useEffect(() => {
    let alive = true;
    setError(null);
    listCdpAdcsSources()
      .then((r) => alive && setSources(r?.sources ?? []))
      .catch((e) => {
        if (!alive) return;
        setSources([]);
        setError(e?.message || String(e));
      });
    return () => {
      alive = false;
    };
  }, [refreshNonce]);

  const health = (s) => {
    const cf = s.columnsFound || {};
    if (!cf.requestId || !cf.rawCertificate) return { label: "header not recognized", color: BRAND.alert.error, soft: BRAND.alert.errorSoft, hint: "certutil's CSV header did not match by name or by position: the agent log has the header it received." };
    if (s.parseFailures > 0) return { label: `${fmt(s.parseFailures)} row(s) unreadable`, color: BRAND.alert.high, soft: BRAND.alert.highSoft, hint: "Rows whose certificate could not be decoded (denied/pending requests don't count)." };
    if (s.truncated) return { label: "catching up", color: BRAND.alert.warningText, soft: BRAND.alert.warningSoft, hint: "The last read hit the per-scan cap; the next scans continue from the last RequestID." };
    return { label: "healthy", color: BRAND.alert.success, soft: BRAND.alert.successSoft, hint: "Header recognized, every row decoded, nothing left behind." };
  };

  return (
    <Box sx={{ mt: 2.5, pt: 2, borderTop: `1px dashed ${BRAND.border}` }}>
      <Typography sx={{ fontWeight: 700, fontSize: TEXT.md, color: BRAND.dark, mb: 0.5 }}>AD CS readers</Typography>
      <Typography sx={{ fontSize: TEXT.sm, color: BRAND.dark, opacity: 0.8, mb: 1 }}>
        A Windows Certification Authority is read by the Tracenium agent installed <strong>on the CA server itself</strong>: it
        runs <code>certutil -view</code> locally, read-only, in increments by RequestID, and reports what the CA issued and
        with which template. Name the CA servers in Agent Settings → Crypto Discovery → <em>AD CS: certification authority
        servers</em>; only those hostnames read, every other device ignores it. Nothing to configure here; this is where
        you see whether it works.
      </Typography>
      {error ? <Alert severity="error" sx={{ mb: 1 }}>{error}</Alert> : null}
      {sources && sources.length === 0 && !error ? (
        <Alert severity="info">
          No CA has reported yet. After enabling the reader, the first read happens on the CA&apos;s next Crypto Discovery scan;
          a row appears here with the header it saw and how far it got.
        </Alert>
      ) : null}
      <Stack spacing={1}>
        {(sources ?? []).map((s) => {
          const h = health(s);
          return (
            <Box key={s.sourceName} sx={{ border: `1px solid ${BRAND.border}`, borderRadius: 1.5, p: 1.25 }}>
              <Stack direction="row" spacing={1} alignItems="center" sx={{ flexWrap: "wrap", rowGap: 0.5 }}>
                <Typography sx={{ fontWeight: 700, fontSize: TEXT.md }}>{s.caName}</Typography>
                <Typography sx={{ fontSize: TEXT.xs, color: TEXT_MUTED }}>{s.host || s.agentId}</Typography>
                <Chip size="small" label={h.label} title={h.hint} sx={{ height: 20, fontSize: TEXT.xs, bgcolor: h.soft, color: h.color, fontWeight: 700 }} />
                {s.columnsFound?.positional ? <Chip size="small" variant="outlined" label="columns by position" title="The header was localized; columns were read in the order the agent requested them." sx={{ height: 20, fontSize: TEXT.xs }} /> : null}
              </Stack>
              <Typography sx={{ fontSize: TEXT.xs, color: TEXT_MUTED, mt: 0.5 }}>
                Last read {when(s.lastSeen)} · up to request #{fmt(s.lastRequestId)} · {fmt(s.issuedTotal)} issuance(s) read in total ·{" "}
                {fmt(s.assetsValid)} valid, {fmt(s.assets - s.assetsValid)} expired, {fmt(s.assetsRevoked)} revoked
              </Typography>
            </Box>
          );
        })}
      </Stack>
    </Box>
  );
}

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
        <AdcsReaders refreshNonce={refreshNonce} />
        <Box sx={{ mt: 2.5, pt: 2, borderTop: `1px dashed ${BRAND.border}` }}>
          <Typography sx={{ fontWeight: 700, fontSize: TEXT.md, color: BRAND.dark, mb: 0.5 }}>Import a CBOM</Typography>
          <CbomImportForm onImported={onSourcesChanged} />
        </Box>
      </SectionPaper>

      <SectionPaper>
        <CdpRemoteProbes refreshNonce={refreshNonce} />
      </SectionPaper>

      <SectionPaper>
        <SectionTitle sub="What the agents scan on each device — interval, Java keystore and certificate file paths, TLS listener ports, who runs the remote probes and the AD CS reader — is part of the agent policy, so it is set per policy and per device group. The approval matrix — which crypto discovery capabilities need a second person’s sign-off — is set there too: it is a permissions change, for administrators.">
          Scan policy (agents)
        </SectionTitle>
        <Button component="a" href="?page=policies" size="small" variant="outlined" endIcon={<OpenInNewIcon fontSize="small" />}>
          Open Policies → Crypto Discovery
        </Button>
      </SectionPaper>
    </Stack>
  );
}
