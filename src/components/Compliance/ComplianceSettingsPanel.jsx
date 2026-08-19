// src/components/Compliance/ComplianceSettingsPanel.jsx
//
// Sprint 5 — operator-editable per-tenant settings: min applicable
// checks for scoring + UI health-band thresholds. Backs onto
// `GET/PUT /security/compliance/settings`.
//
// UX shape:
//   - One row per setting.
//   - Each row shows: label · effective value · "use default" toggle ·
//     override input · system default in muted text.
//   - "Save" enabled only when there's a pending diff.
//   - Inline per-field errors when validation fails.
//
// Why a panel (not a separate page): there are three settings today.
// A full settings page would be empty padding. A drawer/dialog keeps
// the SCP page as the single landing surface.

import { useEffect, useMemo, useState } from "react";
import {
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControlLabel,
  IconButton,
  Stack,
  Switch,
  TextField,
  Tooltip,
  Typography
} from "@mui/material";
import CloseOutlinedIcon from "@mui/icons-material/CloseOutlined";

import {
  getComplianceSettings,
  updateComplianceSettings,
  getFrameworks
} from "../../api/compliance";
import { BRAND } from "../../theme/brand";
import AsyncState from "../common/AsyncState";

// Setting metadata — drives the form rows without per-row JSX
// duplication. Add a setting here and it lights up automatically.
//
// `validate` is a client-side hint; the backend's response carries
// the authoritative `issues[]` array which the panel maps back to
// these field keys.
const SETTINGS_DEFS = [
  {
    key: "complianceMinChecks",
    label: "Minimum applicable checks for scoring",
    help: "Below this many applicable rules per device, the score is published as 'No data' instead of a number — prevents vacuous 100% from a tiny check set.",
    min: 1,
    max: 50,
    step: 1,
    validate: (v) =>
      Number.isFinite(v) && v >= 1
        ? null
        : "Must be a positive integer (>= 1)."
  },
  {
    key: "complianceBandGoodMin",
    label: "Healthy band threshold",
    help: "Devices with a compliance score AT OR ABOVE this value are bucketed as 'Good' in the Health Distribution card.",
    min: 0,
    max: 100,
    step: 1,
    validate: (v) =>
      Number.isFinite(v) && v >= 0 && v <= 100
        ? null
        : "Must be between 0 and 100."
  },
  {
    key: "complianceBandWarningMin",
    label: "Warning band threshold",
    help: "Scores AT OR ABOVE this value (but BELOW the healthy threshold) are bucketed as 'Warning'.",
    min: 0,
    max: 100,
    step: 1,
    validate: (v) =>
      Number.isFinite(v) && v >= 0 && v <= 100
        ? null
        : "Must be between 0 and 100."
  }
];

