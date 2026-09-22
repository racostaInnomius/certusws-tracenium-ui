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
// sunburst del Dashboard (On-prem devices · Infra, con Windows CA
// colgando desde el 19-sep · Cloud · External key sources). Cada sección
// lleva en su cabecera una ficha por fuente —reporta, configurada y muda, falla, no conectada— y
// se pliega: cerrada, la pestaña se lee como un mapa; abierta, se
// configura. (Hubo un mapa aparte arriba; el usuario lo vio como
// información duplicada y lo era.) Se abre sola la sección con algo
// fallando; «¿por qué ese gajo está vacío?» y «¿dónde lo conecto?» se
// contestan en el mismo sitio.
//
// Regla: aquí se configura, en las otras pestañas se mira. Explore sigue
// enseñando lo que los conectores traen; desde allí un enlace vuelve aquí.

import * as React from "react";
import { Alert, Box, Button, Chip, Collapse, IconButton, Snackbar, Stack, Typography } from "@mui/material";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import SectionPaper from "../common/SectionPaper";
import CdpConnectorsPanel from "./CdpConnectorsPanel";
import CdpPublicDomains from "./CdpPublicDomains";
import { CbomImportForm } from "./CbomAssetsPanel";
import CdpCryptoPolicyEditor from "./CdpCryptoPolicyEditor";
import CdpRemoteProbes, { envelopeOf } from "./CdpRemoteProbes";
import SourceChips from "./CdpSourceChips";
import GatewayPanel from "../patch-management/gateway/GatewayPanel";
import { SECTIONS } from "./cdpSunburst";
import { CONNECTOR_KINDS_BY_BASE, FREE_DOMAINS, FREE_PROBE_TARGETS, sectorAnchor, sourcesByBase } from "./cdpSources";
import { getCdpFacets, getCryptoAssetsSummary, listCdpAdcsSources, listCdpConnectors, listCdpDevices, listCdpVcenterSources } from "../../api/cdp";
import * as infrastructureApi from "../../api/infrastructure";
import { getTenantPolicy } from "../../api/policies";
import { getMyCapabilities } from "../../api/roles";
import { useAuthContext } from "../../auth/AuthContext";
import { useEffectiveTenantId } from "../../hooks/useEffectiveTenantId";
import { usePluginCatalog } from "../../hooks/usePluginCatalog";
import { BRAND, TEXT, TEXT_MUTED } from "../../theme/brand";

const fmt = (n) => (n == null ? "—" : Number(n).toLocaleString());
const when = (iso) => (iso ? new Date(iso).toLocaleString() : "never");
const baseOf = (key) => SECTIONS.find((b) => b.key === key);

/**
 * Lo que la pestaña necesita saber de las fuentes, cargado UNA vez y
 * compartido por el mapa y por las secciones: conectores, lectores AD CS,
 * facetas por origen (lo que el agente recoge), resumen de activos de fuera
 * (SSH, CBOM), el bloque `cdp` de la policy (sondas, CA), lo que vCenter ya
 * reportó por el gateway, la lista de equipos (para elegir el gateway) y
 * las capacidades del que mira (para saber si puede registrarlo). Cada
 * carga falla por separado: un endpoint caído deja su parte vacía y se dice.
 */
