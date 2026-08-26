// src/components/Policies/SecurityPolicySection.jsx
//
// "Security policy" card section of the PolicyForm, extracted from the
// Policies god-component. One card per capability (SECURITY_CAPABILITIES): a
// mode selector (off / report-only / auto, with `auto` gated behind the
// capability's `enforcer` flag) plus the capability-specific desired-state
// controls (boolean → Switch, enum → Select, number → numeric field).
// Props-driven: reads form.security and writes the whole form back via
// onChange so the omit-empty serialization in policyTransforms stays intact.

import * as React from "react";
import {
  Box,
  Chip,
  FormControlLabel,
  MenuItem,
  Switch,
  TextField,
  Typography
} from "@mui/material";
import { BRAND, TEXT } from "../../theme/brand";
import { SECURITY_CAPABILITIES, SECURITY_MODES } from "./policyTransforms";

// Fase C — `evidenceByCapability` (optional): live posture evidence per
// capability key, shape { failed, highSeverityFails, devicesFailing,
// devices } from capabilityBridge.evidenceForCapability. When present,
// each card shows what the fleet ACTUALLY looks like against this
// capability right now; clicking the chip jumps to the evidence
// (onShowEvidence). Absent → cards render exactly as before, so the
// device-overrides consumer of this section is untouched.
export default function SecurityPolicySection({
  form,
  onChange,
  readOnly = false,
  evidenceByCapability = null,
  onShowEvidence = null,
  // Gate de tier: `auto` hace que el agente REMEDIE en el endpoint, y eso lo
  // habilita PMP (enterprise). Sin derecho la opción se deshabilita en vez de
  // desaparecer, para que se vea QUE existe y qué plan hace falta — un menú al
  // que le falta una opción sin explicación es peor que uno que dice por qué.
  autoEntitled = true,
}) {
  return (
      <Box
        sx={{
          mt: 4,
          p: 1.5,
          border: `1px solid ${BRAND.border}`,
          borderRadius: 2,
          bgcolor: BRAND.surfaceMuted,
        }}
      >
        <Typography
          variant="overline"
          sx={{ color: BRAND.dark, fontWeight: 800, letterSpacing: 1.2 }}
        >
          Security policy
        </Typography>
        <Typography variant="caption" sx={{ color: BRAND.gray, display: "block", mb: 1 }}>
          Declarative posture rules. Each capability has a <strong>mode</strong>:
          {" "}<em>Off</em> (skip), <em>Report only</em> (detect drift, never modify), or
          {" "}<em>Auto-remediate</em> (fix drift on the device). Default mode is
          {" "}<em>Report only</em>. Functional capabilities are enforced by the agent
          on every compliance pass; placeholders below are stored but not yet enforced.
        </Typography>

        {SECURITY_CAPABILITIES.map((cap) => {
          const entry = form.security?.capabilities?.[cap.key] || { mode: null, values: {} };
          const onModeChange = (newMode) => {
            onChange({
              ...form,
              security: {
                ...(form.security || {}),
                capabilities: {
                  ...(form.security?.capabilities || {}),
                  [cap.key]: {
                    ...entry,
                    mode: newMode,
                  },
                },
              },
            });
          };
          const onValueChange = (fieldKey, newValue) => {
            const nextValues = { ...(entry.values || {}) };
            if (newValue === null || newValue === undefined || newValue === "") {
              delete nextValues[fieldKey];
            } else {
              nextValues[fieldKey] = newValue;
            }
            onChange({
              ...form,
              security: {
                ...(form.security || {}),
                capabilities: {
                  ...(form.security?.capabilities || {}),
                  [cap.key]: {
                    ...entry,
                    values: nextValues,
                  },
                },
              },
            });
          };

          return (
            <Box
              key={cap.key}
              sx={{
                mt: 1.5,
                p: 1.25,
                border: `1px solid ${BRAND.border}`,
                borderRadius: 1.5,
                bgcolor: "#ffffff",
                opacity: cap.enforcer ? 1 : 0.85,
              }}
            >
              <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 1 }}>
                <Box sx={{ flex: 1 }}>
                  <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, flexWrap: "wrap" }}>
                    <Typography variant="subtitle2" sx={{ fontWeight: 700, color: BRAND.dark }}>
                      {cap.label}
                    </Typography>
                    {cap.osTags.map((t) => (
                      <Chip key={t} label={t} size="small" sx={{ height: 18, fontSize: TEXT.xs, bgcolor: BRAND.tealSoft, color: BRAND.tealText }} />
                    ))}
                    {!cap.enforcer && (
                      <Chip
                        label="auto coming soon"
                        size="small"
                        sx={{ height: 18, fontSize: TEXT.xs, bgcolor: BRAND.surfaceMuted, color: BRAND.gray }}
                      />
                    )}
                    {(() => {
                      // Fase C — live evidence badge. Deliberately last
                      // in the chip row: intent chips first, then what
                      // reality says about it.
                      const ev = evidenceByCapability?.[cap.key];
                      if (!ev) return null;
                      const failing = ev.devicesFailing > 0;
                      const label = failing
                        ? `${ev.devicesFailing}${ev.devices ? ` of ${ev.devices}` : ""} device${ev.devicesFailing === 1 ? "" : "s"} failing${ev.highSeverityFails ? ` · ${ev.highSeverityFails} high` : ""}`
                        : "No drift detected";
                      return (
                        <Chip
                          label={label}
                          size="small"
                          onClick={failing && onShowEvidence ? () => onShowEvidence(cap.key) : undefined}
                          clickable={Boolean(failing && onShowEvidence)}
                          sx={{
                            height: 18,
                            fontSize: TEXT.xs,
                            fontWeight: 700,
                            bgcolor: failing ? BRAND.alert?.errorSoft : BRAND.tealSoft,
                            color: failing ? BRAND.alert?.error : BRAND.tealText,
                          }}
                        />
                      );
                    })()}
                  </Box>
                  <Typography variant="caption" sx={{ color: BRAND.gray, display: "block", mt: 0.5 }}>
                    {cap.description}
                  </Typography>
                </Box>

                <TextField
                  select
                  size="small"
                  label="Mode"
                  value={entry.mode ?? ""}
                  onChange={(e) => onModeChange(e.target.value || null)}
                  disabled={readOnly}
                  sx={{ minWidth: 150 }}
                  helperText={entry.mode == null ? "Inherits default" : ""}
                >
                  <MenuItem value="">(inherit default)</MenuItem>
                  {SECURITY_MODES.map((m) => {
                    const isAuto = m.value === "auto";
                    const notBuilt = !cap.enforcer && isAuto;
                    const notPaid = !autoEntitled && isAuto;
                    return (
                      <MenuItem key={m.value} value={m.value} disabled={notBuilt || notPaid}>
                        {m.label}
                        {notBuilt ? " (coming soon)" : notPaid ? " (requires Patch Management)" : ""}
                      </MenuItem>
                    );
                  })}
                </TextField>
              </Box>

              {/* Capability-specific fields. Each field renders to a
                  control matching its declared type — boolean → switch,
                  enum → select, number → numeric TextField. */}
              {cap.fields.length > 0 && (
                <Box sx={{ mt: 1.25, display: "flex", flexDirection: "column", gap: 0.75 }}>
                  {cap.fields.map((field) => {
                    const current = entry.values?.[field.key];
                    if (field.type === "boolean") {
                      const checked = typeof current === "boolean" ? current : field.default;
                      return (
                        <FormControlLabel
                          key={field.key}
                          control={
                            <Switch
                              size="small"
                              checked={checked}
                              onChange={(e) => onValueChange(field.key, e.target.checked)}
                              disabled={readOnly}
                            />
                          }
                          label={
                            <Typography variant="body2">
                              {field.label}:{" "}
                              <strong>
                                {checked ? (field.trueLabel || "Yes") : (field.falseLabel || "No")}
                              </strong>
                            </Typography>
                          }
                          sx={{ mx: 0 }}
                        />
                      );
                    }
                    if (field.type === "enum") {
                      const value = current ?? field.default;
                      return (
                        <TextField
                          key={field.key}
                          select
                          size="small"
                          label={field.label}
                          value={value}
                          onChange={(e) => onValueChange(field.key, e.target.value)}
                          disabled={readOnly}
                          sx={{ maxWidth: 320 }}
                        >
                          {field.options.map((opt) => (
                            <MenuItem key={opt.value} value={opt.value}>
                              {opt.label}
                            </MenuItem>
                          ))}
                        </TextField>
                      );
                    }
                    if (field.type === "number") {
                      const value =
                        current === undefined || current === null ? "" : String(current);
                      return (
                        <TextField
                          key={field.key}
                          type="number"
                          size="small"
                          label={field.label}
                          value={value}
                          onChange={(e) => {
                            const raw = e.target.value;
                            onValueChange(field.key, raw === "" ? null : Number(raw));
                          }}
                          disabled={readOnly}
                          inputProps={{ min: field.min, max: field.max }}
                          sx={{ maxWidth: 320 }}
                        />
                      );
                    }
                    return null;
                  })}
                </Box>
              )}
            </Box>
          );
        })}
      </Box>
  );
}
