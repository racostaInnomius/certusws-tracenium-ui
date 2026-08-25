import { describe, it, expect } from "vitest";
import {
  deriveTriage,
  groupFailingDevices,
  groupFailureCauses,
  normalizeFailureCause,
} from "./jobInsights";

// The 14 distinct `last_error` values actually present in production on
// 2026-08-25. The normalizer was written against THIS corpus, so it is what
// the tests assert against — a rule that groups invented strings correctly
// but scatters the real ones would pass a made-up fixture and fail in the UI.
const CORPUS = [
  "cancelled_by_user",
  "job_timeout",
  "never_dispatched_stale",
  "OK",
  "patch_install partial; installed=0; failed=0; rebootRequired=false",
  "PrivSvc timeout",
  "software_install:failed;deploymentId=10;reason=install_failed",
  "software_install:failed;deploymentId=12;reason=install_failed",
  "software_install:failed;deploymentId=13;reason=install_failed: exe installer requires extra args",
  "stream_not_found",
  "unsupported_job_type:reset_baseline",
  "update_failed: connect ETIMEDOUT 20.60.178.4:443",
  "update_failed: update_hash_mismatch",
  "stale_after_5_failed_attempts",
];

describe("normalizeFailureCause — contra el corpus real", () => {
  it("usa reason= cuando existe, no el prefijo del tipo de job", () => {
    // Cortar en el primer ';' daría "software_install:failed", que es el tipo
    // de job repitiendo que falló — no dice nada.
    expect(normalizeFailureCause("software_install:failed;deploymentId=10;reason=install_failed"))
      .toBe("install_failed");
  });

  it("agrupa los tres software_install bajo una sola causa", () => {
    const causas = new Set(
      CORPUS.filter((c) => c.startsWith("software_install")).map(normalizeFailureCause)
    );
    // El tercero arrastra ": exe installer requires extra args"; sigue siendo
    // install_failed, sólo que con detalle.
    expect(causas.size).toBeLessThanOrEqual(2);
    expect([...causas].every((c) => c.startsWith("install_failed"))).toBe(true);
  });

  it("quita la dirección variable de un ETIMEDOUT", () => {
    // La IP:puerto cambia entre intentos; dejarla dispersaría una causa en
    // tantas filas como endpoints.
    expect(normalizeFailureCause("update_failed: connect ETIMEDOUT 20.60.178.4:443"))
      .toBe("update_failed: connect ETIMEDOUT");
  });

  it("corta los contadores por ejecución", () => {
    expect(normalizeFailureCause("patch_install partial; installed=0; failed=0; rebootRequired=false"))
      .toBe("patch_install partial");
  });

  it("colapsa el contador de intentos para que agrupen", () => {
    expect(normalizeFailureCause("stale_after_5_failed_attempts"))
      .toBe(normalizeFailureCause("stale_after_2_failed_attempts"));
  });

  it("deja intactas las que ya son una causa", () => {
    for (const c of ["job_timeout", "PrivSvc timeout", "stream_not_found", "cancelled_by_user"]) {
      expect(normalizeFailureCause(c)).toBe(c);
    }
  });

  it("nunca descarta una cadena desconocida", () => {
    // Un error que no encaje en ninguna regla debe SEGUIR apareciendo, o el
    // panel subnotifica en silencio lo que se está rompiendo.
    expect(normalizeFailureCause("algo-que-nadie-previo")).toBe("algo-que-nadie-previo");
    for (const c of CORPUS) expect(normalizeFailureCause(c)).toBeTruthy();
  });

  it("devuelve null sólo cuando no hay error", () => {
    expect(normalizeFailureCause(null)).toBeNull();
    expect(normalizeFailureCause("")).toBeNull();
    expect(normalizeFailureCause("   ")).toBeNull();
  });
});

const AHORA = Date.parse("2026-08-25T12:00:00Z");
const haceHoras = (h) => new Date(AHORA - h * 3600 * 1000).toISOString();

