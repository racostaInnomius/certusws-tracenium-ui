import { describe, it, expect, beforeAll } from "vitest";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  sealCredential,
  certFingerprint,
  formatFingerprint,
  pemToDer,
  publicKeyFromCert,
  ENVELOPE_VERSION,
  ENVELOPE_ALG,
} from "./sealCredential";

/**
 * The point of these tests is INTEROP. The browser seals; the agent's PrivSvc
 * opens. If the two disagree by one byte the admin sees "invalid credential"
 * with no way to tell why — so we decrypt here exactly the way the agent does
 * (agent-w/src/connectors/vcenter/envelope.ts) and assert the round trip.
 */
function openEnvelopeLikeTheAgent(env, privateKeyPem, expectedFingerprint) {
  if (env.v !== ENVELOPE_VERSION) throw new Error("unsupported envelope version");
  if (env.alg !== ENVELOPE_ALG) throw new Error("unsupported envelope algorithm");
  if (expectedFingerprint && expectedFingerprint !== env.certFingerprint) {
    throw new Error("stale_envelope");
  }
  const unb64u = (s) => Buffer.from(s, "base64url");

  const key = crypto.privateDecrypt(
    {
      key: crypto.createPrivateKey(privateKeyPem),
      padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: "sha256",
    },
    unb64u(env.ek)
  );

  const decipher = crypto.createDecipheriv("aes-256-gcm", key, unb64u(env.iv));
  decipher.setAAD(Buffer.from(env.certFingerprint, "utf8"));
  decipher.setAuthTag(unb64u(env.tag));
  const plain = Buffer.concat([decipher.update(unb64u(env.ct)), decipher.final()]);
  return JSON.parse(plain.toString("utf8"));
}

describe("sealCredential — interop with the agent", () => {
  let certPem;
  let keyPem;
  let fingerprint;
  const subtle = crypto.webcrypto.subtle;

  beforeAll(async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gw-seal-"));
    const k = path.join(dir, "k.pem");
    const c = path.join(dir, "c.pem");
    execFileSync(
      "openssl",
      ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", k, "-out", c, "-days", "3650", "-subj", "/CN=gateway-ui-test"],
      { stdio: "ignore" }
    );
    keyPem = fs.readFileSync(k, "utf8");
    certPem = fs.readFileSync(c, "utf8");
    fingerprint = await certFingerprint(certPem, subtle);
  });

  const CRED = { username: "svc-tracenium@vsphere.local", password: "C0rrect-H0rse!Battery&Staple" };

  it("produces an envelope the agent can open", async () => {
    const env = await sealCredential(CRED, certPem, { subtle });
    expect(openEnvelopeLikeTheAgent(env, keyPem, fingerprint)).toEqual(CRED);
  });

  it("agrees with the agent on the certificate fingerprint", async () => {
    // Both sides hash the DER; a mismatch here would surface as a phantom
    // "stale envelope" on every provision.
    const der = pemToDer(certPem);
    const nodeFp = crypto.createHash("sha256").update(Buffer.from(der)).digest("hex");
    expect(await certFingerprint(certPem, subtle)).toBe(nodeFp);
  });

  it("survives a password larger than RSA-2048 could wrap directly", async () => {
    // ~190 bytes is the OAEP limit; the hybrid construction removes it.
    const big = { username: "u".repeat(200), password: "p".repeat(2000) };
    const env = await sealCredential(big, certPem, { subtle });
    expect(openEnvelopeLikeTheAgent(env, keyPem, fingerprint)).toEqual(big);
  });

  it("survives the characters that broke shell handling during the spike", async () => {
    const nasty = { username: "u", password: "=@WK+Nq$(x)`y`\\n\"'&<>ñ€" };
    const env = await sealCredential(nasty, certPem, { subtle });
    expect(openEnvelopeLikeTheAgent(env, keyPem, fingerprint)).toEqual(nasty);
  });

  it("emits base64url, not standard base64", async () => {
    // Standard base64 would decode to garbage on the agent side.
    const env = await sealCredential(CRED, certPem, { subtle });
    for (const field of ["ek", "iv", "ct", "tag"]) {
      expect(env[field]).not.toMatch(/[+/=]/);
    }
  });

  it("splits the GCM tag out of the ciphertext, as the wire format expects", async () => {
    const env = await sealCredential(CRED, certPem, { subtle });
    expect(Buffer.from(env.tag, "base64url")).toHaveLength(16);
    expect(Buffer.from(env.iv, "base64url")).toHaveLength(12);
    expect(Buffer.from(env.ek, "base64url")).toHaveLength(256); // RSA-2048
  });
});

