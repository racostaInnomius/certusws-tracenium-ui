// src/components/CryptoDiscovery/CdpSettingsTab.jsx
//
// Repaso UI 2026-09-05: todo lo que se CONFIGURA para usar Crypto
// Discovery vive en una pestaña, «Settings». Antes estaba repartido: la
// matriz de aprobación en «Access policy», los conectores y el import de
// CBOM dentro de un panel de lectura en Explore, y el escaneo del agente
// en la página Policies. Un operador que quería «conectar Key Vault» tenía
// que saber que eso se hacía debajo de una tabla de activos.
//
// Repaso 2026-09-14: la pestaña se ordena por los MISMOS sectores que el
// sunburst del Dashboard (On-prem devices · Windows CA · Infra · Cloud ·
// External key sources). Arriba, un mapa dice de cada fuente si ya
// reporta, si está configurada y muda, o si no está conectada; debajo,
// una sección por sector con lo que se configura ahí. Así «¿por qué ese
// gajo está vacío?» y «¿dónde lo conecto?» se contestan en el mismo sitio.
//
// Regla: aquí se configura, en las otras pestañas se mira. Explore sigue
// enseñando lo que los conectores traen; desde allí un enlace vuelve aquí.

import * as React from "react";
import { Alert, Box, Button, Chip, Stack, Typography } from "@mui/material";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import SectionPaper from "../common/SectionPaper";
import CdpConnectorsPanel from "./CdpConnectorsPanel";
import CdpPublicDomains from "./CdpPublicDomains";
import { CbomImportForm } from "./CbomAssetsPanel";
import CdpRemoteProbes, { envelopeOf } from "./CdpRemoteProbes";
import CdpSourcesMap from "./CdpSourcesMap";
import { BASES } from "./cdpSunburst";
import { CONNECTOR_KINDS_BY_BASE, sectorAnchor } from "./cdpSources";
import { getCdpFacets, getCryptoAssetsSummary, listCdpAdcsSources, listCdpConnectors } from "../../api/cdp";
import { getTenantPolicy } from "../../api/policies";
import { useEffectiveTenantId } from "../../hooks/useEffectiveTenantId";
import { BRAND, TEXT, TEXT_MUTED } from "../../theme/brand";

const fmt = (n) => (n == null ? "—" : Number(n).toLocaleString());
const when = (iso) => (iso ? new Date(iso).toLocaleString() : "never");
const baseOf = (key) => BASES.find((b) => b.key === key);

/**
 * Lo que la pestaña necesita saber de las fuentes, cargado UNA vez y
 * compartido por el mapa y por las secciones: conectores, lectores AD CS,
 * facetas por origen (lo que el agente recoge), resumen de activos de fuera
 * (SSH, CBOM) y el bloque `cdp` de la policy (sondas, CA). Cada carga falla
 * por separado: un endpoint caído deja su parte vacía y se dice.
 */
function useCdpSources(refreshNonce, tenantId) {
  const [state, setState] = React.useState({ loading: true, connectors: null, adcs: null, facets: [], assets: null, cdp: {}, errors: [] });
  const [nonce, setNonce] = React.useState(0);
  React.useEffect(() => {
    let alive = true;
    setState((s) => ({ ...s, loading: true }));
    const errors = [];
    const soft = (label, p, fallback) =>
      p.catch((e) => {
        errors.push(`${label}: ${e?.message || String(e)}`);
        return fallback;
      });
    Promise.all([
      soft("connectors", listCdpConnectors().then((r) => r ?? { connectors: [], secretsConfigured: false }), { connectors: [], secretsConfigured: false }),
      soft("AD CS readers", listCdpAdcsSources().then((r) => r?.sources ?? []), []),
      soft("facets", getCdpFacets({ by: ["source"], limit: 50 }).then((r) => r?.rows ?? []), []),
      soft("assets", getCryptoAssetsSummary(), null),
      soft("policy", tenantId ? getTenantPolicy(tenantId).then((r) => envelopeOf(r).cdp) : Promise.resolve({}), {})
    ]).then(([connectors, adcs, facets, assets, cdp]) => {
      if (!alive) return;
      setState({ loading: false, connectors, adcs, facets, assets, cdp, errors });
    });
    return () => {
      alive = false;
    };
  }, [refreshNonce, nonce, tenantId]);
  return { ...state, reload: () => setNonce((n) => n + 1) };
}

