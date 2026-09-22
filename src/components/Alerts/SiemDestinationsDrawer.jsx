// src/components/Alerts/SiemDestinationsDrawer.jsx
//
// ADR-0028 — a dónde salen las alertas del tenant: el SIEM del cliente o el
// de su MSP (webhook firmado, Splunk HEC o Microsoft Sentinel). F3 suma el
// rastro de auditoría como segunda fuente, por carril (personas / fallos).
//
// Lo que la pantalla dice sin que nadie pregunte, porque es lo que un SOC
// descubre a la primera y cuesta una reunión explicar después:
//   · sale cada TRANSICIÓN (apareció / se resolvió), no la foto de cada hora;
//   · al menos una vez y en orden, con un id estable por evento;
//   · un destino nuevo empieza AHORA: no recibe alertas pasadas;
//   · si el destino no vuelve en 7 días, lo más viejo se pierde.
//
// ⚠️ Al editar se mandan sólo los campos que cambiaron. Un destino que ya
// exporta auditoría exige `audit_log` para tocar URL, secreto, tipo o
// configuración; mandarlo todo en cada guardado haría fallar un simple cambio
// de nombre a quien sólo tiene `alerts`.

import * as React from "react";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  Divider,
  FormControlLabel,
  IconButton,
  MenuItem,
  Select,
  Stack,
  Switch,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import CloseOutlinedIcon from "@mui/icons-material/CloseOutlined";
import HubOutlinedIcon from "@mui/icons-material/HubOutlined";
import { BRAND, TEXT, TEXT_MUTED } from "../../theme/brand";
import { severityMeta } from "../../theme/severity";
import { formatRelative } from "../../utils/format";
import {
  createSiemDestination,
  deleteSiemDestination,
  listSiemDestinations,
  testSiemDestination,
  updateSiemDestination,
} from "../../api/siem";
import { SOURCE_LABEL } from "./alertSources";
import { AUDIT_SCOPE_LABEL, EMPTY_SENTINEL, destinationBody } from "./siemDestinationModel";

const KIND_LABEL = { webhook: "Signed webhook", splunk_hec: "Splunk HEC", sentinel: "Microsoft Sentinel" };
const KIND_HELP = {
  webhook: "A signed POST with a batch of events. Works with Elastic, a Logic App, your own bus or a script. Verify X-Tracenium-Signature: HMAC-SHA256 of \"<X-Tracenium-Timestamp>.<body>\" with the secret below.",
  splunk_hec: "Splunk HTTP Event Collector: use the full collector URL (…:8088/services/collector/event) and the HEC token as the secret.",
  sentinel:
    "Azure Monitor Logs Ingestion API. Register an Entra ID app and give it Monitoring Metrics Publisher on the data collection rule. The rule's stream and the table TraceniumEvents_CL need these columns: TimeGenerated (datetime), EventId, Kind, Source, Severity, Summary, DeviceId, RuleId, RuleName, TraceniumTenantId (string) and Details (dynamic). The URL is the ingestion endpoint, without a path.",
};
const SECRET_LABEL = { webhook: "Signing secret", splunk_hec: "HEC token", sentinel: "Client secret" };
const URL_LABEL = { webhook: "URL (https)", splunk_hec: "URL (https)", sentinel: "Ingestion endpoint (https)" };
const SENTINEL_FIELDS = [
  { key: "azureTenantId", label: "Directory (tenant) ID" },
  { key: "clientId", label: "Application (client) ID" },
  { key: "dcrImmutableId", label: "DCR immutable ID", placeholder: "dcr-…" },
  { key: "streamName", label: "Stream name" },
];


const SEVERITIES = ["info", "low", "medium", "high", "critical"];

const EMPTY = {
  kind: "webhook", label: "", url: "", secret: "", minSeverity: "low", includeResolved: true, sources: [], enabled: true,
  config: EMPTY_SENTINEL, auditScope: "off",
};


function errorText(err) {
  return err?.body?.message || err?.body?.error || err?.message || "Something went wrong";
}

function StatusChip({ d }) {
  const map = {
    ok: { label: "Delivering", sev: "low" },
    test_ok: { label: "Test received", sev: "low" },
    failed: { label: "Failing", sev: "high" },
    test_failed: { label: "Test failed", sev: "high" },
    idle: { label: "Nothing to send yet", sev: "none" },
  };
  const m = d.enabled ? map[d.lastStatus] ?? { label: "Waiting for alerts", sev: "none" } : { label: "Paused", sev: "none" };
  const meta = severityMeta(m.sev);
  return <Chip size="small" label={m.label} sx={{ height: 20, fontSize: TEXT.xs, fontWeight: 700, bgcolor: meta.bg, color: meta.fg }} />;
}

