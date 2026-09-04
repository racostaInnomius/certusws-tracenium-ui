// src/components/Reports/ScheduleReportDialog.jsx
//
// ADR-0014 E3 — "every month, the usual". A schedule stores format,
// the type's non-month params (framework, asset group), how many closed
// months the report should cover, and who receives it. Dates are never
// stored: the server derives from/to on each run from the period, ending
// in the last closed month. Recipients follow EmailReportDialog exactly
// (members by id + optional external emails).

import * as React from "react";
import {
  Box, Button, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle,
  FormControl, FormControlLabel, InputLabel, MenuItem, Select, Stack, TextField, Typography,
} from "@mui/material";
import { useAuthContext } from "../../auth/AuthContext";
import { listTenantMembers } from "../../api/tenants";
import { createReportSchedule } from "../../api/reports";
import { getFrameworks } from "../../api/compliance";
import { listAssetGroups } from "../../api/assetGroups";
import { listFrom } from "../../api/shape";
import { parseRecipients, validateRecipients } from "../Alerts/notifyHelpers";
import { BRAND, TEXT } from "../../theme/brand";
import { PERIOD_OPTIONS, scheduleParamDefs, typeHasPeriod } from "./reportSchedules";

export default function ScheduleReportDialog({ open, onClose, reportType, onCreated }) {
  const { auth } = useAuthContext();
  const tenantId = auth?.tenantId;
  const paramDefs = React.useMemo(() => scheduleParamDefs(reportType), [reportType]);
  const hasPeriod = typeHasPeriod(reportType);

  const [format, setFormat] = React.useState("");
  const [periodMonths, setPeriodMonths] = React.useState(1);
  const [values, setValues] = React.useState({});
  const [frameworks, setFrameworks] = React.useState([]);
  const [groups, setGroups] = React.useState([]);
  const [members, setMembers] = React.useState([]);
  const [loading, setLoading] = React.useState(false);
  const [checkedIds, setCheckedIds] = React.useState([]);
  const [externalText, setExternalText] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState("");

  React.useEffect(() => {
    if (!open || !reportType) return;
    setFormat(reportType.formats?.[0] || "");
    setPeriodMonths(1);
    setValues({});
    setCheckedIds([]);
    setExternalText("");
    setError("");
    setLoading(true);
    const needsFrameworks = paramDefs.some((p) => p.kind === "framework");
    const needsGroups = paramDefs.some((p) => p.kind === "asset_group");
    Promise.all([
      listTenantMembers(tenantId).then((r) => (r?.items || []).filter((m) => m.isActive && m.email)).catch(() => []),
      needsFrameworks ? getFrameworks().then((r) => (Array.isArray(r?.frameworks) ? r.frameworks : [])).catch(() => []) : Promise.resolve([]),
      needsGroups ? listAssetGroups().then((r) => listFrom(r, { context: "scheduleReportGroups" })).catch(() => []) : Promise.resolve([]),
    ])
      .then(([ms, fws, gs]) => {
        setMembers(ms);
        setFrameworks(fws);
        setGroups(gs);
        const fwParam = paramDefs.find((p) => p.kind === "framework");
        if (fwParam && fws.length) {
          const soc2 = fws.find((f) => /^soc2/i.test(f.framework));
          setValues((prev) => ({ ...prev, [fwParam.name]: fws.length === 1 ? fws[0].framework : soc2?.framework || "" }));
        }
      })
      .finally(() => setLoading(false));
  }, [open, reportType, paramDefs, tenantId]);

  if (!reportType) return null;

  const set = (name, v) => setValues((prev) => ({ ...prev, [name]: v }));
  const toggleMember = (id) => setCheckedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const externalEmails = parseRecipients(externalText);
  const externalCheck = validateRecipients(externalEmails);
  const hasRecipients = checkedIds.length > 0 || externalEmails.length > 0;
  const missingRequired = paramDefs.filter((p) => p.required && !values[p.name]);
  const canSave = Boolean(format) && hasRecipients && missingRequired.length === 0 && !loading && !saving;

  const handleSave = async () => {
    if (!externalCheck.ok) {
      setError(externalCheck.invalid.length ? `Not a valid email: ${externalCheck.invalid[0]}` : "Too many external recipients.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const params = {};
      for (const p of paramDefs) {
        const v = values[p.name];
        if (v !== undefined && v !== null && v !== "") params[p.name] = v;
      }
      const res = await createReportSchedule({
        reportKey: reportType.key,
        format,
        params,
        periodMonths: hasPeriod ? periodMonths : 1,
        recipientMemberIds: checkedIds,
        recipientExternal: externalCheck.unique,
      });
      onCreated?.(res?.schedule);
      onClose();
    } catch (err) {
      setError(err?.message || "Could not create the schedule.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={saving ? undefined : onClose} fullWidth maxWidth="xs">
      <DialogTitle sx={{ fontWeight: 800, color: BRAND.dark }}>Schedule "{reportType.label}"</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 0.5 }}>
          <Typography sx={{ fontSize: TEXT.sm, color: BRAND.gray }}>
            Generated on the 1st of every month, archived with its SHA-256 and emailed to the recipients below.
          </Typography>

          <TextField select label="Format" size="small" value={format} onChange={(e) => setFormat(e.target.value)} inputProps={{ "aria-label": "Format" }}>
            {(reportType.formats || []).map((f) => (
              <MenuItem key={f} value={f}>{f.toUpperCase()}</MenuItem>
            ))}
          </TextField>

          {hasPeriod ? (
            <TextField select label="Period" size="small" value={periodMonths} onChange={(e) => setPeriodMonths(Number(e.target.value))} inputProps={{ "aria-label": "Period" }} helperText="Closed months, ending in the month before each run.">
              {PERIOD_OPTIONS.map((o) => (
                <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>
              ))}
            </TextField>
          ) : null}

          {paramDefs.map((p) => {
            if (p.kind === "framework") {
              return (
                <FormControl key={p.name} fullWidth size="small">
                  <InputLabel id={`sched-${p.name}`}>{p.label}</InputLabel>
                  <Select labelId={`sched-${p.name}`} label={p.label} value={values[p.name] || ""} onChange={(e) => set(p.name, e.target.value)} inputProps={{ "aria-label": p.label }}>
                    {frameworks.map((f) => (
                      <MenuItem key={f.framework} value={f.framework}>{f.shortName || f.framework}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
              );
            }
            if (p.kind === "asset_group") {
              return (
                <FormControl key={p.name} fullWidth size="small">
                  <InputLabel id={`sched-${p.name}`}>{p.label}</InputLabel>
                  <Select labelId={`sched-${p.name}`} label={p.label} value={values[p.name] || ""} onChange={(e) => set(p.name, e.target.value)} inputProps={{ "aria-label": p.label }}>
                    <MenuItem value="">All devices</MenuItem>
                    {groups.map((g) => (
                      <MenuItem key={g.id} value={String(g.id)}>{g.name || `Group ${g.id}`}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
              );
            }
            return (
              <TextField key={p.name} label={p.label} size="small" value={values[p.name] || ""} onChange={(e) => set(p.name, e.target.value)} inputProps={{ "aria-label": p.label }} />
            );
          })}

          <Box>
            <Typography variant="caption" sx={{ color: BRAND.gray, fontWeight: 700 }}>TENANT MEMBERS</Typography>
            {loading ? (
              <Typography variant="body2" sx={{ color: BRAND.gray, mt: 0.5 }}>Loading…</Typography>
            ) : members.length === 0 ? (
              <Typography variant="body2" sx={{ color: BRAND.gray, mt: 0.5 }}>No active members with an email on this tenant.</Typography>
            ) : (
              <Box sx={{ maxHeight: 160, overflowY: "auto" }}>
                {members.map((m) => (
                  <FormControlLabel
                    key={m.id}
                    sx={{ display: "flex", ml: 0 }}
                    control={<Checkbox size="small" checked={checkedIds.includes(m.id)} onChange={() => toggleMember(m.id)} />}
                    label={<Typography variant="body2">{m.email} <Typography component="span" variant="caption" sx={{ color: BRAND.gray }}>({m.role})</Typography></Typography>}
                  />
                ))}
              </Box>
            )}
          </Box>

          <TextField
            label="External emails (optional)"
            placeholder="auditor@example.com"
            size="small"
            multiline
            minRows={2}
            value={externalText}
            onChange={(e) => setExternalText(e.target.value)}
            helperText="Comma or newline separated — for people outside this tenant."
          />

          {error ? <Typography variant="body2" sx={{ color: "error.main" }}>{error}</Typography> : null}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving}>Cancel</Button>
        <Button variant="contained" onClick={handleSave} disabled={!canSave} sx={{ textTransform: "none" }}>
          {saving ? "Saving…" : "Create schedule"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
