// src/pages/SessionSettings.jsx
//
// Per-tenant session security settings — toggle auto-logout + idle
// timeout (minutes). Backed by /api/v1/session-settings.
//
// Visibility: anyone authenticated in the tenant can SEE this page
// (the GET endpoint is open). The Save button is enabled only for
// OWNER/ADMIN — the same gate the backend enforces, mirrored client-
// side to avoid the user filling out a form they can't submit.
//
// Effect propagation: after a successful PUT, the AppShell idle timer
// re-arms with the new values on the NEXT refresh. We do NOT mutate
// AuthContext directly — keeping the data-flow one-direction (server →
// /api/bootstrap → context → AppShell) means there's exactly one
// source of truth, and an admin who edits the setting and refreshes
// sees the change applied.

import * as React from "react";
import {
  Alert,
  Box,
  Button,
  Divider,
  FormControlLabel,
  Stack,
  Switch,
  TextField,
  Typography,
} from "@mui/material";
import TimerOutlinedIcon from "@mui/icons-material/TimerOutlined";
import SaveOutlinedIcon from "@mui/icons-material/SaveOutlined";
import RestartAltOutlinedIcon from "@mui/icons-material/RestartAltOutlined";

import { httpGetJson, httpPutJson } from "../api/http";
import PageHeader from "../components/common/PageHeader";
import BackToSettings from "../components/common/BackToSettings";
import SectionPaper from "../components/common/SectionPaper";
import { BRAND } from "../theme/brand";
import { useAuthContext } from "../auth/AuthContext";
import { useEffectiveTenantId } from "../hooks/useEffectiveTenantId";
import { getMyCapabilities } from "../api/roles";

// Mirrors session-settings.service.ts SESSION_SETTINGS_LIMITS. Keeping
// these in sync is a manual responsibility — defense in depth lives
// in the SQL CHECK constraint and the service-layer validation; the
// UI bounds just produce a nicer error before round-tripping to the
// server.
const MIN_MINUTES = 5;
const MAX_MINUTES = 480;
const DEFAULT_MINUTES = 30;

