// src/components/Alerts/criteriaFields.js
//
// Qué se puede editar del CRITERIO de una regla, por fuente.
//
// Hasta ahora la pantalla describía el criterio ("Default = 24h") y no había
// dónde cambiarlo: el único camino era la API. Esto es el registro de campos
// que el editor pinta, con su forma y sus topes.
//
// ⚠️ Deliberadamente NO hay un editor genérico de JSON: cada fuente tiene su
// propio DSL y un JSON libre invita a escribir claves que el handler no lee —
// que es exactamente el defecto que tenía `device_offline`
// (`max_hours_offline` sembrado, `threshold_hours` leído). Una fuente sin
// campos declarados se enseña en solo lectura y se dice que aún no es editable.
//
// Kept apart from the component so it is testable without rendering.

/**
 * `legacyKeys` son claves viejas que el backend sigue aceptando como alias.
 * Al guardar se escribe SIEMPRE la canónica y se borra la vieja, para que la
 * fila deje de llevar dos ortografías de lo mismo.
 *
 * Tipos: `number` (entero con unidad y topes), `bool`, `choice` (una de una
 * lista). Las listas de varios valores —`event_types`, `statuses`, `flags`,
 * `components`…— no se editan aquí todavía: se conservan tal cual al guardar
 * y se enseñan debajo, para no fingir que se pueden tocar.
 *
 * ⚠️ Cada clave declarada aquí tiene que ser la que LEE el handler
 * (`modules/alerts/alerts.service.ts`). Declararlas obligó a mirar una por
 * una, y así salieron los tres desencuentros: `max_hours_offline`,
 * `max_days_to_expire` y `max_score`.
 */
