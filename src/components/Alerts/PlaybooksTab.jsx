// src/components/Alerts/PlaybooksTab.jsx
//
// ADR-0034 F2 — la pestaña Playbooks, dentro de Alertas: un playbook responde
// a una alerta, así que vive junto a las reglas que la producen.
//
// Lo que la pantalla dice sin que nadie pregunte:
//   · un playbook nuevo está en ENSAYO y no toca nada; armarlo es otro gesto;
//   · armarlo exige el permiso de lo que la acción hace de verdad;
//   · los frenos (enfriamiento, topes) se ven, y cuando uno para una corrida
//     se dice cuál y por qué;
//   · un tope diario alcanzado PAUSA el playbook, y eso se lee en la fila.

import * as React from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  MenuItem,
  Select,
  Stack,
  Switch,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import PlayCircleOutlineOutlinedIcon from "@mui/icons-material/PlayCircleOutlineOutlined";
import ScienceOutlinedIcon from "@mui/icons-material/ScienceOutlined";
import { BRAND, TEXT, TEXT_MUTED } from "../../theme/brand";
import { severityMeta } from "../../theme/severity";
import { formatRelative } from "../../utils/format";
import {
  createPlaybook,
  deletePlaybook,
  listPlaybookRuns,
  listPlaybooks,
  setPlaybookEnabled,
  setPlaybookMode,
  updatePlaybook,
} from "../../api/playbooks";
import { SOURCE_LABEL } from "./alertSources";
import {
  ACTION_LABEL,
  CAPABILITY_LABEL,
  DECISION_LABEL,
  MODE_LABEL,
  PROBES,
  PROBE_BY_KEY,
  SEVERITIES,
  actionSummary,
  capabilitiesForActions,
  emptyParams,
  playbookBody,
  playbookProblem,
  skipReasonLabel,
  triggerSummary,
} from "./playbookModel";

const DEFAULT_GUARDS = { devicesPerTick: 25, runsPerDay: 50, cooldownHours: 6 };
const EMPTY_FORM = {
  name: "",
  sources: [],
  minSeverity: "medium",
  conditions: [],
  actions: [{ kind: "remediate", mode: "apply", checkId: "" }],
  guards: DEFAULT_GUARDS,
};

const errorText = (err) => err?.body?.message || err?.body?.error || err?.message || "Something went wrong";

function formFrom(pb) {
  const d = pb.definition ?? {};
  return {
    name: pb.name,
    sources: d.trigger?.sources ?? [],
    minSeverity: d.trigger?.minSeverity ?? "medium",
    conditions: (d.conditions ?? []).map((c) => ({ ...c, value: Array.isArray(c.value) ? c.value.join(", ") : c.value })),
    actions: (d.actions ?? []).map((a) => (a.kind === "live_query" ? { ...a, params: { ...a.params } } : { ...a, checkId: a.checkId ?? "" })),
    guards: { ...DEFAULT_GUARDS, ...(d.guards ?? {}) },
  };
}

function ModeChip({ pb }) {
  const armed = pb.mode === "armed";
  const meta = severityMeta(armed ? "medium" : "none");
  return <Chip size="small" icon={armed ? <PlayCircleOutlineOutlinedIcon /> : <ScienceOutlinedIcon />} label={MODE_LABEL[pb.mode]} sx={{ fontWeight: 800, fontSize: TEXT.xs, bgcolor: meta.bg, color: meta.fg }} />;
}

