// src/components/patch-management/PatchCatalogPanel.jsx
//
// ADR-0038 F3 (D7) — the fleet patch catalog: every patch seen in the tenant,
// how long each device has been missing it, how that stands against the
// remediation targets, what Tracenium knows about it (known issues, install
// confidence across the fleet) and the tenant's decision. A BLOCKED patch is
// never sent — the install gate strips it from every selection.
//
// "≥ 12 days" means the patch was already pending when the catalog started:
// the date is a floor, not a guess.

import * as React from "react";
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  MenuItem,
  Radio,
  RadioGroup,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from "@mui/material";
import RefreshOutlinedIcon from "@mui/icons-material/RefreshOutlined";
import WarningAmberOutlinedIcon from "@mui/icons-material/WarningAmberOutlined";
import SectionPaper from "../common/SectionPaper";
import { BRAND, ICON, ROLE, TEXT } from "../../theme/brand";
import { formatDate } from "../../utils/format";
import { getPatchCatalogEntry, listPatchCatalog, updatePatchCatalogEntry } from "../../api/patchManagement";
import { APPROVAL_META, approvalMeta, confidenceText, decisionPayload, matchesFilter, pendingSinceText, targetsText } from "./patchCatalog";

const TONE = {
  critical: { bg: ROLE.criticalSoft, fg: BRAND.alert.errorText },
  caution: { bg: ROLE.cautionSoft, fg: BRAND.alert.warningText },
  positive: { bg: BRAND.alert.successSoft, fg: BRAND.alert.success },
  info: { bg: BRAND.tealSoft, fg: BRAND.tealText },
  neutral: { bg: BRAND.surfaceMuted, fg: BRAND.dark },
  muted: { bg: BRAND.surfaceMuted, fg: BRAND.gray },
};

function ToneChip({ label, tone, title }) {
  const t = TONE[tone] ?? TONE.neutral;
  const chip = <Chip size="small" label={label} sx={{ height: 22, fontSize: TEXT.xs, fontWeight: 700, bgcolor: t.bg, color: t.fg }} />;
  return title ? (
    <Tooltip title={title} arrow>
      {chip}
    </Tooltip>
  ) : (
    chip
  );
}

const SEVERITY_TONE = { critical: "critical", important: "caution", moderate: "info", low: "neutral" };
const SLA_STATUS = {
  breached: { label: "Overdue", tone: "critical" },
  at_risk: { label: "Due soon", tone: "caution" },
  on_time: { label: "On time", tone: "positive" },
  no_target: { label: "No target", tone: "muted" },
  excluded: { label: "Outside the clock", tone: "muted" },
};

function errMsg(err, fallback) {
  return err?.body?.message || err?.message || fallback;
}

function Summary({ data }) {
  const t = data?.totals ?? {};
  const targets = targetsText(data?.targets);
  const cell = (label, n, tone) => (
    <Box sx={{ minWidth: 110 }}>
      <Typography sx={{ fontSize: TEXT["2xl"], fontWeight: 800, color: TONE[tone]?.fg ?? BRAND.dark }}>{n ?? 0}</Typography>
      <Typography sx={{ fontSize: TEXT.xs, color: BRAND.gray }}>{label}</Typography>
    </Box>
  );
  return (
    <Box sx={{ mb: 2 }}>
      <Stack direction="row" spacing={3} sx={{ flexWrap: "wrap", rowGap: 1.5, mb: 1 }}>
        {cell("Overdue", t.breached, t.breached ? "critical" : "neutral")}
        {cell("Due soon", t.at_risk, t.at_risk ? "caution" : "neutral")}
        {cell("On time", t.on_time, "neutral")}
        {cell("No target", t.no_target, "muted")}
        {cell("Outside the clock", t.excluded, "muted")}
        <Box sx={{ minWidth: 140 }}>
          <Typography sx={{ fontSize: TEXT["2xl"], fontWeight: 800, color: BRAND.dark }}>
            {data?.pctWithinTarget == null ? "—" : `${data.pctWithinTarget}%`}
          </Typography>
          <Typography sx={{ fontSize: TEXT.xs, color: BRAND.gray }}>within target</Typography>
        </Box>
      </Stack>
      <Typography sx={{ fontSize: TEXT.sm, color: BRAND.gray }}>
        Counted per device and patch.{" "}
        {targets
          ? `Targets (the same commitment as Security Compliance remediation): ${targets}.`
          : "No remediation targets are declared, so nothing is measured against a commitment — set them in Security Compliance → Remediation → Remediation targets."}
      </Typography>
    </Box>
  );
}

