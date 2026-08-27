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

/** Categories the named slices claim, so "Rest" can be their complement. */
const CLAIMED = ["crypto", "cryptography", "network_sharing"];

export const SECURITY_DOMAINS = [
  {
    key: "all",
    label: "Everything",
    hint: "All misconfigurations found across the fleet",
    params: { categoriesNotIn: PATCHING_CATEGORY },
  },
  {
    key: "crypto",
    label: "Encryption & certificates",
    hint: "Weak keys and signatures, expired certificates, SSH ciphers",
    params: { category: "crypto,cryptography" },
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
    key: "rest",
    label: "Everything else",
    hint: "Firewall, identity, disk encryption, integrity, antimalware",
    params: { categoriesNotIn: [PATCHING_CATEGORY, ...CLAIMED].join(",") },
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
  other: "rest",
};