export default function ComplianceSettingsPanel({ open, onClose, onToast }) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [settings, setSettings] = useState(null);
  // Local edit state — separate from `settings` so we can show
  // dirty / pristine and discard easily on Cancel.
  const [draft, setDraft] = useState({});
  const [fieldErrors, setFieldErrors] = useState({});
  // Sprint 4 — compliance pack. `allFrameworks` is the full catalog list
  // (bypassing the pack); `packDraft` is null for "all frameworks" or a
  // Set of active keys while editing.
  const [allFrameworks, setAllFrameworks] = useState([]);
  const [packDraft, setPackDraft] = useState(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setFieldErrors({});
    Promise.all([
      getComplianceSettings(),
      // Fail-soft: without the list the pack section just doesn't render.
      getFrameworks({ all: true }).catch(() => null),
    ])
      .then(([res, fw]) => {
        if (cancelled) return;
        if (res?.ok) {
          setSettings(res.settings ?? null);
          setDraft(seedDraftFromSettings(res.settings));
          const active = res.settings?.effective?.activeFrameworks;
          setPackDraft(Array.isArray(active) && active.length ? new Set(active) : null);
        } else {
          setError(res?.message || "Failed to load settings.");
        }
        setAllFrameworks(Array.isArray(fw?.frameworks) ? fw.frameworks : []);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err?.message || String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  // Identify which fields have changed vs the on-server overrides.
  // Drives the Save button's enabled state + the patch shape we
  // send on click.
  const patch = useMemo(() => {
    if (!settings) return {};
    const result = {};
    for (const def of SETTINGS_DEFS) {
      const onServer = settings.overrides[def.key];
      const inDraft = draft[def.key];
      if (!sameOverride(onServer, inDraft)) {
        result[def.key] = inDraft.useDefault ? null : Number(inDraft.value);
      }
    }
    // Sprint 4 — pack diff. Compare as sorted lists; null = all.
    const serverPack = Array.isArray(settings.effective?.activeFrameworks) && settings.effective.activeFrameworks.length
      ? [...settings.effective.activeFrameworks].sort().join("|")
      : "";
    const draftPack = packDraft ? [...packDraft].sort().join("|") : "";
    if (serverPack !== draftPack) {
      result.activeFrameworks = packDraft ? [...packDraft] : null;
    }
    return result;
  }, [draft, settings, packDraft]);

  const hasChanges = Object.keys(patch).length > 0;

  async function handleSave() {
    setSaving(true);
    setError(null);
    setFieldErrors({});
    try {
      const res = await updateComplianceSettings(patch);
      if (res?.ok) {
        onToast?.({ severity: "success", message: "Compliance settings saved." });
        setSettings(res.settings ?? null);
        setDraft(seedDraftFromSettings(res.settings));
        const active = res.settings?.effective?.activeFrameworks;
        setPackDraft(Array.isArray(active) && active.length ? new Set(active) : null);
      } else if (res?.code === "VALIDATION_FAILED") {
        const errors = {};
        for (const issue of res.issues ?? []) {
          errors[issue.field] = issue.message;
        }
        setFieldErrors(errors);
        onToast?.({
          severity: "warning",
          message: "Validation failed — check the highlighted fields."
        });
      } else {
        setError(res?.message || "Save failed.");
      }
    } catch (err) {
      setError(err?.message || String(err));
    } finally {
      setSaving(false);
    }
  }

  function handleCancel() {
    if (settings) {
      setDraft(seedDraftFromSettings(settings));
      const active = settings.effective?.activeFrameworks;
      setPackDraft(Array.isArray(active) && active.length ? new Set(active) : null);
    }
    setFieldErrors({});
    onClose();
  }

  // Sprint 4 — pack helpers. Toggling from "all" to a subset seeds the
  // Set with everything so the operator unchecks what they don't want
  // (rather than starting from an empty page).
  const packIsAll = packDraft === null;
  const allKeys = allFrameworks.map((f) => f.framework);
  const setPackAll = (all) => setPackDraft(all ? null : new Set(allKeys));
  const togglePackKey = (key) =>
    setPackDraft((prev) => {
      const next = new Set(prev ?? allKeys);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      // Unchecking the last one → back to "all" (an empty pack means
      // "all" server-side anyway; make the UI say so).
      return next.size === 0 ? null : next;
    });

  return (
    <Dialog open={open} onClose={handleCancel} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ display: "flex", alignItems: "center", pb: 1 }}>
        <Typography variant="h6" sx={{ flex: 1, fontWeight: 700, color: BRAND.dark }}>
          Compliance settings
        </Typography>
        <IconButton aria-label="Close" size="small" onClick={handleCancel}>
          <CloseOutlinedIcon fontSize="small" />
        </IconButton>
      </DialogTitle>
      <DialogContent>
        {/* NOTE: JSX children evaluate eagerly — the block below runs even
            while AsyncState shows loading/error and `settings` is still null,
            so every read of it stays optional-chained. */}
        <AsyncState
          loading={loading}
          error={error}
          isEmpty={!settings}
          emptyText="No compliance settings available."
          minHeight={200}
        >
          <Stack spacing={2.5} sx={{ mt: 1 }}>
            {SETTINGS_DEFS.map((def) => (
              <SettingRow
                key={def.key}
                def={def}
                draft={draft[def.key]}
                onChange={(next) =>
                  setDraft((prev) => ({ ...prev, [def.key]: next }))
                }
                serverError={fieldErrors[def.key]}
                clientError={
                  draft[def.key] && !draft[def.key].useDefault
                    ? def.validate(Number(draft[def.key].value))
                    : null
                }
                systemDefault={settings?.systemDefaults?.[def.key]}
                effective={settings?.effective?.[def.key]}
              />
            ))}

            {/* Sprint 4 — compliance pack. Which framework breakdowns
                this tenant sees. A VIEW: scores keep computing for every
                framework, so this is reversible with no re-evaluation. */}
            {allFrameworks.length > 0 ? (
              <Box>
                <Divider sx={{ mb: 2 }} />
                <Typography sx={{ fontWeight: 700, color: BRAND.dark, fontSize: 14 }}>
                  Active frameworks (compliance pack)
                </Typography>
                <Typography variant="caption" sx={{ color: BRAND.gray, display: "block", mb: 1 }}>
                  Choose which frameworks appear in the framework table, filter and trend. Scores
                  are still computed for every framework — switching this back on later loses nothing.
                  {fieldErrors.activeFrameworks ? (
                    <Box component="span" sx={{ color: BRAND.alert?.error, display: "block", mt: 0.5 }}>
                      {fieldErrors.activeFrameworks}
                    </Box>
                  ) : null}
                </Typography>
                <FormControlLabel
                  control={<Switch size="small" checked={packIsAll} onChange={(e) => setPackAll(e.target.checked)} />}
                  label={
                    <Typography variant="body2">
                      All frameworks{" "}
                      <Typography component="span" variant="caption" sx={{ color: BRAND.gray }}>
                        ({allFrameworks.length})
                      </Typography>
                    </Typography>
                  }
                />
                {!packIsAll ? (
                  <Stack sx={{ mt: 0.5, ml: 1 }}>
                    {allFrameworks.map((f) => (
                      <FormControlLabel
                        key={f.framework}
                        control={
                          <Checkbox
                            size="small"
                            checked={packDraft?.has(f.framework) ?? true}
                            onChange={() => togglePackKey(f.framework)}
                          />
                        }
                        label={
                          <Stack direction="row" spacing={0.75} alignItems="center">
                            <Typography variant="body2">{f.shortName || f.framework}</Typography>
                            {f.family ? (
                              <Chip size="small" label={f.family} sx={{ height: 18, fontSize: 10 }} />
                            ) : null}
                          </Stack>
                        }
                      />
                    ))}
                    <Typography variant="caption" sx={{ color: BRAND.gray, mt: 0.5 }}>
                      {packDraft?.size ?? 0} of {allFrameworks.length} active
                    </Typography>
                  </Stack>
                ) : null}
              </Box>
            ) : null}
          </Stack>
        </AsyncState>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleCancel} disabled={saving}>
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={handleSave}
          disabled={!hasChanges || saving}
          startIcon={saving ? <CircularProgress size={14} color="inherit" /> : null}
        >
          {saving ? "Saving..." : "Save changes"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// Per-row form. Lives outside the parent so the parent's render
// stays scan-able; the row reaches into `draft` via props only.
function SettingRow({
  def,
  draft,
  onChange,
  serverError,
  clientError,
  systemDefault,
  effective
}) {
  if (!draft) return null;
  const errorMsg = serverError || clientError;
  const showOverrideInput = !draft.useDefault;

  return (
    <Box>
      <Stack direction="row" alignItems="center" spacing={1}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="body2" sx={{ color: BRAND.dark, fontWeight: 700 }}>
            {def.label}
          </Typography>
          <Typography variant="caption" sx={{ color: BRAND.gray, display: "block" }}>
            {def.help}
          </Typography>
        </Box>
        <Tooltip
          title={
            draft.useDefault
              ? `Using system default (${systemDefault})`
              : "Custom value for this tenant"
          }
          arrow
          placement="top"
        >
          <Switch
            checked={!draft.useDefault}
            onChange={(_, checked) =>
              onChange({
                ...draft,
                useDefault: !checked,
                // When flipping ON the override, seed the input with
                // the current effective value so the user doesn't
                // start from an empty field.
                value: checked ? String(effective) : draft.value
              })
            }
            size="small"
          />
        </Tooltip>
      </Stack>
      {showOverrideInput ? (
        <TextField
          size="small"
          type="number"
          fullWidth
          value={draft.value}
          onChange={(e) =>
            onChange({ ...draft, value: e.target.value })
          }
          inputProps={{
            min: def.min,
            max: def.max,
            step: def.step
          }}
          error={Boolean(errorMsg)}
          helperText={errorMsg || `System default: ${systemDefault}`}
          sx={{ mt: 1 }}
        />
      ) : (
        <Typography variant="caption" sx={{ color: BRAND.gray, mt: 0.75, display: "block" }}>
          Currently using system default: <strong>{systemDefault}</strong>
        </Typography>
      )}
    </Box>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────

// Seed the dialog's edit state from the server view. `useDefault` is
// true when no override is set; `value` is the string form of the
// effective value (TextField wants string).
function seedDraftFromSettings(settings) {
  if (!settings) return {};
  const out = {};
  for (const def of SETTINGS_DEFS) {
    const override = settings.overrides[def.key];
    out[def.key] = {
      useDefault: override === null || override === undefined,
      value: String(
        override !== null && override !== undefined
          ? override
          : settings.effective[def.key]
      )
    };
  }
  return out;
}

// Compare server-side override (number|null) vs draft (useDefault +
// value string). Returns true when they're equivalent — used to
// detect "no diff" and disable Save.
function sameOverride(serverOverride, draft) {
  if (!draft) return true;
  if (draft.useDefault) {
    return serverOverride === null || serverOverride === undefined;
  }
  return (
    serverOverride !== null &&
    serverOverride !== undefined &&
    Number(draft.value) === Number(serverOverride)
  );
}
