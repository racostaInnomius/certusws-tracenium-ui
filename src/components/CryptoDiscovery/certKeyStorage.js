// src/components/CryptoDiscovery/certKeyStorage.js
//
// Ola 1.1 — la profundidad del inventario que el backend ya recogía y
// nadie enseñaba: dónde vive la clave privada, si se puede sacar de ahí, y
// qué se sabe de la cadena en ESE equipo.
//
// ── ⚠️ La regla que no se puede romper ───────────────────────────────
//
// Que un certificado no llegue a una raíz de confianza NO es un hallazgo
// en Windows. El almacén de raíces se rellena BAJO DEMANDA: una raíz
// legítima que el equipo aún no ha necesitado sencillamente no está, y el
// mismo certificado da `trusted: false` hoy y `true` mañana sin que nadie
// toque nada. Por eso el backend no emite bandera para eso —sólo se puede
// filtrar (`chain=untrusted`)— y por eso aquí nunca va en rojo. Pintarlo
// como problema llenaría el informe de un cliente de falsos positivos que
// se arreglan solos.
//
// Lo que SÍ es un hallazgo, y el backend sí abandera:
//   `store_chain_incomplete`    el emisor no está en el equipo;
//   `store_chain_bad_signature` la firma no cuadra con el emisor que dice.

/**
 * ¿Se puede sacar la clave privada del equipo?
 *
 * Tres estados. `null` es «no consta», y el backend sólo escribe este campo
 * cuando hay clave privada: sin ella, la pregunta no se hace.
 */
export function keyExportableState(value) {
  if (value === true) {
    return {
      state: "exportable",
      label: "Exportable",
      tone: "warn",
      hint: "The private key can be exported off this device. Whether that is acceptable is your policy's call — this is the fact."
    };
  }
  if (value === false) {
    return {
      state: "non-exportable",
      label: "Non-exportable",
      tone: "good",
      hint: "The private key is marked non-exportable: it cannot be copied out through the normal interfaces."
    };
  }
  return {
    state: "unknown",
    label: "Exportability unknown",
    tone: "neutral",
    hint: "Nothing was recorded about whether this key can be exported. Unknown — not «non-exportable»."
  };
}

/**
 * Dónde vive la clave privada.
 *
 * ⚠️ `null` y `"unknown"` NO son lo mismo y por eso no comparten etiqueta:
 * `null` es «no consta» (sin clave privada, un agente antiguo, macOS), y
 * `"unknown"` es el agente diciendo expresamente que miró y no lo sabe.
 * Ninguno de los dos es un veredicto, así que los dos van en neutro.
 */
export const KEY_STORAGE = {
  software: { label: "Software", tone: "warn", hint: "The key sits in a software store: a file the OS protects, but still a file." },
  tpm: { label: "TPM", tone: "good", hint: "The key is held by the device's TPM and cannot leave the chip." },
  smartcard: { label: "Smart card", tone: "good", hint: "The key is held on a smart card or token." },
  unknown: { label: "Storage unknown", tone: "neutral", hint: "The agent looked and could not tell where this key is held." }
};

export function keyStorageState(value) {
  if (value == null) {
    return {
      state: "not-recorded",
      label: "Storage not recorded",
      tone: "neutral",
      hint: "Nothing came back about where this key is held. Older agents and macOS do not report it, and it is never recorded for a certificate with no private key."
    };
  }
  const meta = KEY_STORAGE[value];
  if (!meta) return { state: String(value), label: String(value), tone: "neutral", hint: "A storage kind this build does not know about." };
  return { state: value, label: meta.label, tone: meta.tone, hint: meta.hint };
}

/** El campo de la LISTA es `keyStorages` (plural): un cert en N equipos. */
export function keyStorageSummary(keyStorages) {
  const list = Array.isArray(keyStorages) ? keyStorages.filter((s) => typeof s === "string" && s) : [];
  if (list.length === 0) return null;
  return list.map(keyStorageState);
}

/**
 * ⚠️ Lo que se sabe de la cadena EN ESTE EQUIPO.
 *
 * `chain` entero a `null` = no se evaluó (un extremo de red nunca lo trae).
 * Y dentro, `signatureValid` y `trusted` son OPCIONALES: cuando el agente
 * no los afirma, la clave NO ESTÁ. `undefined` es «no se afirmó», jamás
 * `false` — sólo `issuerFound` viene siempre.
 *
 * Devuelve una lista de hechos, cada uno con su tono. `trusted: false` sale
 * en neutro A PROPÓSITO (ver la cabecera del fichero).
 */
export function chainFacts(chain) {
  if (!chain || typeof chain !== "object") return null;
  const facts = [];

  if (chain.issuerFound === true) {
    facts.push({ key: "issuerFound", label: "issuer on the device", tone: "good", hint: "The certificate that signed this one is present in a store on this device." });
  } else if (chain.issuerFound === false) {
    facts.push({
      key: "issuerFound",
      label: "issuer not on the device",
      tone: "warn",
      hint: "The issuer of this certificate is not on the device. Anything validating the chain locally has to fetch it or will fail."
    });
  }

  if (chain.signatureValid === true) {
    facts.push({ key: "signatureValid", label: "signature checks out", tone: "good", hint: "The signature verifies against the issuer found on this device." });
  } else if (chain.signatureValid === false) {
    facts.push({
      key: "signatureValid",
      label: "signature does not match its issuer",
      tone: "bad",
      hint: "The signature does not match the issuer this certificate claims. That is not a configuration gap — the two do not belong together."
    });
  }

  if (chain.trusted === true) {
    facts.push({ key: "trusted", label: "chains to a trusted root", tone: "good", hint: "The chain reaches a root this device trusts." });
  } else if (chain.trusted === false) {
    facts.push({
      key: "trusted",
      // ⚠️ Ni «untrusted» ni rojo. En Windows el almacén de raíces se
      // rellena bajo demanda, así que esto cambia solo.
      label: "no trusted root reached yet",
      tone: "neutral",
      hint: "The chain did not reach a root this device trusts. On Windows that is routinely temporary — the root store is populated on demand, so a legitimate root the machine has not needed yet is simply absent. This is a lens for looking, not a finding."
    });
  }

  return facts;
}

/** ¿Trae este `chain` algo que el agente NO afirmó? */
export function chainNotAsserted(chain) {
  if (!chain || typeof chain !== "object") return [];
  const missing = [];
  if (typeof chain.signatureValid !== "boolean") missing.push("signatureValid");
  if (typeof chain.trusted !== "boolean") missing.push("trusted");
  return missing;
}

/** Las dos banderas de cadena de la ola 1.1, dichas en una frase. */
export const STORE_CHAIN_FLAG_LABELS = {
  store_chain_incomplete: "The issuer of this certificate is not on the device",
  store_chain_bad_signature: "The signature does not match the issuer it claims"
};

/**
 * Las lentes de cadena de la lista. `untrusted` está aquí y NO entre las
 * banderas por la razón de la cabecera: se puede mirar, no se puede acusar.
 */
export const CHAIN_FILTER_LABELS = {
  incomplete: "Issuer missing from the device",
  bad_signature: "Signature does not match its issuer",
  untrusted: "No trusted root reached (not a finding)"
};
