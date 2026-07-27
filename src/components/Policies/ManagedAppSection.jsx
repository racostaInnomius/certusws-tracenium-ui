// src/components/Policies/ManagedAppSection.jsx
//
// "Mobile app management (MAM)" section of the PolicyForm, extracted from the
// Policies god-component. Authors policyJson.mam for the T-iOS / T-Android
// managed clients (desktop agents ignore it). The booleans are tri-state
// (Unset / On / Off) rendered as selects; idle-timeout + minimum-app-version
// are optional scalars. Props-driven: reads form.managedApp, writes the whole
// form back via onChange so policyTransforms' omit-empty rules stay intact.

import * as React from "react";
import { Box, MenuItem, TextField, Typography } from "@mui/material";
import { BRAND } from "../../theme/brand";
import { MAM_BOOL_FIELDS } from "./policyTransforms";

export default function ManagedAppSection({ form, onChange, readOnly = false }) {
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
          Mobile app management (MAM)
        </Typography>
        <Typography variant="caption" sx={{ color: BRAND.gray, display: "block", mb: 1 }}>
          Applies to enrolled <strong>iOS &amp; Android</strong> managed clients only —
          desktop agents ignore it. Leave a control <em>Unset</em> to keep the app
          default. Devices re-fetch on the next policy push.
        </Typography>

        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))",
            gap: 2,
            mt: 1.5,
          }}
        >
          {MAM_BOOL_FIELDS.map((f) => {
            const cur = form?.managedApp?.[f.key];
            const val = cur === true ? "on" : cur === false ? "off" : "unset";
            return (
              <TextField
                key={f.key}
                select
                size="small"
                label={f.label}
                value={val}
                onChange={(e) => {
                  const v = e.target.value;
                  const next = v === "on" ? true : v === "off" ? false : null;
                  onChange({
                    ...form,
                    managedApp: { ...(form.managedApp || {}), [f.key]: next },
                  });
                }}
                disabled={readOnly}
                helperText={f.hint}
              >
                <MenuItem value="unset">Unset (app default)</MenuItem>
                <MenuItem value="on">{f.onLabel}</MenuItem>
                <MenuItem value="off">{f.offLabel}</MenuItem>
              </TextField>
            );
          })}
        </Box>

        <Box sx={{ display: "flex", gap: 2, mt: 2, flexWrap: "wrap" }}>
          <TextField
            size="small"
            type="number"
            label="Idle timeout (s)"
            placeholder="app default"
            value={form?.managedApp?.idleTimeoutSeconds ?? ""}
            onChange={(e) =>
              onChange({
                ...form,
                managedApp: {
                  ...(form.managedApp || {}),
                  idleTimeoutSeconds: e.target.value === "" ? "" : Number(e.target.value),
                },
              })
            }
            disabled={readOnly}
            inputProps={{ min: 15, max: 86400, step: 15 }}
            helperText="15–86400s; locks the app after inactivity. Blank = app default."
            sx={{ width: 230 }}
          />
          <TextField
            size="small"
            label="Minimum app version"
            placeholder="any"
            value={form?.managedApp?.minimumAppVersion ?? ""}
            onChange={(e) =>
              onChange({
                ...form,
                managedApp: {
                  ...(form.managedApp || {}),
                  minimumAppVersion: e.target.value,
                },
              })
            }
            disabled={readOnly}
            helperText="Older installs are prompted to update. Blank = any."
            sx={{ width: 230 }}
          />
        </Box>
      </Box>
  );
}
