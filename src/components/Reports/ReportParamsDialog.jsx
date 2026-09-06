// src/components/Reports/ReportParamsDialog.jsx
//
// Parameters for a report type that declares `params` (server-driven, see
// ADR-0008 D9 / ADR-0014 D1). The registry tells us WHAT to ask; this
// dialog renders one field per kind and hands back a plain object the
// caller sends as query (run) or body.params (email):
//
//   framework    → select over the tenant's active SCP frameworks
//   month        → YYYY-MM (native month input; typed fallback in tests)
//   asset_group  → optional select over the tenant's asset groups
//
// Nothing here knows about the evidence pack specifically: a future report
// with the same param kinds gets this dialog for free.

import * as React from "react";
import {
  Box, Button, Dialog, DialogActions, DialogContent, DialogTitle,
  FormControl, InputLabel, MenuItem, Select, TextField, Typography,
} from "@mui/material";
import { getFrameworks } from "../../api/compliance";
import { listAssetGroups } from "../../api/assetGroups";
import { listFrom } from "../../api/shape";
import { BRAND, TEXT } from "../../theme/brand";

import { validateParams, currentMonth, previousMonth } from "./reportParams";

export default function ReportParamsDialog({ open, onClose, reportType, format, onSubmit }) {
  const params = React.useMemo(() => (reportType?.params || []), [reportType]);
  const [values, setValues] = React.useState({});
  const [frameworks, setFrameworks] = React.useState([]);
  const [groups, setGroups] = React.useState([]);
  const [loading, setLoading] = React.useState(false);
  const [touched, setTouched] = React.useState(false);

  React.useEffect(() => {
    if (!open || !reportType) return;
    setTouched(false);
    // Sensible defaults: last closed month as both ends — the most common
    // audit ask is "last month", and the operator widens from there.
    const defaults = {};
    for (const p of params) {
      // Los dos extremos al último mes cerrado: la pregunta habitual de una
      // auditoría es "el mes pasado", y desde ahí se ensancha. (Aquí había un
      // ternario cuyas dos ramas eran idénticas, que se leía como si `from` y
      // `to` fueran a diferir.)
      if (p.kind === "month") defaults[p.name] = previousMonth();
    }
    setValues(defaults);
    const needsFrameworks = params.some((p) => p.kind === "framework");
    const needsGroups = params.some((p) => p.kind === "asset_group");
    if (!needsFrameworks && !needsGroups) return;
    setLoading(true);
    Promise.all([
      needsFrameworks ? getFrameworks().then((r) => (Array.isArray(r?.frameworks) ? r.frameworks : [])).catch(() => []) : Promise.resolve([]),
      needsGroups ? listAssetGroups().then((r) => listFrom(r, { context: "reportParamsGroups" })).catch(() => []) : Promise.resolve([]),
    ])
      .then(([fws, gs]) => {
        setFrameworks(fws);
        setGroups(gs);
        // Preselect the only framework, or SOC 2 when present: that is the
        // reason this dialog exists.
        const fwParam = params.find((p) => p.kind === "framework");
        if (fwParam && fws.length) {
          const soc2 = fws.find((f) => /^soc2/i.test(f.framework));
          setValues((prev) => ({ ...prev, [fwParam.name]: prev[fwParam.name] || (fws.length === 1 ? fws[0].framework : soc2?.framework || "") }));
        }
      })
      .finally(() => setLoading(false));
  }, [open, reportType, params]);

  if (!reportType) return null;
  const errors = validateParams(params, values);
  const canSubmit = Object.keys(errors).length === 0 && !loading;

  const set = (name, v) => setValues((prev) => ({ ...prev, [name]: v }));

  const handleSubmit = () => {
    setTouched(true);
    if (!canSubmit) return;
    const out = {};
    for (const p of params) {
      const v = values[p.name];
      if (v !== undefined && v !== null && v !== "") out[p.name] = v;
    }
    onSubmit?.(out);
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle sx={{ fontWeight: 800, color: BRAND.dark }}>
        {reportType.label}
        <Typography component="span" sx={{ ml: 1, color: BRAND.gray, fontSize: TEXT.sm, fontWeight: 400 }}>
          {format ? format.toUpperCase() : ""}
        </Typography>
      </DialogTitle>
      <DialogContent>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2, mt: 1 }}>
          {params.map((p) => {
            const err = touched ? errors[p.name] : undefined;
            if (p.kind === "framework") {
              return (
                <FormControl key={p.name} fullWidth size="small" error={Boolean(err)}>
                  <InputLabel id={`param-${p.name}`}>{p.label}</InputLabel>
                  <Select
                    labelId={`param-${p.name}`}
                    label={p.label}
                    value={values[p.name] || ""}
                    onChange={(e) => set(p.name, e.target.value)}
                    inputProps={{ "aria-label": p.label }}
                  >
                    {frameworks.map((f) => (
                      <MenuItem key={f.framework} value={f.framework}>{f.shortName || f.framework}</MenuItem>
                    ))}
                  </Select>
                  {err ? <Typography sx={{ color: BRAND.alert.errorText, fontSize: TEXT.xs, mt: 0.5 }}>{err}</Typography> : null}
                </FormControl>
              );
            }
            if (p.kind === "asset_group") {
              return (
                <FormControl key={p.name} fullWidth size="small">
                  <InputLabel id={`param-${p.name}`}>{p.label}</InputLabel>
                  <Select
                    labelId={`param-${p.name}`}
                    label={p.label}
                    value={values[p.name] || ""}
                    onChange={(e) => set(p.name, e.target.value)}
                    inputProps={{ "aria-label": p.label }}
                  >
                    <MenuItem value="">All devices</MenuItem>
                    {groups.map((g) => (
                      <MenuItem key={g.id} value={String(g.id)}>{g.name || `Group ${g.id}`}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
              );
            }
            // month
            return (
              <TextField
                key={p.name}
                label={p.label}
                type="month"
                size="small"
                value={values[p.name] || ""}
                onChange={(e) => set(p.name, e.target.value)}
                error={Boolean(err)}
                helperText={err || " "}
                inputProps={{ "aria-label": p.label, max: currentMonth(), placeholder: "YYYY-MM" }}
                InputLabelProps={{ shrink: true }}
              />
            );
          })}
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={handleSubmit} disabled={loading} sx={{ textTransform: "none" }}>
          Generate
        </Button>
      </DialogActions>
    </Dialog>
  );
}
