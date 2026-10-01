// src/components/Policies/MdmPlatformSection.jsx
//
// Editor del modelo de intención MDM para UNA plataforma.
//
// Por qué una sección por plataforma y no una lista unificada: las
// políticas de macOS e iOS no son las mismas, y forzarlas a un esquema
// común produce un mínimo común denominador que no sirve bien a ninguna
// (ADR-0002 #7). Cada sección guarda su propio dominio de política
// (`mdm-macos` / `mdm-ios`), así que un guardado de macOS no puede pisar
// el bloque de iOS ni el de MAM.
//
// Los controles se renderizan DESDE EL CATÁLOGO del backend: esta vista no
// conoce ningún ajuste por su nombre. Añadir una clave al catálogo la hace
// aparecer aquí sin tocar la UI.
//
// Rediseño 1-oct-2026: una fila por ajuste, agrupadas; buscar y ver sólo lo
// configurado (de 45 ajustes de macOS, lo puesto se perdía entre los «Not
// set»); qué se editó sin guardar; un valor fuera de rango se marca; y, con
// el catálogo que lo dice, qué ajuste NO llega al equipo.

import * as React from "react";
import { Alert, Box, Button, Chip, InputAdornment, TextField, ToggleButton, ToggleButtonGroup, Tooltip, Typography } from "@mui/material";
import ShieldOutlinedIcon from "@mui/icons-material/ShieldOutlined";
import SearchIcon from "@mui/icons-material/Search";
import { BRAND, ICON, TEXT } from "../../theme/brand";
import {
  deliveryOf,
  filterGroups,
  groupLabel,
  isSet,
  rangeText,
  readByPath,
  sameValue,
  settingIssue,
  settingLabel,
  unitFor,
  writeByPath,
} from "./mdmPolicyModel";
import { EnumSetting, NumberSetting, SettingGroup, SettingRow, TextSetting, TriStateToggle } from "./SettingRow";

const chipSx = { height: 20, fontSize: TEXT.xs, fontWeight: 800 };

function SupervisionChip() {
  return (
    <Tooltip
      arrow
      title="Only applies to supervised devices (Apple Business Manager). On devices enrolled without supervision it is saved but not applied."
    >
      <Chip
        size="small"
        icon={<ShieldOutlinedIcon sx={{ fontSize: ICON.sm }} />}
        label="Supervised only"
        sx={{ ...chipSx, bgcolor: BRAND.alert.warningSoft, color: BRAND.alert.warningText }}
      />
    </Tooltip>
  );
}

function NotSentChip() {
  return (
    <Tooltip arrow title="Tracenium MDM doesn't send this setting to Macs yet. It is kept in the policy, but no device receives it.">
      <Chip size="small" label="Not sent to Macs" sx={{ ...chipSx, bgcolor: BRAND.darkSoft, color: "text.secondary" }} />
    </Tooltip>
  );
}

function Control({ id, setting, value, onChange, readOnly, issue }) {
  const spec = setting.spec || {};
  const delivery = deliveryOf(setting);
  if (spec.kind === "boolean") {
    const blocked = delivery.state === "partial" ? [true, false].filter((b) => !delivery.values.includes(b)) : [];
    return <TriStateToggle id={id} value={value} onChange={onChange} blocked={blocked} disabled={readOnly} />;
  }
  if (spec.kind === "integer") {
    const unit = unitFor(setting);
    const range = rangeText(spec);
    return (
      <NumberSetting
        id={id}
        value={value}
        onChange={onChange}
        unit={unit}
        min={spec.min}
        max={spec.max}
        help={range ? `${range}${unit ? ` ${unit}` : ""}` : null}
        issue={issue}
        disabled={readOnly}
      />
    );
  }
  if (spec.kind === "enum") return <EnumSetting id={id} value={value} onChange={onChange} values={spec.values || []} disabled={readOnly} />;
  return (
    <TextSetting
      id={id}
      value={value}
      onChange={onChange}
      maxLength={spec.maxLength}
      // Un texto para leer (el mensaje de la ventana de inicio) en varias
      // líneas; una ruta larga, en una sola que ocupa la fila.
      multiline={/Text$/.test(setting.key)}
      full={(spec.maxLength ?? 0) > 200}
      issue={issue}
      disabled={readOnly}
    />
  );
}

/** Por qué un lado del booleano no se puede elegir: siempre a la vista. */
function partialHint(setting) {
  const d = deliveryOf(setting);
  if (d.state !== "partial") return null;
  return `Only “${d.values[0] ? "On" : "Off"}” is sent to Macs — the profile has no value for the other.`;
}

/** Lo que dice la fila cuando el valor elegido no llega al equipo. */
function deliveryNote(setting, value) {
  const d = deliveryOf(setting);
  if (d.state !== "partial" || !isSet(value) || d.values.includes(value)) return null;
  return `“${value ? "On" : "Off"}” isn't sent: the profile only has a value for “${d.values[0] ? "On" : "Off"}”. Leave it Not set.`;
}

