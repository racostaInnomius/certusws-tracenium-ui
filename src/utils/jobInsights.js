// src/utils/jobInsights.js
//
// Derivations behind the Jobs page's top band: triage counts, failure causes
// and repeat-offender devices.
//
// Lives outside the page for the same reason jobBatches / jobResult / jobForm
// do: Jobs.jsx is 2400 lines and nothing inside it can be tested.

const IN_FLIGHT = ["pending", "sent", "running", "retrying"];
const FAILED = ["failed", "timeout"];

const lower = (v) => String(v || "").toLowerCase();
const ms = (v) => {
  const t = Date.parse(v);
  return Number.isFinite(t) ? t : null;
};

/**
 * Collapse a raw `last_error` into a cause you can group by.
 *
 * The strings are free-form and carry per-job detail, so grouping them raw
 * gives a list where every row has count 1 — useless. These rules were written
 * against the 14 distinct values actually present in production, not invented:
 *
 *   `software_install:failed;deploymentId=10;reason=install_failed`
 *       → the cause is what `reason=` says, not the prefix. Cutting at the
 *         first `;` would yield "software_install:failed", which is the job
 *         type restating that it failed.
 *   `update_failed: connect ETIMEDOUT 20.60.178.4:443`
 *       → the address varies per attempt, so leaving it in scatters one cause
 *         across as many rows as there are endpoints.
 *   `patch_install partial; installed=0; failed=0; rebootRequired=false`
 *       → everything after the first `;` is a per-run counter.
 *   `stale_after_5_failed_attempts`
 *       → the attempt count varies; the cause does not.
 *
 * Anything that doesn't match a rule is returned trimmed, never dropped: an
 * unrecognised error must still show up in the list, or the panel quietly
 * under-reports what is breaking.
 */
export function normalizeFailureCause(raw) {
  let text = String(raw ?? "").trim();
  if (!text) return null;

  // `reason=` wins when present — it is the most specific thing in the string.
  const reason = text.match(/reason=([^;]+)/i);
  if (reason) {
    text = reason[1].trim();
  } else {
    const semi = text.indexOf(";");
    if (semi > 0) text = text.slice(0, semi).trim();
  }

  // Drop volatile detail: addresses, ports, and the numbers embedded in
  // generated messages. Done AFTER the cut so a `reason=` value is cleaned too
  // (`install_failed: exe installer requires ex…` keeps its shape).
  text = text
    .replace(/\b\d{1,3}(?:\.\d{1,3}){3}(?::\d+)?/g, "")
    // No \b here: underscore is a word character, so "_5_" has no boundary
    // and `stale_after_5_failed_attempts` failed to group with the 2-attempt
    // one — the exact case this rule exists for.
    .replace(/\d+/g, "N")
    .replace(/\s+/g, " ")
    .replace(/[\s:;,-]+$/, "")
    .trim();

  return text || null;
}

/** Cuánto lleva un job sin moverse. `null` si no hay ninguna fecha legible. */
function idleMs(job, now) {
  const last = ms(job?.updated_at) ?? ms(job?.created_at);
  return last === null ? null : now - last;
}

/**
 * Un job que NO VA A NINGUNA PARTE.
 *
 * 🔴 POR QUÉ CAMBIÓ (27-sep). Esto exigía `sent_at IS NULL` — «nunca salió de
 * la cola»—, que es la forma del caso para el que se escribió (dos jobs sobre
 * un endpoint muerto 46 h). Pero un job que SÍ se envió y después se pudrió
 * tiene `sent_at` puesto, así que el detector no podía verlo **por
 * construcción**. Le pasó al uninstall de AnyDesk el 26-sep: `retrying` con
 * los cinco intentos gastados, y la franja decía «STUCK IN QUEUE 0» mientras
 * el job llevaba días muerto.
 *
 * La pregunta buena no es «¿salió?» sino «¿se mueve?». Un job no terminal que
 * lleva más de un día sin que nadie le toque una fila no está en curso: está
 * abandonado, lo hayamos enviado o no.
 *
 * ⚠️ SE EXPORTA porque la tabla filtra las MISMAS filas que este número cuenta.
 * Cuando eran dos predicados escritos aparte, el riesgo era que la celda
 * contara filas que la tabla no supiera enseñar — y el comentario de
 * `matchesStuck` en Jobs.jsx ya avisaba de eso.
 */
