// src/hooks/useRunningJobs.js
//
// Los jobs que un agente está ejecutando AHORA, para el aviso del menú Jobs.
//
// POR QUÉ EXISTE (1-oct). Un operador lanza un job, cierra el JobTracker —o
// cambia de página, que es lo mismo— y ya no sabe dónde seguirlo. El tracker
// sólo conoce los jobs que lanzó SU página; esto pregunta al servidor, así que
// ve lo que está corriendo venga de donde venga (Jobs, SDP, PMP, una
// remediación, el propio sistema).
//
// ⚠️ `sent`, NO `running`. Nadie llama a `markRunning` en el backend
// (job-dispatcher.ts): ningún job pasa nunca por `running`. Mientras el agente
// trabaja, el job está en `sent` hasta que contesta. Se pide también `running`
// por si algún día se usa; contarlo sólo a él dejaría el aviso siempre apagado.
//
// ⚠️ `pending` NO cuenta, a propósito. Es lo que espera a un equipo apagado:
// el 1-oct había 58, el más viejo del 17-sep. Un aviso que los contara estaría
// encendido siempre y nadie volvería a mirarlo.
//
// Ritmo: cada 30 s en reposo, cada 10 s mientras algo corre, y en pausa con la
// pestaña oculta. La mediana de un `software_install` es ~40 s y la de un
// `agent_update` ~24 s, así que los cortos pueden acabar entre dos sondeos — y
// no pasa nada: el aviso es para lo que tarda, que es lo que hay que seguir.
// Cablear un evento en cada sitio que lanza jobs (son ~15) sería mucho más
// código para ganar unos segundos.

import * as React from "react";
import { listTenantJobs } from "../api/jobs";
import { isStuckJob } from "../utils/jobInsights";

export const RUNNING_JOB_STATUSES = "sent,running";
export const IDLE_POLL_MS = 30_000;
export const ACTIVE_POLL_MS = 10_000;
// Basta para el número y el tooltip; si hay más, se dice «20+».
const LIMIT = 20;

/**
 * `{ jobs, truncated }` de lo que corre ahora en el tenant. Sin tenant, o con
 * `enabled: false`, no pide nada y devuelve la lista vacía.
 */
export function useRunningJobs(tenantId, { enabled = true } = {}) {
  const [state, setState] = React.useState({ jobs: [], truncated: false });

  React.useEffect(() => {
    if (!enabled || !tenantId) {
      setState({ jobs: [], truncated: false });
      return undefined;
    }

    let cancelled = false;
    let timer = null;
    let inFlight = false;
    let active = false;

    const schedule = () => {
      if (cancelled || document.hidden) return;
      timer = setTimeout(tick, active ? ACTIVE_POLL_MS : IDLE_POLL_MS);
    };

    async function tick() {
      timer = null;
      if (cancelled || inFlight) return;
      inFlight = true;
      try {
        // `cache: false`: un sondeo que saliera de la caché de 60 s de
        // httpGetJson enseñaría un minuto tarde que algo terminó.
        const res = await listTenantJobs(
          tenantId,
          { status: RUNNING_JOB_STATUSES, limit: LIMIT },
          { cache: false }
        );
        const items = Array.isArray(res?.items) ? res.items : [];
        // Un `sent` que el agente abandonó no está «corriendo»: el servidor ya
        // le puso plazo (`stale_after`) y aquí se respeta.
        const jobs = items.filter((job) => !isStuckJob(job));
        active = jobs.length > 0;
        if (!cancelled) setState({ jobs, truncated: res?.truncated === true });
      } catch {
        // En silencio, como la campana: un corte de red o una sesión que
        // caduca no deben llenar la consola cada 10 s. El siguiente sondeo
        // lo vuelve a intentar.
      } finally {
        inFlight = false;
        schedule();
      }
    }

    const onVisibilityChange = () => {
      if (document.hidden) {
        if (timer) clearTimeout(timer);
        timer = null;
      } else if (!timer) {
        tick();
      }
    };

    tick();
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [tenantId, enabled]);

  return state;
}
