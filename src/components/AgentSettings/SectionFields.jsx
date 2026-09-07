// src/components/AgentSettings/SectionFields.jsx
//
// A section's settings as compact rows: label and one-line help on the
// left, the control in the middle, and on the right where the value comes
// from. In tenant scope that column is a dash. In device scope it reads
// "Inherits · Tenant" or "Override" with a way back to inheriting, field by
// field — the override is exactly the set of rows that say Override.

import * as React from "react";
import { Alert, Box, Button, Chip, Switch, TextField, Typography } from "@mui/material";
import { BRAND, ROLE, TEXT } from "../../theme/brand";
import { getFormValue, MONO_FONT, sameFormValue, setFormValue, specsFor, switchOn } from "./fieldSpecs";

function Control({ spec, value, onChange, disabled }) {
  const ariaLabel = spec.label;
  if (spec.type === "switch") {
    return (
      <Switch
        size="small"
        checked={switchOn(spec, value)}
        onChange={(e) => onChange(e.target.checked)}
        disabled={disabled}
        inputProps={{ "aria-label": ariaLabel }}
      />
    );
  }
  if (spec.type === "number") {
    return (
      <TextField
        size="small"
        type="number"
        value={value === null || value === undefined ? "" : value}
        onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))}
        disabled={disabled}
        placeholder={spec.placeholder}
        slotProps={{
          htmlInput: { min: spec.min, max: spec.max, step: spec.step, "aria-label": ariaLabel },
          input: spec.unit ? { endAdornment: <Typography sx={{ fontSize: TEXT.xs, color: BRAND.gray, ml: 0.5 }}>{spec.unit}</Typography> } : undefined,
        }}
        sx={{ width: "100%", "& .MuiInputBase-root": { bgcolor: BRAND.surface } }}
      />
    );
  }
  const multiline = spec.type === "lines";
  return (
    <TextField
      size="small"
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      placeholder={spec.placeholder}
      multiline={multiline}
      minRows={multiline ? 2 : undefined}
      maxRows={multiline ? 6 : undefined}
      slotProps={{ htmlInput: { "aria-label": ariaLabel } }}
      sx={{
        width: "100%",
        "& .MuiInputBase-root": { bgcolor: BRAND.surface },
        ...(spec.mono ? { "& textarea, & input": { fontFamily: MONO_FONT, fontSize: TEXT.sm } } : {}),
      }}
    />
  );
}

function Provenance({ scope, overridden, onInherit, disabled }) {
  if (scope !== "device") return <Typography sx={{ fontSize: TEXT.xs, color: BRAND.gray }}>—</Typography>;
  if (!overridden) return <Typography sx={{ fontSize: TEXT.xs, color: BRAND.gray }}>Inherits · Tenant</Typography>;
  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, flexWrap: "wrap" }}>
      <Chip size="small" label="Override" sx={{ height: 18, fontSize: TEXT.xs, fontWeight: 800, bgcolor: BRAND.alert.warningSoft, color: BRAND.alert.warning }} />
      <Button size="small" onClick={onInherit} disabled={disabled} sx={{ textTransform: "none", fontSize: TEXT.xs, minWidth: 0, p: 0, color: BRAND.tealText }}>
        ✕ back to inherit
      </Button>
    </Box>
  );
}

export function FieldRow({ spec, form, onChange, scope = "tenant", compareForm = null, readOnly = false }) {
  const value = getFormValue(form, spec.key);
  const tenantValue = compareForm ? getFormValue(compareForm, spec.key) : undefined;
  const overridden = scope === "device" && compareForm ? !sameFormValue(value, tenantValue) : false;
  const message = spec.validate ? spec.validate(value, form) : null;
  const isError = Boolean(message) && !spec.warnOnly;
  const showWarnOn = spec.warnWhenOn && spec.type === "switch" && switchOn(spec, value);

  return (
    <Box
      component="li"
      sx={{
        display: "grid",
        gridTemplateColumns: { xs: "1fr", md: "minmax(0, 1fr) 220px 150px" },
        gap: { xs: 0.75, md: 1.5 },
        alignItems: "center",
        py: 1.25,
        borderTop: `1px solid ${BRAND.border}`,
        "&:first-of-type": { borderTop: 0 },
      }}
    >
      <Box sx={{ minWidth: 0 }}>
        <Typography sx={{ fontSize: TEXT.base, fontWeight: 600, color: BRAND.dark, display: "flex", alignItems: "center", gap: 0.75, flexWrap: "wrap" }}>
          {spec.label}
          {spec.code ? <Typography component="span" sx={{ fontSize: TEXT.xs, color: BRAND.gray, fontFamily: MONO_FONT }}>{spec.code}</Typography> : null}
          {spec.badge ? <Chip size="small" label={spec.badge} sx={{ height: 18, fontSize: TEXT.xs, bgcolor: BRAND.tealSoft, color: BRAND.tealText, fontWeight: 700 }} /> : null}
        </Typography>
        {spec.sub ? <Typography sx={{ fontSize: TEXT.xs, color: BRAND.gray }}>{spec.sub}</Typography> : null}
        {message ? (
          <Typography sx={{ fontSize: TEXT.xs, color: isError ? ROLE.critical : ROLE.caution, mt: 0.25, fontWeight: 600 }}>{message}</Typography>
        ) : null}
        {showWarnOn ? (
          <Alert severity="error" variant="outlined" sx={{ mt: 0.75, py: 0, fontSize: TEXT.xs }}>{spec.warnWhenOn}</Alert>
        ) : null}
      </Box>
      <Box sx={{ display: "flex", justifyContent: { xs: "flex-start", md: "flex-end" } }}>
        <Control spec={spec} value={value} onChange={(v) => onChange(setFormValue(form, spec.key, v))} disabled={readOnly} />
      </Box>
      <Provenance
        scope={scope}
        overridden={overridden}
        disabled={readOnly}
        onInherit={() => onChange(setFormValue(form, spec.key, tenantValue))}
      />
    </Box>
  );
}

export default function SectionFields({ sectionId, form, onChange, scope = "tenant", compareForm = null, readOnly = false }) {
  const specs = specsFor(sectionId).filter((s) => !s.visibleWhen || s.visibleWhen(form));
  if (specs.length === 0) return null;
  return (
    <Box component="ul" aria-label={`${sectionId} settings`} sx={{ listStyle: "none", m: 0, p: 0, mt: 1 }}>
      {specs.map((spec) => (
        <FieldRow key={spec.key} spec={spec} form={form} onChange={onChange} scope={scope} compareForm={compareForm} readOnly={readOnly} />
      ))}
    </Box>
  );
}