export function isStuckJob(job, { now = Date.now(), staleHours = 24 } = {}) {
  if (!IN_FLIGHT.includes(lower(job?.status))) return false;

  // 🔴 EL PLAZO LO PONE EL SERVIDOR (27-sep). Con una regla plana de 24 h esta
  // celda marcaba 14 jobs que el orquestador espera A PROPÓSITO: sus plazos son
  // POR TIPO —un `agent_update` se guarda 30 días para el portátil que vuelve
  // de vacaciones, un `patch_scan` sólo 1— y esa tabla vive en el servidor.
  // Copiarla aquí habría creado otro gemelo que se desincroniza, así que la
  // lista trae `stale_after` ya calculado (ver `staleAfter` en job-dispatcher).
  const deadline = ms(job?.stale_after);
  if (deadline !== null) return now > deadline;

  // ⚠️ Sin el campo —backend anterior al 27-sep— sólo se juzga lo que YA SE
  // ENVIÓ. Ahí las 24 h valen: a un job enviado no lo cubre ningún plazo por
  // tipo, y es la clase que la celda no veía (el uninstall de AnyDesk). Un
  // `pending` sin enviar NO se juzga: sin saber su plazo, adivinarlo es
  // exactamente lo que producía las catorce falsas alarmas.
  if (!job?.sent_at) return false;
  const idle = idleMs(job, now);
  return idle !== null && idle > staleHours * 3600 * 1000;
}

/**
 * The four numbers the band leads with.
 *
 * `stuck` is the one that does not exist anywhere else in the UI: a job that
 * is still in flight and has not moved in over a day. It is how the two jobs
 * that sat on a dead endpoint for 46 hours would have surfaced without anyone
 * querying the database — y, desde el 27-sep, también los que se enviaron y
 * nadie volvió a tocar (ver `isStuckJob`).
 */
export function deriveTriage(jobs, { now = Date.now(), windowHours = 24, staleHours = 24 } = {}) {
  const list = Array.isArray(jobs) ? jobs : [];
  const since = now - windowHours * 3600 * 1000;
  const recent = (j) => {
    const t = ms(j.completed_at) ?? ms(j.updated_at) ?? ms(j.created_at);
    return t !== null && t >= since;
  };

  const failed = list.filter((j) => lower(j.status) === "failed" && recent(j)).length;
  const timedOut = list.filter((j) => lower(j.status) === "timeout" && recent(j)).length;

  const stuckJobs = list.filter((j) => isStuckJob(j, { now, staleHours }));
  const stuck = stuckJobs.length;

  // Success rate over everything that FINISHED — terminal, o abandonado.
  //
  // 🔴 Antes el denominador era sólo lo terminal, y el motivo escrito era «lo
  // que está en curso no puede bajar la tasa». Cierto para el trabajo en
  // curso; falso para un job que lleva días sin moverse. Con esa regla, el
  // AnyDesk muerto se quedaba en el saco de «en vuelo» y la portada decía
  // «99 % · 154 of 155» con él dentro, sin contarlo en ninguna parte.
  //
  // ⚠️ Un job atascado NO es un éxito, pero tampoco se declara «fallido»: no
  // sabemos que fallara, sabemos que nadie lo cerró. Entra en el denominador y
  // no en el numerador, que es exactamente lo que significa.
  const terminal = list.filter((j) => !IN_FLIGHT.includes(lower(j.status)));
  const completed = terminal.filter((j) => lower(j.status) === "completed").length;
  const settled = terminal.length + stuck;
  const successRate = settled ? Math.round((completed / settled) * 100) : null;

  return { failed, timedOut, stuck, successRate, completed, terminal: settled };
}

/** Failure causes, most frequent first. */
export function groupFailureCauses(jobs, { limit = 5 } = {}) {
  const counts = new Map();
  for (const job of Array.isArray(jobs) ? jobs : []) {
    if (!FAILED.includes(lower(job.status))) continue;
    const cause = normalizeFailureCause(job.last_error) || "unreported";
    counts.set(cause, (counts.get(cause) || 0) + 1);
  }
  return [...counts.entries()]
    .map(([cause, count]) => ({ cause, count }))
    .sort((a, b) => b.count - a.count || a.cause.localeCompare(b.cause))
    .slice(0, limit);
}

/**
 * Devices whose jobs keep failing, worst first.
 *
 * The angle that found the real problem in production: one endpoint holding 11
 * failed jobs, invisible in a list sorted by time because its rows were spread
 * across two days.
 */
export function groupFailingDevices(jobs, { deviceMap = null, limit = 5 } = {}) {
  const byDevice = new Map();
  for (const job of Array.isArray(jobs) ? jobs : []) {
    if (!FAILED.includes(lower(job.status))) continue;
    const id = String(job.device_id || "");
    if (!id) continue;
    const entry = byDevice.get(id) || { deviceId: id, count: 0, lastAt: null };
    entry.count += 1;
    const t = ms(job.created_at);
    if (t !== null && (entry.lastAt === null || t > entry.lastAt)) entry.lastAt = t;
    byDevice.set(id, entry);
  }

  return [...byDevice.values()]
    .map((entry) => ({
      ...entry,
      // Falls back to the id, like the history table — a device the roster
      // does not know still has to be nameable enough to click.
      hostname: deviceMap?.get(entry.deviceId)?.hostname || entry.deviceId,
    }))
    .sort((a, b) => b.count - a.count || (b.lastAt ?? 0) - (a.lastAt ?? 0))
    .slice(0, limit);
}
