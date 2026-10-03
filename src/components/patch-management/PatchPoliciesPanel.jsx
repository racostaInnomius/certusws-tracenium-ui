// src/components/patch-management/PatchPoliciesPanel.jsx
//
// ADR-0038 F4 — recurring patch policies. Each policy says whom (a group or
// every device, which platforms), what (severities; approval required or not),
// when (Patch Tuesday + N, weekly, monthly — local time), restart, window and
// deadline. Each run freezes the set of patches and takes it ring by ring —
// pilot, broad, everyone else — and a ring only moves on when what it installed
// CHECKED HEALTHY afterwards (≥ 80 %, all of them below 3 devices, and no broken
// declared check). A halted ring waits for someone: promote anyway, or cancel.

import * as React from "react";
import {
  Autocomplete,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  IconButton,
  MenuItem,
  Stack,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import AddOutlinedIcon from "@mui/icons-material/AddOutlined";
import DeleteOutlineOutlinedIcon from "@mui/icons-material/DeleteOutlineOutlined";
import RefreshOutlinedIcon from "@mui/icons-material/RefreshOutlined";
import SectionPaper from "../common/SectionPaper";
import BrandTimeField from "../common/BrandTimeField";
import { useConfirm } from "../common/ConfirmDialog";
import { BRAND, ROLE, TEXT } from "../../theme/brand";
import { formatDate } from "../../utils/format";
import { listFrom } from "../../api/shape";
import { listAssetGroups } from "../../api/assetGroups";
import {
  cancelPatchPolicyRun,
  createPatchPolicy,
  deletePatchPolicy,
  listPatchPolicies,
  listPatchPolicyRuns,
  promotePatchPolicyRun,
  runPatchPolicyNow,
  updatePatchPolicy,
} from "../../api/patchManagement";
import { buildTimezoneOptions, matchTimezone } from "./timezoneOptions";
import { cadenceText, emptyPolicyForm, policyPayload, policyToForm, ringText, runSummary, severitiesText } from "./patchPolicies";

const TONE = {
  critical: { bg: ROLE.criticalSoft, fg: BRAND.alert.errorText },
  caution: { bg: ROLE.cautionSoft, fg: BRAND.alert.warningText },
  positive: { bg: BRAND.alert.successSoft, fg: BRAND.alert.success },
  info: { bg: BRAND.tealSoft, fg: BRAND.tealText },
  muted: { bg: BRAND.surfaceMuted, fg: BRAND.gray },
};
const ToneChip = ({ label, tone }) => {
  const t = TONE[tone] ?? TONE.muted;
  return <Chip size="small" label={label} sx={{ height: 22, fontSize: TEXT.xs, fontWeight: 700, bgcolor: t.bg, color: t.fg }} />;
};
const errMsg = (err, fb) => err?.body?.message || err?.message || fb;
const SEVERITIES = ["critical", "important", "moderate", "low", "unknown"];
const PLATFORMS = [["windows", "Windows"], ["macos", "macOS"], ["linux", "Linux"]];
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function GroupSelect({ label, value, onChange, groups, emptyLabel, helperText }) {
  return (
    <TextField
      select
      size="small"
      label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      helperText={helperText}
      fullWidth
      // "" is a real choice here (every device / everyone else): show it.
      slotProps={{ select: { displayEmpty: true }, inputLabel: { shrink: true } }}
    >
      <MenuItem value="">{emptyLabel}</MenuItem>
      {groups.map((g) => (
        <MenuItem key={g.id} value={String(g.id)}>
          {g.name}
        </MenuItem>
      ))}
    </TextField>
  );
}

function PolicyDialog({ entry, groups, onClose, onSaved, notify }) {
  const [form, setForm] = React.useState(null);
  const [error, setError] = React.useState(null);
  const [saving, setSaving] = React.useState(false);
  const tzOptions = React.useMemo(() => buildTimezoneOptions({ extra: entry?.cadence?.timezone }), [entry]);

  React.useEffect(() => {
    if (entry === undefined) return;
    setError(null);
    setForm(entry ? policyToForm(entry) : emptyPolicyForm());
  }, [entry]);
  if (entry === undefined || !form) return null;

  const update = (patch) => setForm((f) => ({ ...f, ...patch }));
  const cad = (patch) => setForm((f) => ({ ...f, cadence: { ...f.cadence, ...patch } }));
  const ring = (i, patch) => setForm((f) => ({ ...f, rings: f.rings.map((r, j) => (j === i ? { ...r, ...patch } : r)) }));
  const toggle = (key, v) => setForm((f) => ({ ...f, [key]: f[key].includes(v) ? f[key].filter((x) => x !== v) : [...f[key], v] }));

  const save = async () => {
    const r = policyPayload(form);
    if (r.error) return setError(r.error);
    setSaving(true);
    try {
      if (entry) await updatePatchPolicy(entry.id, r.body);
      else await createPatchPolicy(r.body);
      notify?.("success", entry ? "Policy saved — its next run goes out in your name." : "Policy created.");
      onSaved?.();
    } catch (err) {
      setError(errMsg(err, "Could not save the policy."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onClose={() => (saving ? null : onClose())} maxWidth="md" fullWidth>
      <DialogTitle sx={{ fontWeight: 800 }}>{entry ? `Edit ${entry.name}` : "New patch policy"}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField size="small" label="Name" value={form.name} onChange={(e) => update({ name: e.target.value })} fullWidth autoFocus />

          <Typography sx={{ fontSize: TEXT.md, fontWeight: 800, color: BRAND.dark }}>Who</Typography>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
            <GroupSelect label="Scope" value={form.scopeAssetGroupId} onChange={(v) => update({ scopeAssetGroupId: v })} groups={groups} emptyLabel="Every device" />
            <Box>
              {PLATFORMS.map(([v, l]) => (
                <FormControlLabel key={v} control={<Checkbox size="small" checked={form.platforms.includes(v)} onChange={() => toggle("platforms", v)} />} label={l} />
              ))}
              <Typography sx={{ fontSize: TEXT.xs, color: BRAND.gray }}>None ticked = every platform.</Typography>
            </Box>
          </Stack>

          <Typography sx={{ fontSize: TEXT.md, fontWeight: 800, color: BRAND.dark }}>What</Typography>
          <Box>
            {SEVERITIES.map((v) => (
              <FormControlLabel key={v} control={<Checkbox size="small" checked={form.severities.includes(v)} onChange={() => toggle("severities", v)} />} label={severitiesText([v])} />
            ))}
          </Box>
          <FormControlLabel
            control={<Switch checked={form.requireApproval} onChange={(e) => update({ requireApproval: e.target.checked })} />}
            label="Only patches approved in the Patch catalog"
          />
          <Typography sx={{ fontSize: TEXT.xs, color: BRAND.gray, mt: -1.5 }}>
            Off: everything with those severities except what is rejected, blocked or deferred. Out-of-band (.msu) patches are installed from their own section.
          </Typography>

          <Typography sx={{ fontSize: TEXT.md, fontWeight: 800, color: BRAND.dark }}>When</Typography>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={2} alignItems="flex-start">
            <TextField select size="small" label="Cadence" value={form.cadence.kind} onChange={(e) => cad({ kind: e.target.value })} sx={{ minWidth: 170 }}>
              <MenuItem value="patch_tuesday">Patch Tuesday</MenuItem>
              <MenuItem value="weekly">Weekly</MenuItem>
              <MenuItem value="monthly">Monthly</MenuItem>
            </TextField>
            {form.cadence.kind === "patch_tuesday" ? (
              <TextField size="small" label="Days after" value={form.cadence.offsetDays} onChange={(e) => cad({ offsetDays: e.target.value })} sx={{ maxWidth: 120 }} />
            ) : form.cadence.kind === "weekly" ? (
              <TextField select size="small" label="Day" value={form.cadence.weekday} onChange={(e) => cad({ weekday: e.target.value })} sx={{ minWidth: 150 }}>
                {WEEKDAYS.map((d, i) => (
                  <MenuItem key={d} value={i}>
                    {d}
                  </MenuItem>
                ))}
              </TextField>
            ) : (
              <TextField size="small" label="Day of month (1–28)" value={form.cadence.dayOfMonth} onChange={(e) => cad({ dayOfMonth: e.target.value })} sx={{ maxWidth: 170 }} />
            )}
            <BrandTimeField label="At" value={form.cadence.atTime} onChange={(v) => cad({ atTime: v })} />
          </Stack>
          <Autocomplete
            size="small"
            options={tzOptions}
            value={tzOptions.find((o) => o.value === form.cadence.timezone) || null}
            onChange={(_e, opt) => opt && cad({ timezone: opt.value })}
            getOptionLabel={(o) => o.label}
            isOptionEqualToValue={(o, v) => o.value === v.value}
            filterOptions={(opts, st) => opts.filter((o) => matchTimezone(o, st.inputValue))}
            disableClearable
            renderInput={(params) => <TextField {...params} label="Time zone" />}
          />
          <TextField select size="small" label="Maintenance window" value={form.windowMode} onChange={(e) => update({ windowMode: e.target.value })}>
            <MenuItem value="window">Each device&apos;s maintenance window</MenuItem>
            <MenuItem value="on_connect">When the device is on (workstations)</MenuItem>
          </TextField>
          <FormControlLabel control={<Switch checked={form.rebootIfRequired} onChange={(e) => update({ rebootIfRequired: e.target.checked })} />} label="Restart when the patch requires it" />
          <Stack direction="row" spacing={2} alignItems="center">
            <TextField size="small" label="Deadline (days, optional)" value={form.deadlineDays} onChange={(e) => update({ deadlineDays: e.target.value })} sx={{ maxWidth: 190 }} />
            <FormControlLabel
              disabled={form.deadlineDays === ""}
              control={<Switch checked={form.deadlineIgnoresWindow} onChange={(e) => update({ deadlineIgnoresWindow: e.target.checked })} />}
              label="At the deadline, install outside the window"
            />
          </Stack>

          <Typography sx={{ fontSize: TEXT.md, fontWeight: 800, color: BRAND.dark }}>Rings</Typography>
          <Typography sx={{ fontSize: TEXT.sm, color: BRAND.gray, mt: -1.5 }}>
            Each ring waits its soak time, then moves on only if at least {form.promoteThresholdPct}% of its devices checked healthy after the patch (all of them
            with fewer than {form.promoteMinDevices}) and none broke a declared post-change check.
          </Typography>
          {form.rings.map((r, i) => (
            <Stack key={i} direction={{ xs: "column", sm: "row" }} spacing={1.5} alignItems="center">
              <TextField size="small" label={`Ring ${i + 1}`} value={r.name} onChange={(e) => ring(i, { name: e.target.value })} sx={{ minWidth: 160 }} />
              <GroupSelect
                label="Devices"
                value={r.assetGroupId}
                onChange={(v) => ring(i, { assetGroupId: v })}
                groups={groups}
                emptyLabel={i === form.rings.length - 1 ? "Everyone else in scope" : "Pick a group"}
              />
              <TextField size="small" label="Soak (hours)" value={r.soakHours} onChange={(e) => ring(i, { soakHours: e.target.value })} sx={{ maxWidth: 120 }} />
              <IconButton aria-label={`Remove ring ${i + 1}`} disabled={form.rings.length === 1} onClick={() => setForm((f) => ({ ...f, rings: f.rings.filter((_, j) => j !== i) }))}>
                <DeleteOutlineOutlinedIcon fontSize="small" />
              </IconButton>
            </Stack>
          ))}
          {form.rings.length < 4 ? (
            <Button
              size="small"
              startIcon={<AddOutlinedIcon />}
              onClick={() => setForm((f) => ({ ...f, rings: [...f.rings.slice(0, -1), { name: `Ring ${f.rings.length}`, assetGroupId: "", soakHours: 24 }, f.rings[f.rings.length - 1]] }))}
              sx={{ alignSelf: "flex-start", textTransform: "none", color: BRAND.tealText }}
            >
              Add a ring before the last
            </Button>
          ) : null}
          <Stack direction="row" spacing={2}>
            <TextField size="small" label="Promote at (%)" value={form.promoteThresholdPct} onChange={(e) => update({ promoteThresholdPct: e.target.value })} sx={{ maxWidth: 140 }} />
            <TextField size="small" label="Minimum devices" value={form.promoteMinDevices} onChange={(e) => update({ promoteMinDevices: e.target.value })} sx={{ maxWidth: 160 }} />
          </Stack>
          <FormControlLabel control={<Switch checked={form.enabled} onChange={(e) => update({ enabled: e.target.checked })} />} label="Enabled" />
        </Stack>
      </DialogContent>
      {/* Beside the buttons, not at the end of the scrolled content, where it fell below the fold. */}
      <DialogActions>
        {error ? (
          <Typography role="alert" sx={{ fontSize: TEXT.sm, color: BRAND.alert.errorText, mr: "auto", pl: 1 }}>
            {error}
          </Typography>
        ) : null}
        <Button onClick={onClose} disabled={saving} sx={{ textTransform: "none", color: BRAND.gray }}>
          Cancel
        </Button>
        <Button onClick={save} disabled={saving} variant="contained" sx={{ textTransform: "none", fontWeight: 700, bgcolor: BRAND.teal, "&:hover": { bgcolor: BRAND.tealHover } }}>
          {entry ? "Save" : "Create policy"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function RunsDialog({ policy, canManage, onClose, notify, onChanged }) {
  const [runs, setRuns] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  const confirm = useConfirm();
  const load = React.useCallback(async () => {
    if (!policy) return;
    try {
      const r = await listPatchPolicyRuns(policy.id);
      setRuns(Array.isArray(r?.items) ? r.items : []);
    } catch {
      setRuns([]);
    }
  }, [policy]);
  React.useEffect(() => {
    setRuns(null);
    load();
  }, [load]);
  if (!policy) return null;

  const act = async (kind, run) => {
    const ok = await confirm(
      kind === "promote"
        ? { title: `Go on to the next ring of “${policy.name}”?`, body: `You take responsibility for the current ring's result (${run.rings[run.currentRing]?.reason ?? "no decision yet"}). Recorded in the audit log.`, confirmText: "Promote anyway", danger: true }
        : { title: "Cancel this run?", body: "Rings not yet sent will not be. Jobs already created are not cancelled here (do that from Jobs).", confirmText: "Cancel run", danger: true }
    );
    if (!ok) return;
    setBusy(true);
    try {
      if (kind === "promote") await promotePatchPolicyRun(run.id);
      else await cancelPatchPolicyRun(run.id);
      notify?.("success", kind === "promote" ? "Next ring sent." : "Run cancelled.");
      await load();
      onChanged?.();
    } catch (err) {
      notify?.("error", errMsg(err, "Could not do that."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ fontWeight: 800 }}>{policy.name} — runs</DialogTitle>
      <DialogContent>
        {runs == null ? (
          <CircularProgress size={22} sx={{ color: BRAND.teal }} />
        ) : runs.length === 0 ? (
          <Typography sx={{ fontSize: TEXT.sm, color: BRAND.gray }}>No runs yet. The first goes out {policy.nextRunAt ? formatDate(policy.nextRunAt) : "when enabled"}.</Typography>
        ) : (
          runs.map((run) => {
            const sum = runSummary(run);
            return (
              <Box key={run.id} sx={{ mb: 2, pb: 1.5, borderBottom: `1px solid ${BRAND.border}` }}>
                <Stack direction="row" spacing={1} alignItems="center" sx={{ flexWrap: "wrap", rowGap: 0.5 }}>
                  <Typography sx={{ fontSize: TEXT.sm, fontWeight: 700, color: BRAND.dark }}>{formatDate(run.startedAt)}</Typography>
                  <ToneChip label={sum.label} tone={sum.tone} />
                  <Typography sx={{ fontSize: TEXT.xs, color: BRAND.gray }}>
                    {run.patchIds.length ? run.patchIds.slice(0, 6).join(", ") + (run.patchIds.length > 6 ? ` +${run.patchIds.length - 6}` : "") : ""}
                    {run.deadlineAt ? ` · deadline ${formatDate(run.deadlineAt)}` : ""}
                  </Typography>
                  <Box sx={{ flex: 1 }} />
                  {canManage && (run.status === "running" || run.status === "halted") ? (
                    <>
                      <Button size="small" disabled={busy} onClick={() => act("promote", run)} sx={{ textTransform: "none", fontWeight: 700, color: BRAND.alert.warningText }}>
                        Promote anyway
                      </Button>
                      <Button size="small" disabled={busy} onClick={() => act("cancel", run)} sx={{ textTransform: "none", color: BRAND.gray }}>
                        Cancel run
                      </Button>
                    </>
                  ) : null}
                </Stack>
                {sum.detail ? <Typography sx={{ fontSize: TEXT.xs, color: sum.tone === "critical" ? BRAND.alert.errorText : BRAND.gray, mt: 0.5 }}>{sum.detail}</Typography> : null}
                <Table size="small" sx={{ mt: 1 }}>
                  <TableBody>
                    {run.rings.map((r) => (
                      <TableRow key={r.position}>
                        <TableCell sx={{ fontSize: TEXT.sm, fontWeight: 700, width: 160 }}>{r.name}</TableCell>
                        <TableCell sx={{ fontSize: TEXT.sm }}>{ringText(r)}</TableCell>
                        <TableCell sx={{ fontSize: TEXT.sm, width: 200 }}>
                          {r.decision ? (
                            <Tooltip title={r.reason ?? ""} arrow>
                              <span>
                                <ToneChip
                                  label={r.decision === "promoted" ? "Passed" : r.decision === "promoted_by_operator" ? "Promoted by an operator" : "Halted"}
                                  tone={r.decision === "promoted" ? "positive" : r.decision === "halted" ? "critical" : "caution"}
                                />
                              </span>
                            </Tooltip>
                          ) : r.dispatchedAt ? (
                            <Typography sx={{ fontSize: TEXT.xs, color: BRAND.gray }}>{r.reason ?? "in progress"}</Typography>
                          ) : null}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Box>
            );
          })
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} sx={{ textTransform: "none", color: BRAND.gray }}>
          Close
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export default function PatchPoliciesPanel({ canManage, notify, refreshNonce = 0 }) {
  const [items, setItems] = React.useState(null);
  const [groups, setGroups] = React.useState([]);
  const [error, setError] = React.useState(null);
  const [editing, setEditing] = React.useState(undefined); // undefined = closed · null = new · policy
  const [viewing, setViewing] = React.useState(null);
  const confirm = useConfirm();

  const load = React.useCallback(async () => {
    setError(null);
    try {
      const r = await listPatchPolicies();
      setItems(Array.isArray(r?.items) ? r.items : []);
    } catch (err) {
      setItems([]);
      setError(err?.status === 409 ? "Patch policies are not enabled for this tenant yet." : errMsg(err, "Could not load the policies."));
    }
  }, []);
  React.useEffect(() => {
    load();
  }, [load, refreshNonce]);
  React.useEffect(() => {
    listAssetGroups()
      .then((res) => setGroups(listFrom(res, { context: "assetGroups" })))
      .catch(() => setGroups([]));
  }, []);

  const groupName = (id) => (id == null ? "Every device" : groups.find((g) => Number(g.id) === Number(id))?.name ?? `Group #${id}`);

  const runNow = async (p) => {
    const ok = await confirm({ title: `Run “${p.name}” now?`, body: "It freezes what is missing right now and sends its first ring, through the maintenance windows as usual.", confirmText: "Run now" });
    if (!ok) return;
    try {
      await runPatchPolicyNow(p.id);
      notify?.("success", `“${p.name}” started.`);
      load();
    } catch (err) {
      notify?.("error", errMsg(err, "Could not start it."));
    }
  };
  const remove = async (p) => {
    const ok = await confirm({ title: `Delete “${p.name}”?`, body: "A run in progress is cancelled. Jobs already created stay.", confirmText: "Delete policy", danger: true });
    if (!ok) return;
    try {
      await deletePatchPolicy(p.id);
      notify?.("success", "Policy deleted.");
      load();
    } catch (err) {
      notify?.("error", errMsg(err, "Could not delete it."));
    }
  };

  return (
    <SectionPaper variant="panel" sx={{ p: { xs: 1.5, sm: 2 } }}>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.5, flexWrap: "wrap" }}>
        <Typography sx={{ fontSize: TEXT.lg, fontWeight: 800, color: BRAND.dark }}>Patch policies</Typography>
        <Box sx={{ flex: 1 }} />
        <Button onClick={load} startIcon={<RefreshOutlinedIcon />} sx={{ textTransform: "none", color: BRAND.gray }}>
          Refresh
        </Button>
        {canManage ? (
          <Button onClick={() => setEditing(null)} startIcon={<AddOutlinedIcon />} variant="contained" sx={{ textTransform: "none", fontWeight: 700, bgcolor: BRAND.teal, "&:hover": { bgcolor: BRAND.tealHover } }}>
            New policy
          </Button>
        ) : null}
      </Stack>
      <Typography sx={{ fontSize: TEXT.sm, color: "text.secondary", mb: 1.5 }}>
        Recurring patching in rings — pilot first. A ring moves on only when what it installed checked healthy afterwards; if not, it stops and
        says why.
      </Typography>
      {error ? (
        <Typography role="alert" sx={{ color: BRAND.alert.errorText, fontSize: TEXT.sm, mb: 1 }}>
          {error}
        </Typography>
      ) : null}

      {items == null ? (
        <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
          <CircularProgress size={26} sx={{ color: BRAND.teal }} />
        </Box>
      ) : items.length === 0 ? (
        <Box sx={{ p: 3, textAlign: "center", color: BRAND.gray, fontSize: TEXT.sm }}>No policies yet: patches go out only when someone sends them.</Box>
      ) : (
        <Box sx={{ overflowX: "auto" }}>
          <Table size="small" aria-label="Patch policies">
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 700 }}>Policy</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>When</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Rings</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Last run</TableCell>
                <TableCell />
              </TableRow>
            </TableHead>
            <TableBody>
              {items.map((p) => {
                const sum = runSummary(p.lastRun);
                return (
                  <TableRow key={p.id} hover sx={{ opacity: p.enabled ? 1 : 0.6 }}>
                    <TableCell>
                      <Typography sx={{ fontSize: TEXT.sm, fontWeight: 700, color: BRAND.dark }}>{p.name}</Typography>
                      <Typography sx={{ fontSize: TEXT.xs, color: BRAND.gray }}>
                        {groupName(p.scopeAssetGroupId)}
                        {p.platforms?.length ? ` · ${p.platforms.join(", ")}` : ""} · {severitiesText(p.severities)}
                        {p.requireApproval ? " · approved only" : ""}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography sx={{ fontSize: TEXT.sm, color: BRAND.dark }}>{cadenceText(p.cadence)}</Typography>
                      <Typography sx={{ fontSize: TEXT.xs, color: BRAND.gray }}>
                        {p.enabled && p.nextRunAt ? `Next: ${formatDate(p.nextRunAt)}` : "Disabled"}
                        {p.windowMode === "on_connect" ? " · when devices are on" : ""}
                        {p.deadlineDays ? ` · deadline ${p.deadlineDays} d` : ""}
                      </Typography>
                    </TableCell>
                    <TableCell sx={{ fontSize: TEXT.sm }}>{p.rings.map((r) => r.name).join(" → ")}</TableCell>
                    <TableCell>
                      <Button size="small" onClick={() => setViewing(p)} sx={{ textTransform: "none", p: 0, minWidth: 0 }}>
                        <ToneChip label={sum.label} tone={sum.tone} />
                      </Button>
                    </TableCell>
                    <TableCell align="right" sx={{ whiteSpace: "nowrap" }}>
                      {canManage ? (
                        <>
                          <Button size="small" aria-label={`Run ${p.name} now`} onClick={() => runNow(p)} sx={{ textTransform: "none", fontWeight: 700, color: BRAND.tealText }}>
                            Run now
                          </Button>
                          <Button size="small" aria-label={`Edit ${p.name}`} onClick={() => setEditing(p)} sx={{ textTransform: "none", color: BRAND.gray }}>
                            Edit
                          </Button>
                          <IconButton size="small" aria-label={`Delete ${p.name}`} onClick={() => remove(p)}>
                            <DeleteOutlineOutlinedIcon fontSize="small" />
                          </IconButton>
                        </>
                      ) : null}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Box>
      )}

      <PolicyDialog
        entry={editing}
        groups={groups}
        notify={notify}
        onClose={() => setEditing(undefined)}
        onSaved={() => {
          setEditing(undefined);
          load();
        }}
      />
      <RunsDialog policy={viewing} canManage={canManage} notify={notify} onClose={() => setViewing(null)} onChanged={load} />
    </SectionPaper>
  );
}
