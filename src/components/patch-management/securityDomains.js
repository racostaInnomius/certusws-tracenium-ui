// src/components/patch-management/securityDomains.js
//
// The domain filter for the Security configuration surface.
//
// TLS, SMB, Shared folders and "Other" used to be four sibling tabs. They were
// never four different kinds of work — they are four slices of one question,
// "what is misconfigured out there", and splitting them across tabs meant the
// page could only ever answer a quarter of it at a time. Worse, the slices did
// not cover the whole: everything the catalog grew after the tabs were written
// fell into a gap and became unreachable.
//
// So the default here is EVERYTHING, and the filter narrows. That inverts the
// old behaviour, where the default was one narrow slice and the rest was
// invisible unless you knew which tab to guess.
//
// `patching` is deliberately out of scope: OS updates are their own domain
// with their own install path, not a misconfiguration to remediate.

/** OS patching lives on its own surface, not in security configuration. */
export const PATCHING_CATEGORY = "patching";

// ⚠️ NO HAY CAJÓN DE SASTRE, Y ES DELIBERADO (18-sep).
//
// Hubo un «Everything else» definido como el complemento de las rebanadas con
// nombre. Existía como seguro: en la época en que cada pestaña nombraba UNA
// categoría, 636 de 984 hallazgos abiertos no eran alcanzables desde ninguna.
// Pero ese seguro ya lo pone «Everything», que es el primero y el por defecto:
// si el default muestra todo, ninguna categoría nueva puede quedarse sin
// superficie, y el complemento sólo significaba «lo que aún no he mirado».
//
// Lo que sí hacía era ESCONDER. Sus 557 checks empezaban por BitLocker y el
// cortafuegos de Windows —los dos controles más citados de una auditoría—, y su
// propio texto de ayuda enumeraba cinco dominios reales detrás de un nombre que
// no nombra nada. Así que están aquí, cada uno con el suyo.
//
// La invariante que sustituye al cajón, fijada en el test: cada categoría viva
// o tiene rebanada propia, o la renderiza otra superficie, o al menos cae en
// «Everything» — que es lo primero que se ve.

export const SECURITY_DOMAINS = [
  {
    key: "all",
    label: "Everything",
    hint: "All misconfigurations found across the fleet",
    params: { categoriesNotIn: PATCHING_CATEGORY },
  },
  {
    // La clave sigue siendo `crypto` porque `?pmTab=tls` son enlaces que la
    // gente tiene guardados. La etiqueta cambia: con «Disk encryption» al lado,
    // «Encryption & certificates» ya no distinguía nada.
    key: "crypto",
    label: "Certificates & TLS",
    hint: "Weak keys and signatures, expired certificates, SSH ciphers",
    params: { category: "crypto,cryptography" },
  },
  {
    key: "disk",
    label: "Disk encryption",
    hint: "BitLocker, FileVault and LUKS on system and home volumes",
    params: { category: "disk_encryption" },
  },
  {
    key: "firewall",
    label: "Firewall & network",
    hint: "Host firewall profiles, stealth mode, ICMP and routing hardening",
    params: { category: "firewall,network_hardening" },
  },
  {
    key: "identity",
    label: "Identity & accounts",
    hint: "Password policy, screen lock, credential caching",
    params: { category: "identity_policy" },
  },
  {
    key: "malware",
    label: "Malware & integrity",
    // Las opciones de montaje (noexec, nosuid en /tmp y /dev/shm) están aquí y
    // no en un dominio propio: existen para impedir que se ejecute lo que no
    // debe, que es la misma pregunta que responden Defender, AppArmor y AIDE.
    hint: "Defender and AV state, AppArmor and SIP, file integrity, mount hardening",
    params: { category: "antimalware,integrity,filesystem_hardening" },
  },
  {
    key: "smb",
    label: "SMB",
    hint: "SMBv1, signing, encryption, guest access",
    params: { category: "network_sharing", checkIdContains: "smb" },
  },
  {
    key: "shares",
    label: "Shared folders",
    hint: "Exposed and loosely permissioned shares",
    params: { category: "network_sharing", checkIdContains: "share" },
  },
  {
    key: "browsers",
    label: "Browsers",
    hint: "Chrome, Edge and Firefox machine policies from the DISA STIGs",
    params: { category: "browser_hardening" },
  },
];

export const DEFAULT_DOMAIN = SECURITY_DOMAINS[0].key;

/** The FindingsPanel props for a domain key; falls back to showing everything. */
export function domainParams(key) {
  const found = SECURITY_DOMAINS.find((d) => d.key === key);
  return (found ?? SECURITY_DOMAINS[0]).params;
}

/**
 * Old per-tab URLs mapped onto the domain they became.
 *
 * `?pmTab=tls` was a real link people held; it now selects the encryption
 * slice of this one surface rather than opening a tab that no longer exists.
 */
export const LEGACY_TAB_TO_DOMAIN = {
  tls: "crypto",
  smb: "smb",
  shares: "shares",
  // `other` era el cajón de sastre, y `rest` la rebanada que lo sustituyó
  // cuando las pestañas se colapsaron. Los dos van ahora a «Everything»: un
  // enlace viejo debe enseñar de más, nunca de menos.
  other: "all",
  rest: "all",
};