function DestinationForm({ initial, editing, onCancel, onSaved, notify, canExportAudit }) {
  const [v, setV] = React.useState(initial);
  const [busy, setBusy] = React.useState(false);
  const set = (patch) => setV((x) => ({ ...x, ...patch }));

  const save = async () => {
    setBusy(true);
    try {
      const body = destinationBody(v, initial, editing);
      if (editing && Object.keys(body).length === 0) {
        onCancel();
        return;
      }
      if (editing) await updateSiemDestination(editing, body);
      else await createSiemDestination(body);
      notify("success", editing ? "Destination saved." : "Destination added. It receives events from now on — past alerts and audit entries are not sent.");
      onSaved();
    } catch (err) {
      notify("error", errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Stack spacing={1.5} sx={{ p: 1.5, borderRadius: 2, border: `1px solid ${BRAND.border}` }} data-testid="siem-destination-form">
      <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
        <Select size="small" value={v.kind} onChange={(e) => set({ kind: e.target.value })} inputProps={{ "aria-label": "Destination type" }} sx={{ width: 180 }}>
          <MenuItem value="webhook">{KIND_LABEL.webhook}</MenuItem>
          <MenuItem value="splunk_hec">{KIND_LABEL.splunk_hec}</MenuItem>
          <MenuItem value="sentinel">{KIND_LABEL.sentinel}</MenuItem>
        </Select>
        <TextField size="small" label="Name" value={v.label} onChange={(e) => set({ label: e.target.value })} sx={{ flex: 1, minWidth: 180 }} />
      </Box>
      <Typography sx={{ fontSize: TEXT.xs, color: TEXT_MUTED }}>{KIND_HELP[v.kind]}</Typography>
      {v.kind === "sentinel" ? (
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" }, gap: 1 }}>
          {SENTINEL_FIELDS.map((f) => (
            <TextField
              key={f.key}
              size="small"
              label={f.label}
              placeholder={f.placeholder}
              value={v.config?.[f.key] ?? ""}
              onChange={(e) => set({ config: { ...v.config, [f.key]: e.target.value.trim() } })}
              inputProps={{ style: { fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" } }}
            />
          ))}
        </Box>
      ) : null}
      <TextField size="small" label={URL_LABEL[v.kind]} value={v.url} onChange={(e) => set({ url: e.target.value })} inputProps={{ style: { fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" } }} />
      <TextField
        size="small"
        type="password"
        label={SECRET_LABEL[v.kind]}
        placeholder={editing ? "Leave empty to keep the current one" : "At least 16 characters"}
        value={v.secret}
        onChange={(e) => set({ secret: e.target.value })}
        autoComplete="new-password"
      />
      <Typography sx={{ fontSize: TEXT.sm, fontWeight: 700, color: BRAND.dark }}>Alerts</Typography>
      <Box sx={{ display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap" }}>
        <Typography sx={{ fontSize: TEXT.sm }}>From severity</Typography>
        <Select size="small" value={v.minSeverity} onChange={(e) => set({ minSeverity: e.target.value })} inputProps={{ "aria-label": "Minimum severity" }} sx={{ width: 130 }}>
          {SEVERITIES.map((s) => <MenuItem key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</MenuItem>)}
        </Select>
        <FormControlLabel
          control={<Checkbox size="small" checked={v.includeResolved} onChange={(e) => set({ includeResolved: e.target.checked })} />}
          label={<Typography sx={{ fontSize: TEXT.sm }}>Also send when an alert is resolved</Typography>}
        />
      </Box>
      <Box>
        <Typography sx={{ fontSize: TEXT.sm, mb: 0.5 }}>Sources {v.sources.length ? `(${v.sources.length})` : "(all)"}</Typography>
        <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap" }}>
          {Object.entries(SOURCE_LABEL).map(([k, label]) => {
            const on = v.sources.includes(k);
            return (
              <Chip
                key={k}
                size="small"
                label={label}
                onClick={() => set({ sources: on ? v.sources.filter((x) => x !== k) : [...v.sources, k] })}
                variant={on ? "filled" : "outlined"}
                sx={{ fontSize: TEXT.xs, ...(on ? { bgcolor: BRAND.tealSoft, color: BRAND.dark } : {}) }}
              />
            );
          })}
        </Box>
        <Typography sx={{ fontSize: TEXT.xs, color: TEXT_MUTED, mt: 0.5 }}>None selected = every source.</Typography>
      </Box>
      <Box>
        <Typography sx={{ fontSize: TEXT.sm, fontWeight: 700, color: BRAND.dark, mb: 0.5 }}>Audit trail</Typography>
        <Select
          size="small"
          value={v.auditScope}
          onChange={(e) => set({ auditScope: e.target.value })}
          inputProps={{ "aria-label": "Audit trail" }}
          sx={{ minWidth: 280 }}
          disabled={!canExportAudit}
        >
          {Object.entries(AUDIT_SCOPE_LABEL).map(([k, label]) => <MenuItem key={k} value={k}>{label}</MenuItem>)}
        </Select>
        <Typography sx={{ fontSize: TEXT.xs, color: TEXT_MUTED, mt: 0.5 }}>
          {canExportAudit
            ? "Who changed what in this portal: roles, members, policies, certificates. The severity filter above does not apply here; rejected actions arrive as medium. Starts now — past entries are not sent."
            : "Sending the audit trail needs the audit log permission. Ask an owner if you need it."}
        </Typography>
      </Box>
      <Box sx={{ display: "flex", gap: 1, justifyContent: "flex-end" }}>
        <Button onClick={onCancel} disabled={busy}>Cancel</Button>
        <Button variant="contained" onClick={save} disabled={busy} startIcon={busy ? <CircularProgress size={14} /> : null}>
          {editing ? "Save" : "Add destination"}
        </Button>
      </Box>
    </Stack>
  );
}

/**
 * `embedded` — rendered inside the Destinations tab of Alerts instead of a
 * drawer: no header (the tab names it) and no close button.
 */
export default function SiemDestinationsDrawer({ onClose, notify = () => {}, embedded = false }) {
  const [items, setItems] = React.useState(null);
  const [error, setError] = React.useState(null);
  const [form, setForm] = React.useState(null); // { initial, editing }
  const [busyId, setBusyId] = React.useState(null);
  const [canExportAudit, setCanExportAudit] = React.useState(false);

  const load = React.useCallback(async () => {
    try {
      const res = await listSiemDestinations();
      setItems(Array.isArray(res?.destinations) ? res.destinations : []);
      setCanExportAudit(res?.canExportAudit === true);
      setError(null);
    } catch (err) {
      setError(errorText(err));
      setItems([]);
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  const act = async (id, fn, okMessage) => {
    setBusyId(id);
    try {
      const r = await fn();
      if (okMessage) notify(r?.result?.ok === false ? "error" : "success", typeof okMessage === "function" ? okMessage(r) : okMessage);
      await load();
    } catch (err) {
      notify("error", errorText(err));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Box
      sx={embedded ? undefined : { display: "flex", flexDirection: "column", height: "100%" }}
      data-testid="siem-destinations-drawer"
    >
      {embedded ? null : (
      <Stack direction="row" alignItems="center" sx={{ p: 2, borderBottom: `1px solid ${BRAND.border}` }}>
        <HubOutlinedIcon sx={{ color: BRAND.teal, mr: 1 }} />
        <Box sx={{ flex: 1 }}>
          <Typography variant="h6" sx={{ fontWeight: 800, color: BRAND.dark }}>Alert destinations</Typography>
          <Typography variant="caption" sx={{ color: BRAND.gray }}>Send this tenant's alerts to your SIEM.</Typography>
        </Box>
        <IconButton aria-label="Close" onClick={onClose} size="small">
          <CloseOutlinedIcon fontSize="small" />
        </IconButton>
      </Stack>
      )}

      <Box sx={embedded ? undefined : { flex: 1, overflowY: "auto", p: 2 }}>
        <Alert severity="info" sx={{ mb: 2 }}>
          Each alert is sent when it appears and, if you choose, when it is resolved — not again every hour it stays
          open. Delivery is at least once and in order; every event carries a stable id to deduplicate. A new
          destination starts now and does not receive past alerts. If it stays unreachable for more than 7 days, the
          oldest alert events are dropped. A destination can also receive the audit trail — who changed what in this
          portal.
        </Alert>

        {error ? <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert> : null}
        {items === null ? <CircularProgress size={20} sx={{ color: BRAND.teal }} /> : null}

        {items?.length === 0 && !form ? (
          <Typography sx={{ fontSize: TEXT.sm, color: TEXT_MUTED, mb: 2 }}>No destination yet. Alerts stay in this portal, email and push.</Typography>
        ) : null}

        <Stack spacing={1.25}>
          {(items ?? []).map((d) =>
            form?.editing === d.id ? (
              <DestinationForm
                key={d.id}
                editing={d.id}
                initial={{
                  kind: d.kind, label: d.label, url: d.url, secret: "", minSeverity: d.minSeverity, includeResolved: d.includeResolved,
                  sources: d.sources ?? [], enabled: d.enabled, config: d.kind === "sentinel" ? { ...EMPTY_SENTINEL, ...d.config } : EMPTY_SENTINEL,
                  auditScope: d.auditScope ?? "off",
                }}
                canExportAudit={canExportAudit}
                onCancel={() => setForm(null)}
                onSaved={() => { setForm(null); load(); }}
                notify={notify}
              />
            ) : (
              <Box key={d.id} sx={{ p: 1.5, borderRadius: 2, border: `1px solid ${BRAND.border}` }} data-testid={`siem-destination-${d.id}`}>
                <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
                  <Typography sx={{ fontSize: TEXT.md, fontWeight: 700, color: BRAND.dark }}>{d.label}</Typography>
                  <Chip size="small" label={KIND_LABEL[d.kind] ?? d.kind} sx={{ height: 20, fontSize: TEXT.xs }} />
                  <StatusChip d={d} />
                  <Box sx={{ flex: 1 }} />
                  <Switch
                    size="small"
                    checked={d.enabled}
                    disabled={busyId === d.id}
                    onChange={(e) => act(d.id, () => updateSiemDestination(d.id, { enabled: e.target.checked }), e.target.checked ? "Destination resumed." : "Destination paused.")}
                    inputProps={{ "aria-label": `${d.enabled ? "Pause" : "Resume"} ${d.label}` }}
                  />
                </Box>
                <Typography sx={{ fontSize: TEXT.xs, color: TEXT_MUTED, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", wordBreak: "break-all" }}>{d.url}</Typography>
                <Typography sx={{ fontSize: TEXT.xs, color: TEXT_MUTED, mt: 0.5 }}>
                  {d.eventsDelivered} event{d.eventsDelivered === 1 ? "" : "s"} delivered
                  {d.lastDeliveryAt ? ` · last ${formatRelative(d.lastDeliveryAt)}` : ""}
                  {d.backlog > 0 ? ` · ${d.backlog} waiting` : ""}
                  {" · "}from {d.minSeverity}
                  {d.sources?.length ? ` · ${d.sources.length} source${d.sources.length === 1 ? "" : "s"}` : " · all sources"}
                </Typography>
                {d.auditScope && d.auditScope !== "off" ? (
                  <Typography sx={{ fontSize: TEXT.xs, color: TEXT_MUTED }} data-testid={`siem-destination-${d.id}-audit`}>
                    Audit trail: {AUDIT_SCOPE_LABEL[d.auditScope]?.toLowerCase() ?? d.auditScope}
                    {d.auditBacklog > 0 ? ` · ${d.auditBacklog >= 10000 ? "10,000+" : d.auditBacklog} waiting` : ""}
                  </Typography>
                ) : null}
                {d.lastError && (d.lastStatus === "failed" || d.lastStatus === "test_failed") ? (
                  <Typography sx={{ fontSize: TEXT.xs, color: severityMeta("high").fg, mt: 0.5 }}>
                    {d.lastError}
                    {d.lastStatus === "failed" && d.nextAttemptAt ? ` · retrying ${formatRelative(d.nextAttemptAt)}` : ""}
                  </Typography>
                ) : null}
                <Box sx={{ display: "flex", gap: 1, mt: 1 }}>
                  <Tooltip title="Sends one test event. It does not consume or resend real alerts.">
                    <span>
                      <Button size="small" variant="outlined" disabled={busyId === d.id} onClick={() => act(d.id, () => testSiemDestination(d.id), (r) => (r?.result?.ok ? "Test event accepted." : `Test failed: ${r?.result?.error ?? "no answer"}`))}>
                        Send test
                      </Button>
                    </span>
                  </Tooltip>
                  <Button size="small" onClick={() => setForm({ editing: d.id })}>Edit</Button>
                  <Button size="small" color="error" disabled={busyId === d.id} onClick={() => { if (window.confirm(`Delete “${d.label}”? Alerts stop going there.`)) act(d.id, () => deleteSiemDestination(d.id), "Destination deleted."); }}>
                    Delete
                  </Button>
                </Box>
              </Box>
            )
          )}
        </Stack>

        <Divider sx={{ my: 2 }} />
        {form && !form.editing ? (
          <DestinationForm initial={EMPTY} editing={null} onCancel={() => setForm(null)} onSaved={() => { setForm(null); load(); }} notify={notify} canExportAudit={canExportAudit} />
        ) : (
          <Button variant="outlined" onClick={() => setForm({ editing: null })}>Add destination</Button>
        )}
      </Box>
    </Box>
  );
}
