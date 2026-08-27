import { describe, it, expect } from "vitest";
import { resolveActor, NO_ACTOR } from "./auditActor";

// Los valores de `peer` son los que hay en producción, no inventados:
// salieron de agrupar la columna en la control DB el 2026-08-27.
const PEER_REALES = [
  "189.203.174.69:28574",   // un peer de red de verdad
  "9",                      // así se veía un cambio de permisos de rol
  "2",
  "ops:enable-cdp-tls-probe", // una etiqueta de script de operaciones
  "ops:enable-cdp-cert-files",
];

describe("resolveActor", () => {
  it("prefiere el email cuando el backend lo resolvió", () => {
    const a = resolveActor({ actor_email: "javier.pacheco@certusitm.com", actor_subject: "35" });
    expect(a).toEqual({ label: "javier.pacheco@certusitm.com", subject: "35", known: true });
  });

  it("cae al subject cuando esa persona ya no es miembro del tenant", () => {
    // El email deja de resolver; el subject es el identificador durable y
    // sigue siendo lo citable en un ticket.
    expect(resolveActor({ actor_email: null, actor_subject: "35" }))
      .toEqual({ label: "35", subject: "35", known: true });
  });

  it("un evento de máquina no tiene actor, y eso se dice", () => {
    const a = resolveActor({ actor_email: null, actor_subject: null, device_id: "d-1" });
    expect(a.label).toBe(NO_ACTOR);
    expect(a.known).toBe(false);
  });

  it("⚠️ NUNCA usa `peer`, sea lo que sea lo que lleve dentro", () => {
    // La regla entera de este módulo. Si alguien "mejora" la columna
    // rellenando el hueco desde peer, la página vuelve a presentar una IP
    // o una etiqueta de script como si fuera una persona.
    for (const peer of PEER_REALES) {
      const a = resolveActor({ peer, actor_email: null, actor_subject: null });
      expect(a.label, peer).toBe(NO_ACTOR);
      expect(a.known, peer).toBe(false);
    }
  });

  it("tampoco lo usa cuando SÍ hay actor — no lo mezcla", () => {
    const a = resolveActor({ peer: "189.203.174.69:28574", actor_subject: "35" });
    expect(a.label).toBe("35");
  });

  it("trata el vacío y el espacio en blanco como ausencia", () => {
    // Un `actor_email` de cadena vacía llegaría del backend como columna
    // presente pero sin valor; imprimirlo dejaría la celda en blanco, que
    // se lee como "no cargó" en vez de como "no hay".
    for (const bad of ["", "   ", null, undefined]) {
      expect(resolveActor({ actor_email: bad, actor_subject: bad }).label).toBe(NO_ACTOR);
    }
  });

  it("tolera una fila ausente", () => {
    expect(resolveActor(undefined).label).toBe(NO_ACTOR);
    expect(resolveActor(null).known).toBe(false);
  });
});