function DecisionDialog({ item, onClose, onSaved, notify }) {
  const [form, setForm] = React.useState(null);
  const [error, setError] = React.useState(null);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (!item) return;
    setError(null);
    setForm({
      approval: item.approval ?? "none",
      reason: item.approvalReason ?? "",
      deferredUntil: item.deferredUntil ? item.deferredUntil.slice(0, 10) : "",
      knownIssue: item.knownIssue ?? "",
      supersededBy: item.supersededBy ?? "",
    });
  }, [item]);

  if (!item || !form) return null;
  const update = (patch) => setForm((f) => ({ ...f, ...patch }));
  const save = async () => {
    const r = decisionPayload(form);
    if (r.error) return setError(r.error);
    setSaving(true);
    try {
      await updatePatchCatalogEntry(item.patchId, r.body);
      notify?.("success", `${item.patchId} updated.`);
      onSaved?.();
    } catch (err) {
      setError(errMsg(err, "Could not save the decision."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onClose={() => (saving ? null : onClose())} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ fontWeight: 800 }}>{item.patchId}</DialogTitle>
      <DialogContent>
        <Typography sx={{ fontSize: TEXT.sm, color: BRAND.gray, mb: 1.5 }}>{item.title}</Typography>
        <RadioGroup value={form.approval} onChange={(e) => update({ approval: e.target.value })}>
          <FormControlLabel value="none" control={<Radio size="small" />} label="Not reviewed" />
          {Object.entries(APPROVAL_META).map(([value, m]) => (
            <FormControlLabel
              key={value}
              value={value}
              control={<Radio size="small" />}
              label={
                <Box sx={{ py: 0.25 }}>
                  <Typography sx={{ fontSize: TEXT.md, fontWeight: 700, color: BRAND.dark }}>{m.label}</Typography>
                  <Typography sx={{ fontSize: TEXT.xs, color: BRAND.gray }}>{m.hint}</Typography>
                </Box>
              }
            />
          ))}
        </RadioGroup>
        <Stack spacing={1.5} sx={{ mt: 1.5 }}>
          {form.approval !== "none" ? (
            <TextField size="small" label={form.approval === "blocked" || form.approval === "rejected" ? "Why (required)" : "Why (optional)"} value={form.reason} onChange={(e) => update({ reason: e.target.value })} fullWidth multiline minRows={2} inputProps={{ maxLength: 500 }} />
          ) : null}
          {form.approval === "deferred" ? (
            <TextField size="small" type="date" label="Not before" value={form.deferredUntil} onChange={(e) => update({ deferredUntil: e.target.value })} InputLabelProps={{ shrink: true }} sx={{ maxWidth: 200 }} />
          ) : null}
          <TextField size="small" label="Known issue (your notes)" value={form.knownIssue} onChange={(e) => update({ knownIssue: e.target.value })} fullWidth multiline minRows={2} inputProps={{ maxLength: 1000 }} />
          <TextField size="small" label="Superseded by" placeholder="KB5129237" value={form.supersededBy} onChange={(e) => update({ supersededBy: e.target.value })} sx={{ maxWidth: 240 }} />
          {error ? (
            <Typography role="alert" sx={{ fontSize: TEXT.sm, color: BRAND.alert.errorText }}>
              {error}
            </Typography>
          ) : null}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving} sx={{ textTransform: "none", color: BRAND.gray }}>
          Cancel
        </Button>
        <Button onClick={save} disabled={saving} variant="contained" sx={{ textTransform: "none", fontWeight: 700, bgcolor: BRAND.teal, "&:hover": { bgcolor: BRAND.tealHover } }}>
          Save
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function DevicesDialog({ item, onClose }) {
  const [rows, setRows] = React.useState(null);
  React.useEffect(() => {
    if (!item) return;
    setRows(null);
    getPatchCatalogEntry(item.patchId)
      .then((r) => setRows(Array.isArray(r?.devices) ? r.devices : []))
      .catch(() => setRows([]));
  }, [item]);
  if (!item) return null;
  return (
    <Dialog open onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ fontWeight: 800 }}>
        {item.patchId} — missing on {item.devicesPending} device{item.devicesPending === 1 ? "" : "s"}
      </DialogTitle>
      <DialogContent>
        {rows == null ? (
          <CircularProgress size={22} sx={{ color: BRAND.teal }} />
        ) : (
          <Table size="small" aria-label={`Devices missing ${item.patchId}`}>
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 700 }}>Device</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Missing since</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Target</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((d) => {
                const st = SLA_STATUS[d.sla?.status] ?? SLA_STATUS.no_target;
                return (
                  <TableRow key={d.deviceId}>
                    <TableCell sx={{ fontSize: TEXT.sm, fontWeight: 700 }}>{d.hostname || d.deviceId}</TableCell>
                    <TableCell sx={{ fontSize: TEXT.sm }}>
                      {d.firstSeenBackfilled ? "at least since " : ""}
                      {formatDate(d.firstSeenAt)}
                    </TableCell>
                    <TableCell>
                      <ToneChip label={st.label} tone={st.tone} title={d.sla?.targetDays != null ? `Target: ${d.sla.targetDays} days` : undefined} />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
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

export default function PatchCatalogPanel({ canManage, notify, refreshNonce = 0 }) {
  const [scope, setScope] = React.useState("pending");
  const [data, setData] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(null);
  const [filter, setFilter] = React.useState({ text: "", approval: "all" });
  const [deciding, setDeciding] = React.useState(null);
  const [viewing, setViewing] = React.useState(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await listPatchCatalog(scope));
    } catch (err) {
      setData(null);
      setError(err?.status === 409 ? "The patch catalog is not enabled for this tenant yet." : errMsg(err, "Could not load the patch catalog."));
    } finally {
      setLoading(false);
    }
  }, [scope]);

  React.useEffect(() => {
    load();
  }, [load, refreshNonce]);

  const items = (data?.items ?? []).filter((i) => matchesFilter(i, filter));

  return (
    <SectionPaper variant="panel" sx={{ p: { xs: 1.5, sm: 2 } }}>
      <Stack direction="row" alignItems="baseline" spacing={1} sx={{ mb: 0.5, flexWrap: "wrap" }}>
        <Typography sx={{ fontSize: TEXT.lg, fontWeight: 800, color: BRAND.dark }}>Patch catalog</Typography>
        <Box sx={{ flex: 1 }} />
        <Button onClick={load} startIcon={<RefreshOutlinedIcon />} sx={{ textTransform: "none", color: BRAND.gray }}>
          Refresh
        </Button>
      </Stack>
      <Typography sx={{ fontSize: TEXT.sm, color: "text.secondary", mb: 1.5 }}>
        Every patch the fleet has reported missing, since when, and your decision on it. A blocked patch is never sent — not by a
        button and not by a policy.
      </Typography>

      {error ? (
        <Typography role="alert" sx={{ color: BRAND.alert.errorText, fontSize: TEXT.sm, mb: 1 }}>
          {error}
        </Typography>
      ) : null}
      {data ? <Summary data={data} /> : null}

      <Stack direction="row" spacing={1} sx={{ mb: 1.5, flexWrap: "wrap", rowGap: 1 }} alignItems="center">
        <ToggleButtonGroup size="small" exclusive value={scope} onChange={(_e, v) => v && setScope(v)} aria-label="Scope">
          <ToggleButton value="pending" sx={{ textTransform: "none" }}>
            Missing now
          </ToggleButton>
          <ToggleButton value="all" sx={{ textTransform: "none" }}>
            Everything seen
          </ToggleButton>
        </ToggleButtonGroup>
        <TextField size="small" placeholder="Search KB or title" value={filter.text} onChange={(e) => setFilter((f) => ({ ...f, text: e.target.value }))} sx={{ minWidth: 220 }} />
        <TextField select size="small" label="Decision" value={filter.approval} onChange={(e) => setFilter((f) => ({ ...f, approval: e.target.value }))} sx={{ minWidth: 170 }}>
          <MenuItem value="all">All</MenuItem>
          <MenuItem value="unreviewed">Not reviewed</MenuItem>
          {Object.entries(APPROVAL_META).map(([v, m]) => (
            <MenuItem key={v} value={v}>
              {m.label}
            </MenuItem>
          ))}
        </TextField>
      </Stack>

      {loading && !data ? (
        <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
          <CircularProgress size={26} sx={{ color: BRAND.teal }} />
        </Box>
      ) : items.length === 0 ? (
        <Box sx={{ p: 3, textAlign: "center", color: BRAND.gray, fontSize: TEXT.sm }}>
          {scope === "pending" ? "No device is missing a patch right now." : "No patches match."}
        </Box>
      ) : (
        <Box sx={{ overflowX: "auto" }}>
          <Table size="small" aria-label="Patch catalog">
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 700 }}>Patch</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Severity</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Missing on</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Oldest</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Target</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Decision</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Install success</TableCell>
                {canManage ? <TableCell /> : null}
              </TableRow>
            </TableHead>
            <TableBody>
              {items.map((it) => {
                const am = approvalMeta(it.approval);
                const conf = confidenceText(it.confidence);
                const ki = it.traceniumKnownIssue;
                return (
                  <TableRow key={it.patchId} hover>
                    <TableCell sx={{ maxWidth: 360 }}>
                      <Stack direction="row" spacing={0.75} alignItems="center">
                        <Typography sx={{ fontSize: TEXT.sm, fontWeight: 700, color: BRAND.dark }}>{it.patchId}</Typography>
                        {ki ? (
                          <Tooltip arrow title={`${ki.summary}${ki.fixedBy ? ` Fixed by ${ki.fixedBy}.` : ""}`}>
                            <Chip
                              size="small"
                              icon={<WarningAmberOutlinedIcon sx={{ fontSize: ICON.sm }} />}
                              label={ki.fixedBy ? `Known issue · fixed by ${ki.fixedBy}` : "Known issue"}
                              sx={{ height: 20, fontSize: TEXT.xs, fontWeight: 700, bgcolor: ki.impact === "critical" ? ROLE.criticalSoft : ROLE.cautionSoft, color: ki.impact === "critical" ? BRAND.alert.errorText : BRAND.alert.warningText }}
                            />
                          </Tooltip>
                        ) : null}
                        {it.supersededBy ? <ToneChip label={`Superseded by ${it.supersededBy}`} tone="muted" /> : null}
                      </Stack>
                      <Typography sx={{ fontSize: TEXT.xs, color: BRAND.gray }} noWrap title={it.title ?? ""}>
                        {it.title}
                      </Typography>
                      {it.knownIssue ? <Typography sx={{ fontSize: TEXT.xs, color: BRAND.alert.warningText }}>{it.knownIssue}</Typography> : null}
                    </TableCell>
                    <TableCell>
                      <ToneChip label={it.severity} tone={SEVERITY_TONE[it.severity] ?? "muted"} />
                    </TableCell>
                    <TableCell>
                      {it.devicesPending ? (
                        <Button size="small" onClick={() => setViewing(it)} sx={{ textTransform: "none", fontWeight: 700, color: BRAND.tealText, minWidth: 0 }}>
                          {it.devicesPending} device{it.devicesPending === 1 ? "" : "s"}
                        </Button>
                      ) : (
                        <Typography sx={{ fontSize: TEXT.sm, color: BRAND.gray }}>—</Typography>
                      )}
                    </TableCell>
                    <TableCell sx={{ fontSize: TEXT.sm, whiteSpace: "nowrap" }} title={it.oldestPendingBackfilled ? "Already missing when the catalog started: the real date may be earlier." : undefined}>
                      {pendingSinceText(it)}
                    </TableCell>
                    <TableCell>
                      <Stack direction="row" spacing={0.5} sx={{ flexWrap: "wrap", rowGap: 0.5 }}>
                        {["breached", "at_risk"].map((k) => (it.sla?.[k] ? <ToneChip key={k} label={`${SLA_STATUS[k].label} · ${it.sla[k]}`} tone={SLA_STATUS[k].tone} /> : null))}
                        {!it.sla?.breached && !it.sla?.at_risk && it.devicesPending ? (
                          <ToneChip label={it.sla?.on_time ? "On time" : it.sla?.excluded ? "Outside the clock" : "No target"} tone={it.sla?.on_time ? "positive" : "muted"} />
                        ) : null}
                      </Stack>
                    </TableCell>
                    <TableCell>
                      <ToneChip label={am.label} tone={am.tone} title={it.approvalReason ? `${am.hint} ${it.approvalReason}` : am.hint} />
                      {it.approval === "deferred" && it.deferredUntil ? (
                        <Typography sx={{ fontSize: TEXT.xs, color: BRAND.gray }}>until {formatDate(it.deferredUntil)}</Typography>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      <Tooltip arrow title={conf.hint}>
                        <Typography sx={{ fontSize: TEXT.sm, color: BRAND.dark }}>{conf.label}</Typography>
                      </Tooltip>
                    </TableCell>
                    {canManage ? (
                      <TableCell align="right">
                        <Button size="small" aria-label={`Decide on ${it.patchId}`} onClick={() => setDeciding(it)} sx={{ textTransform: "none", fontWeight: 700, color: BRAND.tealText }}>
                          Decide
                        </Button>
                      </TableCell>
                    ) : null}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Box>
      )}

      <DecisionDialog
        item={deciding}
        notify={notify}
        onClose={() => setDeciding(null)}
        onSaved={() => {
          setDeciding(null);
          load();
        }}
      />
      <DevicesDialog item={viewing} onClose={() => setViewing(null)} />
    </SectionPaper>
  );
}
