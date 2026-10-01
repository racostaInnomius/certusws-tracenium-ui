// src/components/RemoteControl/connectionDiag.js
//
// Lo que vio el NAVEGADOR cuando una sesión remota se rompió, contado al
// backend para que quede en los eventos de la sesión (`client_diag`).
//
// ── Por qué ──────────────────────────────────────────────────────────
//
// TNS-OPER-SNOC04 (1-oct-2026): una sesión de pantalla se cerró sola a los 6
// minutos con «WebRTC connection lost — retries exhausted». En la base de
// datos sólo quedó `closed · operator_disconnected`; el agente no vio nada; y
// el visor no escribía ni una línea en la consola. Se descartaron a mano un
// temporizador, TURN y la CPU del Mac —con instrumentación montada a mano y
// reproduciendo—, y la causa nunca se supo: el único que la vio fue el
// navegador, y no tenía dónde contarla.
//
// Con esto, la próxima vez la respuesta está en los eventos de la sesión:
// cuándo pasó ICE a `disconnected`, si salieron los reinicios, cómo se cerró
// el WebSocket (código 1006 = la red, 1000 = alguien lo cerró) y por qué ruta
// iba (directa o relay).
//
// ── Por qué reintenta ────────────────────────────────────────────────
//
// Si lo que se cayó fue la red del operador, el primer envío también falla.
// La red suele volver en segundos y el visor sigue abierto con el error en
// pantalla: unos pocos reintentos con espera creciente cubren justo ese caso.

import { httpPostJson } from "../../api/http";

const MAX_TIMELINE = 60;
const RETRY_DELAYS_MS = [0, 3_000, 8_000, 20_000, 45_000];

const stamp = () => new Date().toISOString().slice(11, 23);

/**
 * @param {{ sessionId: string, post?: Function, delays?: number[] }} opts
 *   `post` y `delays` sólo para pruebas.
 */
export function createConnectionDiag({ sessionId, post = httpPostJson, delays = RETRY_DELAYS_MS }) {
  const timeline = [];
  let lastFrameAt = 0;
  let wsClose = null;
  let reported = false;
  let pc = null;
  const disposers = [];

  function push(ev, s, n) {
    const e = { t: stamp(), ev };
    if (s !== undefined && s !== null && s !== "") e.s = String(s).slice(0, 64);
    if (typeof n === "number" && Number.isFinite(n)) e.n = n;
    timeline.push(e);
    if (timeline.length > MAX_TIMELINE) timeline.shift();
  }

  async function routeSnapshot() {
    if (!pc || typeof pc.getStats !== "function") return {};
    try {
      const st = await pc.getStats();
      let pair;
      st.forEach((r) => {
        if (r.type === "transport" && r.selectedCandidatePairId) pair = st.get(r.selectedCandidatePairId);
      });
      if (!pair) {
        st.forEach((r) => {
          if (r.type === "candidate-pair" && r.nominated && r.state === "succeeded") pair = r;
        });
      }
      if (!pair) return {};
      const local = st.get(pair.localCandidateId);
      const remote = st.get(pair.remoteCandidateId);
      return {
        route: `${local?.candidateType ?? "?"}/${local?.protocol ?? "?"} → ${remote?.candidateType ?? "?"}`,
        rttMs: typeof pair.currentRoundTripTime === "number" ? pair.currentRoundTripTime * 1000 : undefined,
        bytesReceived: pair.bytesReceived,
        bytesSent: pair.bytesSent
      };
    } catch {
      return {};
    }
  }

  return {
    /** Anota los cambios de estado de ICE y de la conexión. */
    watchPc(peer) {
      pc = peer;
      const onIce = () => push("ice", peer.iceConnectionState);
      const onConn = () => push("conn", peer.connectionState);
      peer.addEventListener?.("iceconnectionstatechange", onIce);
      peer.addEventListener?.("connectionstatechange", onConn);
      disposers.push(() => {
        peer.removeEventListener?.("iceconnectionstatechange", onIce);
        peer.removeEventListener?.("connectionstatechange", onConn);
      });
    },
    /** Anota cómo se cerró el WebSocket de señalización. */
    watchWs(ws) {
      const onClose = (e) => {
        wsClose = { code: e?.code, reason: e?.reason };
        push("ws_close", e?.reason, e?.code);
      };
      ws.addEventListener?.("close", onClose);
      disposers.push(() => ws.removeEventListener?.("close", onClose));
    },
    /** Llegó un fotograma (sólo el visor de pantalla). */
    frame() {
      lastFrameAt = Date.now();
    },
    note(ev, s, n) {
      push(ev, s, n);
    },
    /** Datos para pruebas. */
    get timeline() {
      return timeline.slice();
    },
    /**
     * La sesión se rompió: lo cuenta UNA vez, a la consola y al backend.
     * Nunca lanza: un diagnóstico que falla no puede tapar el error real.
     */
    async report(kind) {
      if (reported) return;
      reported = true;
      push("report", kind);
      const payload = {
        kind,
        timeline: timeline.slice(),
        ...(await routeSnapshot()),
        ...(lastFrameAt ? { lastFrameAgoMs: Date.now() - lastFrameAt } : {}),
        ...(wsClose?.code !== undefined ? { wsCloseCode: wsClose.code } : {}),
        ...(wsClose?.reason ? { wsCloseReason: wsClose.reason } : {})
      };
      // La consola primero: es lo que mira quien tenga el visor delante.
      console.warn("[rcp] la sesión se rompió", sessionId, payload);

      const url = `/api/v1/remote-control/sessions/${encodeURIComponent(sessionId)}/client-diag`;
      for (const wait of delays) {
        if (wait) await new Promise((r) => setTimeout(r, wait));
        try {
          await post(url, payload);
          return;
        } catch (err) {
          // 4xx: el backend lo ha rechazado de verdad (no es su operador, ya
          // hay demasiados). Reintentar no lo cambia.
          const status = Number(err?.status ?? err?.statusCode ?? 0);
          if (status >= 400 && status < 500) return;
        }
      }
    },
    dispose() {
      for (const d of disposers.splice(0)) {
        try { d(); } catch { /* nada */ }
      }
    }
  };
}
