import { describe, it, expect } from "vitest";
import { FAILED_REASON, failedRemediationBatchJob } from "../test/fixtures/failedRemediationBatch";
import {
  deriveTriage,
  failureCausesOf,
  groupFailingDevices,
  groupFailureCauses,
  isStuckJob,
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
// Un plazo del servidor, N horas por delante (+) o por detrás (-) de AHORA.
const plazo = (h) => new Date(AHORA + h * 3600 * 1000).toISOString();

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

  it("cuenta como colgado lo que está en vuelo y lleva más de un día sin moverse", () => {
    // Es el estado que dejó dos jobs 46 h sobre un endpoint muerto sin que
    // nada en la interfaz lo dijera.
    //
    // 🔴 ESTA PRUEBA PEDÍA ANTES 2, EXCLUYENDO A PROPÓSITO EL CUARTO («sí se
    // envió»). Fijaba el bug: la regla era `sent_at IS NULL`, así que un job
    // que salió y después se pudrió NO PODÍA contarse. Es exactamente lo que
    // le pasó al uninstall de AnyDesk el 26-sep — `retrying` con los cinco
    // intentos gastados, y la franja decía «0».
    //
    // ⚠️ Y AHORA EL PLAZO LO MANDA EL SERVIDOR (`stale_after`), porque medirlo
    // con 24 h planas marcaba como colgados 14 jobs que el orquestador espera
    // a propósito. Los dos primeros llevan lo mismo parados y sólo uno ha
    // agotado SU plazo: eso es lo que distingue la celda útil de la que se
    // ignora.
    const jobs = [
      { status: "pending", sent_at: null, created_at: haceHoras(46), stale_after: plazo(-2) },  // vencido
      { status: "retrying", sent_at: null, created_at: haceHoras(30), stale_after: plazo(+600) }, // aún se espera
      { status: "pending", sent_at: null, created_at: haceHoras(3), stale_after: plazo(+20) },  // reciente
      { status: "pending", sent_at: haceHoras(40), created_at: haceHoras(46), stale_after: plazo(-12) }, // enviado y podrido
      { status: "completed", sent_at: null, created_at: haceHoras(99), stale_after: plazo(-99) }, // terminal
    ];
    expect(deriveTriage(jobs, { now: AHORA }).stuck).toBe(2);
  });

  it("🔴 el caso de AnyDesk: retrying, enviado, sin moverse desde hace días", () => {
    const anydesk = {
      status: "retrying",
      sent_at: haceHoras(40),
      created_at: haceHoras(44),
      updated_at: haceHoras(39),
    };
    expect(isStuckJob(anydesk, { now: AHORA })).toBe(true);
    expect(deriveTriage([anydesk], { now: AHORA }).stuck).toBe(1);
  });

  it("⚠️ manda `updated_at`, no `created_at`: un job viejo que AVANZA no está colgado", () => {
    // Un despliegue por anillos creado hace días y reenviado hace diez minutos
    // está trabajando. Medir desde la creación lo marcaría colgado para siempre.
    const vivo = { status: "running", created_at: haceHoras(99), updated_at: haceHoras(0.2) };
    expect(isStuckJob(vivo, { now: AHORA })).toBe(false);
  });

  it("🔴 el plazo lo pone el SERVIDOR: dos jobs igual de viejos, distinto veredicto", () => {
    // El defecto que esto arregla: con una regla plana de 24 h la celda marcaba
    // 14 jobs que el orquestador espera A PROPÓSITO. Los plazos son POR TIPO
    // —`agent_update` 30 días, `patch_scan` 1— y esa tabla vive en el backend,
    // que ahora manda `stale_after` ya calculado.
    const viejo = { status: "pending", created_at: haceHoras(48), updated_at: haceHoras(48) };
    const esperando = { ...viejo, stale_after: plazo(+1) };
    const vencido = { ...viejo, stale_after: plazo(-1) };

    expect(isStuckJob(esperando, { now: AHORA })).toBe(false);
    expect(isStuckJob(vencido, { now: AHORA })).toBe(true);
  });

  it("⚠️ el plazo del servidor GANA a las 24 h locales", () => {
    // Si no ganara, un agent_update de 30 días volvería a salir a las 24 h y
    // habríamos arreglado nada.
    const job = {
      status: "pending",
      sent_at: haceHoras(48),
      updated_at: haceHoras(48),
      stale_after: plazo(+10),
    };
    expect(isStuckJob(job, { now: AHORA })).toBe(false);
  });

  it("⚠️ sin el campo (backend viejo) se juzga sólo lo ENVIADO", () => {
    // Un `pending` sin enviar no se puede juzgar sin saber su plazo: adivinarlo
    // es lo que producía las falsas alarmas. Uno enviado sí: no lo cubre ningún
    // plazo por tipo, y es la clase que la celda no veía.
    const sinEnviar = { status: "pending", created_at: haceHoras(100), updated_at: haceHoras(100) };
    const enviado = { status: "retrying", sent_at: haceHoras(40), updated_at: haceHoras(40) };

    expect(isStuckJob(sinEnviar, { now: AHORA })).toBe(false);
    expect(isStuckJob(enviado, { now: AHORA })).toBe(true);
  });

  it("⚠️ lo terminal nunca está colgado, por viejo que sea", () => {
    for (const status of ["completed", "failed", "timeout", "cancelled", "expired"]) {
      expect(isStuckJob({ status, created_at: haceHoras(500) }, { now: AHORA })).toBe(false);
    }
  });

  it("⚠️ sin fechas legibles NO se declara colgado", () => {
    // «No sé cuándo se movió» no es «lleva un día parado». Inventarlo llenaría
    // la celda de filas que la tabla no sabría explicar.
    expect(isStuckJob({ status: "pending" }, { now: AHORA })).toBe(false);
    expect(isStuckJob({ status: "pending", created_at: "no-es-fecha" }, { now: AHORA })).toBe(false);
  });

  it("🔴 un job colgado entra en el denominador de la tasa: no es trabajo en curso", () => {
    // Era lo que dejaba «99 % · 154 of 155» con un job muerto dentro: al estar
    // en el saco de «en vuelo» no se contaba en ninguna parte.
    const jobs = [
      { status: "completed" },
      { status: "completed" },
      { status: "completed" },
      { status: "retrying", sent_at: haceHoras(40), updated_at: haceHoras(40) }, // colgado
    ];
    const t = deriveTriage(jobs, { now: AHORA });
    expect(t.terminal).toBe(4);
    expect(t.completed).toBe(3);
    expect(t.successRate).toBe(75);
  });

  it("⚠️ pero un colgado NO se declara «fallido»", () => {
    // No sabemos que fallara: sabemos que nadie lo cerró. Entra en el
    // denominador y no en el numerador, que es justo lo que significa.
    const colgado = { status: "retrying", sent_at: haceHoras(40), updated_at: haceHoras(40) };
    const t = deriveTriage([colgado], { now: AHORA });
    expect(t.failed).toBe(0);
    expect(t.timedOut).toBe(0);
    expect(t.successRate).toBe(0);
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

describe("🔴 un lote fallido se cuenta por lo que falló DENTRO (69b4aa78, 30-sep)", () => {
  it("la causa es el `reason=` del fix fallido, no «patch_remediate_batch:done»", () => {
    const causes = failureCausesOf(failedRemediationBatchJob());
    expect(causes).toEqual([normalizeFailureCause(`reason=${FAILED_REASON}`)]);
    expect(causes[0]).toMatch(/^post_state_mismatch: syscall fchmodat/);
    expect(causes.join()).not.toMatch(/batch:done/);
  });

  it("groupFailureCauses ya no lista «patch_remediate_batch:done» como causa", () => {
    const out = groupFailureCauses([failedRemediationBatchJob()]);
    expect(out).toHaveLength(1);
    expect(out[0].cause).toMatch(/^post_state_mismatch/);
  });

  it("un lote sin fixes fallidos legibles cae a la cabeza: nunca se pierde la fila", () => {
    const job = { job_type: "patch_remediate", status: "failed", last_error: "patch_remediate_batch:done;items=roto" };
    expect(failureCausesOf(job)).toEqual(["patch_remediate_batch:done"]);
  });

  it("un error de texto libre sigue como estaba", () => {
    expect(failureCausesOf({ job_type: "patch_install", last_error: "PrivSvc timeout: patch.install did not answer within 5700000ms" })).toEqual([
      "PrivSvc timeout: patch.install did not answer within Nms",
    ]);
  });
});
