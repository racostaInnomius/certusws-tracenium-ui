// src/components/Alerts/RuleCriteriaEditor.jsx
//
// Editar el CRITERIO de una regla desde la pantalla, no por API.
//
// La tarjeta describía el criterio ("Default = 24h") y no ofrecía dónde
// cambiarlo. Los campos y sus topes vienen de `criteriaFields.js`; una fuente
// sin campos declarados se enseña en solo lectura, diciendo que todavía no es
// editable aquí, en vez de fingir un editor genérico que escribiría claves que
// el handler no lee.

import * as React from "react";
import { Box, Button, Stack, Typography } from "@mui/material";
import { BRAND, TEXT } from "../../theme/brand";
import CriteriaFieldInputs from "./CriteriaFieldInputs";
import {
  criteriaFieldsFor,
  isCriteriaEditable,
  readCriteria,
  validateCriteria,
  buildCriteriaPayload,
  untouchedCriteriaKeys,
} from "./criteriaFields";

export default function RuleCriteriaEditor({ rule, onSave, busy = false }) {
  const source = rule?.source;
  const fields = criteriaFieldsFor(source);
  const initial = React.useMemo(() => readCriteria(source, rule?.criteria), [source, rule?.criteria]);
  const [values, setValues] = React.useState(initial);
  // Re-sincroniza cuando la regla se recarga debajo (tras guardar).
  React.useEffect(() => setValues(initial), [initial]);

  if (!isCriteriaEditable(source)) {
    return (
      <Box sx={{ mt: 1.25, pt: 1.25, borderTop: `1px dashed ${BRAND.border}` }}>
        <Typography sx={{ fontSize: TEXT.sm, color: BRAND.gray }}>
          This rule&apos;s criteria are not editable here yet. What it matches:
        </Typography>
        <Typography sx={{ fontSize: TEXT.xs, color: BRAND.gray, fontFamily: "monospace", mt: 0.5 }}>
          {JSON.stringify(rule?.criteria ?? {})}
        </Typography>
      </Box>
    );
  }

  const { errors, ok } = validateCriteria(source, values);
  // Lo que el editor no enseña se dice, no se esconde: al guardar se conserva.
  const untouched = untouchedCriteriaKeys(source, rule?.criteria);
  const dirty = fields.some((f) => values[f.key] !== initial[f.key]);

  return (
    <Box sx={{ mt: 1.25, pt: 1.25, borderTop: `1px dashed ${BRAND.border}` }}>
      <Typography
        variant="caption"
        sx={{ color: BRAND.gray, fontWeight: 700, textTransform: "uppercase", display: "block", mb: 1 }}
      >
        When it fires
      </Typography>

      <Stack spacing={1.5}>
        <CriteriaFieldInputs fields={fields} values={values} errors={errors} busy={busy} onChange={setValues} />

        {untouched.length > 0 ? (
          <Typography sx={{ fontSize: TEXT.xs, color: BRAND.gray }} data-testid="rule-criteria-untouched">
            Set by the template and left as they are: {untouched.join(", ")}.
          </Typography>
        ) : null}

        <Stack direction="row" justifyContent="flex-end">
          <Button
            size="small"
            variant="contained"
            disabled={busy || !dirty || !ok}
            onClick={() => onSave(buildCriteriaPayload(source, values, rule?.criteria))}
            sx={{ textTransform: "none", bgcolor: BRAND.teal, "&:hover": { bgcolor: BRAND.tealHover } }}
          >
            Save criteria
          </Button>
        </Stack>
      </Stack>
    </Box>
  );
}
