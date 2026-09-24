// src/components/RemoteControl/iceRestart.js
//
// ICE restart helper for RCP DataChannel sessions (rcp.shell, rcp.file,
// rcp.screen).
//
// What is "ICE restart" and why we need it
// ----------------------------------------
//
// Once a WebRTC PeerConnection has negotiated ICE and entered the
// `connected` state, the underlying network path can still break later —
// the user roams Wi-Fi networks, the operator's NAT mapping ages out, the
// TURN allocation expires, the agent's machine sleeps and wakes. The
// browser surfaces this as `iceConnectionState === "disconnected"`
// (transient, sometimes recovers on its own) or `"failed"` (terminal, the
// only way out is a new round of ICE).
//
// An ICE restart is the standard RFC 5245 / WebRTC mechanism for that
// recovery: the offerer calls `pc.createOffer({ iceRestart: true })`,
// which produces a new offer with a fresh ice-ufrag/ice-pwd. The remote
// peer answers with its own new credentials, and gathering + connectivity
// checks happen all over again on top of the existing DTLS / SCTP / DC
// state. The application data stays alive across the restart — no reopen
// of the DataChannel, no re-spawn of the PTY, no lost file transfer.
//
// Cloudflare specifically recommends ICE restart support for clients
// using their TURN service ("ICE restart support by clients is highly
// recommended" — Cloudflare Realtime FAQ), because their TURN allocations
// can be disrupted by maintenance events.
//
// What this helper does
// ---------------------
//
// Attach to a PeerConnection + the signaling WebSocket. We watch
// `iceconnectionstatechange`:
//
//   failed       → restart immediately (terminal state, no point waiting)
//   disconnected → wait `disconnectedGraceMs` (default 4s) before
//                  restarting; many transient WiFi blips clear within
//                  that window without doing anything
//   connected /
//   completed    → reset the attempts counter; next failure starts at 0
//
// We cap retries at `maxAttempts` (default 2) so a hard network outage
// stops eating CPU and TURN bandwidth — after that we call
// `onFinalFailure` and the component shows an error.
//
// Returns a teardown function the caller should put in its cleanup list
// (the React useEffect cleanup, the cleanupFns array, etc.). Calling it
// detaches the listener and cancels any pending timer.
//
// Caller contract
// ---------------
//
// The component owns the answer flow. When the agent's answer arrives
// over the WS (`{ type: "answer", sdp }`), the caller's existing
// `ws.onmessage` handler must call
// `pc.setRemoteDescription({ type: "answer", sdp })` — that handler does
// NOT need to know whether the answer is for the initial offer or for an
// ICE restart; the API treats them identically. So this helper has zero
// coupling to the message handler.
//
// Usage
// -----
//
//   const detach = attachIceRestart({
//     pc, ws, sessionId,
//     onFinalFailure: () => {
//       setErrorMsg("Connection lost.");
//       setState(STATE.ERROR);
//     },
//     onRestartAttempt: (attempt) => {
//       setStatusMsg(`Reconnecting (attempt ${attempt})…`);
//     }
//   });
//   cleanupFns.push(detach);

