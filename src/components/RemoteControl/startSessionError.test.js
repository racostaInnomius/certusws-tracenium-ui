// src/components/RemoteControl/startSessionError.test.js
//
// El caso que importa está en el primer describe: un error que NO es un 501
// pero cuyo texto contiene "501". Antes se leía como "capacidad no
// disponible" y el operador dejaba de investigar un fallo real.

import { describe, it, expect } from "vitest";
import { describeStartSessionError } from "./startSessionError";

/** Lo que construye api/http.js al fallar una respuesta. */
function httpError(status, body) {
  const text = JSON.stringify(body);
  const err = new Error(`HTTP ${status}: ${text}`);
  err.status = status;
  err.body = body;
  err.code = body?.error?.code || body?.code || `HTTP_${status}`;
  return err;
}

describe("⚠️ un 501 es un status, no una subcadena", () => {
  it("un 500 cuyo cuerpo contiene 501 NO se disfraza de capacidad ausente", () => {
    // Un identificador de equipo, un tamaño en bytes o una marca de tiempo
    // con esos tres dígitos entra en el mensaje: el cuerpo entero va dentro.
    const err = httpError(500, {
      code: "INTERNAL",
      message: "signalling failed for device d-4501-a"
    });
    const out = describeStartSessionError(err, "shell");

    expect(out.severity).toBe("error");
    expect(out.message).toContain("Failed to start session");
    expect(out.message).not.toContain("not yet available");
  });

  it("un 501 de verdad sí lo es", () => {
    const out = describeStartSessionError(httpError(501, { code: "NOT_IMPLEMENTED" }), "file");
    expect(out).toEqual({
      severity: "info",
      message: "This capability is not yet available on the selected agent."
    });
  });

  it("y el código con nombre también, sin depender del status", () => {
    // Un backend antiguo puede contestar 400 con el código en el cuerpo.
    const out = describeStartSessionError(
      httpError(400, { code: "RCP_PLUGIN_NOT_AVAILABLE" }),
      "screen"
    );
    expect(out.severity).toBe("info");
  });
});

describe("el resto de la tabla", () => {
  it("403 pide el rol aunque el cuerpo no traiga código", () => {
    const out = describeStartSessionError(httpError(403, { message: "nope" }), "shell");
    expect(out.severity).toBe("warning");
    expect(out.message).toContain("Admin or Owner role");
  });

  it("sigue reconociendo el código antiguo de admin_master", () => {
    // Un navegador cargado puede estar hablando con un backend anterior a M4.
    const out = describeStartSessionError(
      httpError(400, { code: "RCP_ADMIN_MASTER_REQUIRED" }),
      "shell"
    );
    expect(out.message).toContain("Admin or Owner role");
  });

  it("equipo desconectado", () => {
    const out = describeStartSessionError(httpError(409, { code: "RCP_DEVICE_OFFLINE" }), "shell");
    expect(out).toEqual({
      severity: "error",
      message: "Device is not currently connected. Try again later."
    });
  });

  it("capacidad no anunciada nombra la que se pidió", () => {
    const out = describeStartSessionError(
      httpError(409, { code: "RCP_CAPABILITY_NOT_ADVERTISED" }),
      "screen"
    );
    expect(out.message).toContain("rcp.screen");
  });

  it("demasiadas sesiones", () => {
    const out = describeStartSessionError(
      httpError(429, { code: "RCP_TOO_MANY_SESSIONS" }),
      "shell"
    );
    expect(out.severity).toBe("warning");
    expect(out.message).toContain("Close one");
  });

  it("un error sin forma de HTTP no revienta ni miente", () => {
    // Un fallo de red llega como TypeError, sin status ni code.
    const out = describeStartSessionError(new TypeError("Failed to fetch"), "shell");
    expect(out.severity).toBe("error");
    expect(out.message).toBe("Failed to start session: Failed to fetch");
  });

  it("ni siquiera un null", () => {
    const out = describeStartSessionError(null, "shell");
    expect(out.message).toBe("Failed to start session: unknown error");
  });
});
