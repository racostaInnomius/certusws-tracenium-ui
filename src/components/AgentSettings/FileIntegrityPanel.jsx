// src/components/AgentSettings/FileIntegrityPanel.jsx
//
// ADR-0027 — qué ficheros vigila cada equipo, en Agent Settings → Security
// Compliance.
//
// Edita `form.compliance.fileIntegrity`, así que el guardado, el diff y la
// historia de la política lo tratan como cualquier otro ajuste. No guarda
// nada por su cuenta.
//
// Lo que la pantalla dice sin que nadie lo pregunte, porque son las tres
// cosas que un comprador descubre en su piloto si no las lee antes:
//   · de cada fichero va la ruta, el tamaño, la fecha y un hash; NUNCA el
//     contenido;
//   · compara por ciclo de cumplimiento: no es tiempo real, no bloquea y no
//     restaura;
//   · sólo un conjunto marcado «Audit logs» evidencia PCI DSS 10.3.4.

import * as React from "react";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  FormControlLabel,
  IconButton,
  Menu,
  MenuItem,
  Paper,
  Select,
  Stack,
  Switch,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import FactCheckOutlinedIcon from "@mui/icons-material/FactCheckOutlined";
import AddOutlinedIcon from "@mui/icons-material/AddOutlined";
import DeleteOutlineOutlinedIcon from "@mui/icons-material/DeleteOutlineOutlined";
import { BRAND, TEXT, TEXT_MUTED } from "../../theme/brand";
import {
  FIM_LIMITS,
  PLATFORM_OPTIONS,
  PURPOSE_OPTIONS,
  SUGGESTED_SETS,
  fileIntegrityProblems,
  slugify,
} from "./fileIntegrityModel";

const EMPTY = { enabled: false, sets: [], maxFilesPerDevice: null, maxFileMb: null };