export function attachIceRestart({
  pc,
  ws,
  sessionId,
  maxAttempts = 2,
  disconnectedGraceMs = 4000,
  onFinalFailure,
  onRestartAttempt,
  /**
   * ICE falló SIN haber conectado nunca: no hay nada que reiniciar. Si el
   * llamador no lo trae, se cae en `onFinalFailure` — peor mensaje, pero
   * nunca un silencio.
   */
  onUnestablished
} = {}) {
  if (!pc || !ws || !sessionId) {
    // Misconfigured call — fail loud in dev, no-op in prod.
    if (typeof console !== "undefined") {
      console.warn("[iceRestart] missing pc/ws/sessionId, helper inactive");
    }
    return () => {};
  }

  let attempts = 0;
  let disposed = false;
  let pendingGraceTimer = null;
  let restartInFlight = false;
  // ⚠️ ¿Llegó a haber conexión alguna vez?
  //
  // Reiniciar ICE es recuperar una conexión ROTA. Una que nunca se estableció
  // no está rota: no llegó a existir, y reiniciarla no arregla nada — vuelve a
  // fallar por lo mismo, que casi siempre es un cortafuegos o UDP cerrado en
  // un extremo.
  //
  // Y hace algo peor que no servir: MIENTE. El agente ve credenciales ICE
  // nuevas, y como una shell o un gestor de ficheros no se pueden reconstruir
  // sin tirar el PTY o la transferencia, cierra con `ice_restart_unsupported`
  // — cuyo texto dice «la red cambió a mitad de sesión». El operador se va a
  // buscar un cambio de red que no hubo, con una sesión que nunca conectó.
  //
  // Pasó en campo: T111, equipo MSIG-DOMAIN, 24-sep. La auditoría lo remataba
  // enseñando `connected` un segundo antes, porque ese evento se escribe
  // cuando el agente MANDA SU ANSWER, no cuando hay camino.
  let everConnected = false;

  const clearGrace = () => {
    if (pendingGraceTimer) {
      clearTimeout(pendingGraceTimer);
      pendingGraceTimer = null;
    }
  };

  const tryRestart = async () => {
    if (disposed) return;
    if (restartInFlight) return;
    if (pc.signalingState === "closed") return;
    if (attempts >= maxAttempts) {
      onFinalFailure?.();
      return;
    }
    attempts += 1;
    restartInFlight = true;
    try {
      onRestartAttempt?.(attempts);
      // iceRestart:true forces fresh ICE credentials on the offer side.
      // The agent's answerer (libdatachannel) handles it transparently.
      const offer = await pc.createOffer({ iceRestart: true });
      if (disposed) return;
      await pc.setLocalDescription(offer);
      if (disposed) return;
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "offer", sessionId, sdp: offer.sdp }));
      } else {
        // WS dead → can't deliver. Treat as final failure.
        onFinalFailure?.();
      }
    } catch (err) {
      if (typeof console !== "undefined") {
        console.warn("[iceRestart] attempt failed", err);
      }
      onFinalFailure?.();
    } finally {
      restartInFlight = false;
    }
  };

  /**
   * ICE falló sin haber conectado nunca. Se dice tal cual y se cierra con
   * `ice_failed`, cuyo texto ya explica lo que hay que mirar: «no encontraron
   * un camino de red, ni siquiera por el relay; lo normal es un cortafuegos
   * restrictivo en alguno de los dos lados».
   *
   * El cierre lo manda este helper y no el llamador para que el motivo llegue
   * a la auditoría aunque el panel se desmonte: el backend escribe el PRIMER
   * cierre que recibe (`WHERE status IN ('pending','active')`), así que este
   * gana al `user_closed` de la limpieza.
   */
  const reportUnestablished = () => {
    try {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "close", sessionId, reason: "ice_failed" }));
      }
    } catch {
      /* el socket ya se fue; el motivo lo pondrá el barrido */
    }
    (onUnestablished || onFinalFailure)?.();
  };

  const handler = () => {
    if (disposed) return;
    const state = pc.iceConnectionState;
    if (state === "failed") {
      // Terminal. Don't wait — go straight to restart.
      clearGrace();
      if (!everConnected) {
        reportUnestablished();
        return;
      }
      tryRestart();
    } else if (state === "disconnected") {
      // Transient blip. Schedule a delayed restart; if iceState recovers
      // to connected/completed before the timer fires, the connected
      // branch below cancels the timer.
      if (pendingGraceTimer) return;
      pendingGraceTimer = setTimeout(() => {
        pendingGraceTimer = null;
        if (disposed) return;
        if (pc.iceConnectionState === "disconnected" ||
            pc.iceConnectionState === "failed") {
          if (!everConnected) {
            reportUnestablished();
            return;
          }
          tryRestart();
        }
      }, disconnectedGraceMs);
    } else if (state === "connected" || state === "completed") {
      clearGrace();
      attempts = 0;
      everConnected = true;
    }
  };

  pc.addEventListener("iceconnectionstatechange", handler);

  return () => {
    disposed = true;
    clearGrace();
    try {
      pc.removeEventListener("iceconnectionstatechange", handler);
    } catch {
      /* peer connection already torn down — nothing to remove */
    }
  };
}
