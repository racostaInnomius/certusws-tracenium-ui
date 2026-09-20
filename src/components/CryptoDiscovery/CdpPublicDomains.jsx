// src/components/CryptoDiscovery/CdpPublicDomains.jsx
//
// Dominios públicos (Certificate Transparency), como bloque propio y siempre
// visible en Crypto Discovery → Settings (2026-09-08).
//
// Lo que pasó: el usuario quitó «tracenium.com» —lo único que había— y con
// ello desapareció el conector CT entero; la única forma de volver a poner un
// dominio era el formulario genérico de conectores, eligiendo «Public CT logs
// (crt.sh)» en un desplegable que empieza por Azure Key Vault. Nadie lo
// encuentra, y es el conector que NO necesita credenciales: el primero que
// cualquier tenant debería tener.
//
// Aquí los dominios son la unidad, no el conector: se añaden y quitan de uno
// en uno. Por debajo sigue habiendo UN conector `ct` (se crea con el primer
// dominio y se borra con el último, avisando de que lo que trajo se retira).
// El tipo `ct` ya no se ofrece en el formulario genérico: sustituir, no
// duplicar.
//
// Repaso 2026-09-18: el refactor por sectores (640ab0e, 14-sep) dio a cada
// panel de conectores su lista de tipos, y ninguna incluye `ct` —el bloque de
// Cloud lo filtra a mano—. Consecuencia: el conector CT dejó de tener fila en
// ninguna lista y con ella se fueron «Run now», «Test», el estado de la última
// lectura y el historial. El propio mensaje al añadir un dominio remitía a un
// «Run now» que ya no existía: un dominio nuevo no se podía leer hasta el
// refresco diario. La lectura vuelve aquí, que es donde vive su conector.

import * as React from "react";
import { Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Stack, TextField, Typography } from "@mui/material";
import { BRAND, TEXT, TEXT_MUTED } from "../../theme/brand";
import { createCdpConnector, deleteCdpConnector, runCdpConnector, updateCdpConnector } from "../../api/cdp";
import { RunHistory, StatusChip } from "./CdpConnectorsPanel";

