// src/components/patch-management/gateway/sealTargetNotice.test.js
//
// ADR-0013 (F) — lo que el admin ve antes de sellar una credencial de vSphere.
//
// El modo de fallo que esto defiende no deja rastro: alguien sustituye el
// certificado, el admin sella hacia una clave ajena, y la pantalla dice que
// todo fue bien. La casilla de siempre no lo atrapa — pide comparar con «la
// huella que muestra el equipo del gateway», y casi nadie va al servidor a
// mirarla; se marca porque hay que marcarla.
//
// Lo que lo atrapa es recordar la huella anterior y enseñar las dos.

import { describe, it, expect } from "vitest";
import {
  describeSealTarget,
  canSubmitCredential,
  describeProvisionError,
  isAwaitingDevice,
} from "./sealTargetNotice";

const A = "a".repeat(64);
const B = "b".repeat(64);

const certInfo = (over = {}) => ({
  certPem: "PEM",
  certFingerprintSha256: A,
  source: "gateway_key",
  pinnedFingerprintSha256: A,
  fingerprintChanged: false,
  ...over,
});

const submitArgs = (over = {}) => ({
  certInfo: certInfo(),
  username: "svc@vsphere.local",
  password: "x",
  confirmedIdentity: true,
  confirmedChange: false,
  submitting: false,
  ...over,
});

describe("el caso normal no molesta", () => {
  it("no dice nada cuando la huella es la de siempre", () => {
    expect(describeSealTarget(certInfo())).toBeNull();
  });

  it("tampoco en la primera vez, cuando no hay nada fijado", () => {
    expect(
      describeSealTarget(certInfo({ pinnedFingerprintSha256: null }))
    ).toBeNull();
  });

  it("deja enviar", () => {
    expect(canSubmitCredential(submitArgs())).toBe(true);
  });
});

describe("⭐ el certificado cambió respecto al aprobado", () => {
  const changed = certInfo({
    certFingerprintSha256: B,
    pinnedFingerprintSha256: A,
    fingerprintChanged: true,
  });

  it("lo dice en rojo y con las DOS huellas", () => {
    // Enseñar solo la nueva no sirve: sin la anterior no hay nada que comparar.
    const n = describeSealTarget(changed);
    expect(n.tone).toBe("error");
    expect(n.pinned).toBe(A);
    expect(n.current).toBe(B);
  });

  it("nombra las dos lecturas posibles en vez de acusar", () => {
    // Reconstruir el host es legítimo y frecuente. Una alarma que solo grita
    // «ataque» se aprende a ignorar.
    const n = describeSealTarget(changed);
    expect(n.body).toMatch(/rebuilt or replaced/i);
    expect(n.body).toMatch(/impersonation/i);
  });

  it("BLOQUEA el envío hasta que alguien lo aprueba aparte", () => {
    // El paso que sostiene todo lo demás. Si se pudiera sellar igual,
    // enseñar las huellas sería decoración.
    expect(canSubmitCredential(submitArgs({ certInfo: changed }))).toBe(false);
  });

  it("deja enviar cuando se aprueba explícitamente", () => {
    expect(
      canSubmitCredential(submitArgs({ certInfo: changed, confirmedChange: true }))
    ).toBe(true);
  });

  it("la confirmación del cambio NO sustituye a la de identidad", () => {
    // Son dos afirmaciones distintas: «esta huella es la del equipo» y «sé que
    // cambió». Colapsarlas convertiría un clic rutinario en la aprobación de
    // algo que nadie miró.
    expect(
      canSubmitCredential(submitArgs({
        certInfo: changed,
        confirmedIdentity: false,
        confirmedChange: true,
      }))
    ).toBe(false);
  });
});

describe("el gateway aún no publicó su clave dedicada", () => {
  const enrolment = certInfo({ source: "enrollment", pinnedFingerprintSha256: null });

  it("avisa de que en Windows el sobre no se podrá abrir", () => {
    // Vale la pena decirlo antes: si no, el admin escribe la contraseña, la
    // envía, y se entera media hora después por la columna de salud.
    const n = describeSealTarget(enrolment);
    expect(n.kind).toBe("awaiting_dedicated_key");
    expect(n.body).toMatch(/Windows/);
  });

  it("avisa, pero no bloquea", () => {
    // En Linux y macOS funciona. Bloquear aquí rompería gateways que están
    // perfectamente bien durante la ventana de despliegue.
    expect(canSubmitCredential(submitArgs({ certInfo: enrolment }))).toBe(true);
  });

  it("un cambio de huella manda sobre este aviso", () => {
    const both = certInfo({
      source: "enrollment",
      certFingerprintSha256: B,
      pinnedFingerprintSha256: A,
      fingerprintChanged: true,
    });
    expect(describeSealTarget(both).kind).toBe("fingerprint_changed");
  });
});

describe("el servidor también rechaza", () => {
  it("traduce un cambio ocurrido con el diálogo abierto", () => {
    // La carrera real: el diálogo cargó una huella y el agente republicó antes
    // de enviar.
    const d = describeProvisionError({ error: "fingerprint_changed", pinned: A, current: B });
    expect(d.tone).toBe("error");
    expect(d.pinned).toBe(A);
    expect(d.current).toBe(B);
    // Lo primero que necesita saber quien lo lee.
    expect(d.body).toMatch(/Nothing was sent/i);
  });

  it("trata una pestaña vieja como lo que es, no como un ataque", () => {
    const d = describeProvisionError({ error: "stale_seal_target" });
    expect(d.tone).toBe("warning");
    expect(d.body).toMatch(/Reload/i);
  });

  it("deja pasar los errores que no sabe traducir", () => {
    // Para que el mensaje del servidor, más específico, no se pierda.
    expect(describeProvisionError({ error: "validation_error" })).toBeNull();
    expect(describeProvisionError(undefined)).toBeNull();
  });
});

describe("esperar al equipo no es un error", () => {
  it("reconoce el caso de designar un gateway apagado", () => {
    expect(isAwaitingDevice({ body: { error: "no_device_certificate" } })).toBe(true);
  });

  it("no confunde otros fallos con espera", () => {
    expect(isAwaitingDevice({ body: { error: "not_found" } })).toBe(false);
    expect(isAwaitingDevice(new Error("network"))).toBe(false);
  });
});
