// src/components/CryptoDiscovery/CdpProbeRanges.jsx
//
// Ola 1.2 — `cdp.probeRanges`: los rangos que los equipos sonda BARREN.
//
// ── Por qué aquí y no en Agent Settings ──────────────────────────────
//
// Es una lista de objetos `{ range, ports, sni? }`, y Agent Settings sólo
// sabe editar número / texto / líneas / switch / desplegable. Pero sobre
// todo: se lee al lado de las sondas remotas, porque es la MISMA decisión
// contada de dos maneras — un objetivo es un servicio que alguien nombró,
// un rango es «mira a ver qué hay». Los dos escriben la policy del tenant
// por el mismo camino (PATCH del dominio `cdp` con If-Match) y los dos son
// del complemento CDP Coverage.
//
// ⚠️ Los topes son los del backend (`policies.service.ts`) y los del
// parser del agente, y se comprueban ANTES de guardar: el agente DESCARTA
// una entrada que no cumple —entera, no recortada—, así que un /16 guardado
// desde el portal parecería puesto y no barrería nada. Que reboten al
// escribirlos es la diferencia entre un ajuste que falla y uno que miente.

import * as React from "react";
import { Alert, Box, Button, Chip, IconButton, Stack, TextField, Tooltip, Typography } from "@mui/material";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import { BRAND, TEXT, TEXT_MUTED } from "../../theme/brand";
import { getTenantPolicy, patchTenantPolicyDomain } from "../../api/policies";
import { useEffectiveTenantId } from "../../hooks/useEffectiveTenantId";
import { envelopeOf } from "./CdpRemoteProbes";
import {
  CDP_PROBE_RANGES_MAX,
  CDP_PROBE_RANGE_MAX_ADDRESSES,
  CDP_PROBE_RANGE_MAX_PORTS,
  CDP_PROBE_RANGE_MIN_PREFIX,
  probeRangeIssues,
  probeRangeSize
} from "../Policies/policyTransforms";

const MONO = "ui-monospace, Menlo, monospace";

/** "443, 8443" → [443, 8443]; lo que no es un entero se queda fuera. */
function parsePorts(text) {
  return String(text ?? "")
    .split(/[\s,;]+/)
    .filter(Boolean)
    .map((t) => Number(t))
    .filter((n) => Number.isInteger(n));
}

