// src/components/CryptoDiscovery/sshUserKeys.test.js
//
// La semántica de una clave SSH de usuario, fijada donde vive.
//
// ⭐ El test que importa es `encryptionState`: con el modo por defecto
// (`public-only`) el agente NO abre las claves privadas, así que
// `encrypted: null` es «no se miró». Pintar «sin cifrar» ahí sería
// inventarse un hallazgo de seguridad en el informe de un cliente.

import { describe, expect, it } from "vitest";
import {
  encryptionState,
  filterSshUserKeys,
  formatBytes,
  isSshUserKey,
  readSshUserKey,
  sshLegacyLabel,
  sshUserOptions
} from "./sshUserKeys";

const asset = (detail, extra = {}) => ({ assetId: "a1", detail, ...extra });
const priv = (detail) => readSshUserKey(asset({ kind: "private", path: "/home/j/.ssh/id_rsa", ...detail }));

describe("⭐ public-only is not a verdict about encryption", () => {
  it("encrypted:null under public-only renders as NOT EVALUATED, never as unencrypted", () => {
    const s = encryptionState(priv({ mode: "public-only", encrypted: null }));
    expect(s.state).toBe("not-evaluated");
    expect(s.label).toBe("Not evaluated");
    // Ni la etiqueta ni la explicación pueden contener la afirmación que
    // nadie hizo. Es exactamente el fallo que este bloque existe para cazar.
    expect(s.label.toLowerCase()).not.toMatch(/unencrypted|not encrypted|sin cifrar/);
    expect(s.hint).toMatch(/NOT the same as unencrypted/i);
    expect(s.hint).toMatch(/never opens a private key file/i);
  });

  it("the same holds when the row carries no mode at all (older agent)", () => {
    expect(encryptionState(priv({ encrypted: null })).state).toBe("not-evaluated");
  });

  it("not-evaluated is visually neutral — neither «fine» nor «finding»", () => {
    expect(encryptionState(priv({ mode: "public-only", encrypted: null })).tone).toBe("neutral");
    expect(encryptionState(priv({ mode: "full", encrypted: true })).tone).toBe("good");
    expect(encryptionState(priv({ mode: "full", encrypted: false })).tone).toBe("bad");
  });

  it("under full, false IS the finding and true IS fine", () => {
    expect(encryptionState(priv({ mode: "full", encrypted: false })).state).toBe("unencrypted");
    expect(encryptionState(priv({ mode: "full", encrypted: false })).label).toBe("Not encrypted");
    expect(encryptionState(priv({ mode: "full", encrypted: true })).state).toBe("encrypted");
  });

  it("an unreadable file claims nothing about its contents", () => {
    const s = encryptionState(priv({ mode: "full", encrypted: null, readable: false }));
    expect(s.state).toBe("unreadable");
    expect(s.tone).toBe("neutral");
  });

  it("only private keys have an encryption state at all", () => {
    expect(encryptionState(readSshUserKey(asset({ kind: "authorized", path: "/home/j/.ssh/authorized_keys" })))).toBe(null);
    expect(encryptionState(readSshUserKey(asset({ kind: "public", path: "/home/j/.ssh/id_ed25519.pub" })))).toBe(null);
  });
});

