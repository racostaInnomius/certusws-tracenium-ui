// src/components/CryptoDiscovery/CdpRemoteProbes.jsx
//
// Sondas TLS remotas, en la pestaña Settings de Crypto Discovery (repaso
// 2026-09-07). Vivía como un apéndice de la sección CDP de Agent Settings:
// la lista de servicios internos descubiertos y su «Add» estaban tan
// escondidos que el usuario no los encontraba, y la sonda es un asunto de
// Crypto Discovery —qué certificados sirven los balanceadores, appliances
// y bases de datos sin agente—, no un ajuste del agente.
//
// Lo que se ve: desde qué equipos se sondea (`cdp.probeHosts`), qué
// objetivos hay (`cdp.probeTargets`) y qué servicios internos han visto los
// agentes (candidatos). «Add» y «Remove» escriben la policy del tenant por
// el mismo camino que Agent Settings: PATCH del dominio `cdp` con la
// versión cargada (If-Match), así una edición simultánea en Agent Settings
// no se pisa en silencio. Los equipos que sondean se nombran en Agent
// Settings: son un ajuste del agente y aquí solo se enseñan.

import * as React from "react";
import { Alert, Box, Button, Chip, Stack, Typography } from "@mui/material";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import { BRAND, TEXT, TEXT_MUTED } from "../../theme/brand";
import { listCdpProbeCandidates } from "../../api/cdp";
import { getTenantPolicy, patchTenantPolicyDomain } from "../../api/policies";
import { useEffectiveTenantId } from "../../hooks/useEffectiveTenantId";
import { CDP_PROBE_TARGETS_MAX, invalidProbeTargets } from "../Policies/policyTransforms";

const MONO = "ui-monospace, Menlo, monospace";

/**
 * GET /policies/tenants/:id/policy contesta `{ ok, policy: { policy_version,
 * policy_json, … } }`: la fila va DENTRO de `policy`. La primera versión de
 * esto leía `policy_version` en la raíz —null— y el servidor contestó 428
 * PRECONDITION_REQUIRED al primer «Add» real (08-sep). Peor: leía `res.policy`
 * como si fuera el JSON y sacaba un bloque `cdp` vacío, así que de haber
 * pasado el If-Match habría borrado `adcs`, `scan…` y `probeHosts` con el
 * replace-slice. Por eso `write` se niega sin versión.
 */
export function envelopeOf(res) {
  if (!res) return { version: null, cdp: {} };
  const row = res.policy && typeof res.policy === "object" && ("policy_json" in res.policy || "policyJson" in res.policy || "policy_version" in res.policy || "policyVersion" in res.policy) ? res.policy : res;
  const json = row.policy_json ?? row.policyJson ?? {};
  const version = row.policy_version ?? row.policyVersion ?? null;
  return { version: version == null ? null : String(version), cdp: json?.cdp && typeof json.cdp === "object" ? json.cdp : {} };
}

