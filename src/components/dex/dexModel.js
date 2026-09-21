// src/components/dex/dexModel.js
//
// ADR-0030 F3 — lo que la UI necesita para leer la experiencia del equipo.
// Las reglas de las señales viven en el BACKEND (modules/dex/dex-signals.ts):
// aquí sólo se pinta lo que llega, con su evidencia.

export const WINDOW_MINUTES = 15;

export const EVENT_KIND_LABEL = {
  app_crash: "Application crash",
  app_hang: "Application hang",
  os_crash: "System crash",
  unexpected_shutdown: "Unexpected shutdown",
};

export const SCOPE_NOTE = {
  events: {
    unsupported: "This platform does not expose crash information to the agent.",
    unavailable: "The agent could not read this device's crash logs — no crashes shown does NOT mean none happened.",
  },
  boot: {
    unsupported: "Boot duration is not available on this platform.",
    unavailable: "The agent could not read the boot duration.",
  },
  battery: { unavailable: "The agent could not read the battery." },
};

/**
 * Serie para la gráfica. ⚠️ Donde falta una ventana (equipo apagado o dormido)
 * se mete un punto vacío: la línea se corta en vez de unir los dos lados con
 * una recta que diría que hubo actividad en medio.
 */
export function seriesWithGaps(windows = []) {
  const out = [];
  let prev = null;
  for (const w of windows) {
    const t = Date.parse(w.startUtc);
    if (!Number.isFinite(t)) continue;
    if (prev !== null && t - prev > WINDOW_MINUTES * 60_000 * 1.5) {
      out.push({ t: prev + WINDOW_MINUTES * 60_000, cpuAvg: null, cpuMax: null, memAvg: null });
    }
    out.push({ t, cpuAvg: w.cpuAvgPct, cpuMax: w.cpuMaxPct, memAvg: w.memAvgPct });
    prev = t;
  }
  return out;
}

/** Resumen del periodo: medias ponderadas por muestras y el pico. */
export function periodSummary(windows = []) {
  let n = 0;
  let cpu = 0;
  let mem = 0;
  let cpuN = 0;
  let memN = 0;
  let cpuPeak = null;
  let memPeak = null;
  for (const w of windows) {
    const s = Number(w.samples) || 0;
    n += s;
    if (w.cpuAvgPct != null) {
      cpu += w.cpuAvgPct * s;
      cpuN += s;
    }
    if (w.memAvgPct != null) {
      mem += w.memAvgPct * s;
      memN += s;
    }
    if (w.cpuMaxPct != null) cpuPeak = cpuPeak === null ? w.cpuMaxPct : Math.max(cpuPeak, w.cpuMaxPct);
    if (w.memMaxPct != null) memPeak = memPeak === null ? w.memMaxPct : Math.max(memPeak, w.memMaxPct);
  }
  return {
    samples: n,
    cpuAvg: cpuN ? Math.round(cpu / cpuN) : null,
    cpuPeak: cpuPeak === null ? null : Math.round(cpuPeak),
    memAvg: memN ? Math.round(mem / memN) : null,
    memPeak: memPeak === null ? null : Math.round(memPeak),
  };
}

/** Eventos agrupados: por aplicación los de apps, sueltos los del sistema. */
export function groupEvents(events = [], sinceMs = 0) {
  const recent = events.filter((e) => Date.parse(e.occurredAtUtc) >= sinceMs);
  const apps = new Map();
  const system = [];
  for (const e of recent) {
    if ((e.kind === "app_crash" || e.kind === "app_hang") && e.app) {
      const k = e.app.toLowerCase();
      const g = apps.get(k) ?? { app: e.app, crashes: 0, hangs: 0, last: e.occurredAtUtc };
      if (e.kind === "app_crash") g.crashes += 1;
      else g.hangs += 1;
      if (e.occurredAtUtc > g.last) g.last = e.occurredAtUtc;
      apps.set(k, g);
    } else if (e.kind === "os_crash" || e.kind === "unexpected_shutdown") {
      system.push(e);
    }
  }
  return {
    apps: [...apps.values()].sort((a, b) => b.crashes + b.hangs - (a.crashes + a.hangs) || a.app.localeCompare(b.app)),
    system,
  };
}

export function formatDuration(ms) {
  if (ms == null) return "—";
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return r ? `${m} min ${r} s` : `${m} min`;
}
