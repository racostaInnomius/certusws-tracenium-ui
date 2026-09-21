// src/components/patch-management/MaintenanceWindowDialog.jsx
//
// Create / edit a maintenance window. Operators think in "these days, from this
// time to that time, in this timezone" — so the form takes start + end times and
// day toggles, and converts to the backend's { daysOfWeek, startMinute,
// durationMinutes, timezone } on submit (handling windows that cross midnight).
// Dumb component: validates + calls onSubmit(payload).

import * as React from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Stack,
  Box,
  Switch,
  FormControlLabel,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
  Autocomplete,
} from "@mui/material";
import { BRAND, TEXT } from "../../theme/brand";
import BrandTimeField from "../common/BrandTimeField";
import { minutesToHHMM, hhmmToMinutes, durationFromTimes } from "./maintenanceWindowTime";
import { buildTimezoneOptions, matchTimezone } from "./timezoneOptions";

const DAYS = [
  { v: 0, l: "Sun" }, { v: 1, l: "Mon" }, { v: 2, l: "Tue" }, { v: 3, l: "Wed" },
  { v: 4, l: "Thu" }, { v: 5, l: "Fri" }, { v: 6, l: "Sat" },
];

const BROWSER_TZ = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

function defaults() {
  return { name: "", days: [1, 2, 3, 4, 5], startTime: "02:00", endTime: "04:00", timezone: BROWSER_TZ, enabled: true };
}
function fromEntry(e) {
  return {
    name: e.name ?? "",
    days: Array.isArray(e.daysOfWeek) ? [...e.daysOfWeek] : [],
    startTime: minutesToHHMM(e.startMinute ?? 120),
    endTime: minutesToHHMM((e.startMinute ?? 120) + (e.durationMinutes ?? 120)),
    timezone: e.timezone ?? BROWSER_TZ,
    enabled: e.enabled !== false,
  };
}

export default function MaintenanceWindowDialog({ open, mode, window: entry, submitting, onClose, onSubmit }) {
  const [form, setForm] = React.useState(defaults);
  // Built once per open: the offsets shown are today's (DST changes them).
  const tzOptionList = React.useMemo(() => buildTimezoneOptions({ extra: entry?.timezone }), [entry?.timezone]);
  const [error, setError] = React.useState(null);

  React.useEffect(() => {
    if (!open) return;
    setError(null);
    setForm(mode === "edit" && entry ? fromEntry(entry) : defaults());
  }, [open, mode, entry]);

  const update = (patch) => setForm((p) => ({ ...p, ...patch }));

  const handleSubmit = () => {
    if (!form.name.trim()) return setError("Name is required");
    if (form.days.length === 0) return setError("Pick at least one day");
    const startMinute = hhmmToMinutes(form.startTime);
    const endMinute = hhmmToMinutes(form.endTime);
    const durationMinutes = durationFromTimes(startMinute, endMinute);
    if (durationMinutes == null) return setError("Start and end time must differ");
    onSubmit?.({
      name: form.name.trim(),
      daysOfWeek: [...form.days].sort((a, b) => a - b),
      startMinute,
      durationMinutes,
      timezone: form.timezone,
      enabled: form.enabled,
    });
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle sx={{ fontWeight: 800, color: BRAND.dark }}>
        {mode === "edit" ? "Edit maintenance window" : "Add maintenance window"}
      </DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2.5}>
          <TextField size="small" label="Name" placeholder="Overnight (weekdays)" value={form.name} onChange={(e) => update({ name: e.target.value })} required />

          <Box>
            <Typography variant="caption" sx={{ color: BRAND.gray, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 }}>
              Days
            </Typography>
            <Box sx={{ mt: 0.75 }}>
              <ToggleButtonGroup
                size="small"
                value={form.days}
                onChange={(_e, next) => update({ days: next })}
                sx={{
                  flexWrap: "wrap",
                  "& .MuiToggleButton-root": {
                    textTransform: "none", px: 1.5, color: BRAND.gray, borderColor: BRAND.border,
                    "&.Mui-selected": { color: BRAND.teal, bgcolor: BRAND.tealSoft, "&:hover": { bgcolor: BRAND.tealSoft } },
                  },
                }}
              >
                {DAYS.map((d) => (
                  <ToggleButton key={d.v} value={d.v}>{d.l}</ToggleButton>
                ))}
              </ToggleButtonGroup>
            </Box>
          </Box>

          <Box sx={{ display: "grid", gap: 1.5, gridTemplateColumns: "1fr 1fr" }}>
            {/* No `type="time"`: su desplegable lo pinta el navegador en azul y
                no se puede tematizar (ver common/timeOptions.js). */}
            <BrandTimeField label="Start" value={form.startTime} onChange={(v) => update({ startTime: v })} />
            <BrandTimeField label="End" value={form.endTime} onChange={(v) => update({ endTime: v })} />
          </Box>

          {/* Every IANA zone, with its UTC offset, searchable by city
              («McAllen» → America/Chicago). See timezoneOptions.js. */}
          <Autocomplete
            size="small"
            options={tzOptionList}
            value={tzOptionList.find((o) => o.value === form.timezone) || null}
            onChange={(_e, opt) => { if (opt) update({ timezone: opt.value }); }}
            getOptionLabel={(o) => o.label}
            isOptionEqualToValue={(o, v) => o.value === v.value}
            filterOptions={(opts, state) => opts.filter((o) => matchTimezone(o, state.inputValue))}
            disableClearable
            renderInput={(params) => (
              <TextField {...params} label="Timezone" placeholder="Search a city or zone — e.g. McAllen, Monterrey, Madrid" />
            )}
          />

          <Typography sx={{ fontSize: TEXT.sm, color: BRAND.gray }}>
            Deployments created outside every window wait until the next one opens. An end time earlier than the start crosses midnight.
          </Typography>

          <FormControlLabel
            control={<Switch checked={form.enabled} onChange={(e) => update({ enabled: e.target.checked })} />}
            label="Enabled"
          />

          {error ? (
            <Box sx={{ p: 1.5, borderRadius: 1, bgcolor: BRAND.alert?.errorSoft, color: BRAND.alert?.error, fontSize: TEXT.md, fontWeight: 600 }}>
              {error}
            </Box>
          ) : null}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={onClose} disabled={submitting} sx={{ textTransform: "none", color: BRAND.gray }}>Cancel</Button>
        <Button
          onClick={handleSubmit}
          disabled={submitting}
          variant="contained"
          sx={{ textTransform: "none", fontWeight: 700, bgcolor: BRAND.teal, "&:hover": { bgcolor: BRAND.tealHover } }}
        >
          {submitting ? "Saving…" : mode === "edit" ? "Save changes" : "Create"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