describe("deriveTriage", () => {
  it("cuenta fallos y timeouts sólo dentro de la ventana", () => {
    const jobs = [
      { status: "failed", completed_at: haceHoras(2) },
      { status: "failed", completed_at: haceHoras(40) },
      { status: "timeout", completed_at: haceHoras(5) },
    ];
    const t = deriveTriage(jobs, { now: AHORA });
    expect(t.failed).toBe(1);
    expect(t.timedOut).toBe(1);
  });

  it("cuenta como colgado sólo lo que NUNCA se envió y lleva más de un día", () => {
    // Es el estado que dejó dos jobs 46 h sobre un endpoint muerto sin que
    // nada en la interfaz lo dijera.
    const jobs = [
      { status: "pending", sent_at: null, created_at: haceHoras(46) },
      { status: "retrying", sent_at: null, created_at: haceHoras(30) },
      { status: "pending", sent_at: null, created_at: haceHoras(3) },   // reciente
      { status: "pending", sent_at: haceHoras(40), created_at: haceHoras(46) }, // sí se envió
      { status: "completed", sent_at: null, created_at: haceHoras(99) }, // terminal
    ];
    expect(deriveTriage(jobs, { now: AHORA }).stuck).toBe(2);
  });

  it("excluye lo que sigue en vuelo del cálculo de la tasa", () => {
    // Una tasa que baja porque hay trabajo EN CURSO sería peor que no tenerla.
    const jobs = [
      { status: "completed" }, { status: "completed" }, { status: "completed" },
      { status: "failed" },
      { status: "running" }, { status: "pending" },
    ];
    const t = deriveTriage(jobs, { now: AHORA });
    expect(t.terminal).toBe(4);
    expect(t.successRate).toBe(75);
  });

  it("sin jobs terminales la tasa es null, no 0", () => {
    // 0% diría "todo falla"; null dice "todavía no hay nada que medir".
    expect(deriveTriage([{ status: "running" }], { now: AHORA }).successRate).toBeNull();
    expect(deriveTriage([], { now: AHORA }).successRate).toBeNull();
  });
});

describe("groupFailureCauses", () => {
  it("agrupa y ordena por frecuencia", () => {
    const jobs = [
      { status: "timeout", last_error: "job_timeout" },
      { status: "timeout", last_error: "job_timeout" },
      { status: "failed", last_error: "software_install:failed;deploymentId=10;reason=install_failed" },
      { status: "completed", last_error: null },
    ];
    expect(groupFailureCauses(jobs)).toEqual([
      { cause: "job_timeout", count: 2 },
      { cause: "install_failed", count: 1 },
    ]);
  });

  it("un fallo sin error se cuenta como 'unreported', no se pierde", () => {
    expect(groupFailureCauses([{ status: "failed", last_error: null }]))
      .toEqual([{ cause: "unreported", count: 1 }]);
  });
});

describe("groupFailingDevices", () => {
  it("ordena por número de fallos y resuelve el hostname", () => {
    const jobs = [
      { status: "timeout", device_id: "d1", created_at: haceHoras(3) },
      { status: "timeout", device_id: "d1", created_at: haceHoras(9) },
      { status: "failed", device_id: "d2", created_at: haceHoras(1) },
      { status: "completed", device_id: "d3", created_at: haceHoras(1) },
    ];
    const map = new Map([["d1", { hostname: "LAP-OPS-11" }]]);
    const out = groupFailingDevices(jobs, { deviceMap: map });

    expect(out[0]).toMatchObject({ deviceId: "d1", hostname: "LAP-OPS-11", count: 2 });
    // d2 no está en el roster: se nombra con su id en vez de desaparecer.
    expect(out[1]).toMatchObject({ deviceId: "d2", hostname: "d2", count: 1 });
    expect(out).toHaveLength(2);
  });
});