describe("reading a row", () => {
  it("pulls every field the view shows out of detail", () => {
    const k = readSshUserKey(
      asset(
        {
          kind: "authorized",
          user: "deploy",
          path: "/home/deploy/.ssh/authorized_keys",
          keyType: "ssh-ed25519",
          fingerprintSha256: "SHA256:abc",
          comment: "jenkins@ci",
          options: ['command="/usr/bin/rsync"'],
          legacyReason: null,
          unrestricted: false,
          agentId: "agent-1"
        },
        { keySizeBits: 256, algorithmName: "Ed25519", lastSeen: "2026-09-20T00:00:00Z" }
      )
    );
    expect(k).toMatchObject({
      kind: "authorized",
      user: "deploy",
      path: "/home/deploy/.ssh/authorized_keys",
      keyType: "ssh-ed25519",
      algorithm: "Ed25519",
      bits: 256,
      fingerprintSha256: "SHA256:abc",
      comment: "jenkins@ci",
      unrestricted: false,
      agentId: "agent-1"
    });
    expect(k.options).toEqual(['command="/usr/bin/rsync"']);
  });

  it("a missing field is null, never a made-up default", () => {
    const k = readSshUserKey(asset({ kind: "public", path: "/x.pub" }));
    expect(k.user).toBe(null);
    expect(k.fingerprintSha256).toBe(null);
    expect(k.comment).toBe(null);
    expect(k.bits).toBe(null);
    expect(k.options).toEqual([]);
    expect(k.unrestricted).toBe(null);
  });

  it("a row without a recognisable kind is not an SSH user key", () => {
    expect(isSshUserKey({ assetId: "x", name: "some cert" })).toBe(false);
    expect(isSshUserKey(asset({ kind: "authorized", path: "/a" }))).toBe(true);
    expect(isSshUserKey(asset({ kind: "something-else", path: "/a" }))).toBe(false);
  });

  it("file metadata travels for the private keys", () => {
    const k = priv({ filePermissions: "0644", sizeBytes: 2610, modifiedAt: "2026-01-02T03:04:05Z", publicHalfPath: "/home/j/.ssh/id_rsa.pub" });
    expect(k.filePermissions).toBe("0644");
    expect(k.sizeBytes).toBe(2610);
    expect(k.publicHalfPath).toBe("/home/j/.ssh/id_rsa.pub");
    expect(formatBytes(k.sizeBytes)).toBe("2.5 KB");
    expect(formatBytes(null)).toBe(null);
  });
});

describe("filters", () => {
  const keys = [
    readSshUserKey(asset({ kind: "authorized", user: "root", path: "/root/.ssh/authorized_keys", unrestricted: true, legacyReason: "rsa_below_3072" })),
    readSshUserKey(asset({ kind: "authorized", user: "deploy", path: "/home/deploy/.ssh/authorized_keys", unrestricted: false, options: ["from=10.0.0.1"] })),
    readSshUserKey(asset({ kind: "public", user: "deploy", path: "/home/deploy/.ssh/id_ed25519.pub", comment: "laptop" })),
    readSshUserKey(asset({ kind: "private", user: "deploy", path: "/home/deploy/.ssh/id_rsa", mode: "public-only", legacyReason: "dsa_removed_from_openssh" }))
  ];

  it("by kind, by user and by free text", () => {
    expect(filterSshUserKeys(keys, { kind: "authorized" })).toHaveLength(2);
    expect(filterSshUserKeys(keys, { user: "root" })).toHaveLength(1);
    expect(filterSshUserKeys(keys, { search: "laptop" })).toHaveLength(1);
    expect(filterSshUserKeys(keys, { search: "AUTHORIZED_KEYS" })).toHaveLength(2);
  });

  it("legacy: «any» means any reason, a reason means that one", () => {
    expect(filterSshUserKeys(keys, { legacyReason: "any" })).toHaveLength(2);
    expect(filterSshUserKeys(keys, { legacyReason: "dsa_removed_from_openssh" })).toHaveLength(1);
  });

  it("⭐ «unrestricted only» never catches a row where the field does not apply", () => {
    // `unrestricted: null` (una pública, una privada) NO es «sin restringir».
    const out = filterSshUserKeys(keys, { unrestricted: true });
    expect(out).toHaveLength(1);
    expect(out[0].user).toBe("root");
  });

  it("no filter returns everything", () => {
    expect(filterSshUserKeys(keys, {})).toHaveLength(4);
    expect(sshUserOptions(keys)).toEqual(["deploy", "root"]);
  });
});

describe("legacy reasons are named, not echoed", () => {
  it("cites the threshold behind each judgement", () => {
    expect(sshLegacyLabel("rsa_below_3072")).toMatch(/NIST SP 800-57/);
    expect(sshLegacyLabel("dsa_removed_from_openssh")).toMatch(/OpenSSH/);
    expect(sshLegacyLabel(null)).toBe(null);
    // Un motivo nuevo del backend se enseña crudo antes que desaparecer.
    expect(sshLegacyLabel("some_future_reason")).toBe("some_future_reason");
  });
});
