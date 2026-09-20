// src/components/discovery/coverageModel.js
//
// La parte pura de Cobertura: cómo se nombra cada estado y qué fecha se
// enseña. Aparte del componente porque son las frases que hay que poder
// discutir con un cliente delante — «¿por qué dices que este equipo está
// muerto?» — y porque así se prueban sin montar una tabla.

export const STATE_META = {
  active: { label: "Active", severity: "low", help: "Seen in the last 30 days." },
  dormant: { label: "Inactive", severity: "medium", help: "Nothing for 30 to 180 days." },
  stale: { label: "Stale", severity: "high", help: "Nothing for over 180 days, or never used." },
  disabled: { label: "Disabled", severity: "none", help: "The computer account is disabled in Active Directory." },
};

export function stateMeta(state) {
  return STATE_META[state] ?? { label: state ?? "—", severity: "none", help: "" };
}

const DAY_MS = 86_400_000;

/**
 * Cuál de las dos fechas manda y hace cuánto fue.
 *
 * ⚠️ `lastLogonTimestamp` se replica entre controladores de dominio con hasta
 * 14 días de retraso, así que NO se enseña sola: si la contraseña de máquina
 * es más reciente, es esa la que dice que el equipo está vivo — la rota él
 * solo cada 30 días mientras hable con el dominio.
 */
export function activitySignal(device, now = Date.now()) {
  const logon = device?.lastLogonUtc ? Date.parse(device.lastLogonUtc) : NaN;
  const password = device?.passwordLastSetUtc ? Date.parse(device.passwordLastSetUtc) : NaN;
  const candidates = [
    { at: logon, source: "logon" },
    { at: password, source: "password" },
  ].filter((c) => Number.isFinite(c.at));
  if (candidates.length === 0) return { at: null, source: "none", days: null, label: "No date in AD" };
  const best = candidates.reduce((a, b) => (b.at > a.at ? b : a));
  const days = Math.max(0, Math.floor((now - best.at) / DAY_MS));
  return {
    at: new Date(best.at).toISOString(),
    source: best.source,
    days,
    label: best.source === "password" ? "Domain password rotated" : "Last sign-in recorded",
  };
}

export function daysAgoText(days) {
  if (days === null || days === undefined) return "—";
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 60) return `${days} days ago`;
  if (days < 730) return `${Math.round(days / 30)} months ago`;
  return `${Math.round(days / 365)} years ago`;
}

/**
 * Las cifras de la cabecera. `gap` es la que importa: equipos VIVOS, sin
 * agente y que nadie ha descartado. El total de objetos de AD por sí solo no
 * dice nada — un directorio viejo arrastra cientos de fantasmas.
 */
export function coverageCards(summary) {
  const s = summary ?? {};
  const byState = s.byState ?? {};
  return [
    { key: "gap", label: "Without agent", value: s.gap ?? 0, hint: "Active in AD, no agent, not ignored. This is the work.", emphasis: true },
    { key: "active", label: "Active in AD", value: byState.active ?? 0, hint: "Seen in the last 30 days." },
    { key: "managed", label: "With agent", value: s.managed ?? 0, hint: "Matched to a device in the fleet." },
    { key: "invited", label: "Invited", value: s.invited ?? 0, hint: "Someone took the install package; the agent has not checked in yet." },
    { key: "total", label: "Objects in AD", value: s.total ?? 0, hint: "Every computer object, including disabled and stale ones." },
  ];
}

/** Texto de la última lectura, incluido el porqué cuando no se pudo hacer. */
export function runSummary(run) {
  if (!run) return { text: "No read yet.", tone: "muted" };
  if (run.status === "running") return { text: "Reading Active Directory…", tone: "muted" };
  if (run.status === "missed") {
    return { text: "The collector was offline, so Active Directory was not read. The previous list is kept.", tone: "warning" };
  }
  if (run.status === "failed") {
    const reason = run.error === "run_expired" ? "the read never came back" : run.error || "unknown reason";
    return { text: `The last read failed: ${reason}. The previous list is kept.`, tone: "warning" };
  }
  const found = Number(run.foundCount ?? 0);
  const truncated = run.error === "truncated";
  return {
    text: `${found} computer object${found === 1 ? "" : "s"} read${run.domain ? ` from ${run.domain}` : ""}.${truncated ? " The directory has more than we read in one pass." : ""}`,
    tone: truncated ? "warning" : "ok",
  };
}
