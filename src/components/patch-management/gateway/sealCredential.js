// src/components/patch-management/gateway/sealCredential.js
//
// Seals a vCenter credential IN THE BROWSER against the gateway's public key.
//
// This is the whole security argument of the feature: the control plane relays
// a blob it holds no private key for, so it cannot read the credential even if
// it wanted to. The guarantee is cryptographic, not a promise about logging.
// Nothing here may ever send, log, or store the plaintext. See ADR-0001 (C).
//
// Hybrid construction, matching the agent's reference implementation byte for
// byte (agent-w/src/connectors/vcenter/envelope.ts):
//
//   AES-256-GCM encrypts the payload   ← RSA-2048/OAEP can only wrap ~190 bytes,
//   RSA-OAEP-SHA256 wraps the AES key    which a long password can exceed.
//
// The certificate fingerprint travels in the clear (so the gateway can tell a
// STALE envelope from a corrupt one) and is bound as GCM additional
// authenticated data (so it cannot be rewritten without breaking auth).

export const ENVELOPE_VERSION = 1;
export const ENVELOPE_ALG = "RSA-OAEP-256+A256GCM";

/** base64url, no padding — RFC 4648 §5. Standard base64 would not interop. */
function toBase64Url(bytes) {
  let bin = "";
  const arr = new Uint8Array(bytes);
  for (let i = 0; i < arr.length; i++) bin += String.fromCharCode(arr[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Strip the PEM armour and decode the DER body. */
export function pemToDer(pem, label = "CERTIFICATE") {
  const re = new RegExp(`-----BEGIN ${label}-----([\\s\\S]*?)-----END ${label}-----`);
  const m = String(pem || "").match(re);
  if (!m) throw new Error(`PEM block ${label} not found`);
  const b64 = m[1].replace(/\s+/g, "");
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Lowercase hex SHA-256 of the certificate DER — the value shown for comparison. */
export async function certFingerprint(certPem, subtle = globalThis.crypto?.subtle) {
  const der = pemToDer(certPem);
  const digest = await subtle.digest("SHA-256", der);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Group a hex fingerprint into AB:CD:… for human comparison. */
export function formatFingerprint(hex) {
  return String(hex || "")
    .toUpperCase()
    .replace(/[^0-9A-F]/g, "")
    .match(/../g)
    ?.join(":") ?? "";
}

/**
 * Extract the RSA public key from an X.509 certificate.
 *
 * WebCrypto cannot import a certificate directly, only a SubjectPublicKeyInfo,
 * so we locate the SPKI inside the DER. Rather than write an ASN.1 parser, we
 * find the RSA algorithm identifier and take the SubjectPublicKeyInfo SEQUENCE
 * that contains it — the certificate is the only place that OID appears in this
 * position, and importKey verifies the result, so a wrong guess fails loudly
 * instead of silently encrypting to nothing.
 */
export async function publicKeyFromCert(certPem, subtle = globalThis.crypto?.subtle) {
  const der = pemToDer(certPem);

  // OID 1.2.840.113549.1.1.1 (rsaEncryption), DER-encoded.
  const RSA_OID = [0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01];
  let oidAt = -1;
  outer: for (let i = 0; i + RSA_OID.length <= der.length; i++) {
    for (let j = 0; j < RSA_OID.length; j++) {
      if (der[i + j] !== RSA_OID[j]) continue outer;
    }
    oidAt = i;
    break;
  }
  if (oidAt < 0) throw new Error("certificate does not carry an RSA public key");

  // Walk back to the SEQUENCE header that opens the SubjectPublicKeyInfo. It
  // sits a few bytes before the AlgorithmIdentifier SEQUENCE that holds the OID.
  for (let start = oidAt; start >= 0 && start > oidAt - 32; start--) {
    if (der[start] !== 0x30) continue; // SEQUENCE tag
    for (const spki of candidateSpki(der, start)) {
      try {
        return await subtle.importKey(
          "spki",
          spki,
          { name: "RSA-OAEP", hash: "SHA-256" },
          false,
          ["encrypt"]
        );
      } catch {
        /* not this SEQUENCE — keep looking */
      }
    }
  }
  throw new Error("could not extract the public key from the gateway certificate");
}

/** Yield the DER slice for the SEQUENCE starting at `start`, if it is well-formed. */
function* candidateSpki(der, start) {
  const lenByte = der[start + 1];
  if (lenByte === undefined) return;
  let headerLen;
  let length;
  if (lenByte < 0x80) {
    headerLen = 2;
    length = lenByte;
  } else {
    const n = lenByte & 0x7f;
    if (n < 1 || n > 4) return;
    headerLen = 2 + n;
    length = 0;
    for (let k = 0; k < n; k++) length = (length << 8) | der[start + 2 + k];
  }
  const end = start + headerLen + length;
  if (end <= der.length && length > 0) yield der.slice(start, end);
}

/**
 * Seal `{ username, password }` against the gateway certificate.
 *
 * Returns the wire envelope. The plaintext never leaves this function.
 */
export async function sealCredential(
  credential,
  certPem,
  { subtle = globalThis.crypto?.subtle, getRandomValues } = {}
) {
  if (!subtle) {
    // WebCrypto is only exposed on secure origins. Without it we CANNOT seal,
    // and we must not fall back to sending plaintext.
    throw new Error(
      "Web Crypto is unavailable — the page must be served over HTTPS to configure a gateway credential"
    );
  }
  const username = String(credential?.username ?? "");
  const password = String(credential?.password ?? "");
  if (!username || !password) throw new Error("username and password are required");

  const rand =
    getRandomValues ?? ((arr) => globalThis.crypto.getRandomValues(arr));

  const publicKey = await publicKeyFromCert(certPem, subtle);
  const fingerprint = await certFingerprint(certPem, subtle);

  const aesKey = await subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt"]);
  const iv = rand(new Uint8Array(12));

  const plaintext = new TextEncoder().encode(JSON.stringify({ username, password }));
  const sealed = await subtle.encrypt(
    {
      name: "AES-GCM",
      iv,
      // Bind the fingerprint so it cannot be swapped without failing auth.
      additionalData: new TextEncoder().encode(fingerprint),
      tagLength: 128,
    },
    aesKey,
    plaintext
  );
  plaintext.fill(0);

  // WebCrypto appends the 16-byte tag to the ciphertext; the wire format keeps
  // them separate, as node's crypto expects.
  const sealedBytes = new Uint8Array(sealed);
  const ct = sealedBytes.slice(0, sealedBytes.length - 16);
  const tag = sealedBytes.slice(sealedBytes.length - 16);

  const rawAes = new Uint8Array(await subtle.exportKey("raw", aesKey));
  const ek = await subtle.encrypt({ name: "RSA-OAEP" }, publicKey, rawAes);
  rawAes.fill(0);

  return {
    v: ENVELOPE_VERSION,
    alg: ENVELOPE_ALG,
    certFingerprint: fingerprint,
    ek: toBase64Url(ek),
    iv: toBase64Url(iv),
    ct: toBase64Url(ct),
    tag: toBase64Url(tag),
  };
}