describe("the envelope never carries the plaintext", () => {
  let certPem;
  const subtle = crypto.webcrypto.subtle;

  beforeAll(() => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gw-seal2-"));
    const c = path.join(dir, "c.pem");
    execFileSync(
      "openssl",
      ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", path.join(dir, "k.pem"), "-out", c, "-days", "3650", "-subj", "/CN=t"],
      { stdio: "ignore" }
    );
    certPem = fs.readFileSync(c, "utf8");
  });

  it("contains neither the username nor the password", async () => {
    const cred = { username: "UNIQUE-USER-ZZQ9", password: "UNIQUE-PASS-ZZQ9" };
    const wire = JSON.stringify(await sealCredential(cred, certPem, { subtle }));
    expect(wire).not.toContain(cred.username);
    expect(wire).not.toContain(cred.password);
  });

  it("uses a fresh key and IV every time", async () => {
    const a = await sealCredential({ username: "u", password: "p" }, certPem, { subtle });
    const b = await sealCredential({ username: "u", password: "p" }, certPem, { subtle });
    expect(a.iv).not.toBe(b.iv);
    expect(a.ek).not.toBe(b.ek);
    expect(a.ct).not.toBe(b.ct);
  });
});

describe("refusals", () => {
  const subtle = crypto.webcrypto.subtle;

  it("REFUSES to seal without Web Crypto rather than falling back to plaintext", async () => {
    // WebCrypto is absent on insecure origins. Sending the credential in the
    // clear "just this once" would silently destroy the entire guarantee.
    // NOTE: `undefined` would trigger the parameter default and silently pick
    // up the ambient WebCrypto — `null` is what actually exercises the guard.
    await expect(
      sealCredential({ username: "u", password: "p" }, "irrelevant", { subtle: null })
    ).rejects.toThrow(/HTTPS/i);
  });

  it("requires both a username and a password", async () => {
    await expect(sealCredential({ username: "", password: "p" }, "x", { subtle })).rejects.toThrow(
      /required/
    );
    await expect(sealCredential({ username: "u", password: "" }, "x", { subtle })).rejects.toThrow(
      /required/
    );
  });

  it("rejects a malformed certificate instead of encrypting to nothing", async () => {
    await expect(
      sealCredential({ username: "u", password: "p" }, "not a pem", { subtle })
    ).rejects.toThrow(/PEM block/);
  });

  it("rejects a certificate with no RSA key", async () => {
    const der = new Uint8Array([0x30, 0x03, 0x02, 0x01, 0x00]);
    const b64 = Buffer.from(der).toString("base64");
    const pem = `-----BEGIN CERTIFICATE-----\n${b64}\n-----END CERTIFICATE-----`;
    await expect(publicKeyFromCert(pem, subtle)).rejects.toThrow(/RSA public key/);
  });
});

describe("formatFingerprint", () => {
  it("groups hex for human comparison against the gateway host", () => {
    expect(formatFingerprint("62a20ae2d752fc78")).toBe("62:A2:0A:E2:D7:52:FC:78");
  });

  it("tolerates separators and case already present", () => {
    expect(formatFingerprint("62:a2:0A:e2")).toBe("62:A2:0A:E2");
  });

  it("returns empty for junk rather than a misleading string", () => {
    expect(formatFingerprint("")).toBe("");
    expect(formatFingerprint(null)).toBe("");
  });
});
