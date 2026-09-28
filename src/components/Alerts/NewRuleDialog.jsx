// src/components/Alerts/NewRuleDialog.jsx
//
// Crear una regla a medida desde la pantalla.
//
// El backend acepta reglas sin plantilla desde el primer día
// (`template_id` nulo, y nada impide dos de la misma fuente), pero la Rules
// tab sólo dejaba encender plantillas y prometía un «custom rule builder» en
// una Fase 2 que no llegó. Lo que esto habilita y antes no se podía: dos
// reglas de la MISMA fuente con umbral, severidad y audiencia distintos —
// «sin dar señales >24 h» a media para IT, y «>7 días» a alta para dirección.
//
// ⚠️ Sólo se ofrecen las fuentes con criterios DECLARADOS en
// `criteriaFields.js`: sin campos no hay forma de escribir su criterio, y un
// formulario que no puede escribirlo sería una regla que no empareja lo que
// el operador cree. Las demás se nombran, con su motivo.

import * as React from "react";
import {
  Alert,
  Button,
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
import { SOURCE_LABEL } from "./alertSources";
import CriteriaFieldInputs from "./CriteriaFieldInputs";
import {
  editableSources,
  criteriaFieldsFor,
  readCriteria,
  validateCriteria,
  buildCriteriaPayload,
} from "./criteriaFields";
import { creatableSources } from "./creatableSources";

const SEVERITIES = ["low", "medium", "high", "critical"];

export default function NewRuleDialog({ open, onClose, onCreate, sourcePlugin, availability, busy = false }) {
  const options = React.useMemo(
    () => creatableSources({ sourcePlugin, availability }),
    [sourcePlugin, availability]
  );
  const [source, setSource] = React.useState("");
  const [name, setName] = React.useState("");
  const [severity, setSeverity] = React.useState("medium");
  const [values, setValues] = React.useState({});

  // Al abrir, en blanco: un diálogo que recuerda la fuente anterior hace que
  // el siguiente operador cree sin querer una regla de otra cosa.
  React.useEffect(() => {
    if (!open) return;
    setSource("");
    setName("");
    setSeverity("medium");
    setValues({});
  }, [open]);

  const pick = (next) => {
    setSource(next);
    // El nombre se propone, no se impone: es lo que se lee en el feed.
    setName(SOURCE_LABEL[next] || next);
    setValues(readCriteria(next, {}));
  };

  const fields = source ? criteriaFieldsFor(source) : [];
  const { errors, ok } = source ? validateCriteria(source, values) : { errors: {}, ok: false };
  const canCreate = Boolean(source) && name.trim().length > 0 && ok && !busy;
  const notOffered = editableSources().length;

  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} fullWidth maxWidth="sm">
      <DialogTitle sx={{ fontWeight: 800, color: BRAND.dark }}>New alert rule</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 0.5 }}>
          <Typography sx={{ fontSize: TEXT.sm, color: BRAND.gray }}>
            A rule of your own, on top of the catalog — for example a second offline rule with a longer threshold and a
            different audience. Who gets emailed is set afterwards, in <strong>Email…</strong>.
          </Typography>

          <TextField
            select
            size="small"
            label="What it watches"
            value={source}
            onChange={(e) => pick(e.target.value)}
            disabled={busy}
            slotProps={{ htmlInput: { "aria-label": "What it watches" } }}
            helperText={`${notOffered} sources can be configured here. The rest have criteria that are not editable yet — those still need the API.`}
          >
            {options.map((o) => (
              <MenuItem key={o.source} value={o.source} disabled={!o.available}>
                {o.label}
                {o.available
                  ? ""
                  : o.reason === "not_entitled"
                    ? " — not in your plan"
                    : " — plugin turned off"}
              </MenuItem>
            ))}
          </TextField>

          {source ? (
            <>
              <TextField
                size="small"
                label="Name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={busy}
                helperText="What you will read in the feed and in the email subject."
                slotProps={{ htmlInput: { "aria-label": "Name" } }}
              />
              <TextField
                select
                size="small"
                label="Severity"
                value={severity}
                onChange={(e) => setSeverity(e.target.value)}
                disabled={busy}
                slotProps={{ htmlInput: { "aria-label": "Severity" } }}
                helperText="It also decides delivery: by default only the higher severities are emailed."
                sx={{ maxWidth: 240 }}
              >
                {SEVERITIES.map((s) => (
                  <MenuItem key={s} value={s}>
                    {s}
                  </MenuItem>
                ))}
              </TextField>

              <Typography
                variant="caption"
                sx={{ color: BRAND.gray, fontWeight: 700, textTransform: "uppercase", display: "block" }}
              >
                When it fires
              </Typography>
              <CriteriaFieldInputs fields={fields} values={values} errors={errors} busy={busy} onChange={setValues} />

              <Alert severity="info" sx={{ fontSize: TEXT.sm }}>
                It starts switched on. Until you set recipients it only shows in this feed — nothing is emailed.
              </Alert>
            </>
          ) : null}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy} sx={{ textTransform: "none" }}>
          Cancel
        </Button>
        <Button
          variant="contained"
          disabled={!canCreate}
          onClick={() =>
            onCreate({
              name: name.trim(),
              severity,
              source,
              criteria: buildCriteriaPayload(source, values, {}),
              enabled: true,
            })
          }
          sx={{ textTransform: "none", bgcolor: BRAND.teal, "&:hover": { bgcolor: BRAND.tealHover } }}
        >
          Create rule
        </Button>
      </DialogActions>
    </Dialog>
  );
}
