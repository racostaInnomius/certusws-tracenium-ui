// src/api/alerts.seenEvent.test.js
//
// "Mark all seen" avisa al badge, en vez de dejarlo esperando al sondeo.
//
// El badge del Topbar vive en otro componente y se refresca cada 60 s. Aunque
// el contador del servidor ya sea correcto, sin este aviso pulsar el botón no
// cambiaba nada en pantalla durante hasta un minuto — que es exactamente como
// se ve un botón que no funciona, y era la mitad de la queja.

import { afterEach, describe, expect, it, vi } from "vitest";

const post = vi.fn(async () => ({ ok: true, lastSeenAt: "2026-09-08T12:00:00.000Z" }));
vi.mock("./http", () => ({
  httpGetJson: vi.fn(async () => ({})),
  httpPostJson: (...a) => post(...a),
  httpPatchJson: vi.fn(async () => ({})),
  httpDeleteJson: vi.fn(async () => ({})),
}));

import { ALERTS_SEEN_EVENT, markAllAlertsSeen } from "./alerts";

afterEach(() => vi.clearAllMocks());

describe("markAllAlertsSeen", () => {
  it("dispara el evento que hace recontar al badge", async () => {
    const visto = vi.fn();
    window.addEventListener(ALERTS_SEEN_EVENT, visto);

    await markAllAlertsSeen();

    expect(post).toHaveBeenCalledWith("/api/v1/alerts/mark-all-seen", {});
    expect(visto).toHaveBeenCalledTimes(1);
    window.removeEventListener(ALERTS_SEEN_EVENT, visto);
  });

  it("no avisa si el servidor rechazó: el cursor no se movió", async () => {
    // Avisar igualmente pondría el badge a cero enseñando algo que no ocurrió,
    // y el operador se quedaría creyendo que marcó lo que no marcó.
    post.mockRejectedValueOnce(new Error("boom"));
    const visto = vi.fn();
    window.addEventListener(ALERTS_SEEN_EVENT, visto);

    await expect(markAllAlertsSeen()).rejects.toThrow("boom");

    expect(visto).not.toHaveBeenCalled();
    window.removeEventListener(ALERTS_SEEN_EVENT, visto);
  });
});
