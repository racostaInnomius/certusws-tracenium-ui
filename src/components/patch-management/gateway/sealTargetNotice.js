// src/components/patch-management/gateway/sealTargetNotice.js
//
// ADR-0013 (F) — qué se le enseña al admin antes de sellar, y cuándo NO se le
// deja sellar.
//
// ── Por qué la casilla de siempre no bastaba ────────────────────────
//
// El diálogo lleva desde ADR-0001 pidiendo confirmar una huella «comparándola
// con la que muestra el propio equipo del gateway». Eso es el modelo de SSH, y
// funciona cuando hay dónde mirar. Aquí, en la práctica, casi nadie va al
// servidor a compararla: la casilla se marca porque hay que marcarla.
//
// Lo que la vuelve real es recordar. La primera vez se fija la huella; a partir
// de ahí el sistema —no la memoria de una persona— nota si cambia. Un cambio
// deja de ser invisible y pasa a ser algo que alguien tiene que aprobar
// mirando las dos.
//
// ⚠️ Esto es presentación. La comprobación de verdad vive en el servidor
// (`gateway-seal-target.ts`), porque el paso que sostiene el mecanismo es
// NEGARSE a sellar, y una UI con un bug no debe poder saltárselo. Lo de aquí
// existe para que la persona tenga con qué decidir, no para hacer cumplir nada.

/**
 * Cómo presentar el certificado contra el que se va a sellar.
 *
 * Devuelve null cuando no hay nada que decir — el caso normal, donde la huella
 * de siempre y su casilla bastan.
 */
export function describeSealTarget(certInfo) {
  if (!certInfo) return null;

  const pinned = certInfo.pinnedFingerprintSha256 || null;
  const current = certInfo.certFingerprintSha256 || null;

  // El caso que (F) existe para atrapar. Va primero: si la huella cambió, eso
  // es lo único que importa de esta pantalla.
  if (certInfo.fingerprintChanged && pinned && current) {
    return {
      kind: "fingerprint_changed",
      tone: "error",
      requiresChangeConfirmation: true,
      pinned,
      current,
      title: "This gateway is presenting a different certificate",
      body:
        "The last credential for this gateway was sealed to another certificate. " +
        "That is expected if the gateway host was rebuilt or replaced — and it is " +
        "what an impersonation would also look like. Confirm with whoever " +
        "administers the host before continuing.",
    };
  }

  // Reserva de la ventana de despliegue: el agente aún no ha publicado su clave
  // dedicada. Merece decirse, porque en Windows sellar contra la de
  // enrolamiento produce un sobre que el equipo no puede abrir.
  if (certInfo.source === "enrollment") {
    return {
      kind: "awaiting_dedicated_key",
      tone: "warning",
      requiresChangeConfirmation: false,
      current,
      title: "This gateway has not published its credential key yet",
      body:
        "It is still using its enrollment certificate. On Windows that certificate " +
        "cannot open a sealed credential, so the gateway will report the credential " +
        "as undeliverable. Update the agent on the gateway host first.",
    };
  }

  return null;
}

/**
 * ¿Se puede pulsar «Seal and send»?
 *
 * Dos confirmaciones DISTINTAS, y no se colapsan a propósito: una dice «esta
 * huella es la del equipo» y la otra dice «sé que cambió respecto a la
 * anterior». Reutilizar la primera para lo segundo convertiría un clic ya
 * rutinario en la aprobación de algo que nadie miró.
 */
export function canSubmitCredential({
  certInfo,
  username,
  password,
  confirmedIdentity,
  confirmedChange,
  submitting,
}) {
  if (!certInfo || !username || !password || !confirmedIdentity || submitting) return false;
  const notice = describeSealTarget(certInfo);
  if (notice?.requiresChangeConfirmation && !confirmedChange) return false;
  return true;
}

/**
 * El servidor también rechaza, y por buenas razones que la carga inicial no
 * podía conocer: el certificado pudo cambiar entre abrir el diálogo y enviar.
 *
 * Se traduce a algo accionable en lugar de enseñar el código. `pinned` y
 * `current` vienen en el cuerpo justamente para poder compararlas aquí.
 */
export function describeProvisionError(body) {
  switch (body?.error) {
    case "fingerprint_changed":
      return {
        tone: "error",
        title: "The certificate changed while this dialog was open",
        body:
          "Nothing was sent. Close and reopen this dialog to review the new " +
          "fingerprint before sealing anything to it.",
        pinned: body.pinned || null,
        current: body.current || null,
      };
    case "stale_seal_target":
      return {
        tone: "warning",
        title: "This page is out of date",
        body:
          "The credential was sealed against a certificate this gateway no longer " +
          "presents. Nothing was sent. Reload and enter it again.",
      };
    default:
      return null;
  }
}

/**
 * ¿El fallo de carga es «el equipo todavía no ha aparecido»?
 *
 * Es un estado legítimo y frecuente —designar un gateway con la máquina
 * apagada— y no un error. Presentarlo en rojo manda a alguien a buscar una
 * avería que no existe.
 */
export function isAwaitingDevice(err) {
  return err?.body?.error === "no_device_certificate";
}
