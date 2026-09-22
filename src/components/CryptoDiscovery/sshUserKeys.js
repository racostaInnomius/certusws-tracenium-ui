// src/components/CryptoDiscovery/sshUserKeys.js
//
// Ola 1.4 — cómo se LEE una clave SSH de usuario. Puro, sin React: la
// semántica que sigue es la que un componente no debe improvisar, y así hay
// un sitio donde los tests la fijan.
//
// ── ⚠️ La regla que no se puede romper ───────────────────────────────
//
// El agente recoge con un alcance (`detail.mode`), y en el defecto
// —`public-only`, porque abrir `~/.ssh/id_*` dispara detecciones de acceso
// a credenciales en los EDR— NO abre las claves privadas: sólo hace `stat`.
// Ahí `encrypted: null` significa «no se miró», no «no está cifrada».
//
// Pintar «unencrypted» sobre eso sería inventarse un hallazgo de seguridad
// en el informe de un cliente: alguien iría a buscar una clave sin
// passphrase que nunca se comprobó. El modo viaja con cada fila justamente
// para que nadie tenga que adivinarlo, y `encryptionState` es el único
// camino por el que la UI llega a esa palabra.

/** Los tres `detail.kind` que el backend escribe. */
export const SSH_KEY_KINDS = ["authorized", "public", "private"];

export const SSH_KIND_LABEL = {
  authorized: "Authorized — grants access to this account",
  public: "Public — a key this user holds",
  private: "Private — a key file present on the device"
};

/**
 * Por qué una clave se considera heredada. El juicio lo hace el backend
 * (`sshKeyLegacyReason`), con umbrales citados; aquí sólo se nombra.
 */
export const SSH_LEGACY_REASON = {
  dsa_removed_from_openssh: "DSA — OpenSSH disabled it by default in 7.0 and removed the code in 10.0",
  rsa_below_3072: "RSA under 3072 bits — NIST SP 800-57 accepts 2048 only through 2030"
};

export function sshLegacyLabel(reason) {
  if (!reason) return null;
  return SSH_LEGACY_REASON[reason] ?? reason;
}

/**
 * Un activo `origin = 'ssh-user'` tal como lo necesita la vista.
 *
 * Los campos viven en `detail` (jsonb). Se acepta también un objeto ya
 * aplanado para que el que llame pueda pasar lo que quiera: lo que NO se
 * hace es rellenar un hueco con un valor por defecto — un campo ausente
 * sale `null` y se pinta como «—».
 */
export function readSshUserKey(item) {
  const d = item && typeof item === "object" ? (item.detail && typeof item.detail === "object" ? item.detail : item) : {};
  const kind = SSH_KEY_KINDS.includes(d.kind) ? d.kind : null;
  return {
    assetId: item?.assetId ?? null,
    kind,
    user: typeof d.user === "string" && d.user ? d.user : null,
    path: typeof d.path === "string" && d.path ? d.path : null,
    keyType: d.keyType ?? null,
    algorithm: item?.algorithmName ?? d.algorithm ?? null,
    bits: Number.isInteger(item?.keySizeBits) ? item.keySizeBits : Number.isInteger(d.bits) ? d.bits : null,
    curve: d.curve ?? null,
    fingerprintSha256: d.fingerprintSha256 ?? null,
    comment: d.comment ?? null,
    options: Array.isArray(d.options) ? d.options : [],
    legacyReason: d.legacyReason ?? null,
    // Sólo las concesiones (`authorized`) pueden estar restringidas o no;
    // en las demás el backend manda `null` y eso NO es «sin restringir».
    unrestricted: typeof d.unrestricted === "boolean" ? d.unrestricted : null,
    agentId: d.agentId ?? null,
    // Sólo en las privadas: metadatos de `stat`.
    format: d.format ?? null,
    encrypted: typeof d.encrypted === "boolean" ? d.encrypted : null,
    readable: d.readable !== false,
    mode: typeof d.mode === "string" ? d.mode : null,
    filePermissions: d.filePermissions ?? null,
    sizeBytes: Number.isInteger(d.sizeBytes) ? d.sizeBytes : null,
    modifiedAt: d.modifiedAt ?? null,
    publicHalfPath: d.publicHalfPath ?? null,
    lastSeen: item?.lastSeen ?? null
  };
}

