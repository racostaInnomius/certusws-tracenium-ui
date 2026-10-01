// src/components/Policies/ManagedAppSection.jsx
//
// La política de la app de Tracenium (MAM) para los clientes gestionados de
// T-iOS / T-Android (los agentes de escritorio la ignoran): `policyJson.mam`.
//
// Rediseño 1-oct-2026: las mismas filas que los ajustes de macOS (nombre y
// explicación a la izquierda, el control a la derecha) en vez de una rejilla
// de desplegables dentro de una caja con el título repetido. Los booleanos son
// tri-estado (Not set / un valor / el otro) y los nombres de cada lado salen
// de MAM_BOOL_FIELDS («Require» / «Don't require»). Controlado: `value` es el
// formulario MAM y `onChange` recibe el formulario entero, para que las reglas
// de omitir-vacío de policyTransforms sigan intactas.

import * as React from "react";
import { MAM_BOOL_FIELDS, MAM_IDLE_MAX, MAM_IDLE_MIN } from "./policyTransforms";
import { mamIssues, sameValue } from "./mdmPolicyModel";
import { NumberSetting, SettingGroup, SettingRow, TextSetting, TriStateToggle } from "./SettingRow";

export default function ManagedAppSection({ value, loaded = value, onChange, readOnly = false }) {
  const form = value || {};
  const set = (key, v) => onChange({ ...form, [key]: v });
  const edited = (key) => !sameValue(form[key] ?? null, loaded?.[key] ?? null);
  const idleIssue = mamIssues(form).find((i) => i.key === "idleTimeoutSeconds")?.issue ?? null;

  return (
    <SettingGroup id="mam-settings" title="App protection">
      {MAM_BOOL_FIELDS.map((f) => (
        <SettingRow key={f.key} id={`mam-${f.key}`} label={f.label} description={f.hint} edited={edited(f.key)}>
          <TriStateToggle
            id={`mam-${f.key}`}
            value={form[f.key]}
            // null y no undefined: es lo que el formulario MAM guarda como «sin opinión».
            onChange={(v) => set(f.key, v === undefined ? null : v)}
            labels={{ on: f.onLabel, off: f.offLabel }}
            disabled={readOnly}
          />
        </SettingRow>
      ))}
      <SettingRow
        id="mam-idleTimeoutSeconds"
        label="Idle timeout"
        description="Locks the app after this long without use. Not set = the app's default."
        edited={edited("idleTimeoutSeconds")}
      >
        <NumberSetting
          id="mam-idleTimeoutSeconds"
          value={form.idleTimeoutSeconds === "" ? undefined : form.idleTimeoutSeconds}
          onChange={(v) => set("idleTimeoutSeconds", v === undefined ? "" : v)}
          unit="sec"
          min={MAM_IDLE_MIN}
          max={MAM_IDLE_MAX}
          help={`${MAM_IDLE_MIN}–${MAM_IDLE_MAX} sec`}
          issue={idleIssue}
          disabled={readOnly}
        />
      </SettingRow>
      <SettingRow
        id="mam-minimumAppVersion"
        label="Minimum app version"
        description="Older installs are asked to update before they open. Not set = any version."
        edited={edited("minimumAppVersion")}
      >
        <TextSetting
          id="mam-minimumAppVersion"
          value={form.minimumAppVersion === "" ? undefined : form.minimumAppVersion}
          onChange={(v) => set("minimumAppVersion", v ?? "")}
          placeholder="Any version"
          width={170}
          disabled={readOnly}
        />
      </SettingRow>
    </SettingGroup>
  );
}
