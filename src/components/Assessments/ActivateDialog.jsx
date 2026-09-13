// src/components/Assessments/ActivateDialog.jsx
//
// ADR-0022 decisión 8 — activar un dominio detectado eligiendo el DC primario,
// el secundario opcional y la agenda. Sirve también para cambiar el colector de
// una instancia activa. El selector sólo ofrece DC con agente de ESE dominio
// (collector-candidates); el servidor vuelve a comprobarlo.
//
// ⚠️ Los candidatos se cargan al ABRIR y no se refrescan mientras el diálogo
// está abierto: un refresco sobre un formulario editable se come la elección
// (memoria project_refresh_over_editable_views).

import * as React from "react";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { BRAND, TEXT } from "../../theme/brand";
import { activateAssessmentInstance, listCollectorCandidates } from "../../api/assessments";
import { bannerSx } from "./StatusChip";

const WEEKDAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

function initialSchedule(instance) {
  const s = instance?.schedule;
  return {
    frequency: ["manual", "daily", "weekly", "monthly"].includes(s?.frequency) ? s.frequency : "weekly",
    days: Array.isArray(s?.window?.days) && s.window.days.length ? s.window.days : ["sun"],
    startHour: Number.isInteger(s?.window?.startHour) ? s.window.startHour : 2,
  };
}

export default function ActivateDialog({ open, instance, onClose, onActivated }) {
  const [candidates, setCandidates] = React.useState(null);
  const [loadError, setLoadError] = React.useState(null);
  const [primary, setPrimary] = React.useState("");
  const [secondary, setSecondary] = React.useState("");
  const [schedule, setSchedule] = React.useState(() => initialSchedule(instance));
  const [saving, setSaving] = React.useState(false);
  const [saveError, setSaveError] = React.useState(null);

  React.useEffect(() => {
    if (!open || !instance) return;
    let alive = true;
    setCandidates(null);
    setLoadError(null);
    setSaveError(null);
    setPrimary(instance.collectorDeviceId || "");
    setSecondary(instance.collectorSecondaryDeviceId || "");
    setSchedule(initialSchedule(instance));
    listCollectorCandidates(instance.id)
      .then((r) => alive && setCandidates(Array.isArray(r?.candidates) ? r.candidates : []))
      .catch((e) => alive && setLoadError(e?.body?.message || e?.message || "Could not load domain controllers."));
    return () => {
      alive = false;
    };
  }, [open, instance]);

  const isChange = instance?.status === "active";
  const label = (c) => `${c.hostname || c.deviceId}${c.online ? "" : " · offline"}`;

  async function submit() {
    setSaving(true);
    setSaveError(null);
    try {
      const body = {
        primaryDeviceId: primary,
        secondaryDeviceId: secondary || null,
        schedule: {
          frequency: schedule.frequency,
          window: { days: schedule.days, startHour: Number(schedule.startHour) },
        },
      };
      const result = await activateAssessmentInstance(instance.id, body);
      onActivated?.(result);
    } catch (e) {
      setSaveError(e?.body?.message || e?.body?.error || e?.message || "Activation failed.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onClose={saving ? undefined : onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ fontWeight: 800 }}>
        {isChange ? "Change collector" : "Activate"} · {instance?.displayName}
      </DialogTitle>
      <DialogContent>
        <Typography sx={{ fontSize: TEXT.sm, color: "text.secondary", mb: 2 }}>
          The collector is a domain controller that already runs the agent. It reads the directory with its own machine
          account, evaluates on the controller and uploads verdicts with bounded evidence — no Active Directory object
          leaves it. {isChange ? "" : "Activating adds this domain to your license and schedules the first run."}
        </Typography>

        {loadError ? <Alert severity="error" sx={{ ...bannerSx("error"),  mb: 2 }}>{loadError}</Alert> : null}
        {candidates === null && !loadError ? (
          <Box sx={{ display: "flex", justifyContent: "center", py: 3 }}>
            <CircularProgress size={24} sx={{ color: BRAND.teal }} />
          </Box>
        ) : null}
        {candidates && candidates.length === 0 ? (
          <Alert severity="warning" sx={{ ...bannerSx("warning"),  mb: 2 }}>
            No domain controller of this domain runs the agent. Install the agent on one to activate the domain.
          </Alert>
        ) : null}

        {candidates && candidates.length > 0 ? (
          <Stack spacing={2}>
            <TextField
              select
              label="Primary domain controller"
              value={primary}
              onChange={(e) => setPrimary(e.target.value)}
              size="small"
              helperText="Runs every assessment when it is online."
            >
              {candidates.map((c) => (
                <MenuItem key={c.deviceId} value={c.deviceId}>
                  {label(c)}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              select
              label="Secondary domain controller (optional)"
              value={secondary}
              onChange={(e) => setSecondary(e.target.value)}
              size="small"
              helperText="Used only when the primary is offline. With neither online the run is recorded as missed."
            >
              <MenuItem value="">None</MenuItem>
              {candidates
                .filter((c) => c.deviceId !== primary)
                .map((c) => (
                  <MenuItem key={c.deviceId} value={c.deviceId}>
                    {label(c)}
                  </MenuItem>
                ))}
            </TextField>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
              <TextField
                select
                label="Schedule"
                value={schedule.frequency}
                onChange={(e) => setSchedule((s) => ({ ...s, frequency: e.target.value }))}
                size="small"
                sx={{ minWidth: 140 }}
              >
                <MenuItem value="manual">Manual</MenuItem>
                <MenuItem value="daily">Daily</MenuItem>
                <MenuItem value="weekly">Weekly</MenuItem>
                <MenuItem value="monthly">Monthly</MenuItem>
              </TextField>
              {schedule.frequency === "weekly" || schedule.frequency === "monthly" ? (
                <TextField
                  select
                  label={schedule.frequency === "monthly" ? "First weekday of the month" : "Days"}
                  value={schedule.days}
                  onChange={(e) => {
                    const v = e.target.value;
                    const list = Array.isArray(v) ? v : [v];
                    setSchedule((s) => ({ ...s, days: WEEKDAYS.filter((d) => list.includes(d)) }));
                  }}
                  size="small"
                  slotProps={{ select: { multiple: true } }}
                  sx={{ minWidth: 160 }}
                >
                  {WEEKDAYS.map((d) => (
                    <MenuItem key={d} value={d}>
                      {d}
                    </MenuItem>
                  ))}
                </TextField>
              ) : null}
              {schedule.frequency !== "manual" ? (
                <TextField
                  type="number"
                  label="Start hour (UTC)"
                  value={schedule.startHour}
                  onChange={(e) => setSchedule((s) => ({ ...s, startHour: e.target.value }))}
                  size="small"
                  slotProps={{ htmlInput: { min: 0, max: 23, step: 1 } }}
                  sx={{ width: 140 }}
                />
              ) : null}
            </Stack>
          </Stack>
        ) : null}

        {saveError ? <Alert severity="error" sx={{ ...bannerSx("error"),  mt: 2 }}>{saveError}</Alert> : null}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving} sx={{ textTransform: "none" }}>
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={submit}
          disabled={saving || !primary || !candidates?.length || (schedule.frequency !== "manual" && schedule.days.length === 0)}
          sx={{ textTransform: "none", fontWeight: 700, bgcolor: BRAND.teal, "&:hover": { bgcolor: BRAND.tealHover } }}
        >
          {saving ? "Saving…" : isChange ? "Save collector" : "Activate"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