const MONO = "ui-monospace, Menlo, monospace";
const fmt = (n) => (n == null ? "—" : Number(n).toLocaleString());
const when = (iso) => (iso ? new Date(iso).toLocaleString() : "never");
export const CT_DEFAULT_LABEL = "Public domains";
// Un nombre de dominio registrable: al menos dos etiquetas, sin esquema ni
// ruta. `*.` delante se acepta y se quita (el backend hace lo mismo).
export const DOMAIN_RE = /^(\*\.)?[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i;

export function normalizeDomain(raw) {
  return String(raw ?? "").trim().toLowerCase().replace(/^\*\./, "").replace(/\.$/, "");
}

/** Cada dominio con el conector `ct` que lo lleva. */
export function ctDomains(connectors) {
  const out = [];
  for (const c of connectors ?? []) {
    if (c?.kind !== "ct") continue;
    const list = Array.isArray(c.config?.domains) ? c.config.domains : String(c.config?.domains ?? "").split(/[,\s]+/);
    for (const d of list) {
      const n = normalizeDomain(d);
      if (n && !out.some((x) => x.domain === n)) out.push({ domain: n, connector: c });
    }
  }
  return out;
}

export default function CdpPublicDomains({ connectors, onChanged }) {
  const [draft, setDraft] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [notice, setNotice] = React.useState(null);
  const [confirmLast, setConfirmLast] = React.useState(null);
  const [historyOpen, setHistoryOpen] = React.useState(false);
  const [nonce, setNonce] = React.useState(0);

  const rows = ctDomains(connectors);
  const ct = (connectors ?? []).filter((c) => c?.kind === "ct");
  const primary = ct[0] ?? null;
  // Lo que la última lectura no pudo leer. Es una corrida «ok» con avisos:
  // sin esto sería un estado invisible —cifra corta y ninguna explicación—.
  const partialDomains = Array.isArray(primary?.lastSummary?.problems) ? primary.lastSummary.problems : [];
  // Con qué proveedor se leyó la última vez. Importa: crt.sh y CertSpotter
  // no ven lo mismo (el 20-sep crt.sh no tenía el certificado vivo de un
  // dominio que CertSpotter sí), así que quien mira una cifra merece saber
  // de dónde sale.
  const PROVIDER_LABEL = { certspotter: "via CertSpotter", crtsh: "via crt.sh", mixed: "via CertSpotter + crt.sh" };
  const provider = PROVIDER_LABEL[primary?.lastSummary?.provider] ?? "";

  const run = async (fn, okText) => {
    setBusy(true);
    setNotice(null);
    try {
      // Sin `okText`, el propio trabajo dice cómo fue (una lectura resume lo
      // que trajo, y eso no se sabe hasta que termina).
      const text = await fn();
      setNotice({ sev: "success", text: okText ?? text });
      onChanged?.();
    } catch (e) {
      setNotice({ sev: "error", text: e?.message || String(e) });
    } finally {
      setBusy(false);
    }
  };

  const add = () => {
    const d = normalizeDomain(draft);
    if (!d) return;
    if (!DOMAIN_RE.test(d)) {
      setNotice({ sev: "error", text: `“${draft.trim()}” is not a domain name (example.com, corp.example.net).` });
      return;
    }
    if (rows.some((r) => r.domain === d)) {
      setNotice({ sev: "info", text: `${d} is already listed.` });
      setDraft("");
      return;
    }
    const doIt = primary
      ? () => updateCdpConnector(primary.connectorId, { config: { ...primary.config, domains: [...ctDomains([primary]).map((r) => r.domain), d] } })
      : () => createCdpConnector({ kind: "ct", label: CT_DEFAULT_LABEL, config: { domains: [d], includeSubdomains: true, includeExpired: false }, clientSecret: "" });
    run(doIt, `${d} added. Its public certificates are read on the next daily refresh, or with “Run now” below.`).then(() => setDraft(""));
  };

  const remove = (row) => {
    const remaining = ctDomains([row.connector]).map((r) => r.domain).filter((x) => x !== row.domain);
    if (remaining.length === 0) {
      setConfirmLast(row);
      return;
    }
    run(() => updateCdpConnector(row.connector.connectorId, { config: { ...row.connector.config, domains: remaining } }), `${row.domain} removed. What it brought is retired on the next refresh.`);
  };

  /**
   * Leer ahora. `dryRun` pregunta a crt.sh y no guarda nada: sirve para ver
   * que el dominio recién añadido devuelve algo sin esperar al refresco
   * diario. La corrida de verdad recarga al padre para que el estado y el
   * historial se vean al momento.
   */
  const runNow = (dryRun) => {
    if (!primary) return;
    run(async () => {
      const r = await runCdpConnector(primary.connectorId, { dryRun });
      if (!r?.ok) throw new Error(r?.message || r?.error || "Run failed");
      const s = r.summary ?? {};
      setNonce((n) => n + 1);
      // Una corrida puede salir bien y aun así dejar un dominio sin leer
      // (crt.sh contesta 502 a ratos). Eso se dice: callarlo sería enseñar
      // una cifra que no incluye a todos tus dominios.
      const partial = Array.isArray(s.problems) && s.problems.length > 0 ? ` Not read this time: ${s.problems.join(" · ")}` : "";
      return (dryRun
        ? `crt.sh answered: ${fmt(s.certificates)} certificate(s) for these domains. Nothing was imported.`
        : `Read: ${fmt(s.certificates)} certificate(s) · ${fmt(s.removed)} retired · ${fmt(s.matchedFleetCertificates)} also on your devices.`) + partial;
    });
  };

  const removeLast = () => {
    const row = confirmLast;
    setConfirmLast(null);
    if (!row) return;
    run(() => deleteCdpConnector(row.connector.connectorId), `${row.domain} removed. Nothing is watched in the public logs now; add a domain to start again.`);
  };

  return (
    <Box>
      <Typography sx={{ fontWeight: 700, fontSize: TEXT.md, color: BRAND.dark, mb: 0.5 }}>Public domains</Typography>
      <Typography sx={{ fontSize: TEXT.sm, color: BRAND.dark, opacity: 0.8, mb: 1 }}>
        Every certificate a public CA (Let&apos;s Encrypt, DigiCert, Sectigo, Google…) logs for these domains and their
        subdomains, read from the Certificate Transparency logs via crt.sh. No credentials. A certificate here that no
        device has is either a service without an agent or someone requesting certificates for your domains on their own.
      </Typography>
      {notice ? <Alert severity={notice.sev} sx={{ mb: 1 }} onClose={() => setNotice(null)}>{notice.text}</Alert> : null}
      <Stack direction="row" spacing={1} alignItems="center" sx={{ flexWrap: "wrap", rowGap: 1 }}>
        {rows.length === 0 ? (
          <Typography sx={{ fontSize: TEXT.sm, color: TEXT_MUTED }}>No domain watched yet.</Typography>
        ) : (
          rows.map((r) => (
            <Chip key={r.domain} size="small" label={r.domain} onDelete={busy ? undefined : () => remove(r)} sx={{ fontFamily: MONO, height: 24, fontSize: TEXT.xs }} />
          ))
        )}
      </Stack>
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 1 }}>
        <TextField
          size="small"
          label="Add a domain"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          placeholder="example.com"
          disabled={busy}
          sx={{ minWidth: 280 }}
          inputProps={{ style: { fontFamily: MONO } }}
        />
        <Button size="small" variant="contained" disabled={busy || normalizeDomain(draft).length === 0} onClick={add}>
          {busy ? "Saving…" : "Add domain"}
        </Button>
      </Stack>

      {primary ? (
        <Box sx={{ mt: 1.25, pt: 1, borderTop: `1px dashed ${BRAND.border}` }}>
          <Stack direction="row" spacing={1} alignItems="center" sx={{ flexWrap: "wrap", rowGap: 0.5 }}>
            <StatusChip c={primary} />
            {primary.enabled === false ? <Chip size="small" label="disabled" variant="outlined" /> : null}
            <Typography sx={{ fontSize: TEXT.xs, color: TEXT_MUTED }}>
              Last read {when(primary.lastRunAt)}
              {primary.lastSummary ? ` · ${fmt(primary.lastSummary.certificates)} certificate(s)` : ""}
              {provider ? ` · ${provider}` : ""}
              {primary.lastError ? ` · ${primary.lastError}` : ""}
            </Typography>
            {partialDomains.length > 0 ? (
              <Chip size="small" label={`${partialDomains.length} not read`} sx={{ height: 20, fontSize: TEXT.xs, bgcolor: BRAND.alert.warningSoft, color: BRAND.alert.warningText, fontWeight: 700 }} />
            ) : null}
            <Box sx={{ flex: 1 }} />
            <Button size="small" variant="outlined" disabled={busy} onClick={() => runNow(true)}>Test</Button>
            <Button size="small" variant="contained" disabled={busy || primary.enabled === false} onClick={() => runNow(false)}>
              {busy ? "Reading…" : "Run now"}
            </Button>
            {primary.enabled === false ? (
              <Button size="small" disabled={busy} onClick={() => run(() => updateCdpConnector(primary.connectorId, { enabled: true }), "Public domains re-enabled; they are read again on the daily refresh.")}>
                Enable
              </Button>
            ) : null}
            <Button size="small" aria-expanded={historyOpen} onClick={() => setHistoryOpen((v) => !v)}>
              {historyOpen ? "Hide history" : "History"}
            </Button>
          </Stack>
          {partialDomains.length > 0 ? (
            <Alert severity="warning" sx={{ mt: 1 }}>
              <Typography sx={{ fontSize: TEXT.sm, mb: 0.5 }}>
                The last read left {partialDomains.length} domain(s) out. What they brought is kept as it was and nothing
                was retired for them; the next read is within the hour.
              </Typography>
              {partialDomains.map((p) => (
                <Typography key={p} sx={{ fontSize: TEXT.xs }}>{p}</Typography>
              ))}
            </Alert>
          ) : null}
          <Typography sx={{ fontSize: TEXT.xs, color: TEXT_MUTED, mt: 1 }}>
            Read through CertSpotter, a commercial Certificate Transparency index Tracenium subscribes to — nothing for you
            to sign up for or pay separately. It has shown live certificates that the free crt.sh was missing, and crt.sh
            stays as the fallback whenever the hourly allowance is spent, so a read never comes back empty for lack of a
            source.
          </Typography>
          {historyOpen ? <RunHistory connectorId={primary.connectorId} nonce={nonce} /> : null}
        </Box>
      ) : null}

      <Dialog open={confirmLast != null} onClose={() => setConfirmLast(null)}>
        <DialogTitle>Stop watching {confirmLast?.domain}?</DialogTitle>
        <DialogContent>
          <Typography sx={{ fontSize: TEXT.sm }}>
            It is the last domain, so the public-logs connector is removed with it: the certificates it brought are
            retired from Explore and the roadmap. Nothing is touched at the source. Adding a domain later starts again from
            scratch.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmLast(null)}>Keep</Button>
          <Button color="error" variant="contained" onClick={removeLast}>Remove domain</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