/** ¿Trae esta fila el `detail` que la vista necesita? */
export function isSshUserKey(item) {
  return readSshUserKey(item).kind !== null;
}

/**
 * ⚠️ El estado de cifrado de una clave PRIVADA, con su procedencia.
 *
 *   `encrypted`      → se abrió y tiene passphrase.
 *   `unencrypted`    → se abrió y NO la tiene. Es un hallazgo real.
 *   `not-evaluated`  → NO SE MIRÓ. Es lo que devuelve el modo por defecto,
 *                      y jamás puede leerse como «sin cifrar».
 *   `unreadable`     → se intentó y el fichero no se pudo leer.
 *
 * `tone`: `neutral` para lo no evaluado — ni verde ni rojo. Que se
 * distinga de «bien» es el punto entero.
 */
export function encryptionState(key) {
  const k = key || {};
  if (k.kind !== "private") return null;
  if (k.readable === false) {
    return {
      state: "unreadable",
      label: "Not readable",
      tone: "neutral",
      hint: "The agent could not read this file — permissions, most likely. Nothing is claimed about its contents."
    };
  }
  if (k.encrypted === true) {
    return { state: "encrypted", label: "Encrypted", tone: "good", hint: "The key file is protected with a passphrase." };
  }
  if (k.encrypted === false) {
    return {
      state: "unencrypted",
      label: "Not encrypted",
      tone: "bad",
      hint: "The key file was opened and carries no passphrase: anyone who reads the file can use the key."
    };
  }
  // encrypted == null. El modo decide qué se puede AFIRMAR.
  const publicOnly = k.mode === "public-only" || k.mode == null;
  return {
    state: "not-evaluated",
    label: "Not evaluated",
    tone: "neutral",
    hint: publicOnly
      ? "Not looked at. In public-only mode — the default — the agent never opens a private key file, so whether it has a passphrase is unknown. This is NOT the same as unencrypted."
      : "The collector returned no verdict for this file. Unknown, not unencrypted."
  };
}

/** Los filtros de la vista, aplicados en el cliente sobre las filas leídas. */
export function filterSshUserKeys(keys, filter = {}) {
  const { kind, legacyReason, unrestricted, user, search } = filter;
  const q = String(search ?? "").trim().toLowerCase();
  return (Array.isArray(keys) ? keys : []).filter((k) => {
    if (kind && k.kind !== kind) return false;
    // `legacyReason: "any"` = cualquier motivo; un motivo concreto = ése.
    if (legacyReason === "any" && !k.legacyReason) return false;
    if (legacyReason && legacyReason !== "any" && k.legacyReason !== legacyReason) return false;
    // Sólo `true` filtra: `unrestricted === null` (no aplica) no es «sin
    // restringir», así que nunca cae en este cubo.
    if (unrestricted === true && k.unrestricted !== true) return false;
    if (user && k.user !== user) return false;
    if (q) {
      const hay = [k.user, k.path, k.comment, k.fingerprintSha256, k.keyType].filter(Boolean).join(" ").toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

/** Los valores presentes, para poblar el desplegable de usuario. */
export function sshUserOptions(keys) {
  return [...new Set((Array.isArray(keys) ? keys : []).map((k) => k.user).filter(Boolean))].sort();
}

/** `1234` → `1.2 KB`. `null` no se inventa: se queda en null. */
export function formatBytes(n) {
  if (!Number.isFinite(n)) return null;
  if (n < 1024) return `${n} B`;
  return `${(n / 1024).toFixed(1)} KB`;
}
