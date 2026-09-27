// src/components/Compliance/RescanComplianceButton.jsx
//
// «Rescan now»: pedirle a UN equipo que recoja y mande su evidencia de
// compliance ya, sin esperar al escaneo programado (horas).
//
// 27-sep: después de aplicar o revertir un fix no había forma de ver el
// resultado hasta el siguiente ciclo del agente. Es el job de siempre
// (`facts_snapshot` con `factType: "compliance"`, el mismo que se lanza desde
// Jobs o Grupos); aquí sólo se pone donde se necesita.
//
// ⚠️ Nunca dos a la vez para el mismo equipo: si ya hay una recolección de
// compliance (o «all») pendiente o en curso, el botón se apaga y dice que ya
// está escaneando — varios clics, de uno o de varios operadores, encolaban
// varios escaneos (ver las tormentas de escaneo). Y no hay botón de flota:
// para un grupo está el despacho de Grupos/Jobs, con su confirmación.

import * as React from "react";
import { Button, CircularProgress, Tooltip } from "@mui/material";
import RefreshOutlinedIcon from "@mui/icons-material/RefreshOutlined";
import { ICON } from "../../theme/brand";
import { createDeviceJob, listDeviceJobs } from "../../api/jobs";
import { listFrom } from "../../api/shape";

const POLL_MS = 5000;
const TERMINAL = new Set(["completed", "success", "succeeded", "failed", "timeout", "cancelled"]);
const OK = new Set(["completed", "success", "succeeded"]);
const SCAN_FACT_TYPES = new Set(["compliance", "all"]);

function payloadOf(job) {
  let p = job?.payload_json ?? job?.payload ?? null;
  if (typeof p === "string") {
    try {
      p = JSON.parse(p);
    } catch {
      return null;
    }
  }
  return p && typeof p === "object" ? p : null;
}

/** La recolección de compliance de este equipo que sigue sin terminar, si la hay. */
export function pendingComplianceScan(jobs) {
  return (
    (Array.isArray(jobs) ? jobs : []).find(
      (j) =>
        j?.job_type === "facts_snapshot"
        && SCAN_FACT_TYPES.has(String(payloadOf(j)?.factType ?? ""))
        && !TERMINAL.has(String(j?.status ?? "").toLowerCase())
    ) ?? null
  );
}

/**
 * Estado de la recolección de un equipo: si hay una en curso, lanzarla y
 * enterarse de cuándo acaba (onFinished recibe `ok`).
 */
export function useComplianceRescan(agentId, { onFinished = null, onToast = null } = {}) {
  const [pendingJob, setPendingJob] = React.useState(null);
  const [starting, setStarting] = React.useState(false);
  const finishedRef = React.useRef(onFinished);
  finishedRef.current = onFinished;
  const toastRef = React.useRef(onToast);
  toastRef.current = onToast;
  const trackingRef = React.useRef(null);

  const refresh = React.useCallback(async () => {
    if (!agentId) return;
    try {
      const res = await listDeviceJobs(agentId, { limit: 25 });
      const jobs = Array.isArray(res?.jobs) ? res.jobs : listFrom(res, { context: "deviceJobs" });
      const pending = pendingComplianceScan(jobs);
      const tracked = trackingRef.current;
      // La que acabamos de lanzar todavía no sale en la lista (réplica, o la
      // lista va por detrás): se sigue esperando en vez de darla por perdida.
      if (tracked && !pending && !jobs.some((j) => j.job_id === tracked)) return;
      setPendingJob(pending);
      // La que lanzamos aquí ya terminó: se dice y el llamante recarga.
      if (tracked && !pending) {
        const done = jobs.find((j) => j.job_id === tracked);
        trackingRef.current = null;
        const ok = OK.has(String(done?.status ?? "").toLowerCase());
        toastRef.current?.({
          severity: ok ? "success" : "warning",
          message: ok ? "Rescan finished — the device's compliance is up to date." : `Rescan did not complete (${done?.status ?? "unknown"}).`,
        });
        finishedRef.current?.(ok);
      }
    } catch {
      // Leer el estado es una comodidad: si falla, el botón queda como estaba.
    }
  }, [agentId]);

  React.useEffect(() => {
    setPendingJob(null);
    trackingRef.current = null;
    refresh();
  }, [refresh]);

  React.useEffect(() => {
    if (!pendingJob) return undefined;
    const id = setInterval(() => {
      if (document.visibilityState === "visible") refresh();
    }, POLL_MS);
    return () => clearInterval(id);
  }, [pendingJob, refresh]);

  const start = React.useCallback(async () => {
    if (!agentId || pendingJob || starting) return;
    setStarting(true);
    try {
      const res = await createDeviceJob(agentId, { jobType: "facts_snapshot", payload: { factType: "compliance" } });
      const jobId = res?.job?.job_id ?? res?.job?.jobId ?? res?.jobId ?? res?.job_id ?? null;
      trackingRef.current = jobId;
      setPendingJob({ job_id: jobId, status: "pending", job_type: "facts_snapshot" });
      toastRef.current?.({ severity: "info", message: "Rescan requested — the device will report its compliance shortly." });
    } catch (e) {
      toastRef.current?.({ severity: "error", message: e?.body?.message || e?.message || "Could not request the rescan." });
    } finally {
      setStarting(false);
    }
  }, [agentId, pendingJob, starting]);

  return { scanning: Boolean(pendingJob), starting, start, refresh };
}

export default function RescanComplianceButton({
  agentId,
  label = "Rescan now",
  onFinished = null,
  onToast = null,
  size = "small",
  variant = "text",
  disabled = false,
}) {
  const { scanning, starting, start } = useComplianceRescan(agentId, { onFinished, onToast });
  const busy = scanning || starting;
  return (
    <Tooltip
      arrow
      title={
        scanning
          ? "A compliance scan is already queued or running on this device."
          : "Ask the device to collect and send its compliance evidence now, instead of waiting for the next scheduled scan."
      }
    >
      <span>
        <Button
          size={size}
          variant={variant}
          onClick={start}
          disabled={disabled || busy}
          startIcon={busy ? <CircularProgress size={12} /> : <RefreshOutlinedIcon sx={{ fontSize: ICON.sm }} />}
          sx={{ textTransform: "none", fontWeight: 700, whiteSpace: "nowrap" }}
        >
          {busy ? "Scanning…" : label}
        </Button>
      </span>
    </Tooltip>
  );
}