export default function CdpProbeRanges({ refreshNonce, locked = false }) {
  const tenantId = useEffectiveTenantId();
  const [env, setEnv] = React.useState(null);
  const [error, setError] = React.useState(null);
  const [notice, setNotice] = React.useState(null);
  const [saving, setSaving] = React.useState(false);
  const [nonce, setNonce] = React.useState(0);
  const [draft, setDraft] = React.useState({ range: "", ports: "443", sni: "" });

  React.useEffect(() => {
    if (!tenantId) return undefined;
    let alive = true;
    setError(null);
    getTenantPolicy(tenantId)
      .then(envelopeOf)
      .then((e) => alive && setEnv(e))
      // Un fallo de lectura NO puede leerse como «no hay rangos»: sin
      // envelope no se pinta una lista vacía, se pinta el error.
      .catch((e) => alive && setError(e?.message || String(e)));
    return () => {
      alive = false;
    };
  }, [tenantId, refreshNonce, nonce]);

  const ranges = Array.isArray(env?.cdp?.probeRanges) ? env.cdp.probeRanges : [];
  const draftEntry = {
    range: draft.range.trim(),
    ports: parsePorts(draft.ports),
    ...(draft.sni.trim() ? { sni: draft.sni.trim() } : {})
  };
  const draftIssues = draft.range.trim() === "" ? [] : probeRangeIssues(draftEntry);
  const full = ranges.length >= CDP_PROBE_RANGES_MAX;

  /** true sólo si el servidor aceptó la escritura. */
  const write = async (next, what) => {
    if (!tenantId || !env) return false;
    if (env.version == null) {
      setNotice({ sev: "error", text: "The policy version could not be read, so nothing was saved. Reload and try again." });
      return false;
    }
    setSaving(true);
    setNotice(null);
    try {
      // Bloque `cdp` entero con la versión cargada, igual que las sondas:
      // un PATCH que sólo llevara `probeRanges` borraría el resto.
      const res = await patchTenantPolicyDomain(tenantId, "cdp", { cdp: { ...env.cdp, probeRanges: next } }, { expectedVersion: env.version });
      setEnv({ version: res?.policyVersion != null ? String(res.policyVersion) : env.version, cdp: { ...env.cdp, probeRanges: next } });
      setNotice({ sev: "success", text: `${what}. The devices under “Runs from” pick it up on their next policy refresh.` });
      setNonce((n) => n + 1);
      return true;
    } catch (e) {
      if (e?.status === 409) {
        setNotice({ sev: "warning", text: "The policy was modified by someone else. Reloaded — try again." });
        setNonce((n) => n + 1);
      } else {
        setNotice({ sev: "error", text: e?.message || String(e) });
      }
      return false;
    } finally {
      setSaving(false);
    }
  };

  const add = async () => {
    if (draftIssues.length > 0 || !draftEntry.range) return;
    if (full) {
      setNotice({ sev: "error", text: `At most ${CDP_PROBE_RANGES_MAX} ranges.` });
      return;
    }
    // El formulario sólo se vacía si el servidor lo aceptó: si falla, lo
    // escrito sigue ahí para reintentar en vez de haber que teclearlo otra vez.
    if (await write([...ranges, draftEntry], `${draftEntry.range} added to the swept ranges`)) {
      setDraft({ range: "", ports: "443", sni: "" });
    }
  };
  const remove = (i) => write(ranges.filter((_, idx) => idx !== i), `${ranges[i]?.range ?? "The range"} removed from the swept ranges`);

  return (
    <Box>
      <Typography sx={{ fontWeight: 700, fontSize: TEXT.base, color: BRAND.dark }}>Ranges to sweep</Typography>
      <Typography sx={{ fontSize: TEXT.sm, color: BRAND.dark, opacity: 0.8, mb: 1 }}>
        The other half of remote probing: instead of naming a service, name a range and the probe devices try a TLS
        handshake against every address in it. It is how a certificate on a machine nobody listed gets found — the
        inventory then says it was <em>found by a range sweep</em>, and which range found it.
      </Typography>
      <Typography sx={{ fontSize: TEXT.xs, color: TEXT_MUTED, mb: 1.5 }}>
        Limits, enforced here because the agent enforces them by <strong>dropping an entry whole</strong> — it never
        trims one down, so a range over the cap sweeps nothing at all rather than sweeping part of itself:
        at most {CDP_PROBE_RANGES_MAX} entries, each covering at most {CDP_PROBE_RANGE_MAX_ADDRESSES.toLocaleString()} addresses
        (an IPv4 CIDR of /{CDP_PROBE_RANGE_MIN_PREFIX} or narrower, or a <code>start-end</code> pair) and at
        most {CDP_PROBE_RANGE_MAX_PORTS} ports. The numbers are about safety, not speed: sweeping a network is the one
        thing the agent does that an IDS can read as a port scan.
      </Typography>

      {locked ? (
        // ADR-0026: aquí NO hay muestra gratis, a diferencia de los objetivos
        // sueltos (3 incluidos). Decirlo es la mitad del aviso — quien ve «0
        // rangos» sin esto cree que se le borraron.
        <Alert severity="info" icon={false} sx={{ mb: 1.5, border: `1px solid ${BRAND.border}`, bgcolor: "transparent" }}>
          <Typography sx={{ fontSize: TEXT.sm, fontWeight: 700, color: BRAND.dark, mb: 0.5 }}>Included in CDP Coverage</Typography>
          <Typography sx={{ fontSize: TEXT.sm, color: BRAND.dark, opacity: 0.85 }}>
            Without the add-on, ranges are <strong>not delivered to the devices at all</strong> — there is no free
            sample here, unlike the three included probe targets. A sweep discovers machines nobody licensed, which is
            exactly what the add-on covers, and the smallest range already shows a whole network. Anything already
            collected stays visible with the date it was last read.
          </Typography>
        </Alert>
      ) : null}

      {error ? <Alert severity="error" sx={{ mb: 1.5 }}>The swept ranges could not be read: {error}</Alert> : null}
      {notice ? <Alert severity={notice.sev} sx={{ mb: 1.5 }} onClose={() => setNotice(null)}>{notice.text}</Alert> : null}

      <Stack spacing={0.75} sx={{ mb: 1.5 }}>
        {env == null && !error ? (
          <Typography sx={{ fontSize: TEXT.sm, color: TEXT_MUTED }}>Loading…</Typography>
        ) : ranges.length === 0 && !error ? (
          <Typography sx={{ fontSize: TEXT.sm, color: TEXT_MUTED }}>No range is swept. Add one below.</Typography>
        ) : (
          ranges.map((r, i) => {
            const issues = probeRangeIssues(r);
            const size = probeRangeSize(r?.range);
            return (
              <Stack
                key={`${r?.range}-${i}`}
                direction="row"
                spacing={1}
                alignItems="center"
                sx={{ flexWrap: "wrap", rowGap: 0.5, border: `1px solid ${BRAND.border}`, borderRadius: 1.5, px: 1.25, py: 0.75 }}
              >
                <Typography sx={{ fontFamily: MONO, fontSize: TEXT.sm, fontWeight: 700 }}>{r?.range || "—"}</Typography>
                <Typography sx={{ fontSize: TEXT.xs, color: TEXT_MUTED }}>
                  {size != null ? `${size.toLocaleString()} address${size === 1 ? "" : "es"}` : "size unknown"}
                </Typography>
                {(Array.isArray(r?.ports) ? r.ports : []).map((p) => (
                  <Chip key={p} size="small" label={`tcp/${p}`} sx={{ height: 20, fontSize: TEXT.xs, fontFamily: MONO }} />
                ))}
                {r?.sni ? (
                  <Tooltip arrow title="Every handshake in this range sends this server name. Without it the sweep records what each IP serves with no SNI.">
                    <Chip size="small" label={`SNI ${r.sni}`} sx={{ height: 20, fontSize: TEXT.xs, bgcolor: BRAND.tealSoft, color: BRAND.tealText, fontWeight: 700 }} />
                  </Tooltip>
                ) : null}
                {issues.length > 0 ? (
                  <Tooltip arrow title={issues.join(" ")}>
                    <Chip
                      size="small"
                      label="dropped by the agent"
                      sx={{ height: 20, fontSize: TEXT.xs, bgcolor: BRAND.alert.errorSoft, color: BRAND.alert.errorText, fontWeight: 700 }}
                    />
                  </Tooltip>
                ) : null}
                <IconButton
                  size="small"
                  aria-label={`Remove ${r?.range}`}
                  disabled={saving || env == null}
                  onClick={() => remove(i)}
                  sx={{ ml: "auto" }}
                >
                  <DeleteOutlineIcon fontSize="small" />
                </IconButton>
              </Stack>
            );
          })
        )}
      </Stack>

      <Stack direction="row" spacing={1} alignItems="flex-start" sx={{ flexWrap: "wrap", rowGap: 1 }}>
        <TextField
          size="small"
          label="Range"
          placeholder="10.0.4.0/24"
          value={draft.range}
          onChange={(e) => setDraft((d) => ({ ...d, range: e.target.value }))}
          slotProps={{ htmlInput: { "aria-label": "Range", style: { fontFamily: MONO } } }}
          sx={{ minWidth: 200 }}
        />
        <TextField
          size="small"
          label="Ports"
          placeholder="443, 8443"
          value={draft.ports}
          onChange={(e) => setDraft((d) => ({ ...d, ports: e.target.value }))}
          slotProps={{ htmlInput: { "aria-label": "Ports" } }}
          sx={{ minWidth: 150 }}
        />
        <TextField
          size="small"
          label="SNI (optional)"
          placeholder="www.corp.example"
          value={draft.sni}
          onChange={(e) => setDraft((d) => ({ ...d, sni: e.target.value }))}
          slotProps={{ htmlInput: { "aria-label": "SNI" } }}
          sx={{ minWidth: 200 }}
        />
        <Button
          variant="outlined"
          size="medium"
          onClick={add}
          disabled={saving || env == null || full || draft.range.trim() === "" || draftIssues.length > 0}
        >
          Add range
        </Button>
      </Stack>
      {draftIssues.length > 0 ? (
        <Typography sx={{ fontSize: TEXT.xs, color: BRAND.alert.errorText, fontWeight: 600, mt: 0.75 }}>
          {draftIssues.join(" ")}
        </Typography>
      ) : null}
      {full ? (
        <Typography sx={{ fontSize: TEXT.xs, color: BRAND.alert.warningText, fontWeight: 600, mt: 0.75 }}>
          {CDP_PROBE_RANGES_MAX} ranges is the maximum. Remove one to add another.
        </Typography>
      ) : null}
    </Box>
  );
}