export default function SessionSettings({ onNavigate }) {
  const { auth } = useAuthContext();
  // ⚠️ NOT `auth?.tenantId` — see useEffectiveTenantId. During vendor/MSP
  // portfolio navigation the selected tenant lives in the MSP context and
  // `auth` does not carry it, so this read silently resolved to nothing.
  const tenantId = useEffectiveTenantId();
  const isGlobalAdmin = auth?.globalRole === "admin_master";

  // Decide whether the current user can edit the setting. The backend
  // is the source of truth (requireCapability("session_settings") gate
  // on PUT, ADR-0011 Phase 3), but mirroring the check here lets us
  // disable the form instead of letting a member without it fill the
  // form in and get a 403 on Save. Defaults to disabled while the fetch
  // is in flight (myPermissions still null) — fail-closed, not a flash
  // of an enabled button that then locks.
  const [myPermissions, setMyPermissions] = React.useState(null);

  React.useEffect(() => {
    if (!tenantId) return;
    let alive = true;
    getMyCapabilities(tenantId)
      .then((resp) => {
        if (!alive) return;
        setMyPermissions(new Set(Array.isArray(resp?.permissions) ? resp.permissions : []));
      })
      .catch(() => {
        if (!alive) return;
        setMyPermissions(new Set());
      });
    return () => {
      alive = false;
    };
  }, [tenantId]);

  const canEdit = isGlobalAdmin || Boolean(myPermissions?.has("session_settings"));

  const [loading, setLoading] = React.useState(true);
  const [view, setView] = React.useState(null);
  const [error, setError] = React.useState("");

  // Form state — initialised from the loaded view, then user-editable.
  const [formEnabled, setFormEnabled] = React.useState(true);
  const [formMinutes, setFormMinutes] = React.useState(DEFAULT_MINUTES);
  const [formMinutesText, setFormMinutesText] = React.useState(String(DEFAULT_MINUTES));

  const [saving, setSaving] = React.useState(false);
  const [savedAt, setSavedAt] = React.useState(null);

  const loadSettings = React.useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const resp = await httpGetJson("/api/v1/session-settings");
      const v = resp?.settings ?? null;
      setView(v);
      if (v) {
        setFormEnabled(v.effective?.autoLogoutEnabled !== false);
        const m = v.effective?.autoLogoutMinutes ?? DEFAULT_MINUTES;
        setFormMinutes(m);
        setFormMinutesText(String(m));
      }
    } catch (err) {
      setError(err?.message || "Could not load session settings.");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  // Minutes input — store text + parsed number separately so the user
  // can type freely (including transient empty / partial values) without
  // the number snapping back to 0 every keystroke.
  const onMinutesChange = (e) => {
    const txt = e.target.value;
    setFormMinutesText(txt);
    const n = parseInt(txt, 10);
    if (Number.isFinite(n)) setFormMinutes(n);
  };

  const formMinutesValid =
    Number.isInteger(formMinutes) &&
    formMinutes >= MIN_MINUTES &&
    formMinutes <= MAX_MINUTES;
  const minutesError =
    !formMinutesValid
      ? `Must be a whole number between ${MIN_MINUTES} and ${MAX_MINUTES}.`
      : "";

  const dirty = (() => {
    if (!view) return false;
    const enabledChanged = formEnabled !== (view.effective?.autoLogoutEnabled !== false);
    const minutesChanged = formMinutes !== view.effective?.autoLogoutMinutes;
    return enabledChanged || minutesChanged;
  })();

  const onSave = async () => {
    if (!canEdit) return;
    if (!formMinutesValid) return;
    setSaving(true);
    setError("");
    setSavedAt(null);
    try {
      const resp = await httpPutJson("/api/v1/session-settings", {
        autoLogoutEnabled: formEnabled,
        autoLogoutMinutes: formMinutes,
      });
      const v = resp?.settings ?? null;
      setView(v);
      setSavedAt(new Date());
      // Note: the AppShell idle timer reads from AuthContext, which
      // is populated by /api/bootstrap. The new value takes effect on
      // the next bootstrap refresh — typically the next full page
      // load. We deliberately don't push the value into the context
      // here to keep one source of truth.
    } catch (err) {
      setError(err?.message || "Save failed.");
    } finally {
      setSaving(false);
    }
  };

  const onResetToDefaults = async () => {
    if (!canEdit) return;
    setSaving(true);
    setError("");
    setSavedAt(null);
    try {
      // Passing explicit null clears the per-tenant override. The
      // service deletes the row when both fields go null, falling back
      // to system defaults. See updateSessionSettings() in
      // session-settings.service.ts.
      const resp = await httpPutJson("/api/v1/session-settings", {
        autoLogoutEnabled: null,
        autoLogoutMinutes: null,
      });
      const v = resp?.settings ?? null;
      setView(v);
      if (v) {
        setFormEnabled(v.effective?.autoLogoutEnabled !== false);
        const m = v.effective?.autoLogoutMinutes ?? DEFAULT_MINUTES;
        setFormMinutes(m);
        setFormMinutesText(String(m));
      }
      setSavedAt(new Date());
    } catch (err) {
      setError(err?.message || "Reset failed.");
    } finally {
      setSaving(false);
    }
  };

  const usingOverride =
    view?.overrides?.autoLogoutEnabled !== null ||
    view?.overrides?.autoLogoutMinutes !== null;

  return (
    <Box sx={{ pb: 4 }}>
      <PageHeader
        title="Session security"
        subtitle="Control how soon the portal signs operators out after a period of inactivity."
        icon={<TimerOutlinedIcon />}
        back={<BackToSettings onNavigate={onNavigate} />}
      />

      {error ? (
        <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>
      ) : null}

      {savedAt ? (
        <Alert severity="success" sx={{ mb: 2 }}>
          Saved. New idle timeout applies on the next page refresh.
        </Alert>
      ) : null}

      {!canEdit ? (
        <Alert severity="info" sx={{ mb: 2 }}>
          You can view this setting but only tenant Owners and Admins can
          change it.
        </Alert>
      ) : null}

      <SectionPaper variant="panel">
        <Stack spacing={3} sx={{ p: 3 }}>
          <Box>
            <Typography variant="subtitle1" sx={{ fontWeight: 700, color: BRAND.dark }}>
              Auto-logout on inactivity
            </Typography>
            <Typography variant="body2" sx={{ color: BRAND.gray, mt: 0.5 }}>
              When enabled, the portal warns the operator after the configured
              idle window and signs them out if they don't respond within 15
              seconds. The change applies to every operator in this tenant
              after their next page refresh.
            </Typography>
          </Box>

          <FormControlLabel
            control={
              <Switch
                checked={formEnabled}
                disabled={!canEdit || loading || saving}
                onChange={(_, v) => setFormEnabled(v)}
              />
            }
            label={formEnabled ? "Enabled" : "Disabled"}
          />

          <TextField
            label="Logout after (minutes of inactivity)"
            type="number"
            value={formMinutesText}
            disabled={!canEdit || loading || saving || !formEnabled}
            onChange={onMinutesChange}
            error={Boolean(minutesError) && formEnabled}
            helperText={
              !formEnabled
                ? "Disabled — operators stay signed in until they explicitly sign out."
                : (minutesError || `Allowed: ${MIN_MINUTES}–${MAX_MINUTES} minutes.`)
            }
            inputProps={{ min: MIN_MINUTES, max: MAX_MINUTES, step: 1 }}
            sx={{ maxWidth: 320 }}
          />

          {view ? (
            <Box>
              <Typography variant="caption" sx={{ color: BRAND.gray }}>
                {usingOverride
                  ? "This tenant has a custom configuration."
                  : `Using system defaults (${view.defaults.autoLogoutMinutes} min, ${
                      view.defaults.autoLogoutEnabled ? "enabled" : "disabled"
                    }).`}
                {view.updatedAt
                  ? ` Last updated ${new Date(view.updatedAt).toLocaleString()}${
                      view.updatedBy ? ` by ${view.updatedBy}` : ""
                    }.`
                  : ""}
              </Typography>
            </Box>
          ) : null}

          <Divider />

          <Stack direction="row" spacing={2} sx={{ flexWrap: "wrap" }}>
            <Button
              variant="contained"
              startIcon={<SaveOutlinedIcon />}
              onClick={onSave}
              disabled={
                !canEdit || saving || loading || !dirty || (formEnabled && !formMinutesValid)
              }
            >
              {saving ? "Saving…" : "Save changes"}
            </Button>
            <Button
              variant="outlined"
              startIcon={<RestartAltOutlinedIcon />}
              onClick={onResetToDefaults}
              disabled={!canEdit || saving || loading || !usingOverride}
            >
              Reset to system defaults
            </Button>
          </Stack>
        </Stack>
      </SectionPaper>
    </Box>
  );
}
