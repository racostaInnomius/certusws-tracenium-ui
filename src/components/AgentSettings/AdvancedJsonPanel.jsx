// src/components/AgentSettings/AdvancedJsonPanel.jsx
//
// The raw policy document. Two very different actions live here and the
// copy keeps them apart:
//   * editing the text feeds the form (same as before): Save then sends
//     the agent-config slice only, like every other section;
//   * "Replace entire document" is the whole-document PUT — it also
//     rewrites the Security Baselines and Device Management blocks, which
//     is why it has its own button and its own confirm.
// For a device the editable document is the override PATCH (phase B: the
// paths the device changes, nothing else) and the effective policy the
// device runs is shown read-only underneath.

import * as React from "react";
import { Alert, Box, Button, TextField, Typography } from "@mui/material";
import { BRAND, TEXT } from "../../theme/brand";
import { JsonBlock, DetailRow, renderSourceChip } from "../Policies/policyDisplay";

export default function AdvancedJsonPanel({
  jsonDraft,
  jsonError,
  onJsonChange,
  readOnly = false,
  onReplaceDocument = null,
  replaceDisabled = false,
  effective = null,
  scope = "tenant",
}) {
  return (
    <Box>
      <Typography component="h2" sx={{ fontSize: TEXT.lg, fontWeight: 800, color: BRAND.dark }}>
        Advanced
      </Typography>
      <Typography sx={{ fontSize: TEXT.sm, color: "text.secondary", mb: 1.5 }}>
        {scope === "device"
          ? "The override patch as stored: only the paths this device changes. Everything else is inherited from the tenant policy. Replacing it writes exactly this document."
          : "The tenant policy as stored. Edits here update the form: Save still writes the agent settings only. Unknown keys are preserved."}
      </Typography>

      <TextField
        multiline
        minRows={14}
        fullWidth
        value={jsonDraft}
        onChange={(e) => onJsonChange(e.target.value)}
        disabled={readOnly}
        error={Boolean(jsonError)}
        helperText={jsonError || " "}
        inputProps={{ "aria-label": "Policy JSON", spellCheck: false }}
        sx={{ "& .MuiInputBase-root": { fontFamily: "monospace", fontSize: TEXT.sm, bgcolor: BRAND.surface } }}
      />

      {onReplaceDocument ? (
        <Alert
          severity="warning"
          sx={{ mt: 1.5 }}
          action={
            <Button color="inherit" size="small" onClick={onReplaceDocument} disabled={readOnly || replaceDisabled || Boolean(jsonError)}>
              {scope === "device" ? "Replace override patch" : "Replace entire document"}
            </Button>
          }
        >
          {scope === "device"
            ? "Replaces the whole patch. An empty patch ({}) removes the override. plugins and modules are ignored: activation follows the plan."
            : "Replacing the document also overwrites the Security Baselines and Device Management blocks, which are normally edited on their own pages."}
        </Alert>
      ) : null}

      {scope === "device" && effective ? (
        <Box sx={{ mt: 3 }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}>
            <Typography sx={{ fontSize: TEXT.base, fontWeight: 800, color: BRAND.dark }}>Effective policy on this device</Typography>
            {renderSourceChip(effective.source)}
          </Box>
          <Box sx={{ display: "grid", gap: 0.5, mb: 1 }}>
            <DetailRow label="Version" value={effective.version || "—"} mono />
          </Box>
          <JsonBlock value={effective.json ?? {}} maxHeight={260} />
        </Box>
      ) : null}
    </Box>
  );
}