const FIELDS = {
  device_offline: [
    {
      key: "threshold_hours",
      legacyKeys: ["max_hours_offline"],
      type: "number",
      unit: "hours",
      label: "Hours of silence before alerting",
      help: "A device that has not reported for longer than this is offline. Minimum 1 hour — below that, a network blip becomes an alert.",
      min: 1,
      max: 8760,
      default: 24,
    },
    {
      key: "include_disconnected",
      type: "bool",
      label: "Include devices that are powered off or disconnected",
      help: "On (recommended): every device that has gone quiet. Off: only devices whose session still looks connected — the agent stopped reporting without closing the stream.",
      default: true,
    },
  ],

  // handleCertExpiry — ⚠️ `warn_days`, no `max_days_to_expire` (la plantilla
  // sembraba la segunda y nadie la leía).
  cert_expiry: [
    {
      key: "warn_days",
      legacyKeys: ["max_days_to_expire"],
      type: "number",
      unit: "days",
      label: "Days before expiry to start warning",
      help: "Certificates expiring within this many days are reported, together with any that already expired inside the feed window.",
      min: 1,
      max: 3650,
      default: 14,
    },
  ],

  // handleCdpCertExpiry
  cdp_cert_expiry: [
    {
      key: "warn_days",
      type: "number",
      unit: "days",
      label: "Days before expiry to start warning",
      help: "Discovered certificates expiring within this many days.",
      min: 1,
      max: 3650,
      default: 30,
    },
    {
      key: "include_roots",
      type: "bool",
      label: "Include root certificates",
      help: "Off by default: a root in the trust store expiring years out is not an operational problem.",
      default: false,
    },
    {
      key: "only_private_key",
      type: "bool",
      label: "Only certificates whose private key is on the device",
      help: "On: only what this fleet can actually renew. Off: everything discovered, including certificates served by someone else.",
      default: false,
    },
  ],

  // handleComplianceScore — ⚠️ `min_score`, no `max_score`.
  compliance_score: [
    {
      key: "min_score",
      legacyKeys: ["max_score"],
      type: "number",
      unit: "points",
      label: "Alert when the score drops below",
      help: "Compliance score out of 100. A device scoring under this number raises an alert.",
      min: 1,
      max: 100,
      default: 60,
    },
    {
      key: "ignore_unscored",
      type: "bool",
      label: "Ignore devices with nothing to score",
      help: "On (recommended): a device with no applicable checks scores 0 for lack of data, not for failing. Off: those count as a zero.",
      default: true,
    },
  ],

  // handleComplianceStale
  compliance_stale: [
    {
      key: "stale_after_hours",
      type: "number",
      unit: "hours",
      label: "Hours without a posture report before it counts as stale",
      help: "The device may be perfectly compliant — this says nobody has checked in that long.",
      min: 1,
      max: 8760,
      default: 24,
    },
    {
      key: "min_age_for_alert_hours",
      type: "number",
      unit: "hours",
      label: "Grace period for a freshly enrolled device",
      help: "A device enrolled minutes ago has not reported yet, and that is not a finding. It is only counted once its first snapshot is this old.",
      min: 0,
      max: 8760,
      default: 1,
    },
  ],

  // handleDiskCapacity — clampPct(1..100), y `critical` nunca por debajo del aviso.
  disk_capacity: [
    {
      key: "threshold_pct",
      type: "number",
      unit: "%",
      label: "Warn when a disk is this full",
      help: "Percentage of the volume in use.",
      min: 1,
      max: 100,
      default: 85,
    },
    {
      key: "critical_pct",
      type: "number",
      unit: "%",
      label: "Treat it as critical at",
      help: "Must be at or above the warning level — the backend raises it to match if it is lower.",
      min: 1,
      max: 100,
      default: 95,
    },
  ],

  // handleJobFailure
  job_failure: [
    {
      key: "min_attempts",
      type: "number",
      unit: "attempts",
      label: "Failed attempts before alerting",
      help: "1 reports every failure. Raise it to hear only about jobs that keep failing.",
      min: 1,
      max: 100,
      default: 1,
    },
  ],

  // handleComplianceFinding
  compliance_finding: [
    {
      key: "min_severity",
      type: "choice",
      label: "Lowest severity worth an alert",
      help: "Findings below this severity are not reported by this rule.",
      choices: [
        { value: "low", label: "Low and above" },
        { value: "medium", label: "Medium and above" },
        { value: "high", label: "High and above" },
        { value: "critical", label: "Critical only" },
      ],
      default: "high",
    },
  ],

  // handleCdpTrustAnchor
  cdp_trust_anchor: [
    {
      key: "novel_after_hours",
      type: "number",
      unit: "hours",
      label: "Hours a new trust anchor stays “novel”",
      help: "An anchor first seen within this window is reported as newly appeared.",
      min: 1,
      max: 8760,
      default: 24,
    },
  ],

  // handleCdpPqcRoadmap
  cdp_pqc_roadmap: [
    {
      key: "regression_days",
      type: "number",
      unit: "days",
      label: "Days to look back for a regression",
      help: "How far back to compare when deciding that key exchange went backwards.",
      min: 1,
      max: 3650,
      default: 30,
    },
  ],

  // parseDiscoveryGapCriteria
  discovery_gap: [
    {
      key: "include_invited",
      type: "bool",
      label: "Include devices already invited to enroll",
      help: "Off by default: somebody is already on it, and repeating it every hour is noise.",
      default: false,
    },
  ],

  // parseSlaCriteria (compliance-sla.handler.ts). `statuses` (por vencer /
  // vencido) es una lista: se conserva y se enseña, como en las demás.
  compliance_sla: [
    {
      key: "min_severity",
      type: "choice",
      label: "Lowest finding severity worth an alert",
      help: "Only severities that have a remediation target are measured; a severity with no target is never due.",
      choices: [
        { value: "low", label: "Low and above" },
        { value: "medium", label: "Medium and above" },
        { value: "high", label: "High and above" },
        { value: "critical", label: "Critical only" },
      ],
      default: "high",
    },
    {
      key: "critical_devices_only",
      type: "bool",
      label: "Only devices in a critical asset group",
      help: "Off: the whole fleet. On: only devices whose asset group is marked critical.",
      default: false,
    },
  ],

  // parseDriftCriteria — ⚠️ esta fuente usa camelCase, y es lo que lee.
  security_setting_drift: [
    {
      key: "minDevices",
      type: "number",
      unit: "devices",
      label: "Devices that must share the drift before alerting",
      help: "1 reports a single device. Raise it to hear only about drift that spread.",
      min: 1,
      max: 10000,
      default: 1,
    },
    {
      key: "onlyOperationalRisk",
      type: "bool",
      label: "Only settings that carry operational risk",
      help: "On (recommended): drift that actually weakens or breaks something. Off: every tracked setting that moved.",
      default: true,
    },
  ],

  // handleSoftwareChange
  software_change: [
    {
      key: "only_user_facing",
      type: "bool",
      label: "Only software a person would recognise",
      help: "Filters out runtimes, drivers and redistributables that arrive with something else.",
      default: false,
    },
    {
      key: "exclude_store",
      type: "bool",
      label: "Exclude store packages",
      help: "Microsoft Store and similar packages update on their own; each update would otherwise be a change.",
      default: false,
    },
    {
      key: "new_to_fleet",
      type: "bool",
      label: "Only software never seen in this fleet before",
      help: "On: the first appearance anywhere. Off: every install, including software already in use elsewhere.",
      default: false,
    },
  ],
};

/**
 * Las fuentes cuyos criterios se pueden declarar aquí — y por tanto las
 * únicas que se ofrecen al crear una regla a medida. Ofrecer una fuente sin
 * campos sería un formulario que no puede escribir su criterio.
 */
