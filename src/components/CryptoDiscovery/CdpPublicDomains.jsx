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

import * as React from "react";
import { Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Stack, TextField, Typography } from "@mui/material";
import { BRAND, TEXT, TEXT_MUTED } from "../../theme/brand";
import { createCdpConnector, deleteCdpConnector, updateCdpConnector } from "../../api/cdp";

const MONO = "ui-monospace, Menlo, monospace";
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

  const rows = ctDomains(connectors);
  const ct = (connectors ?? []).filter((c) => c?.kind === "ct");
  const primary = ct[0] ?? null;

  const run = async (fn, okText) => {
    setBusy(true);
    setNotice(null);
    try {
      await fn();
      setNotice({ sev: "success", text: okText });
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
