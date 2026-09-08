// src/components/CryptoDiscovery/CdpConnectorsPanel.jsx
//
// Fase 4c: conectores sin agente. El primero, Azure Key Vault. Vive
// dentro de «Outside your devices» (Explore) y no en una pestaña propia:
// es otra fuente de activos que ningún agente ve, y la pregunta sigue
// siendo «dónde viven».
//
// El secreto de la identidad se manda una vez y no vuelve: el servidor
// lo sella y aquí solo se sabe si «hay secreto». Sin la clave de sellado
// en el servidor el formulario lo dice y no deja crear nada, en vez de
// guardar el secreto en claro.

import * as React from "react";
import { Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, Stack, TextField, Typography } from "@mui/material";
import { BRAND, TEXT, TEXT_MUTED } from "../../theme/brand";
import { createCdpConnector, deleteCdpConnector, listCdpConnectorRuns, listCdpConnectors, runCdpConnector, updateCdpConnector } from "../../api/cdp";
import CdpPublicDomains from "./CdpPublicDomains";

const fmt = (n) => (n == null ? "—" : Number(n).toLocaleString());
const when = (iso) => (iso ? new Date(iso).toLocaleString() : "never");

const KIND_LABEL = { keyvault: "Azure Key Vault", acm: "AWS Certificate Manager", gcp: "Google Cloud", vault: "HashiCorp Vault", k8s: "Kubernetes", ct: "Public CT logs (crt.sh)" };
const SECRETLESS_KINDS = new Set(["ct"]);
const EMPTY_FORM = { vaultUrl: "", tenantId: "", clientId: "", region: "", accessKeyId: "", projectId: "", hcUrl: "", namespace: "", mounts: "pki", authMethod: "approle", roleId: "", caPem: "", apiServer: "", namespaces: "", readSecrets: true, domains: "", includeSubdomains: true, includeExpired: false };