function useCdpSources(refreshNonce, tenantId) {
  const [state, setState] = React.useState({ loading: true, connectors: null, adcs: null, facets: [], assets: null, cdp: {}, vcenterSources: [], devices: [], permissions: null, errors: [] });
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
      soft("policy", tenantId ? getTenantPolicy(tenantId).then((r) => envelopeOf(r).cdp) : Promise.resolve({}), {}),
      soft("vCenter sources", listCdpVcenterSources().then((r) => r?.sources ?? []), []),
      soft("devices", listCdpDevices({ pageSize: 500 }).then((r) => r?.items ?? []), []),
      soft("permissions", tenantId ? getMyCapabilities(tenantId).then((r) => new Set(Array.isArray(r?.permissions) ? r.permissions : [])) : Promise.resolve(null), null)
    ]).then(([connectors, adcs, facets, assets, cdp, vcenterSources, devices, permissions]) => {
      if (!alive) return;
      setState({ loading: false, connectors, adcs, facets, assets, cdp, vcenterSources, devices, permissions, errors });
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
    // `columnsFound` null = la ultima lectura no trajo filas (nada nuevo
    // desde el ultimo RequestID): la cabecera no se juzga. Solo un objeto
    // con las columnas clave a false es una cabecera no reconocida.
    const cf = s.columnsFound && typeof s.columnsFound === "object" ? s.columnsFound : null;
    if (cf && (!cf.requestId || !cf.rawCertificate)) return { label: "header not recognized", color: BRAND.alert.errorText, soft: BRAND.alert.errorSoft, hint: "certutil's CSV header did not match by name or by position: the agent log has the header it received." };
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

/**
 * Una sección por sector, plegable. La cabecera lleva el nombre, «x of y
 * reporting» y las fichas de estado; el cuerpo, lo que se configura. El
 * cuerpo queda montado aunque esté plegado: los paneles cargan lo suyo y
 * las fichas reflejan su estado sin abrir nada. Windows CA cuelga de
 * Infra: misma tarjeta, sangrada y con el padre delante.
 */
function Sector({ baseKey, label: labelOverride, section, sub, open, onToggle, onChip, nested = false, children }) {
  const b = baseOf(baseKey);
  // `label` explícito para las secciones que no son un sector del sunburst
  // (la política criptográfica): mismo marco plegable, sin fichas de fuente.
  const label = labelOverride ?? b?.label ?? baseKey;
  const headerId = `${sectorAnchor(baseKey)}-header`;
  // Anidada (Windows CA dentro de Infra): mismo cuerpo, sin tarjeta propia.
  const Wrapper = nested ? Box : SectionPaper;
  const wrapperSx = nested ? { mt: 2.5, pt: 2, borderTop: `1px dashed ${BRAND.border}`, scrollMarginTop: 16 } : { scrollMarginTop: 16 };
  return (
    <Wrapper id={sectorAnchor(baseKey)} sx={wrapperSx}>
      <Stack direction="row" spacing={1.5} alignItems="flex-start">
        <IconButton size="small" aria-expanded={open} aria-controls={`${sectorAnchor(baseKey)}-body`} aria-label={open ? `Collapse ${label}` : `Expand ${label}`} onClick={onToggle} sx={{ mt: -0.25 }}>
          {open ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
        </IconButton>
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Stack direction="row" spacing={1.5} alignItems="baseline" sx={{ flexWrap: "wrap", rowGap: 0.25, cursor: "pointer" }} onClick={onToggle}>
            <Typography id={headerId} component={nested ? "h4" : "h3"} sx={{ fontWeight: 700, fontSize: nested ? TEXT.md : TEXT.base, color: BRAND.dark, m: 0 }}>
              {label}
            </Typography>
            {section ? (
              <Typography sx={{ fontSize: TEXT.xs, color: TEXT_MUTED }}>
                {section.reporting} of {section.total} reporting
              </Typography>
            ) : null}
          </Stack>
          {section ? (
            <Box sx={{ mt: 0.75 }}>
              <SourceChips sources={section.sources} onClick={onChip ?? (open ? undefined : () => onToggle())} />
            </Box>
          ) : null}
          <Collapse in={open} id={`${sectorAnchor(baseKey)}-body`} role="region" aria-labelledby={headerId}>
            <Box sx={{ pt: 1.5 }}>
              {sub ? <Typography sx={{ fontSize: TEXT.sm, color: BRAND.dark, opacity: 0.8, mb: 1.5 }}>{sub}</Typography> : null}
              {children}
            </Box>
          </Collapse>
        </Box>
      </Stack>
    </Wrapper>
  );
}

const Divider = () => <Box sx={{ mt: 2.5, pt: 2, borderTop: `1px dashed ${BRAND.border}` }} />;

/**
 * ADR-0026 — lo que no se ha contratado se EXPLICA, no se esconde. Un mapa que
 * oculta lo que no tienes te hace creer que no existe; y lo ya recogido sigue
 * ahí, congelado con su fecha, no borrado.
 */
function CoverageNotice({ what }) {
  return (
    <Alert severity="info" icon={false} sx={{ mb: 1.5, border: `1px solid ${BRAND.border}`, bgcolor: "transparent" }}>
      <Typography sx={{ fontSize: TEXT.sm, fontWeight: 700, color: BRAND.dark, mb: 0.5 }}>Included in CDP Coverage</Typography>
      <Typography sx={{ fontSize: TEXT.sm, color: BRAND.dark, opacity: 0.85 }}>
        {what} covers machines you don&apos;t license with an agent, so it belongs to the CDP Coverage add-on. Anything
        already collected stays visible with the date it was last read — it just stops refreshing. Ask your Tracenium
        contact to enable it.
      </Typography>
    </Alert>
  );
}

export default function CdpSettingsTab({ refreshNonce, onSourcesChanged, onViewPublicCertificates }) {
  const tenantId = useEffectiveTenantId();
  const { auth } = useAuthContext();
  const src = useCdpSources(refreshNonce, tenantId);
  // ADR-0026 — «CDP Coverage»: los orígenes que cubren máquinas que el cliente
  // no licencia. `isEntitled` devuelve true mientras no se sepa: esconder de
  // más por un parpadeo deja tirado a quien sí pagó, y mostrar de más cuesta
  // un 402 que explica qué contratar.
  const { isEntitled } = usePluginCatalog();
  const coverage = isEntitled("cdp_coverage");
  const caHosts = Array.isArray(src.cdp?.adcs?.hosts) ? src.cdp.adcs.hosts : [];
  const changed = () => {
    onSourcesChanged?.();
    src.reload();
  };
  const connectorsState = src.connectors ?? undefined;
  // El gateway de vCenter se carga y refresca en su propio panel (tras
  // verificar vuelve a leer solo); el mapa de arriba refleja lo último que
  // el panel vio.
  const [gateways, setGateways] = React.useState([]);
  const onGatewaysLoaded = React.useCallback((list) => setGateways(Array.isArray(list) ? list : []), []);
  // Registrar el gateway y sellar su credencial es cosa de quien tiene la
  // capacidad del plugin (el servidor pide patch_management O
  // crypto_discovery; en esta página la segunda es la que cuenta).
  const canManageGateway = auth?.tenantMember?.isActive === true && Boolean(src.permissions?.has("crypto_discovery") || src.permissions?.has("patch_management"));
  const [snack, setSnack] = React.useState(null);
  const notify = React.useCallback((severity, message) => setSnack({ severity, message }), []);
  const sections = React.useMemo(
    () => sourcesByBase({ facets: src.facets, assets: src.assets, connectors: src.connectors?.connectors ?? [], adcs: src.adcs ?? [], cdp: src.cdp, gateways, vcenterSources: src.vcenterSources, coverage }),
    [src.facets, src.assets, src.connectors, src.adcs, src.cdp, src.vcenterSources, gateways, coverage]
  );
  const sectionOf = (key) => sections.find((b) => b.key === key);

  // Plegado por sección. Al terminar la primera carga se abren solas las
  // que tengan algo fallando: es lo que hay que mirar. Lo demás, a un clic.
  const [open, setOpen] = React.useState(() => new Set());
  const [seeded, setSeeded] = React.useState(false);
  React.useEffect(() => {
    if (src.loading || seeded) return;
    setSeeded(true);
    setOpen(new Set(sections.filter((b) => b.sources.some((x) => x.state === "failed")).map((b) => b.key)));
  }, [src.loading, seeded, sections]);
  const toggle = (key) => () =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const sectorProps = (key) => ({ baseKey: key, section: sectionOf(key), open: open.has(key), onToggle: toggle(key) });
  // Windows CA es parte de Infra (19-sep; antes colgaba de On-prem): su
  // cabecera lleva también las fichas de la CA (con «CA ·» delante) y
  // cuenta sus fuentes; el bloque de la CA va DENTRO de la tarjeta,
  // plegable a su vez. Una ficha de la CA abre los dos niveles.
  const infraHeader = React.useMemo(() => {
    const a = sections.find((b) => b.key === "infra");
    const ca = sections.find((b) => b.key === "adcs");
    if (!a) return a;
    const caSources = (ca?.sources ?? []).map((x) => ({ ...x, key: `ca:${x.key}`, label: `CA · ${x.label}`, ca: true }));
    return { ...a, sources: [...a.sources, ...caSources], reporting: a.reporting + (ca?.reporting ?? 0), total: a.total + (ca?.total ?? 0) };
  }, [sections]);
  const openInfra = (source) =>
    setOpen((prev) => {
      const next = new Set(prev);
      next.add("infra");
      if (source?.ca) next.add("adcs");
      return next;
    });

  return (
    <Stack spacing={2}>
      {src.errors.length > 0 ? <Alert severity="warning">Some of this could not be loaded: {src.errors.join(" · ")}</Alert> : null}
      <Typography sx={{ fontSize: TEXT.sm, color: TEXT_MUTED }}>
        The same sectors as the Dashboard sunburst, inside out. Each source is reporting, configured but silent, failing, or not connected; open a sector to set it up.
      </Typography>

      <Sector {...sectorProps("onprem")} sub="What the agents collect on every managed endpoint: certificate stores, Java keystores, certificate files, NSS databases, the TLS services each device serves and its SSH host keys. It is part of the agent policy — interval, paths, listener ports — so it is set per policy and per device group. The approval matrix (which crypto discovery capabilities need a second person’s sign-off) lives there too: it is a permissions change, for administrators.">
        <Button component="a" href="?page=policies" size="small" variant="outlined" endIcon={<OpenInNewIcon fontSize="small" />}>
          Open Policies → Crypto Discovery
        </Button>
      </Sector>

      <Sector {...sectorProps("infra")} section={infraHeader} onChip={openInfra} sub="Everything that reports without being a managed endpoint: services probed remotely, Kubernetes clusters, vCenter with its ESXi hosts, a CBOM from another scanner and the Windows Certification Authority.">
        {coverage ? null : <CoverageNotice what="Reading machines you have no agent on — remote probes past the three included, Kubernetes, vCenter and the Windows CA —" />}
        <CdpRemoteProbes refreshNonce={refreshNonce} maxTargets={coverage ? undefined : FREE_PROBE_TARGETS} />
        <Divider />
        <CdpConnectorsPanel
          embedded
          locked={!coverage}
          kinds={CONNECTOR_KINDS_BY_BASE.infra}
          state={connectorsState}
          reload={src.reload}
          refreshNonce={refreshNonce}
          onChanged={changed}
          title="Kubernetes clusters"
          intro="Refreshed daily. Reads kubernetes.io/tls secrets, cert-manager Certificate objects and which Ingress uses each certificate. A certificate that also lives on a device is matched by fingerprint."
        />
        <Divider />
        <GatewayPanel
          variant="cdp"
          api={infrastructureApi}
          canManage={canManageGateway}
          devices={src.devices}
          notify={notify}
          onLoaded={onGatewaysLoaded}
          onChanged={changed}
        />
        <Typography sx={{ fontSize: TEXT.xs, color: TEXT_MUTED, mt: 1 }}>
          Shared with Patch Management: one registration per vCenter, used for VM snapshots there and for certificates here.
          The vSphere account needs only <code>System.View</code> to read certificates; “Test connection” reports each use
          separately. What is read: the certificate vCenter serves on 443 and the one each ESXi host serves on 443, as the
          Infra sector of the Dashboard.
        </Typography>
        <Divider />
        <Typography sx={{ fontWeight: 700, fontSize: TEXT.md, color: BRAND.dark, mb: 0.5 }}>Import a CBOM</Typography>
        <Typography sx={{ fontSize: TEXT.sm, color: BRAND.dark, opacity: 0.8, mb: 1 }}>
          Crypto assets found by another scanner, as a CycloneDX file — nothing an agent collects, which is why it lives
          here and not under On-prem devices. They join the inventory under the source name you give.
        </Typography>
        <CbomImportForm onImported={changed} />
        <Sector {...sectorProps("adcs")} nested sub="Its own group inside Infra: what the Windows Certification Authority issued, read by the agent installed on the CA server. Kept apart from the rest because it is an issuance record — every certificate the CA handed out, wherever it ended up — and not an inventory of what a machine holds.">
          <AdcsReaders sources={src.adcs} caHosts={caHosts} />
        </Sector>
      </Sector>

      <Sector {...sectorProps("cloud")} sub="What is exposed on the internet or lives in a cloud provider: your public domains (from Certificate Transparency logs, no credentials), AWS Certificate Manager and Google Cloud.">
        {src.connectors ? <CdpPublicDomains connectors={src.connectors.connectors ?? []} onChanged={changed} maxDomains={coverage ? undefined : FREE_DOMAINS} onViewCertificates={onViewPublicCertificates} /> : null}
        <Divider />
        {coverage ? null : <CoverageNotice what="AWS Certificate Manager and Google Cloud" />}
        <CdpConnectorsPanel
          embedded
          locked={!coverage}
          kinds={CONNECTOR_KINDS_BY_BASE.cloud.filter((k) => k !== "ct")}
          state={connectorsState}
          reload={src.reload}
          refreshNonce={refreshNonce}
          onChanged={changed}
          title="AWS Certificate Manager and Google Cloud"
          intro="Refreshed daily. Each reports its certificates, who uses them and, where the provider knows it, what it will issue next. A certificate that also lives on a device is matched by fingerprint."
        />
      </Sector>

      <Sector {...sectorProps("external")} sub="Vaults that hold or issue keys for your systems: Azure Key Vault and HashiCorp Vault PKI. Read-only; the keys stay where they are.">
        {coverage ? null : <CoverageNotice what="Azure Key Vault and HashiCorp Vault" />}
        <CdpConnectorsPanel
          embedded
          locked={!coverage}
          kinds={CONNECTOR_KINDS_BY_BASE.external}
          state={connectorsState}
          reload={src.reload}
          refreshNonce={refreshNonce}
          onChanged={changed}
          title="Azure Key Vault and HashiCorp Vault"
          intro="Refreshed daily. Each reports its certificates and keys, who uses them and what it will issue next. A certificate that also lives on a device is matched by fingerprint."
        />
      </Sector>

      {/* Ola 1.6: la política criptográfica del tenant. No es una fuente, así
          que va al final y sin fichas; plegada como el resto. Aquí se
          configura; su efecto se mira en la pestaña Risk. */}
      <Sector
        baseKey="crypto-policy"
        label="Crypto policy"
        open={open.has("crypto-policy")}
        onToggle={toggle("crypto-policy")}
      >
        <CdpCryptoPolicyEditor />
      </Sector>

      <Snackbar open={Boolean(snack)} autoHideDuration={6000} onClose={() => setSnack(null)} anchorOrigin={{ vertical: "bottom", horizontal: "center" }}>
        <Alert severity={snack?.severity ?? "info"} onClose={() => setSnack(null)} sx={{ width: "100%" }}>{snack?.message}</Alert>
      </Snackbar>
    </Stack>
  );
}
