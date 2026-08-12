// src/components/Policies/AiSdpSections.jsx
//
// Two small PolicyForm sections extracted from the Policies god-component:
//   • AiIntelligenceSection — the aip entitlement toggle + per-day quota
//     (fail-closed; blank limits = unlimited).
//   • SoftwareDeliverySection — the per-device download bandwidth cap.
// Both are props-driven ({form, onChange, readOnly}); they read their own
// form.ai / form.sdp slice and write the whole form back via onChange so the
// omit-empty serialization in policyTransforms stays intact.

import * as React from "react";
import { Box, FormControlLabel, Switch, TextField, Typography } from "@mui/material";
import { BRAND } from "../../theme/brand";

export function AiIntelligenceSection({ form, onChange, readOnly = false }) {
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
          AI Intelligence
        </Typography>
        <Typography variant="caption" sx={{ color: BRAND.gray, display: "block", mb: 1 }}>
          Unlocks AI-assisted features (e.g. the software-intake pipeline that proposes
          install configs). <strong>Fail-closed</strong>: off unless enabled here. Per-day
          quotas cap spend — leave a limit blank for unlimited. Every AI call is audited.
        </Typography>

        <FormControlLabel
          control={
            <Switch
              size="small"
              checked={Boolean(form?.ai?.enabled)}
              onChange={(e) =>
                onChange({ ...form, ai: { ...(form.ai || {}), enabled: e.target.checked } })
              }
              disabled={readOnly}
            />
          }
          label={
            <Box>
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                Enable AI features <Typography component="span" variant="caption" sx={{ color: BRAND.gray, ml: 0.5 }}>(aip entitlement)</Typography>
              </Typography>
              <Typography variant="caption" sx={{ color: BRAND.gray }}>
                Required for the SDP intake pipeline (install-config generation).
              </Typography>
            </Box>
          }
          sx={{ alignItems: "flex-start", mx: 0, mt: 0.5 }}
        />

        {form?.ai?.enabled ? (
          <Box sx={{ display: "flex", gap: 2, mt: 1.5, flexWrap: "wrap" }}>
            <TextField
              size="small"
              type="number"
              label="Max AI calls / day"
              placeholder="unlimited"
              value={form?.ai?.maxCallsPerDay ?? ""}
              onChange={(e) =>
                onChange({
                  ...form,
                  ai: {
                    ...(form.ai || {}),
                    maxCallsPerDay: e.target.value === "" ? "" : Number(e.target.value),
                  },
                })
              }
              disabled={readOnly}
              inputProps={{ min: 1, step: 1 }}
              helperText="Blank = unlimited"
              sx={{ width: 180 }}
            />
            <TextField
              size="small"
              type="number"
              label="Max AI tokens / day"
              placeholder="unlimited"
              value={form?.ai?.maxTokensPerDay ?? ""}
              onChange={(e) =>
                onChange({
                  ...form,
                  ai: {
                    ...(form.ai || {}),
                    maxTokensPerDay: e.target.value === "" ? "" : Number(e.target.value),
                  },
                })
              }
              disabled={readOnly}
              inputProps={{ min: 1, step: 1000 }}
              helperText="Blank = unlimited"
              sx={{ width: 200 }}
            />
          </Box>
        ) : null}
      </Box>
  );
}

export function SoftwareDeliverySection({ form, onChange, readOnly = false }) {
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
          Software delivery
        </Typography>
        <Typography variant="caption" sx={{ color: BRAND.gray, display: "block", mb: 1 }}>
          Bandwidth cap for package downloads on each device (installs and
          distribution-point prefetches). Blank = full speed.
        </Typography>
        <TextField
          size="small"
          type="number"
          label="Download limit (KB/s)"
          placeholder="full speed"
          value={form?.sdp?.bandwidthLimitKbps ?? ""}
          onChange={(e) =>
            onChange({
              ...form,
              sdp: {
                ...(form.sdp || {}),
                bandwidthLimitKbps: e.target.value === "" ? "" : Number(e.target.value),
              },
            })
          }
          disabled={readOnly}
          inputProps={{ min: 1, step: 128 }}
          helperText="Blank = full speed"
          sx={{ width: 200 }}
        />
      </Box>
  );
}