function ActionEditor({ action, onChange, onRemove }) {
  const set = (patch) => onChange({ ...action, ...patch });
  const probe = action.kind === "live_query" ? PROBE_BY_KEY[action.probe] : null;
  return (
    <Box sx={{ p: 1.25, borderRadius: 2, border: `1px solid ${BRAND.border}` }} data-testid="pb-action">
      <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", alignItems: "center" }}>
        <Select
          size="small"
          value={action.kind}
          onChange={(e) => (e.target.value === "live_query" ? onChange({ kind: "live_query", probe: "process", params: emptyParams("process") }) : onChange({ kind: "remediate", mode: "apply", checkId: "" }))}
          inputProps={{ "aria-label": "Action" }}
          sx={{ minWidth: 200 }}
        >
          <MenuItem value="remediate">{ACTION_LABEL.remediate}</MenuItem>
          <MenuItem value="live_query">{ACTION_LABEL.live_query}</MenuItem>
        </Select>
        {action.kind === "remediate" ? (
          <>
            <Select size="small" value={action.mode} onChange={(e) => set({ mode: e.target.value })} inputProps={{ "aria-label": "Remediation mode" }} sx={{ minWidth: 140 }}>
              <MenuItem value="apply">Apply the fix</MenuItem>
              <MenuItem value="dry_run">Simulate on the device</MenuItem>
            </Select>
            <TextField
              size="small"
              label="Check"
              placeholder="Leave empty: the one in the alert"
              value={action.checkId ?? ""}
              onChange={(e) => set({ checkId: e.target.value })}
              sx={{ minWidth: 260 }}
            />
          </>
        ) : (
          <>
            <Select
              size="small"
              value={action.probe}
              onChange={(e) => onChange({ kind: "live_query", probe: e.target.value, params: emptyParams(e.target.value) })}
              inputProps={{ "aria-label": "Question" }}
              sx={{ minWidth: 200 }}
            >
              {PROBES.map((p) => (
                <MenuItem key={p.key} value={p.key}>{p.label}</MenuItem>
              ))}
            </Select>
            {(probe?.fields ?? []).map((f) => (
              <TextField
                key={f.name}
                size="small"
                label={f.label}
                placeholder={f.placeholder}
                value={action.params?.[f.name] ?? ""}
                onChange={(e) => set({ params: { ...action.params, [f.name]: e.target.value } })}
                sx={{ minWidth: 220 }}
              />
            ))}
          </>
        )}
        <Box sx={{ flex: 1 }} />
        <Button size="small" color="error" onClick={onRemove} sx={{ textTransform: "none" }}>Remove</Button>
      </Box>
      {action.kind === "remediate" && !String(action.checkId ?? "").trim() ? (
        <Typography sx={{ fontSize: TEXT.xs, color: TEXT_MUTED, mt: 0.5 }}>
          Without a check, it remediates the one the alert names. If the alert does not name one, the run says so and does nothing.
        </Typography>
      ) : null}
    </Box>
  );
}