export default function CdpRemoteProbes({ refreshNonce }) {
  const tenantId = useEffectiveTenantId();
  const [env, setEnv] = React.useState(null);
  const [candidates, setCandidates] = React.useState(null);
  const [error, setError] = React.useState(null);
  const [saving, setSaving] = React.useState(false);
  const [notice, setNotice] = React.useState(null);
  const [nonce, setNonce] = React.useState(0);

  React.useEffect(() => {
    let alive = true;
    setError(null);
    const loads = [
      tenantId ? getTenantPolicy(tenantId).then(envelopeOf) : Promise.resolve({ version: null, cdp: {} }),
      listCdpProbeCandidates({ limit: 100 }).then((r) => r?.candidates ?? [])
    ];
    Promise.all(loads)
      .then(([e, c]) => {
        if (!alive) return;
        setEnv(e);
        setCandidates(c);
      })
      .catch((e) => alive && setError(e?.message || String(e)));
    return () => {
      alive = false;
    };
  }, [tenantId, refreshNonce, nonce]);

  const hosts = Array.isArray(env?.cdp?.probeHosts) ? env.cdp.probeHosts : [];
  const targets = Array.isArray(env?.cdp?.probeTargets) ? env.cdp.probeTargets : [];
  const listed = new Set(targets.map((t) => String(t).toLowerCase()));

  const write = async (nextTargets, what) => {
    if (!tenantId || !env) return;
    if (env.version == null) {
      setNotice({ sev: "error", text: "The policy version could not be read, so nothing was saved. Reload and try again." });
      return;
    }
    setSaving(true);
    setNotice(null);
    try {
      const res = await patchTenantPolicyDomain(tenantId, "cdp", { cdp: { ...env.cdp, probeTargets: nextTargets } }, { expectedVersion: env.version });
      setEnv({ version: res?.policyVersion != null ? String(res.policyVersion) : env.version, cdp: { ...env.cdp, probeTargets: nextTargets } });
      setNotice({ sev: "success", text: `${what}. The devices under “Runs from” pick it up on their next policy refresh.` });
      setNonce((n) => n + 1);
    } catch (e) {
      if (e?.status === 409) {
        setNotice({ sev: "warning", text: "The policy was modified by someone else. Reloaded — try again." });
        setNonce((n) => n + 1);
      } else {
        setNotice({ sev: "error", text: e?.message || String(e) });
      }
    } finally {
      setSaving(false);
    }
  };
  const add = (target) => {
    const t = String(target).toLowerCase();
    if (listed.has(t)) return;
    if (invalidProbeTargets(t).length > 0) {
      setNotice({ sev: "error", text: `${target} is not a valid host:port.` });
      return;
    }
    if (targets.length >= CDP_PROBE_TARGETS_MAX) {
      setNotice({ sev: "error", text: `At most ${CDP_PROBE_TARGETS_MAX} targets.` });
      return;
    }
    write([...targets, t], `${target} added to the probe targets`);
  };
  const remove = (target) => write(targets.filter((x) => String(x).toLowerCase() !== String(target).toLowerCase()), `${target} removed from the probe targets`);

  return (
    <Box>
      <Typography sx={{ fontWeight: 700, fontSize: TEXT.base, color: BRAND.dark }}>Remote TLS probes</Typography>
      <Typography sx={{ fontSize: TEXT.sm, color: BRAND.dark, opacity: 0.8, mb: 1.5 }}>
        Services without an agent — load balancers, appliances, databases, hypervisors — probed from a few named devices:
        the certificate they serve, what the handshake negotiates and whether they accept a post-quantum key exchange.
        Cleartext-first ports (SMTP, IMAP, POP3, LDAP, PostgreSQL, MySQL) get their StartTLS preamble.
      </Typography>
      {error ? <Alert severity="error" sx={{ mb: 1.5 }}>{error}</Alert> : null}
      {notice ? <Alert severity={notice.sev} sx={{ mb: 1.5 }} onClose={() => setNotice(null)}>{notice.text}</Alert> : null}

      <Stack direction="row" spacing={1} alignItems="flex-start" sx={{ mb: 1.5, flexWrap: "wrap", rowGap: 1 }}>
        <Typography sx={{ fontSize: TEXT.sm, fontWeight: 700, color: BRAND.dark, minWidth: 110 }}>Runs from</Typography>
        {env == null ? (
          <Typography sx={{ fontSize: TEXT.sm, color: TEXT_MUTED }}>Loading…</Typography>
        ) : hosts.length === 0 ? (
          <Alert severity={targets.length > 0 ? "warning" : "info"} sx={{ py: 0, flex: 1 }}>
            No device is named to run the probes{targets.length > 0 ? ", so the targets below are not probed" : ""}. Name two or
            three devices in Agent Settings → Crypto Discovery → <em>Remote probes run from</em>.
          </Alert>
        ) : (
          hosts.map((h) => <Chip key={h} size="small" label={h} sx={{ fontFamily: MONO, height: 22, fontSize: TEXT.xs }} />)
        )}
        <Button component="a" href="?page=policies" size="small" endIcon={<OpenInNewIcon fontSize="small" />} sx={{ ml: "auto", flexShrink: 0 }}>
          Agent Settings
        </Button>
      </Stack>

      <Stack direction="row" spacing={1} alignItems="flex-start" sx={{ mb: 2, flexWrap: "wrap", rowGap: 1 }}>
        <Typography sx={{ fontSize: TEXT.sm, fontWeight: 700, color: BRAND.dark, minWidth: 110 }}>Targets ({targets.length})</Typography>
        {env == null ? null : targets.length === 0 ? (
          <Typography sx={{ fontSize: TEXT.sm, color: TEXT_MUTED }}>None yet — add a discovered service below, or type them in Agent Settings.</Typography>
        ) : (
          targets.map((t) => (
            <Chip key={t} size="small" label={t} onDelete={saving ? undefined : () => remove(t)} sx={{ fontFamily: MONO, height: 22, fontSize: TEXT.xs }} />
          ))
        )}
      </Stack>

      <Typography sx={{ fontSize: TEXT.md, fontWeight: 700, color: BRAND.dark }}>Discovered internal TLS services</Typography>
      <Typography sx={{ fontSize: TEXT.xs, color: TEXT_MUTED, mb: 1 }}>
        Endpoints on private addresses that devices running the local probe connect to (last 14 days). Add the ones you want
        probed; nothing here is probed on its own.
      </Typography>
      {candidates === null ? (
        <Typography sx={{ fontSize: TEXT.xs, color: TEXT_MUTED }}>Loading…</Typography>
      ) : candidates.length === 0 ? (
        <Typography sx={{ fontSize: TEXT.xs, color: TEXT_MUTED }}>
          Nothing discovered yet. Devices report candidates once the local probe is on and they have talked to an internal TLS
          service.
        </Typography>
      ) : (
        <Box sx={{ overflowX: "auto" }}>
          <Box component="table" sx={{ width: "100%", borderCollapse: "collapse", fontSize: TEXT.sm }} aria-label="Discovered internal TLS services">
            <Box component="thead">
              <Box component="tr" sx={{ textAlign: "left", color: TEXT_MUTED, fontSize: TEXT.xs, textTransform: "uppercase", letterSpacing: ".06em" }}>
                <Box component="th" sx={{ py: 0.5 }}>Service</Box>
                <Box component="th">Devices</Box>
                <Box component="th">Connections</Box>
                <Box component="th">Seen from</Box>
                <Box component="th" />
              </Box>
            </Box>
            <Box component="tbody">
              {candidates.map((c) => {
                const isListed = listed.has(String(c.target).toLowerCase());
                return (
                  <Box component="tr" key={c.target} sx={{ borderTop: `1px solid ${BRAND.border}` }}>
                    <Box component="td" sx={{ py: 0.5, fontFamily: MONO }}>{c.target}</Box>
                    <Box component="td">{c.devices}</Box>
                    <Box component="td">{c.connections}</Box>
                    <Box component="td" sx={{ color: TEXT_MUTED }}>{(c.processes ?? []).join(", ") || "—"}</Box>
                    <Box component="td" sx={{ textAlign: "right" }}>
                      {isListed ? (
                        <Typography component="span" sx={{ fontSize: TEXT.xs, color: BRAND.tealText, fontWeight: 700 }}>{c.probed ? "probed" : "listed"}</Typography>
                      ) : (
                        <Button size="small" variant="outlined" disabled={saving || !tenantId || env == null} onClick={() => add(c.target)} aria-label={`Add ${c.target} to probe targets`}>
                          Add
                        </Button>
                      )}
                    </Box>
                  </Box>
                );
              })}
            </Box>
          </Box>
        </Box>
      )}
    </Box>
  );
}
