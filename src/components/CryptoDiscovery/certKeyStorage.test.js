// src/components/CryptoDiscovery/certKeyStorage.test.js
//
// Ola 1.1 — la profundidad del inventario, fijada donde vive.
//
// ⭐ El test que importa: que un certificado no llegue a una raíz de
// confianza NO es un hallazgo. En Windows el almacén de raíces se rellena
// BAJO DEMANDA, así que una raíz legítima que el equipo aún no ha
// necesitado sencillamente no está, y el mismo certificado da `false` hoy y
// `true` mañana sin que nadie toque nada. Pintarlo en rojo llenaría el
// informe de un cliente de falsos positivos que se arreglan solos.

import { describe, expect, it } from "vitest";
import {
  CHAIN_FILTER_LABELS,
  STORE_CHAIN_FLAG_LABELS,
  chainFacts,
  chainNotAsserted,
  keyExportableState,
  keyStorageState,
  keyStorageSummary
} from "./certKeyStorage";

const factFor = (chain, key) => (chainFacts(chain) ?? []).find((f) => f.key === key);

describe("⭐ not reaching a trusted root is a lens, never a finding", () => {
  it("trusted:false is neutral — not red, and not called «untrusted»", () => {
    const f = factFor({ issuerFound: true, trusted: false }, "trusted");
    expect(f.tone).toBe("neutral");
    expect(f.tone).not.toBe("bad");
    expect(f.tone).not.toBe("warn");
    // La palabra que lo convertiría en acusación no aparece en la etiqueta.
    expect(f.label.toLowerCase()).not.toMatch(/untrusted|invalid|rejected|fail/);
    expect(f.label).toMatch(/no trusted root reached yet/i);
  });

  it("and it explains why it is temporary on Windows", () => {
    const f = factFor({ issuerFound: true, trusted: false }, "trusted");
    expect(f.hint).toMatch(/populated on demand/i);
    expect(f.hint).toMatch(/lens for looking, not a finding/i);
  });

  it("⭐ there is deliberately no flag for it, only a filter", () => {
    // Si alguien añade una bandera «cadena no confiable» aquí, esto se pone
    // rojo: el backend no la emite, y la UI no puede inventarla.
    expect(Object.keys(STORE_CHAIN_FLAG_LABELS)).toEqual(["store_chain_incomplete", "store_chain_bad_signature"]);
    expect(JSON.stringify(STORE_CHAIN_FLAG_LABELS)).not.toMatch(/trusted/i);
    // Pero sí existe como lente, y la lente se anuncia como tal.
    expect(CHAIN_FILTER_LABELS.untrusted).toMatch(/not a finding/i);
  });

  it("trusted:true is the good state, so the three are distinguishable", () => {
    expect(factFor({ issuerFound: true, trusted: true }, "trusted").tone).toBe("good");
  });
});

describe("⭐ an absent chain key is «not asserted», never «no»", () => {
  it("signatureValid and trusted absent produce no fact at all", () => {
    // El backend OMITE la clave cuando el agente no se pronuncia. Un
    // `undefined` leído como `false` inventaría dos hallazgos por fila.
    const facts = chainFacts({ issuerFound: true });
    expect(facts).toHaveLength(1);
    expect(facts[0].key).toBe("issuerFound");
    expect(chainNotAsserted({ issuerFound: true })).toEqual(["signatureValid", "trusted"]);
  });

  it("only the keys that really are missing get listed", () => {
    expect(chainNotAsserted({ issuerFound: true, signatureValid: true })).toEqual(["trusted"]);
    expect(chainNotAsserted({ issuerFound: true, signatureValid: false, trusted: false })).toEqual([]);
  });

  it("a null chain is «not evaluated»: no facts, not a clean bill of health", () => {
    expect(chainFacts(null)).toBe(null);
    expect(chainFacts(undefined)).toBe(null);
    expect(chainNotAsserted(null)).toEqual([]);
  });
});

describe("the two real chain findings", () => {
  it("the issuer missing from the device is a warning, and says what breaks", () => {
    const f = factFor({ issuerFound: false }, "issuerFound");
    expect(f.tone).toBe("warn");
    expect(f.label).toMatch(/issuer not on the device/i);
    expect(STORE_CHAIN_FLAG_LABELS.store_chain_incomplete).toBe("The issuer of this certificate is not on the device");
  });

  it("a signature that does not match its issuer is the hard one", () => {
    const f = factFor({ issuerFound: true, signatureValid: false }, "signatureValid");
    expect(f.tone).toBe("bad");
    expect(f.hint).toMatch(/do not belong together/i);
    expect(STORE_CHAIN_FLAG_LABELS.store_chain_bad_signature).toBe("The signature does not match the issuer it claims");
  });
});

describe("where the private key lives", () => {
  it("TPM and smart card are good, software is the one worth knowing about", () => {
    expect(keyStorageState("tpm").tone).toBe("good");
    expect(keyStorageState("smartcard").label).toBe("Smart card");
    expect(keyStorageState("software").tone).toBe("warn");
  });

  it("⭐ «not recorded» and «unknown» are DIFFERENT facts, and neither is a verdict", () => {
    // `null` = no consta (sin clave privada, agente antiguo, macOS).
    // `"unknown"` = el agente miró y no lo sabe. Fundirlas borraría la
    // diferencia entre «no se preguntó» y «se preguntó sin respuesta».
    const notRecorded = keyStorageState(null);
    const unknown = keyStorageState("unknown");
    expect(notRecorded.state).toBe("not-recorded");
    expect(unknown.state).toBe("unknown");
    expect(notRecorded.label).not.toBe(unknown.label);
    expect(notRecorded.tone).toBe("neutral");
    expect(unknown.tone).toBe("neutral");
  });

  it("a storage kind this build does not know is shown raw, not dropped", () => {
    expect(keyStorageState("hsm").label).toBe("hsm");
    expect(keyStorageState("hsm").tone).toBe("neutral");
  });

  it("the list field is plural, and empty means nothing to say", () => {
    expect(keyStorageSummary(["tpm", "software"]).map((s) => s.label)).toEqual(["TPM", "Software"]);
    expect(keyStorageSummary([])).toBe(null);
    expect(keyStorageSummary(undefined)).toBe(null);
  });
});

describe("whether the key can leave", () => {
  it("⭐ unknown is not «non-exportable»", () => {
    const u = keyExportableState(null);
    expect(u.state).toBe("unknown");
    expect(u.tone).toBe("neutral");
    expect(u.hint).toMatch(/not «non-exportable»/i);
    expect(u.label).not.toMatch(/^Non-exportable$/);
  });

  it("exportable is the fact worth surfacing; non-exportable is the good one", () => {
    expect(keyExportableState(true).tone).toBe("warn");
    expect(keyExportableState(true).label).toBe("Exportable");
    expect(keyExportableState(false).tone).toBe("good");
    expect(keyExportableState(false).label).toBe("Non-exportable");
    // Es un hecho, no un veredicto: la política del cliente decide.
    expect(keyExportableState(true).hint).toMatch(/your policy's call/i);
  });
});