export default function MdmPlatformSection({
  platform,
  groups,
  block,
  loadedBlock = block,
  onChangeBlock,
  readOnly = false,
  /** Nº de equipos de esta plataforma que NO están supervisados. */
  unsupervisedCount = null,
}) {
  const [query, setQuery] = React.useState("");
  const [onlyConfigured, setOnlyConfigured] = React.useState(false);

  // Aviso de aplicabilidad: si el operador configuró alguna clave que
  // exige supervisión y hay equipos sin supervisar, decirlo. Sin esto
  // configuraría algo que silenciosamente no ocurre en parte del parque.
  const configuredSupervisionKeys = React.useMemo(() => {
    const out = [];
    for (const g of groups) {
      for (const s of g.items) {
        if (!s.requiresSupervision) continue;
        if (isSet(readByPath(block, s.key))) out.push(s.label || s.key);
      }
    }
    return out;
  }, [groups, block]);

  const configuredCount = React.useMemo(
    () => groups.reduce((n, g) => n + g.items.filter((s) => isSet(readByPath(block, s.key))).length, 0),
    [groups, block]
  );
  const total = groups.reduce((n, g) => n + g.items.length, 0);
  const shown = React.useMemo(
    () => filterGroups(groups, { block, loadedBlock, query, onlyConfigured }),
    [groups, block, loadedBlock, query, onlyConfigured]
  );

  if (!groups.length) {
    return (
      <Typography variant="body2" sx={{ color: "text.secondary" }}>
        No settings for this platform in the catalog yet.
      </Typography>
    );
  }

  // En iOS no se entrega nada todavía y la cabecera ya lo dice: un chip por
  // fila sería ruido. En macOS casi todo llega, y lo que no, se marca.
  const markNotSent = platform === "macos";

  return (
    <Box sx={{ display: "grid", gap: 2, minWidth: 0 }}>
      {configuredSupervisionKeys.length > 0 && unsupervisedCount > 0 ? (
        <Alert severity="warning" sx={{ borderRadius: 2 }}>
          <strong>
            {configuredSupervisionKeys.length} setting
            {configuredSupervisionKeys.length === 1 ? "" : "s"} won&apos;t apply on {unsupervisedCount}{" "}
            unsupervised device{unsupervisedCount === 1 ? "" : "s"}
          </strong>
          : {configuredSupervisionKeys.join(", ")}. They are saved, but only take effect on
          supervised devices (Apple Business Manager).
        </Alert>
      ) : null}

      <Box sx={{ display: "flex", gap: 1.5, flexWrap: "wrap", alignItems: "center" }}>
        <TextField
          size="small"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Find a setting"
          slotProps={{
            htmlInput: { "aria-label": "Find a setting" },
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon sx={{ fontSize: ICON.lg, color: "text.secondary" }} />
                </InputAdornment>
              ),
            },
          }}
          sx={{ width: { xs: "100%", sm: 300 } }}
        />
        <ToggleButtonGroup
          exclusive
          size="small"
          value={onlyConfigured ? "configured" : "all"}
          onChange={(_e, v) => v && setOnlyConfigured(v === "configured")}
          aria-label="Which settings to show"
          sx={{
            "& .MuiToggleButton-root": { textTransform: "none", fontWeight: 700, fontSize: TEXT.sm, px: 1.5, py: 0.5, color: BRAND.dark },
            "& .Mui-selected": { bgcolor: `${BRAND.tealSoftStrong} !important`, color: `${BRAND.tealText} !important` },
          }}
        >
          <ToggleButton value="all">All {total}</ToggleButton>
          <ToggleButton value="configured">Configured {configuredCount}</ToggleButton>
        </ToggleButtonGroup>
      </Box>

      {shown.length === 0 ? (
        <Box sx={{ py: 4, textAlign: "center", border: `1px dashed ${BRAND.borderStrong}`, borderRadius: 2 }}>
          <Typography sx={{ fontSize: TEXT.base, color: BRAND.dark, fontWeight: 600 }}>
            {query.trim() ? `No settings match “${query.trim()}”.` : "Nothing is configured yet."}
          </Typography>
          <Typography sx={{ fontSize: TEXT.sm, color: "text.secondary", mt: 0.5 }}>
            {query.trim()
              ? "Try another word, or clear the search."
              : "Every setting is Not set, so devices keep their own values. Show all settings to choose some."}
          </Typography>
          <Button
            size="small"
            onClick={() => (query.trim() ? setQuery("") : setOnlyConfigured(false))}
            sx={{ mt: 1, textTransform: "none", fontWeight: 700, color: BRAND.tealText }}
          >
            {query.trim() ? "Clear search" : "Show all settings"}
          </Button>
        </Box>
      ) : (
        shown.map((group) => {
          const full = groups.find((g) => g.name === group.name) || group;
          const set = full.items.filter((s) => isSet(readByPath(block, s.key))).length;
          return (
            <SettingGroup
              key={group.name}
              id={`mdm-${platform}-${group.name}`}
              title={groupLabel(group.name)}
              count={set ? `${set} of ${full.items.length} set` : null}
            >
              {group.items.map((s) => {
                const id = `mdm-${s.key.replace(/[^A-Za-z0-9]/g, "-")}`;
                const value = readByPath(block, s.key);
                const issue = settingIssue(s, value);
                const notSent = markNotSent && deliveryOf(s).state === "saved";
                const meta = (
                  <>
                    {s.requiresSupervision ? <SupervisionChip /> : null}
                    {notSent ? <NotSentChip /> : null}
                  </>
                );
                return (
                  <SettingRow
                    key={s.key}
                    id={id}
                    label={settingLabel(s, group.name)}
                    meta={meta}
                    description={[s.description, partialHint(s)].filter(Boolean).join(" ") || null}
                    note={deliveryNote(s, value)}
                    edited={!sameValue(value, readByPath(loadedBlock, s.key))}
                    stacked={s.spec?.kind === "string" && (s.spec?.maxLength ?? 0) > 200}
                  >
                    <Control
                      id={id}
                      setting={s}
                      value={value}
                      issue={issue}
                      readOnly={readOnly}
                      onChange={(v) => onChangeBlock(writeByPath(block, s.key, v))}
                    />
                  </SettingRow>
                );
              })}
            </SettingGroup>
          );
        })
      )}
    </Box>
  );
}