function PlaybookForm({ initial, editing, onCancel, onSaved, notify }) {
  const [v, setV] = React.useState(initial);
  const [busy, setBusy] = React.useState(false);
  const [problem, setProblem] = React.useState(null);
  const set = (patch) => setV((x) => ({ ...x, ...patch }));
  const needed = capabilitiesForActions(v.actions);

  const save = async () => {
    const p = playbookProblem(v);
    if (p) {
      setProblem(p);
      return;
    }
    setProblem(null);
    setBusy(true);
    try {
      const body = playbookBody(v);
      if (editing) await updatePlaybook(editing, body);
      else await createPlaybook(body);
      notify("success", editing ? "Playbook saved." : "Playbook created — it starts in rehearsal and touches nothing until you arm it.");
      onSaved();
    } catch (err) {
      setProblem(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Stack spacing={1.5} sx={{ p: 1.5, borderRadius: 2, border: `1px solid ${BRAND.border}` }} data-testid="pb-form">
      <TextField size="small" label="Name" value={v.name} onChange={(e) => set({ name: e.target.value })} />

      <Typography sx={{ fontSize: TEXT.sm, fontWeight: 700, color: BRAND.dark }}>When</Typography>
      <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", alignItems: "center" }}>
        <Typography sx={{ fontSize: TEXT.sm }}>An alert opens, from</Typography>
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
      </Box>
      <Box sx={{ display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap" }}>
        <Typography sx={{ fontSize: TEXT.sm }}>from severity</Typography>
        <Select size="small" value={v.minSeverity} onChange={(e) => set({ minSeverity: e.target.value })} inputProps={{ "aria-label": "Minimum severity" }} sx={{ width: 130 }}>
          {SEVERITIES.map((s) => <MenuItem key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</MenuItem>)}
        </Select>
        <Typography sx={{ fontSize: TEXT.xs, color: TEXT_MUTED }}>No source selected = any source.</Typography>
      </Box>

      <Typography sx={{ fontSize: TEXT.sm, fontWeight: 700, color: BRAND.dark }}>Do</Typography>
      {v.actions.map((a, i) => (
        <ActionEditor
          key={i}
          action={a}
          onChange={(next) => set({ actions: v.actions.map((x, j) => (j === i ? next : x)) })}
          onRemove={() => set({ actions: v.actions.filter((_, j) => j !== i) })}
        />
      ))}
      <Box>
        <Button size="small" onClick={() => set({ actions: [...v.actions, { kind: "live_query", probe: "process", params: emptyParams("process") }] })} sx={{ textTransform: "none" }}>
          Add action
        </Button>
      </Box>

      <Typography sx={{ fontSize: TEXT.sm, fontWeight: 700, color: BRAND.dark }}>Limits</Typography>
      <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
        {[
          { key: "devicesPerTick", label: "Devices per run", help: "Above this, the rest is held back and said so." },
          { key: "runsPerDay", label: "Runs per day", help: "On reaching it the playbook pauses itself." },
          { key: "cooldownHours", label: "Cooldown (hours)", help: "Per device. Breaks the fix → re-open → fix loop." },
        ].map((g) => (
          <TextField
            key={g.key}
            size="small"
            type="number"
            label={g.label}
            helperText={g.help}
            value={v.guards[g.key]}
            onChange={(e) => set({ guards: { ...v.guards, [g.key]: Number(e.target.value) } })}
            sx={{ width: 210 }}
          />
        ))}
      </Box>

      <Alert severity="info" sx={{ fontSize: TEXT.sm }}>
        A new playbook runs in <b>rehearsal</b>: it records what it would have done and calls nobody. Arming it is a
        separate step and needs the permission for what it does
        {needed.length ? ` (${needed.map((c) => CAPABILITY_LABEL[c] ?? c).join(", ")})` : ""}.
      </Alert>
      {problem ? <Alert severity="error">{problem}</Alert> : null}

      <Box sx={{ display: "flex", gap: 1, justifyContent: "flex-end" }}>
        <Button onClick={onCancel} disabled={busy}>Cancel</Button>
        <Button variant="contained" onClick={save} disabled={busy} startIcon={busy ? <CircularProgress size={14} /> : null} sx={{ bgcolor: BRAND.teal, "&:hover": { bgcolor: BRAND.tealHover }, textTransform: "none", fontWeight: 700 }}>
          {editing ? "Save" : "Create in rehearsal"}
        </Button>
      </Box>
    </Stack>
  );
}

function Runs({ playbookId }) {
  const [runs, setRuns] = React.useState(null);
  React.useEffect(() => {
    let alive = true;
    listPlaybookRuns(playbookId)
      .then((res) => alive && setRuns(Array.isArray(res?.runs) ? res.runs : []))
      .catch(() => alive && setRuns([]));
    return () => {
      alive = false;
    };
  }, [playbookId]);

  if (runs === null) return <CircularProgress size={16} sx={{ color: BRAND.teal }} />;
  if (runs.length === 0) return <Typography sx={{ fontSize: TEXT.sm, color: TEXT_MUTED }}>No run yet. A run appears when a matching alert opens.</Typography>;
  return (
    <Stack spacing={0.5} data-testid="pb-runs">
      {runs.map((r) => (
        <Box key={r.id} sx={{ fontSize: TEXT.sm }}>
          <Typography component="span" sx={{ fontSize: TEXT.sm, fontWeight: 700, color: BRAND.dark }}>{DECISION_LABEL[r.decision] ?? r.decision}</Typography>
          <Typography component="span" sx={{ fontSize: TEXT.sm, color: TEXT_MUTED }}>
            {" "}· {r.deviceId ?? "no device"} · {formatRelative(r.createdAt)}
            {r.skipReason ? ` · ${skipReasonLabel(r.skipReason)}` : ""}
          </Typography>
          {r.actions?.length ? (
            <Typography sx={{ fontSize: TEXT.xs, color: TEXT_MUTED, pl: 1 }}>
              {r.actions.map((a) => `${ACTION_LABEL[a.kind] ?? a.kind}: ${a.status}${a.detail ? ` (${a.detail})` : ""}`).join(" · ")}
            </Typography>
          ) : null}
        </Box>
      ))}
    </Stack>
  );
}

export default function PlaybooksTab({ notify = () => {} }) {
  const [items, setItems] = React.useState(null);
  const [error, setError] = React.useState(null);
  const [form, setForm] = React.useState(null);
  const [openRuns, setOpenRuns] = React.useState(null);
  const [busyId, setBusyId] = React.useState(null);

  const load = React.useCallback(async () => {
    try {
      const res = await listPlaybooks();
      setItems(Array.isArray(res?.playbooks) ? res.playbooks : []);
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
      await fn();
      if (okMessage) notify("success", okMessage);
      await load();
    } catch (err) {
      notify("error", errorText(err));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Stack spacing={1.5} data-testid="playbooks-tab">
      <Alert severity="info">
        A playbook answers an alert without a person: when one opens and matches, it can ask the device a question or
        remediate the check that failed. It starts in rehearsal, it only ever touches the device the alert names, and
        its limits — cooldown per device, devices per run, runs per day — are shown below each one.
      </Alert>
      {error ? <Alert severity="error">{error}</Alert> : null}
      {items === null ? <CircularProgress size={20} sx={{ color: BRAND.teal }} /> : null}
      {items?.length === 0 && !form ? (
        <Typography sx={{ fontSize: TEXT.sm, color: TEXT_MUTED }}>No playbook yet. Alerts keep arriving as always; nothing acts on them on its own.</Typography>
      ) : null}

      {(items ?? []).map((pb) =>
        form?.editing === pb.id ? (
          <PlaybookForm key={pb.id} editing={pb.id} initial={formFrom(pb)} onCancel={() => setForm(null)} onSaved={() => { setForm(null); load(); }} notify={notify} />
        ) : (
          <Box key={pb.id} sx={{ p: 1.5, borderRadius: 2, border: `1px solid ${BRAND.border}` }} data-testid={`pb-${pb.id}`}>
            <Box sx={{ display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap" }}>
              <Typography sx={{ fontSize: TEXT.md, fontWeight: 700, color: BRAND.dark }}>{pb.name}</Typography>
              <ModeChip pb={pb} />
              {!pb.enabled ? <Chip size="small" label="Paused" sx={{ height: 20, fontSize: TEXT.xs, fontWeight: 700 }} /> : null}
              <Box sx={{ flex: 1 }} />
              <Tooltip title={pb.enabled ? "Pause: it stops matching alerts" : "Resume"}>
                <Switch
                  size="small"
                  checked={pb.enabled}
                  disabled={busyId === pb.id}
                  onChange={(e) => act(pb.id, () => setPlaybookEnabled(pb.id, e.target.checked), e.target.checked ? "Playbook resumed." : "Playbook paused.")}
                  inputProps={{ "aria-label": `${pb.enabled ? "Pause" : "Resume"} ${pb.name}` }}
                />
              </Tooltip>
            </Box>

            <Typography sx={{ fontSize: TEXT.sm, color: TEXT_MUTED }}>{triggerSummary(pb.definition?.trigger)}</Typography>
            {(pb.definition?.actions ?? []).map((a, i) => (
              <Typography key={i} sx={{ fontSize: TEXT.sm, color: BRAND.dark }}>→ {actionSummary(a)}</Typography>
            ))}
            <Typography sx={{ fontSize: TEXT.xs, color: TEXT_MUTED, mt: 0.5 }}>
              Up to {pb.definition?.guards?.devicesPerTick} devices per run · {pb.definition?.guards?.runsPerDay} runs per day
              {" "}· {pb.definition?.guards?.cooldownHours} h cooldown per device
              {pb.runsToday ? ` · ${pb.runsToday} today` : ""}
              {pb.armedBy ? ` · armed by ${pb.armedBy}` : ""}
            </Typography>
            {pb.pausedReason ? (
              <Typography sx={{ fontSize: TEXT.xs, color: severityMeta("high").fg }} data-testid={`pb-paused-${pb.id}`}>
                Paused on its own: {pb.pausedReason}
              </Typography>
            ) : null}

            <Box sx={{ display: "flex", gap: 1, mt: 1, flexWrap: "wrap" }}>
              {pb.mode === "armed" ? (
                <Button size="small" variant="outlined" disabled={busyId === pb.id} onClick={() => act(pb.id, () => setPlaybookMode(pb.id, "dry_run"), "Back to rehearsal — it records what it would do and calls nobody.")}>
                  Back to rehearsal
                </Button>
              ) : (
                <Tooltip title={`Arming needs: ${["Playbooks", ...capabilitiesForActions(pb.definition?.actions ?? []).map((c) => CAPABILITY_LABEL[c] ?? c)].join(", ")}`}>
                  <span>
                    <Button
                      size="small"
                      variant="contained"
                      disabled={busyId === pb.id}
                      onClick={() => {
                        if (window.confirm(`Arm “${pb.name}”? From now on it acts on matching alerts without asking.`)) {
                          act(pb.id, () => setPlaybookMode(pb.id, "armed"), "Playbook armed.");
                        }
                      }}
                      sx={{ bgcolor: BRAND.teal, "&:hover": { bgcolor: BRAND.tealHover }, textTransform: "none", fontWeight: 700 }}
                    >
                      Arm
                    </Button>
                  </span>
                </Tooltip>
              )}
              <Button size="small" onClick={() => setOpenRuns(openRuns === pb.id ? null : pb.id)}>{openRuns === pb.id ? "Hide runs" : "Runs"}</Button>
              <Button size="small" onClick={() => setForm({ editing: pb.id })}>Edit</Button>
              <Button size="small" color="error" disabled={busyId === pb.id} onClick={() => { if (window.confirm(`Delete “${pb.name}”?`)) act(pb.id, () => deletePlaybook(pb.id), "Playbook deleted."); }}>
                Delete
              </Button>
            </Box>

            {openRuns === pb.id ? (
              <Box sx={{ mt: 1.5, pt: 1.5, borderTop: `1px solid ${BRAND.border}` }}>
                <Runs playbookId={pb.id} />
              </Box>
            ) : null}
          </Box>
        )
      )}

      <Divider />
      {form && !form.editing ? (
        <PlaybookForm initial={EMPTY_FORM} editing={null} onCancel={() => setForm(null)} onSaved={() => { setForm(null); load(); }} notify={notify} />
      ) : (
        <Box>
          <Button variant="outlined" onClick={() => setForm({ editing: null })}>New playbook</Button>
        </Box>
      )}
    </Stack>
  );
}
