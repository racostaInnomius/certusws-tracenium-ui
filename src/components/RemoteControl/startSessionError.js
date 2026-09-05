// src/components/RemoteControl/startSessionError.js
//
// Por qué falló el arranque de una sesión, dicho para un operador.
//
// ⚠️ Esto vivía dentro del `catch` de RemoteControl.jsx y decidía mirando
// `msg.includes(...)` sobre el mensaje del error. Para los códigos con
// nombre eso es aceptable —"RCP_DEVICE_OFFLINE" no aparece por accidente
// en un texto—, pero una de las ramas buscaba la subcadena "501", y el
// mensaje de un fallo HTTP lleva el cuerpo entero: un identificador de
// equipo, un tamaño en bytes o una marca de tiempo que contuviera esos
// tres dígitos se leía como "capacidad no disponible". El operador recibía
// entonces una explicación tranquilizadora ("todavía no está disponible en
// este agente") de un error que era otra cosa, y dejaba de investigar.
//
// `api/http.js` ya adjunta al error el `status` numérico y un `code`
// extraído del cuerpo. Preguntarles no cuesta nada y no se equivoca; el
// texto se sigue mirando solo como respaldo, para un backend que aún no
// devuelva el código en el cuerpo.
//
// Vive aparte de la página porque una tabla de decisión se prueba, y el
// `catch` de un `useCallback` dentro de un componente no.

/**
 * @param {unknown} err   lo que lanzó `startSession`
 * @param {string} type   "shell" | "file" | "screen" — solo para el texto
 * @returns {{ severity: "info"|"warning"|"error", message: string }}
 */
export function describeStartSessionError(err, type) {
  const msg = String(err?.message || "");
  const code = String(err?.code || "");
  const status = Number(err?.status) || 0;

  // El código exacto, o —como respaldo— el nombre del código dentro del
  // mensaje. Nunca un número suelto: para eso está `status`.
  const is = (c) => code === c || msg.includes(c);

  if (status === 501 || is("RCP_PLUGIN_NOT_AVAILABLE")) {
    return {
      severity: "info",
      message: "This capability is not yet available on the selected agent."
    };
  }
  if (status === 403 || is("FORBIDDEN") || is("RCP_ADMIN_MASTER_REQUIRED")) {
    // M4 movió RCP al gate compartido requireRole("ADMIN","OWNER"), así que
    // el backend responde un FORBIDDEN pelado. El código antiguo se sigue
    // reconociendo porque un navegador puede estar hablando con un backend
    // que aún no se ha desplegado.
    return {
      severity: "warning",
      message: "You need the Admin or Owner role on this tenant to start a remote session."
    };
  }
  if (is("RCP_DEVICE_OFFLINE")) {
    return { severity: "error", message: "Device is not currently connected. Try again later." };
  }
  if (is("RCP_CAPABILITY_NOT_ADVERTISED")) {
    return {
      severity: "warning",
      message: `This device hasn't advertised rcp.${type} — check the agent's policy configuration.`
    };
  }
  if (is("RCP_TOO_MANY_SESSIONS")) {
    return {
      severity: "warning",
      message: "Too many concurrent sessions. Close one before starting another."
    };
  }
  return { severity: "error", message: `Failed to start session: ${msg || "unknown error"}` };
}

export default describeStartSessionError;