/**
 * Lectores AD CS (repaso 2026-09-06). El conector no es un conector: es
 * el agente instalado EN la CA, leyendo su base con certutil cuando la
 * policy lo pide. Por eso no se da de alta aquí; aquí se VE si funciona:
 * qué CA reportó, hasta qué RequestID llegó, si la cabecera de certutil
 * se reconoció, cuántas filas no se pudieron leer y si la última lectura
 * se cortó por presupuesto. Es lo que permite validar el lector sin
 * entrar al servidor.
 */
function AdcsReaders({ sources, caHosts }) {
  const health = (s) => {
    const cf = s.columnsFound || {};
    if (!cf.requestId || !cf.rawCertificate) return { label: "header not recognized", color: BRAND.alert.errorText, soft: BRAND.alert.errorSoft, hint: "certutil's CSV header did not match by name or by position: the agent log has the header it received." };
    if (s.parseFailures > 0) return { label: `${fmt(s.parseFailures)} row(s) unreadable`, color: BRAND.alert.high, soft: BRAND.alert.highSoft, hint: "Rows whose certificate could not be decoded (denied/pending requests don't count)." };
    if (s.truncated) return { label: "catching up", color: BRAND.alert.warningText, soft: BRAND.alert.warningSoft, hint: "The last read hit the per-scan cap; the next scans continue from the last RequestID." };
    return { label: "healthy", color: BRAND.alert.successText, soft: BRAND.alert.successSoft, hint: "Header recognized, every row decoded, nothing left behind." };
  };

  return (
    <Box>
      <Typography sx={{ fontSize: TEXT.sm, color: BRAND.dark, opacity: 0.8, mb: 1 }}>
        A Windows Certification Authority is read by the Tracenium agent installed <strong>on the CA server itself</strong>: it
        runs <code>certutil -view</code> locally, read-only, in increments by RequestID, and reports what the CA issued and
        with which template. Name the CA servers in Agent Settings → Crypto Discovery → <em>AD CS: certification authority
        servers</em>; only those hostnames read, every other device ignores it. Nothing else to configure here; this is
        where you see whether it works.
      </Typography>
      {sources && sources.length === 0 ? (
        <Alert severity="info">
          {caHosts.length > 0
            ? `No CA has reported yet. ${caHosts.join(", ")} ${caHosts.length === 1 ? "is" : "are"} named in the agent policy; the first read happens on the CA's next Crypto Discovery scan, and a row appears here with the header it saw and how far it got.`
            : "No CA server is named yet. Add the CA hostnames in Agent Settings → Crypto Discovery; the first read happens on the CA's next Crypto Discovery scan."}
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

/** Una sección por sector, con el mismo id que usa el mapa para bajar hasta ella. */
function Sector({ baseKey, sub, children }) {
  const b = baseOf(baseKey);
  return (
    <SectionPaper id={sectorAnchor(baseKey)} sx={{ scrollMarginTop: 16 }}>
      <SectionTitle sub={sub}>{b?.label ?? baseKey}</SectionTitle>
      {children}
    </SectionPaper>
  );
}

const Divider = () => <Box sx={{ mt: 2.5, pt: 2, borderTop: `1px dashed ${BRAND.border}` }} />;

export default function CdpSettingsTab({ refreshNonce, onSourcesChanged }) {
  const tenantId = useEffectiveTenantId();
  const src = useCdpSources(refreshNonce, tenantId);
  const caHosts = Array.isArray(src.cdp?.adcs?.hosts) ? src.cdp.adcs.hosts : [];
  const changed = () => {
    onSourcesChanged?.();
    src.reload();
  };
  const connectorsState = src.connectors ?? undefined;
  const mapData = React.useMemo(
    () => ({ facets: src.facets, assets: src.assets, connectors: src.connectors?.connectors ?? [], adcs: src.adcs ?? [], cdp: src.cdp }),
    [src.facets, src.assets, src.connectors, src.adcs, src.cdp]
  );

  return (
    <Stack spacing={2}>
      <SectionPaper>
        <SectionTitle sub="The same sectors as the Dashboard sunburst, inside out. Each source is reporting, configured but silent, failing, or not connected; click one to jump to where it is set up.">
          Sources
        </SectionTitle>
        {src.errors.length > 0 ? <Alert severity="warning" sx={{ mb: 1 }}>Some of this could not be loaded: {src.errors.join(" · ")}</Alert> : null}
        <CdpSourcesMap data={mapData} loading={src.loading} />
      </SectionPaper>

      <Sector baseKey="onprem" sub="What the agents collect on every managed endpoint: certificate stores, Java keystores, certificate files, NSS databases, the TLS services each device serves and its SSH host keys. It is part of the agent policy — interval, paths, listener ports — so it is set per policy and per device group. The approval matrix (which crypto discovery capabilities need a second person’s sign-off) lives there too: it is a permissions change, for administrators.">
        <Button component="a" href="?page=policies" size="small" variant="outlined" endIcon={<OpenInNewIcon fontSize="small" />}>
          Open Policies → Crypto Discovery
        </Button>
        <Divider />
        <Typography sx={{ fontWeight: 700, fontSize: TEXT.md, color: BRAND.dark, mb: 0.5 }}>Import a CBOM</Typography>
        <Typography sx={{ fontSize: TEXT.sm, color: BRAND.dark, opacity: 0.8, mb: 1 }}>
          Crypto assets found by another scanner, as a CycloneDX file. They join the on-prem inventory under the source name you give.
        </Typography>
        <CbomImportForm onImported={changed} />
      </Sector>

      <Sector baseKey="adcs" sub="What the Windows Certification Authority issued, read by the agent on the CA server. Kept apart from what the agents find on devices: one is an inventory, the other is the CA's issuance record.">
        <AdcsReaders sources={src.adcs} caHosts={caHosts} />
      </Sector>

      <Sector baseKey="infra" sub="Virtual and network infrastructure without an agent: services probed remotely, Kubernetes clusters and, when available, vCenter.">
        <CdpRemoteProbes refreshNonce={refreshNonce} />
        <Divider />
        <CdpConnectorsPanel
          embedded
          kinds={CONNECTOR_KINDS_BY_BASE.infra}
          state={connectorsState}
          reload={src.reload}
          refreshNonce={refreshNonce}
          onChanged={changed}
          title="Kubernetes clusters"
          intro="Refreshed daily. Reads kubernetes.io/tls secrets, cert-manager Certificate objects and which Ingress uses each certificate. A certificate that also lives on a device is matched by fingerprint."
        />
        <Divider />
        <Typography sx={{ fontWeight: 700, fontSize: TEXT.md, color: BRAND.dark, mb: 0.5 }}>vCenter / ESXi</Typography>
        <Typography sx={{ fontSize: TEXT.sm, color: BRAND.dark, opacity: 0.8 }}>
          Not available yet. The Patch Management gateway already holds a vCenter credential; reading the vCenter machine
          certificate, the trusted roots it distributes and each ESXi host certificate through it is planned. Meanwhile,
          add vCenter and each ESXi host as remote probe targets above (<code>host:443</code>): the certificate they serve,
          and the key exchange they negotiate, show up under Remote probes and in the Infra sector.
        </Typography>
      </Sector>

      <Sector baseKey="cloud" sub="What is exposed on the internet or lives in a cloud provider: your public domains (from Certificate Transparency logs, no credentials), AWS Certificate Manager and Google Cloud.">
        {src.connectors ? <CdpPublicDomains connectors={src.connectors.connectors ?? []} onChanged={changed} /> : null}
        <Divider />
        <CdpConnectorsPanel
          embedded
          kinds={CONNECTOR_KINDS_BY_BASE.cloud.filter((k) => k !== "ct")}
          state={connectorsState}
          reload={src.reload}
          refreshNonce={refreshNonce}
          onChanged={changed}
          title="AWS Certificate Manager and Google Cloud"
          intro="Refreshed daily. Each reports its certificates, who uses them and, where the provider knows it, what it will issue next. A certificate that also lives on a device is matched by fingerprint."
        />
      </Sector>

      <Sector baseKey="external" sub="Vaults that hold or issue keys for your systems: Azure Key Vault and HashiCorp Vault PKI. Read-only; the keys stay where they are.">
        <CdpConnectorsPanel
          embedded
          kinds={CONNECTOR_KINDS_BY_BASE.external}
          state={connectorsState}
          reload={src.reload}
          refreshNonce={refreshNonce}
          onChanged={changed}
          title="Azure Key Vault and HashiCorp Vault"
          intro="Refreshed daily. Each reports its certificates and keys, who uses them and what it will issue next. A certificate that also lives on a device is matched by fingerprint."
        />
      </Sector>
    </Stack>
  );
}
