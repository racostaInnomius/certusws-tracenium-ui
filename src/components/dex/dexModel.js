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
  // No es inestabilidad: el arranque. Sólo lo mandan los agentes que ya leen
  // Kernel-General 12 (Windows) o la causa del apagado previo (macOS).
  restart: "Restarted",
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

/**
 * Las marcas del eje X cuando la gráfica cubre días: UNA por día, a medianoche
 * local, y como mucho `max` (con 30 días va de tantos en tantos).
 *
 * ⚠️ Sin esto Recharts ponía una marca cada pocas horas y el formato de día
 * las rotulaba todas igual: «Sep 22» nueve veces seguidas (prod, 24-sep).
 */
export function dayTicks(series = [], max = 8) {
  const ts = series.map((p) => p.t).filter(Number.isFinite);
  if (ts.length < 2) return undefined;
  const lo = Math.min(...ts);
  const hi = Math.max(...ts);
  const d = new Date(lo);
  d.setHours(0, 0, 0, 0);
  if (d.getTime() < lo) d.setDate(d.getDate() + 1);
  const days = [];
  while (d.getTime() <= hi) {
    days.push(d.getTime());
    d.setDate(d.getDate() + 1);
  }
  if (days.length === 0) return undefined;
  const step = Math.ceil(days.length / max);
  return days.filter((_, i) => i % step === 0);
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

// ── La cronología ────────────────────────────────────────────────────
//
// Lo que antes había que sacar de la base a mano (caso CLIFIJIMENEZlocal.local,
// 29-sep-2026: «ayer estuvo colgado y lento»): cuándo estuvo encendido y con qué
// carga, cuándo dormía, qué falló y cuándo se reinició, en orden. La gráfica
// tenía los números pero no el relato: un crash salía agrupado por aplicación
// («last 17 h ago») y no se veía que fue dos minutos antes del reinicio.

const BOOT_KINDS = new Set(["restart", "unexpected_shutdown", "os_crash"]);
const TIMELINE_KINDS = new Set(["app_crash", "app_hang", "os_crash", "unexpected_shutdown", "restart"]);
/** El 41 y el 12 de Windows del mismo reinicio llegan a segundos uno del otro. */
const SAME_BOOT_MS = 5 * 60_000;

/**
 * Una ventana con al menos la mitad de sus muestras (una por minuto) es un
 * equipo despierto. Con menos, un portátil dormido que despertó un momento —
 * Power Nap, mantenimiento—: pintarlo como uso diría que alguien trabajó.
 */
export function isAwakeWindow(w) {
  const minutes = Number(w?.minutes) || WINDOW_MINUTES;
  return (Number(w?.samples) || 0) >= Math.ceil(minutes / 2);
}

/**
 * El último arranque conocido (DEX, o el del inventario) como un reinicio más,
 * si ningún evento lo cuenta ya.
 *
 * ⚠️ Sin esto, hasta que la flota tenga el agente que manda `restart`, la
 * cronología no marcaba NINGÚN reinicio: en el caso real el tramo de la noche
 * salía como «22:30 – 08:45 · 10 h», con las dos horas lentas promediadas junto
 * a ocho más y el reinicio invisible. Sólo es el último arranque, pero en un
 * «ayer estuvo lento» casi siempre es el que importa. De él no se sabe cómo
 * acabó la sesión anterior, y se dice.
 */
export function withLastBoot(events = [], lastBootUtc) {
  const t = Date.parse(lastBootUtc ?? "");
  if (!Number.isFinite(t)) return events;
  const known = events.some((e) => BOOT_KINDS.has(e.kind) && Math.abs(Date.parse(e.occurredAtUtc) - t) <= SAME_BOOT_MS);
  if (known) return events;
  return [...events, { kind: "restart", occurredAtUtc: new Date(t).toISOString(), app: null, detail: "shutdown cause not reported" }];
}

/** Los eventos que cuentan en la cronología, en orden, sin el reinicio duplicado de Windows. */
export function timelineEvents(events = [], fromMs = -Infinity) {
  const list = events
    .filter((e) => TIMELINE_KINDS.has(e.kind))
    .map((e) => ({ ...e, t: Date.parse(e.occurredAtUtc) }))
    .filter((e) => Number.isFinite(e.t) && e.t >= fromMs);
  // Windows manda el apagado inesperado (41) Y el arranque (12) del mismo
  // reinicio: se queda el que dice más.
  const unexpected = list.filter((e) => e.kind === "unexpected_shutdown").map((e) => e.t);
  return list
    .filter((e) => e.kind !== "restart" || !unexpected.some((u) => Math.abs(u - e.t) <= SAME_BOOT_MS))
    .sort((a, b) => a.t - b.t);
}

/**
 * Tramos despierto / dormido y eventos, del MÁS RECIENTE al más antiguo (como
 * Activity). Cada entrada lleva `t` (su inicio) para agruparla por día.
 *
 *   · `awake`: ventanas despiertas seguidas, con su carga (media ponderada por
 *     muestras y pico). Se corta en cada hueco y en cada reinicio: si no, el
 *     antes y el después de reiniciar saldrían promediados en un solo tramo.
 *   · `asleep`: lo que hay entre dos tramos despiertos — sin datos, o con
 *     despertares breves (`wakes`). No se pinta antes del primer dato ni después
 *     del último: el informe es horario, y el final «sin datos» sería casi
 *     siempre un envío pendiente, no un equipo dormido.
 *   · `event`: crash, cuelgue, caída del sistema, apagado inesperado, reinicio.
 */
export function buildTimeline(windows = [], events = [], fromMs = -Infinity) {
  const evs = timelineEvents(events, fromMs);
  const boots = evs.filter((e) => BOOT_KINDS.has(e.kind)).map((e) => e.t);
  const ws = windows
    .map((w) => ({ ...w, t: Date.parse(w.startUtc), len: (Number(w.minutes) || WINDOW_MINUTES) * 60_000 }))
    .filter((w) => Number.isFinite(w.t) && w.t >= fromMs)
    .sort((a, b) => a.t - b.t);

  // 1) Tramos despiertos.
  const runs = [];
  let run = null;
  for (const w of ws) {
    if (!isAwakeWindow(w)) {
      run = null;
      continue;
    }
    const last = run?.windows[run.windows.length - 1];
    const contiguous = last && w.t - (last.t + last.len) < 60_000;
    // Un reinicio POSTERIOR al inicio del tramo en curso: el que ya lo abrió no
    // vuelve a cortarlo en la ventana siguiente.
    const rebooted = run ? boots.some((b) => b > run.start && b <= w.t + w.len) : false;
    if (!contiguous || rebooted) {
      // Si el reinicio cae DENTRO de esta ventana, el tramo empieza en el
      // reinicio y no en el inicio de la ventana: si no, «despierto desde las
      // 00:30» quedaría DEBAJO del reinicio de las 00:34 y se leería al revés.
      const bootInside = boots.find((b) => b > w.t && b < w.t + w.len);
      run = { windows: [], start: bootInside ?? w.t };
      runs.push(run);
    }
    run.windows.push(w);
    run.end = w.t + w.len;
  }

  // 2) Entre dos tramos despiertos: dormido o apagado, con sus despertares.
  const entries = runs.map((r) => {
    const s = periodSummary(r.windows);
    return { type: "awake", t: r.start, end: r.end, cpuAvg: s.cpuAvg, cpuPeak: s.cpuPeak, memAvg: s.memAvg, memPeak: s.memPeak };
  });
  for (let i = 1; i < runs.length; i++) {
    const from = runs[i - 1].end;
    const to = runs[i].windows[0].t;
    if (to <= from) continue; // cortados sólo por un reinicio: no hubo hueco
    const wakes = ws.filter((w) => w.t >= from && w.t < to && !isAwakeWindow(w)).length;
    entries.push({ type: "asleep", t: from, end: to, wakes });
  }

  for (const e of evs) entries.push({ type: "event", t: e.t, kind: e.kind, app: e.app ?? null, detail: e.detail ?? null });

  // Más reciente primero; a igual hora, el tramo que EMPIEZA con el reinicio va
  // encima de él.
  return entries.sort((a, b) => b.t - a.t || (a.type === "event") - (b.type === "event"));
}

/** La duración de un tramo de la cronología: «45 min», «2 h 5 min», «1 d 3 h». */
export function formatSpan(ms) {
  const min = Math.round((Number(ms) || 0) / 60_000);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return min % 60 ? `${h} h ${min % 60} min` : `${h} h`;
  const d = Math.floor(h / 24);
  return h % 24 ? `${d} d ${h % 24} h` : `${d} d`;
}

export function formatDuration(ms) {
  if (ms == null) return "—";
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return r ? `${m} min ${r} s` : `${m} min`;
}