export function ConnectorForm({ onCreated, secretsConfigured = true }) {
  const [kind, setKind] = React.useState("keyvault");
  // Sin clave de sellado en el servidor solo se pueden crear los tipos
  // sin credencial (CT). El selector de tipo queda siempre activo.
  const disabled = !secretsConfigured && !SECRETLESS_KINDS.has(kind);
  const [label, setLabel] = React.useState("");
  const [f, setF] = React.useState(EMPTY_FORM);
  const [secret, setSecret] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState(null);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));

  const config =
    kind === "acm"
      ? { region: f.region.trim(), accessKeyId: f.accessKeyId.trim() }
      : kind === "gcp"
        ? { projectId: f.projectId.trim() }
        : kind === "vault"
          ? { vaultUrl: f.hcUrl.trim(), namespace: f.namespace.trim() || undefined, mounts: f.mounts, authMethod: f.authMethod, roleId: f.authMethod === "approle" ? f.roleId.trim() : undefined, caPem: f.caPem.trim() || undefined }
          : kind === "k8s"
            ? { apiServer: f.apiServer.trim(), namespaces: f.namespaces, readSecrets: f.readSecrets, caPem: f.caPem.trim() || undefined }
            : kind === "ct"
              ? { domains: f.domains, includeSubdomains: f.includeSubdomains, includeExpired: f.includeExpired }
              : { vaultUrl: f.vaultUrl.trim(), tenantId: f.tenantId.trim(), clientId: f.clientId.trim() };
  const ready =
    label.trim().length >= 2 &&
    (SECRETLESS_KINDS.has(kind) || secret) &&
    (kind === "ct"
      ? f.domains.trim().length > 3
      : kind === "acm"
      ? config.region && config.accessKeyId
      : kind === "gcp"
        ? config.projectId && secret.trim().startsWith("{")
        : kind === "vault"
          ? /^https:\/\//i.test(config.vaultUrl) && config.mounts.trim() && (config.authMethod === "token" || config.roleId)
          : kind === "k8s"
            ? /^https:\/\//i.test(config.apiServer)
            : /^https:\/\//i.test(config.vaultUrl) && config.tenantId && config.clientId);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await createCdpConnector({ kind, label: label.trim(), config, clientSecret: SECRETLESS_KINDS.has(kind) ? "" : secret });
      if (!r?.ok) throw new Error(r?.message || r?.error || "Could not create the connector");
      setLabel("");
      setF(EMPTY_FORM);
      setSecret("");
      onCreated?.(r.connector);
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Box>
      <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", rowGap: 1 }}>
        <TextField size="small" select label="Kind" value={kind} onChange={(e) => setKind(e.target.value)} sx={{ minWidth: 220 }}>
          <MenuItem value="keyvault">Azure Key Vault</MenuItem>
          <MenuItem value="acm">AWS Certificate Manager</MenuItem>
          <MenuItem value="gcp">Google Cloud</MenuItem>
          <MenuItem value="vault">HashiCorp Vault</MenuItem>
          <MenuItem value="k8s">Kubernetes</MenuItem>
          {/* «Public CT logs» ya no se ofrece aquí: los dominios públicos
              tienen su propio bloque (CdpPublicDomains), siempre visible. */}
        </TextField>
        <TextField size="small" label="Label" value={label} onChange={(e) => setLabel(e.target.value)} placeholder={kind === "acm" ? "AWS production" : kind === "gcp" ? "GCP production" : kind === "vault" ? "Corp PKI" : kind === "k8s" ? "Prod cluster" : kind === "ct" ? "Our domains" : "Production vault"} sx={{ minWidth: 160 }} disabled={disabled} />
        {kind === "ct" ? (
          <>
            <TextField size="small" label="Domains" value={f.domains} onChange={set("domains")} placeholder="example.com, corp.example.net" sx={{ minWidth: 320 }} disabled={disabled} />
            <TextField size="small" select label="Subdomains" value={f.includeSubdomains ? "yes" : "no"} onChange={(e) => setF((x) => ({ ...x, includeSubdomains: e.target.value === "yes" }))} sx={{ minWidth: 150 }} disabled={disabled}>
              <MenuItem value="yes">Include</MenuItem>
              <MenuItem value="no">Exact only</MenuItem>
            </TextField>
            <TextField size="small" select label="Expired" value={f.includeExpired ? "yes" : "no"} onChange={(e) => setF((x) => ({ ...x, includeExpired: e.target.value === "yes" }))} sx={{ minWidth: 150 }} disabled={disabled}>
              <MenuItem value="no">Skip</MenuItem>
              <MenuItem value="yes">Include</MenuItem>
            </TextField>
          </>
        ) : kind === "k8s" ? (
          <>
            <TextField size="small" label="API server" value={f.apiServer} onChange={set("apiServer")} placeholder="https://k8s.corp.example:6443" sx={{ minWidth: 280 }} disabled={disabled} />
            <TextField size="small" label="Namespaces (empty = all)" value={f.namespaces} onChange={set("namespaces")} placeholder="prod, staging" sx={{ minWidth: 200 }} disabled={disabled} />
            <TextField size="small" select label="TLS secrets" value={f.readSecrets ? "yes" : "no"} onChange={(e) => setF((x) => ({ ...x, readSecrets: e.target.value === "yes" }))} sx={{ minWidth: 200 }} disabled={disabled}>
              <MenuItem value="yes">Read (fingerprint, in use by)</MenuItem>
              <MenuItem value="no">cert-manager only</MenuItem>
            </TextField>
            <TextField size="small" label="Service account token" type="password" value={secret} onChange={(e) => setSecret(e.target.value)} sx={{ minWidth: 260 }} disabled={disabled} autoComplete="off" />
            <TextField size="small" label="Cluster CA (PEM, optional)" multiline minRows={1} maxRows={4} value={f.caPem} onChange={set("caPem")} placeholder="-----BEGIN CERTIFICATE-----" sx={{ minWidth: 300, "& textarea": { fontFamily: "ui-monospace, Menlo, monospace", fontSize: TEXT.xs } }} disabled={disabled} />
          </>
        ) : kind === "vault" ? (
          <>
            <TextField size="small" label="Vault address" value={f.hcUrl} onChange={set("hcUrl")} placeholder="https://vault.corp.example:8200" sx={{ minWidth: 280 }} disabled={disabled} />
            <TextField size="small" label="Namespace (Enterprise)" value={f.namespace} onChange={set("namespace")} sx={{ minWidth: 160 }} disabled={disabled} />
            <TextField size="small" label="PKI mounts" value={f.mounts} onChange={set("mounts")} placeholder="pki, pki_int" sx={{ minWidth: 160 }} disabled={disabled} />
            <TextField size="small" select label="Auth" value={f.authMethod} onChange={set("authMethod")} sx={{ minWidth: 130 }} disabled={disabled}>
              <MenuItem value="approle">AppRole</MenuItem>
              <MenuItem value="token">Token</MenuItem>
            </TextField>
            {f.authMethod === "approle" ? (
              <TextField size="small" label="Role ID" value={f.roleId} onChange={set("roleId")} sx={{ minWidth: 300 }} disabled={disabled} />
            ) : null}
            <TextField size="small" label={f.authMethod === "approle" ? "Secret ID" : "Vault token"} type="password" value={secret} onChange={(e) => setSecret(e.target.value)} sx={{ minWidth: 260 }} disabled={disabled} autoComplete="off" />
            <TextField size="small" label="CA certificate (PEM, optional)" multiline minRows={1} maxRows={4} value={f.caPem} onChange={set("caPem")} placeholder="-----BEGIN CERTIFICATE-----" sx={{ minWidth: 300, "& textarea": { fontFamily: "ui-monospace, Menlo, monospace", fontSize: TEXT.xs } }} disabled={disabled} />
          </>
        ) : kind === "gcp" ? (
          <>
            <TextField size="small" label="Project ID" value={f.projectId} onChange={set("projectId")} placeholder="acme-prod" sx={{ minWidth: 200 }} disabled={disabled} />
            <TextField size="small" label="Service account JSON key" multiline minRows={1} maxRows={4} value={secret} onChange={(e) => setSecret(e.target.value)} placeholder='{"type":"service_account", …}' sx={{ minWidth: 340, "& textarea": { fontFamily: "ui-monospace, Menlo, monospace", fontSize: TEXT.xs } }} disabled={disabled} inputProps={{ "aria-label": "Service account JSON key", autoComplete: "off" }} />
          </>
        ) : kind === "acm" ? (
          <>
            <TextField size="small" label="Region" value={f.region} onChange={set("region")} placeholder="us-east-1" sx={{ minWidth: 140 }} disabled={disabled} />
            <TextField size="small" label="Access key ID" value={f.accessKeyId} onChange={set("accessKeyId")} placeholder="AKIA…" sx={{ minWidth: 240 }} disabled={disabled} />
            <TextField size="small" label="Secret access key" type="password" value={secret} onChange={(e) => setSecret(e.target.value)} sx={{ minWidth: 260 }} disabled={disabled} autoComplete="off" />
          </>
        ) : (
          <>
            <TextField size="small" label="Vault URL" value={f.vaultUrl} onChange={set("vaultUrl")} placeholder="https://kv-prod.vault.azure.net" sx={{ minWidth: 280 }} disabled={disabled} />
            <TextField size="small" label="Directory (tenant) ID" value={f.tenantId} onChange={set("tenantId")} sx={{ minWidth: 300 }} disabled={disabled} />
            <TextField size="small" label="Application (client) ID" value={f.clientId} onChange={set("clientId")} sx={{ minWidth: 300 }} disabled={disabled} />
            <TextField size="small" label="Client secret" type="password" value={secret} onChange={(e) => setSecret(e.target.value)} sx={{ minWidth: 220 }} disabled={disabled} autoComplete="off" />
          </>
        )}
        <Button size="small" variant="contained" disabled={disabled || busy || !ready} onClick={submit}>
          {busy ? "Saving…" : `Add ${KIND_LABEL[kind]}`}
        </Button>
      </Stack>
      {kind === "k8s" ? (
        <Typography sx={{ fontSize: TEXT.xs, color: TEXT_MUTED, mt: 0.5 }}>
          Reads <code>kubernetes.io/tls</code> secrets (only that type), cert-manager <code>Certificate</code> objects
          and which Ingress uses each certificate. RBAC: get/list on secrets, list on certificates.cert-manager.io,
          list on ingresses. <strong>Note:</strong> the API returns the private key together with the public
          certificate; Tracenium keeps <code>tls.crt</code> and discards the rest in the same step, never storing or
          logging it. Choose <em>cert-manager only</em> if even that is not acceptable — you lose fingerprints.
        </Typography>
      ) : kind === "vault" ? (
        <Typography sx={{ fontSize: TEXT.xs, color: TEXT_MUTED, mt: 0.5 }}>
          Reads each PKI mount: issued certificates, issuers and roles (what the mount <em>will</em> issue, by key type).
          Policy: <code>list</code> on <code>&lt;pki&gt;/certs</code>, <code>&lt;pki&gt;/issuers</code>,{" "}
          <code>&lt;pki&gt;/roles</code> and <code>read</code> on <code>&lt;pki&gt;/cert/*</code>,{" "}
          <code>&lt;pki&gt;/issuer/*</code>, <code>&lt;pki&gt;/roles/*</code>. Never <code>issue</code>, <code>sign</code> or
          KV. If Vault serves a private certificate, paste its CA here; verification is never disabled.
        </Typography>
      ) : kind === "gcp" ? (
        <Typography sx={{ fontSize: TEXT.xs, color: TEXT_MUTED, mt: 0.5 }}>
          Create a service account with only <code>certificatemanager.certs.list</code> and{" "}
          <code>compute.sslCertificates.list</code> (roles <em>Certificate Manager Viewer</em> + <em>Compute Viewer</em>) and
          paste its JSON key. Both Certificate Manager and the classic Compute SSL certificates are read; an API that
          is not enabled in the project simply counts as empty. Public certificates only: no private key ever leaves
          Google.
        </Typography>
      ) : kind === "acm" ? (
        <Typography sx={{ fontSize: TEXT.xs, color: TEXT_MUTED, mt: 0.5 }}>
          Create an IAM user (or role credentials) with a policy allowing only{" "}
          <code>acm:ListCertificates</code>, <code>acm:DescribeCertificate</code>, <code>acm:GetCertificate</code> and{" "}
          <code>sts:GetCallerIdentity</code>. Never grant <code>acm:ExportCertificate</code>: Tracenium reads the public
          certificate and who uses it, and never a private key. One connector per region.
        </Typography>
      ) : (
        <Typography sx={{ fontSize: TEXT.xs, color: TEXT_MUTED, mt: 0.5 }}>
          Register an app in Entra ID and give it <strong>read-only</strong> access to the vault: RBAC roles{" "}
          <em>Key Vault Certificate User</em> and <em>Key Vault Crypto User</em> (or <em>Key Vault Reader</em>), or an
          access policy with certificates <code>get, list</code> and keys <code>get, list</code>. No secret permissions:
          Tracenium never reads vault secrets, so it never sees a private key.
        </Typography>
      )}
      {error ? <Alert severity="error" sx={{ mt: 1 }}>{error}</Alert> : null}
    </Box>
  );
}

/**
 * Historial de ejecuciones de un conector (repaso 2026-09-06). Antes solo
 * se veía la última, así que un fallo esporádico del planificador (crt.sh
 * caído a las 22:31) tapaba la ejecución buena de la víspera y no había
 * forma de saber si el conector «suele» funcionar.
 */
function RunHistory({ connectorId, nonce }) {
  const [runs, setRuns] = React.useState(null);
  const [error, setError] = React.useState(null);
  React.useEffect(() => {
    let alive = true;
    setError(null);
    listCdpConnectorRuns(connectorId, { limit: 20 })
      .then((r) => alive && setRuns(r?.runs ?? []))
      .catch((e) => {
        if (!alive) return;
        setRuns([]);
        setError(e?.message || String(e));
      });
    return () => {
      alive = false;
    };
  }, [connectorId, nonce]);

  if (error) return <Alert severity="error" sx={{ mt: 1 }}>Couldn&apos;t load the history: {error}</Alert>;
  if (runs == null) return <Typography sx={{ fontSize: TEXT.xs, color: TEXT_MUTED, mt: 1 }}>Loading history…</Typography>;
  if (runs.length === 0) return <Typography sx={{ fontSize: TEXT.xs, color: TEXT_MUTED, mt: 1 }}>No runs recorded yet. «Test» runs are dry and are not recorded.</Typography>;
  const secs = (ms) => (ms == null ? "" : ` · ${Math.round(Number(ms) / 1000)}s`);
  return (
    <Box sx={{ mt: 1, overflowX: "auto" }} aria-label="Run history">
      <Box component="table" sx={{ width: "100%", borderCollapse: "collapse", fontSize: TEXT.xs }}>
        <Box component="thead">
          <Box component="tr" sx={{ textAlign: "left", color: TEXT_MUTED, textTransform: "uppercase", letterSpacing: ".06em" }}>
            <Box component="th" sx={{ py: 0.5, pr: 1.5 }}>When</Box>
            <Box component="th" sx={{ pr: 1.5 }}>Trigger</Box>
            <Box component="th" sx={{ pr: 1.5 }}>Result</Box>
            <Box component="th">Detail</Box>
          </Box>
        </Box>
        <Box component="tbody">
          {runs.map((r) => (
            <Box component="tr" key={r.runId} sx={{ borderTop: `1px solid ${BRAND.border}` }}>
              <Box component="td" sx={{ py: 0.5, pr: 1.5, whiteSpace: "nowrap" }}>{when(r.startedAt)}</Box>
              <Box component="td" sx={{ pr: 1.5 }}>{r.trigger === "scheduled" ? "scheduled" : "manual"}</Box>
              <Box component="td" sx={{ pr: 1.5 }}>
                {r.status === "ok" ? (
                  <Chip size="small" label="ok" sx={{ height: 18, fontSize: TEXT.xs, bgcolor: BRAND.alert.successSoft, color: BRAND.alert.success, fontWeight: 700 }} />
                ) : (
                  <Chip size="small" label="failed" sx={{ height: 18, fontSize: TEXT.xs, bgcolor: BRAND.alert.errorSoft, color: BRAND.alert.error, fontWeight: 700 }} />
                )}
              </Box>
              <Box component="td" sx={{ color: r.error ? BRAND.alert.errorText : BRAND.dark }}>
                {r.error
                  ? r.error
                  : `${fmt(r.summary?.certificates ?? r.assets)} certificate(s), ${fmt(r.summary?.keys ?? 0)} key(s) · ${fmt(r.removed)} retired · ${fmt(r.summary?.matchedFleetCertificates ?? 0)} on devices${r.summary?.complete === false ? " · listing incomplete" : ""}${secs(r.summary?.durationMs)}`}
              </Box>
            </Box>
          ))}
        </Box>
      </Box>
    </Box>
  );
}

function StatusChip({ c }) {
  if (!c.lastStatus) return <Chip size="small" label="never run" variant="outlined" />;
  if (c.lastStatus === "ok") return <Chip size="small" label="ok" sx={{ bgcolor: BRAND.alert.successSoft, color: BRAND.alert.success, fontWeight: 700 }} />;
  return <Chip size="small" label="failed" sx={{ bgcolor: BRAND.alert.errorSoft, color: BRAND.alert.error, fontWeight: 700 }} />;
}

/**
 * Quitar un conector retira sus activos del roadmap y del embudo. Un
 * `window.confirm` nativo no encaja con el resto del portal ni deja
 * decir QUÉ se pierde; este diálogo sí.
 */
function RemoveConnectorDialog({ connector, busy, onClose, onConfirm }) {
  return (
    <Dialog open={Boolean(connector)} onClose={busy ? undefined : onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Remove “{connector?.label}”?</DialogTitle>
      <DialogContent>
        <Typography variant="body2">
          The {fmt(connector?.lastSummary?.certificates)} certificate(s) and {fmt(connector?.lastSummary?.keys)} key(s)
          it brought are retired from Explore and the roadmap. Nothing is touched at the source
          {connector?.kind && KIND_LABEL[connector.kind] ? ` (${KIND_LABEL[connector.kind]})` : ""}; adding the connector
          again re-reads everything.
        </Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>Cancel</Button>
        <Button variant="contained" color="error" disabled={busy} onClick={onConfirm}>
          {busy ? "Removing…" : "Remove connector"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

/** `embedded`: sin cabecera ni separador propios — la pestaña Settings ya los pone. */
export default function CdpConnectorsPanel({ refreshNonce, onChanged, embedded = false }) {
  const [state, setState] = React.useState(null);
  const [error, setError] = React.useState(null);
  const [busyId, setBusyId] = React.useState(null);
  const [runResult, setRunResult] = React.useState(null);
  const [toRemove, setToRemove] = React.useState(null);
  // Conectores con el historial desplegado.
  const [historyOpen, setHistoryOpen] = React.useState(() => new Set());
  const [nonce, setNonce] = React.useState(0);

  React.useEffect(() => {
    let alive = true;
    setError(null);
    listCdpConnectors()
      .then((r) => alive && setState(r ?? { connectors: [], secretsConfigured: false }))
      .catch((e) => alive && setError(e?.message || String(e)));
    return () => {
      alive = false;
    };
  }, [refreshNonce, nonce]);

  const reload = () => setNonce((n) => n + 1);

  const run = async (c, dryRun) => {
    setBusyId(c.connectorId);
    setRunResult(null);
    try {
      const r = await runCdpConnector(c.connectorId, { dryRun });
      if (!r?.ok) throw new Error(r?.message || r?.error || "Run failed");
      setRunResult({ id: c.connectorId, dryRun, summary: r.summary });
      if (!dryRun) onChanged?.();
    } catch (e) {
      setRunResult({ id: c.connectorId, dryRun, error: e?.message || String(e) });
    } finally {
      setBusyId(null);
      reload();
    }
  };

  const toggle = async (c) => {
    setBusyId(c.connectorId);
    try {
      await updateCdpConnector(c.connectorId, { enabled: !c.enabled });
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setBusyId(null);
      reload();
    }
  };

  const remove = async (c) => {
    setBusyId(c.connectorId);
    try {
      await deleteCdpConnector(c.connectorId);
      onChanged?.();
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setBusyId(null);
      setToRemove(null);
      reload();
    }
  };

  const connectors = state?.connectors ?? [];
  const secretsConfigured = state?.secretsConfigured !== false;

  return (
    <Box sx={embedded ? undefined : { mt: 2, pt: 1.5, borderTop: `1px dashed ${BRAND.border}` }}>
      {state ? <CdpPublicDomains connectors={connectors} onChanged={() => { onChanged?.(); reload(); }} /> : null}
      <Box sx={{ mt: 2.5, pt: 2, borderTop: `1px dashed ${BRAND.border}` }} />
      <Typography sx={{ fontWeight: 700, fontSize: TEXT.md, color: BRAND.dark, mb: 0.5 }}>Connectors</Typography>
      <Typography sx={{ fontSize: TEXT.sm, color: BRAND.dark, opacity: 0.8, mb: 1 }}>
        Refreshed daily. Azure Key Vault, AWS Certificate Manager, Google Cloud, HashiCorp Vault PKI and Kubernetes (TLS
        secrets and cert-manager); the public domains above are one more connector, listed here too. Each reports its
        certificates and keys, who uses them and, where the source knows it, what it will issue next. A certificate
        that also lives on a device is matched by fingerprint.
      </Typography>
      {error ? <Alert severity="error" sx={{ mb: 1 }}>{error}</Alert> : null}
      {state && !secretsConfigured ? (
        <Alert severity="warning" sx={{ mb: 1 }}>
          The server has no <code>CDP_CONNECTOR_SECRETS_KEY</code>, so connector credentials cannot be stored. Set it
          on the control plane before adding a connector with credentials. Public CT logs need none and work now.
        </Alert>
      ) : null}
      <ConnectorForm secretsConfigured={secretsConfigured} onCreated={() => { reload(); }} />

      {connectors.length > 0 ? (
        <Stack spacing={1} sx={{ mt: 1.5 }}>
          {connectors.map((c) => (
            <Box key={c.connectorId} sx={{ border: `1px solid ${BRAND.border}`, borderRadius: 1.5, p: 1.25 }}>
              <Stack direction="row" spacing={1} alignItems="center" sx={{ flexWrap: "wrap", rowGap: 0.5 }}>
                <Typography sx={{ fontWeight: 700, fontSize: TEXT.md }}>{c.label}</Typography>
                <Chip size="small" variant="outlined" label={KIND_LABEL[c.kind] ?? c.kind} />
                <Typography sx={{ fontSize: TEXT.xs, color: TEXT_MUTED }}>
                  {c.kind === "acm"
                    ? `${c.config?.region} · ${c.config?.accessKeyId}`
                    : c.kind === "gcp"
                      ? c.config?.projectId
                      : c.kind === "vault"
                        ? `${c.config?.vaultUrl} · ${(c.config?.mounts ?? []).join(", ")}`
                        : c.kind === "k8s"
                          ? `${c.config?.apiServer}${(c.config?.namespaces ?? []).length ? ` · ${c.config.namespaces.join(", ")}` : ""}${c.config?.readSecrets === false ? " · cert-manager only" : ""}`
                          : c.kind === "ct"
                            ? (c.config?.domains ?? []).join(", ")
                            : c.config?.vaultUrl}
                </Typography>
                <StatusChip c={c} />
                {!c.enabled ? <Chip size="small" label="disabled" variant="outlined" /> : null}
                <Box sx={{ flex: 1 }} />
                <Button size="small" variant="outlined" disabled={busyId != null} onClick={() => run(c, true)}>Test</Button>
                <Button size="small" variant="contained" disabled={busyId != null} onClick={() => run(c, false)}>
                  {busyId === c.connectorId ? "Running…" : "Run now"}
                </Button>
                <Button size="small" disabled={busyId != null} onClick={() => toggle(c)}>{c.enabled ? "Disable" : "Enable"}</Button>
                <Button
                  size="small"
                  aria-expanded={historyOpen.has(c.connectorId)}
                  onClick={() =>
                    setHistoryOpen((prev) => {
                      const next = new Set(prev);
                      if (next.has(c.connectorId)) next.delete(c.connectorId);
                      else next.add(c.connectorId);
                      return next;
                    })
                  }
                >
                  {historyOpen.has(c.connectorId) ? "Hide history" : "History"}
                </Button>
                <Button size="small" color="error" disabled={busyId != null} onClick={() => setToRemove(c)}>Remove</Button>
              </Stack>
              <Typography sx={{ fontSize: TEXT.xs, color: TEXT_MUTED, mt: 0.5 }}>
                Last run {when(c.lastRunAt)}
                {c.lastSummary ? ` · ${fmt(c.lastSummary.certificates)} certificate(s), ${fmt(c.lastSummary.keys)} key(s)${c.lastSummary.complete === false ? " (listing incomplete: nothing retired)" : ""}` : ""}
                {c.lastError ? ` · ${c.lastError}` : ""}
              </Typography>
              {runResult?.id === c.connectorId ? (
                <Alert severity={runResult.error ? "error" : "success"} sx={{ mt: 1 }}>
                  {runResult.error
                    ? runResult.error
                    : `${runResult.dryRun ? "Connection OK: " : "Synced: "}${fmt(runResult.summary?.certificates)} certificate(s), ${fmt(runResult.summary?.keys)} key(s)` +
                      (runResult.dryRun ? "" : ` · ${fmt(runResult.summary?.removed)} retired · ${fmt(runResult.summary?.matchedFleetCertificates)} also on your devices`) +
                      (runResult.summary?.complete === false ? " · listing incomplete (keys denied?): nothing retired" : "")}
                </Alert>
              ) : null}
              {historyOpen.has(c.connectorId) ? <RunHistory connectorId={c.connectorId} nonce={nonce} /> : null}
            </Box>
          ))}
        </Stack>
      ) : null}
      <RemoveConnectorDialog
        connector={toRemove}
        busy={busyId != null && busyId === toRemove?.connectorId}
        onClose={() => setToRemove(null)}
        onConfirm={() => toRemove && remove(toRemove)}
      />
    </Box>
  );
}