export default function FileIntegrityPanel({ form, onChange, readOnly = false, scope = "tenant", compareForm = null }) {
  const fim = form?.compliance?.fileIntegrity ?? null;
  const value = fim ?? EMPTY;
  // En ámbito de equipo, la lista del equipo SUSTITUYE a la del tenant (no se
  // suma): es una decisión sobre ESE equipo. Se dice cuál manda.
  const deviceScope = scope === "device" && compareForm;
  const tenantFim = compareForm?.compliance?.fileIntegrity ?? null;
  const overridden = deviceScope && JSON.stringify(fim ?? null) !== JSON.stringify(tenantFim ?? null);
  const [menuAnchor, setMenuAnchor] = React.useState(null);

  const problems = React.useMemo(() => fileIntegrityProblems(fim), [fim]);
  const problemFor = (field) => problems.find((p) => p.field === field)?.message ?? null;

  const commit = (next) =>
    onChange({ ...form, compliance: { ...(form?.compliance ?? {}), fileIntegrity: next } });

  const updateSet = (i, patch) => commit({ ...value, sets: value.sets.map((s, j) => (j === i ? { ...s, ...patch } : s)) });
  const removeSet = (i) => {
    const sets = value.sets.filter((_s, j) => j !== i);
    commit({ ...value, sets, enabled: sets.length > 0 ? value.enabled : false });
  };
  const addSet = (preset) => {
    const taken = new Set(value.sets.map((s) => s.id));
    const set = preset
      ? { maxDepth: FIM_LIMITS.defaultMaxDepth, ...preset, id: taken.has(preset.id) ? slugify(preset.label, taken) : preset.id }
      : { id: slugify("New set", taken), label: "New set", platform: "windows", purpose: "system", path: "", recursive: false, maxDepth: FIM_LIMITS.defaultMaxDepth };
    // Declarar el primer conjunto ES encenderlo; quitarlo todo lo apaga.
    commit({ ...value, sets: [...value.sets, set], enabled: value.sets.length === 0 ? true : value.enabled });
    setMenuAnchor(null);
  };
  const unusedPresets = SUGGESTED_SETS.filter((p) => !value.sets.some((s) => s.path === p.path));
  const hasAuditLogs = value.sets.some((s) => s.purpose === "audit_logs");

  return (
    <Paper elevation={0} sx={{ p: 2, borderRadius: 2, border: `1px solid ${BRAND.border}` }} data-testid="file-integrity-panel">
      <Stack direction="row" spacing={1} alignItems="flex-start">
        <FactCheckOutlinedIcon sx={{ color: BRAND.tealText, mt: 0.25 }} fontSize="small" />
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography variant="subtitle2" sx={{ color: BRAND.dark, fontWeight: 700 }}>
            File integrity
          </Typography>
          <Typography sx={{ fontSize: TEXT.sm, color: "text.secondary" }}>
            Each device reads the files you declare here on every compliance cycle and reports any that appear, disappear
            or change. It sends the path, size, date and a SHA-256 of each file — never its content. It compares between
            reads: it is not real time, and it does not block or restore anything.
          </Typography>
        </Box>
        <FormControlLabel
          control={
            <Switch
              checked={value.enabled === true}
              disabled={readOnly || value.sets.length === 0}
              onChange={(e) => commit({ ...value, enabled: e.target.checked })}
            />
          }
          label={<Typography sx={{ fontSize: TEXT.sm }}>{value.enabled ? "On" : "Off"}</Typography>}
          sx={{ mr: 0 }}
        />
      </Stack>

      {deviceScope ? (
        <Alert
          severity={overridden ? "warning" : "info"}
          sx={{ mt: 1.5 }}
          action={
            overridden && !readOnly ? (
              <Button color="inherit" size="small" onClick={() => commit(tenantFim ? JSON.parse(JSON.stringify(tenantFim)) : null)}>
                Use the organization's sets
              </Button>
            ) : null
          }
        >
          {overridden
            ? "This device watches its own sets. They replace the organization's list for this device; they are not added to it."
            : "This device follows the organization's sets. Editing here gives it a list of its own, which replaces the organization's for this device."}
        </Alert>
      ) : null}

      {value.sets.length === 0 ? (
        <Typography sx={{ fontSize: TEXT.sm, color: TEXT_MUTED, mt: 2 }}>
          Nothing is watched. Start from a suggested set or declare your own.
        </Typography>
      ) : (
        <Stack spacing={1.25} sx={{ mt: 2 }}>
          {value.sets.map((s, i) => (
            <Box key={`${s.id}-${i}`} sx={{ p: 1.25, borderRadius: 1.5, border: `1px solid ${BRAND.border}` }} data-testid={`fim-set-${i}`}>
              <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", alignItems: "flex-start" }}>
                <TextField
                  size="small"
                  label="Name"
                  value={s.label ?? ""}
                  disabled={readOnly}
                  onChange={(e) => {
                    const taken = new Set(value.sets.filter((_x, j) => j !== i).map((x) => x.id));
                    updateSet(i, { label: e.target.value, id: slugify(e.target.value, taken) });
                  }}
                  error={Boolean(problemFor(`sets[${i}].id`))}
                  helperText={problemFor(`sets[${i}].id`) ?? " "}
                  sx={{ width: 190 }}
                />
                <TextField
                  size="small"
                  label="Folder or file"
                  value={s.path ?? ""}
                  disabled={readOnly}
                  onChange={(e) => updateSet(i, { path: e.target.value })}
                  error={Boolean(problemFor(`sets[${i}].path`))}
                  helperText={problemFor(`sets[${i}].path`) ?? " "}
                  inputProps={{ style: { fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" } }}
                  sx={{ flex: 1, minWidth: 240 }}
                />
                <Select size="small" value={s.platform} disabled={readOnly} onChange={(e) => updateSet(i, { platform: e.target.value })} inputProps={{ "aria-label": "Platform" }} sx={{ width: 120 }}>
                  {PLATFORM_OPTIONS.map((o) => <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>)}
                </Select>
                <Select size="small" value={s.purpose} disabled={readOnly} onChange={(e) => updateSet(i, { purpose: e.target.value })} inputProps={{ "aria-label": "Purpose" }} sx={{ width: 150 }}>
                  {PURPOSE_OPTIONS.map((o) => <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>)}
                </Select>
                <Tooltip title="Remove this set">
                  <span>
                    <IconButton size="small" disabled={readOnly} onClick={() => removeSet(i)} aria-label={`Remove ${s.label || s.id}`}>
                      <DeleteOutlineOutlinedIcon fontSize="small" />
                    </IconButton>
                  </span>
                </Tooltip>
              </Box>
              <Box sx={{ display: "flex", gap: 2, alignItems: "center", flexWrap: "wrap" }}>
                <FormControlLabel
                  control={<Checkbox size="small" checked={s.recursive === true} disabled={readOnly} onChange={(e) => updateSet(i, { recursive: e.target.checked })} />}
                  label={<Typography sx={{ fontSize: TEXT.sm }}>Include subfolders</Typography>}
                />
                {s.recursive ? (
                  <TextField
                    size="small"
                    type="number"
                    label="Levels"
                    value={s.maxDepth ?? ""}
                    disabled={readOnly}
                    onChange={(e) => updateSet(i, { maxDepth: e.target.value === "" ? "" : Number(e.target.value) })}
                    error={Boolean(problemFor(`sets[${i}].maxDepth`))}
                    helperText={problemFor(`sets[${i}].maxDepth`) ?? " "}
                    inputProps={{ min: 1, max: FIM_LIMITS.maxDepth }}
                    sx={{ width: 110 }}
                  />
                ) : null}
              </Box>
            </Box>
          ))}
        </Stack>
      )}

      {!readOnly ? (
        <Box sx={{ display: "flex", gap: 1, mt: 1.5, flexWrap: "wrap" }}>
          <Button size="small" startIcon={<AddOutlinedIcon />} onClick={(e) => setMenuAnchor(e.currentTarget)} disabled={unusedPresets.length === 0}>
            Add a suggested set
          </Button>
          <Button size="small" onClick={() => addSet(null)} disabled={value.sets.length >= FIM_LIMITS.maxSets}>
            Declare your own
          </Button>
          <Menu anchorEl={menuAnchor} open={Boolean(menuAnchor)} onClose={() => setMenuAnchor(null)}>
            {unusedPresets.map((p) => (
              <MenuItem key={p.id} onClick={() => addSet(p)}>
                <Box>
                  <Typography sx={{ fontSize: TEXT.sm, fontWeight: 700 }}>{p.label}</Typography>
                  <Typography sx={{ fontSize: TEXT.xs, color: TEXT_MUTED, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>{p.path}</Typography>
                </Box>
              </MenuItem>
            ))}
          </Menu>
        </Box>
      ) : null}

      {value.sets.length > 0 ? (
        <Box sx={{ display: "flex", gap: 1, mt: 2, flexWrap: "wrap" }}>
          <TextField
            size="small"
            type="number"
            label="Files per device"
            placeholder={String(FIM_LIMITS.defaultMaxFilesPerDevice)}
            value={value.maxFilesPerDevice ?? ""}
            disabled={readOnly}
            onChange={(e) => commit({ ...value, maxFilesPerDevice: e.target.value === "" ? null : Number(e.target.value) })}
            error={Boolean(problemFor("maxFilesPerDevice"))}
            helperText={problemFor("maxFilesPerDevice") ?? "Past this, the read stops and says so."}
            sx={{ width: 220 }}
          />
          <TextField
            size="small"
            type="number"
            label="Largest file to hash (MB)"
            placeholder={String(FIM_LIMITS.defaultMaxFileMb)}
            value={value.maxFileMb ?? ""}
            disabled={readOnly}
            onChange={(e) => commit({ ...value, maxFileMb: e.target.value === "" ? null : Number(e.target.value) })}
            error={Boolean(problemFor("maxFileMb"))}
            helperText={problemFor("maxFileMb") ?? "Bigger files are listed, not hashed."}
            sx={{ width: 240 }}
          />
        </Box>
      ) : null}

      {value.sets.length > 0 && !hasAuditLogs ? (
        <Alert severity="info" sx={{ mt: 1.5 }}>
          No set is marked “Audit logs”. Security Compliance needs one to evidence PCI DSS 10.3.4, which is about the
          audit logs themselves, not any file.
        </Alert>
      ) : null}
    </Paper>
  );
}