export function editableSources() {
  return Object.keys(FIELDS);
}

export function criteriaFieldsFor(source) {
  return FIELDS[source] ?? [];
}

export function isCriteriaEditable(source) {
  return criteriaFieldsFor(source).length > 0;
}

/** La unidad en palabras, para que el error diga en qué se está midiendo. */
const UNIT_WORD = { hours: "hours", days: "days", points: "points", "%": "percent", attempts: "attempts", devices: "devices" };
const unitWord = (unit) => UNIT_WORD[unit] ?? "values";

const firstDefined = (obj, keys) => {
  for (const k of keys) {
    if (obj?.[k] !== undefined && obj?.[k] !== null) return obj[k];
  }
  return undefined;
};

/** Los valores a enseñar: lo guardado (canónica o alias) o el valor por defecto. */
export function readCriteria(source, criteria) {
  const out = {};
  for (const f of criteriaFieldsFor(source)) {
    const raw = firstDefined(criteria ?? {}, [f.key, ...(f.legacyKeys ?? [])]);
    if (f.type === "number") {
      const n = Number(raw);
      out[f.key] = Number.isFinite(n) ? n : f.default;
    } else if (f.type === "bool") {
      // ⚠️ Sólo un `false` explícito apaga: ausente = el valor por defecto,
      // que es lo que hace el backend. Tratar la ausencia como `false`
      // enseñaría apagado algo que está encendido.
      out[f.key] = raw === undefined ? f.default : raw === true;
    } else if (f.type === "choice") {
      out[f.key] = f.choices.some((c) => c.value === raw) ? raw : f.default;
    }
  }
  return out;
}

/** Validación por campo, para poder decir qué está mal sin guardar. */
export function validateCriteria(source, values) {
  const errors = {};
  for (const f of criteriaFieldsFor(source)) {
    if (f.type !== "number") continue;
    const word = unitWord(f.unit);
    const n = Number(values?.[f.key]);
    if (values?.[f.key] === "" || !Number.isFinite(n) || !Number.isInteger(n)) errors[f.key] = `Whole ${word} only.`;
    else if (n < f.min) errors[f.key] = `At least ${f.min} ${f.min === 1 ? word.replace(/s$/, "") : word}.`;
    else if (n > f.max) errors[f.key] = `At most ${f.max} ${word}.`;
  }
  return { errors, ok: Object.keys(errors).length === 0 };
}

/**
 * El cuerpo a guardar: lo que no es editable aquí se CONSERVA (una regla
 * puede llevar claves puestas por API, y las listas de varios valores todavía
 * no se tocan desde la pantalla), y las claves heredadas se retiran en favor
 * de la canónica.
 */
export function buildCriteriaPayload(source, values, current) {
  const out = { ...(current ?? {}) };
  for (const f of criteriaFieldsFor(source)) {
    for (const legacy of f.legacyKeys ?? []) delete out[legacy];
    if (f.type === "number") out[f.key] = Math.trunc(Number(values[f.key]));
    else if (f.type === "bool") out[f.key] = values[f.key] === true;
    else out[f.key] = values[f.key];
  }
  return out;
}

/**
 * Lo que este editor NO enseña de un criterio, para decirlo en vez de
 * esconderlo: listas de tipos de evento, de estados, de banderas…
 */
export function untouchedCriteriaKeys(source, criteria) {
  const declared = new Set();
  for (const f of criteriaFieldsFor(source)) {
    declared.add(f.key);
    for (const legacy of f.legacyKeys ?? []) declared.add(legacy);
  }
  return Object.keys(criteria ?? {}).filter((k) => !declared.has(k));
}

/** Una línea para la tarjeta, sin abrir el editor. */
export function describeCriteria(source, criteria) {
  const fields = criteriaFieldsFor(source);
  if (fields.length === 0) return "";
  const v = readCriteria(source, criteria);
  if (source === "device_offline") {
    return `After ${v.threshold_hours}h of silence · ${
      v.include_disconnected ? "powered-off devices included" : "only sessions still marked connected"
    }`;
  }
  // El resto: campo a campo, con su etiqueta en minúscula y su valor.
  return fields
    .map((f) => {
      if (f.type === "bool") return v[f.key] ? lower(f.label) : null;
      if (f.type === "choice") return f.choices.find((c) => c.value === v[f.key])?.label ?? null;
      return `${lower(f.label)}: ${v[f.key]}${f.unit === "%" ? "%" : ` ${f.unit}`}`;
    })
    .filter(Boolean)
    .join(" · ");
}

const lower = (label) => label.charAt(0).toLowerCase() + label.slice(1);
