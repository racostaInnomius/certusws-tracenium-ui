// src/components/Compliance/categoryMeta.js
//
// Human-readable name + one-line explanation for each compliance
// category, shared by "Posture by category" and the catalog dialog.
//
// Why this file exists: an IT-literate operator new to Tracenium read
// the category breakdown and could not say what separated "Crypto"
// from "Cryptography", or what "Identity policy" covered. We merged
// those two categories in the catalog (20260827), but merging only
// removed the contradiction — it did not explain anything. The names
// are our vocabulary, not an industry standard, so they have to carry
// their own definition.
//
// The rule for a description: name the QUESTION the category answers,
// then the concrete things it looks at. "Encryption settings" is not
// a definition; "whether the disk is encrypted at rest — BitLocker,
// FileVault, LUKS" is, because the operator recognises the nouns.
//
// Categories come from `compliance_check_catalog.category` in the
// control DB. A category with no entry here still renders (its key,
// underscores swapped for spaces) — the map is a courtesy, not a
// gate, so seeding a new category never blanks a row.

const CATEGORY_META = {
  identity_policy: {
    label: "Identity policy",
    description:
      "Who can sign in and how they prove it: local account rules, password requirements, screen lock, and SSH login settings."
  },
  cryptography: {
    label: "Cryptography",
    description:
      "The strength of the algorithms and keys in use: certificates held on the device, SSH and TLS cipher suites, and how passwords are hashed."
  },
  patching: {
    label: "Patching",
    description:
      "Whether the operating system and installed software are current, and whether known vulnerabilities are still exposed."
  },
  integrity: {
    label: "Integrity",
    description:
      "Protections that stop the system itself from being tampered with: Secure Boot, TPM, SIP, SELinux/AppArmor, memory-layout randomisation, and audit logging."
  },
  network_sharing: {
    label: "Network sharing",
    description:
      "What the device offers to everyone else on the network: file shares, SMB, remote login, and listening services."
  },
  network_hardening: {
    label: "Network hardening",
    description:
      "Kernel network settings that reject hostile traffic: ICMP redirects, source-routed packets, reverse-path filtering, SYN cookies."
  },
  firewall: {
    label: "Firewall",
    description: "Whether the host firewall is enabled and filtering on every profile."
  },
  filesystem_hardening: {
    label: "Filesystem hardening",
    description:
      "Mount options that limit what can be executed, created, or run with elevated rights on each filesystem."
  },
  disk_encryption: {
    label: "Disk encryption",
    description:
      "Whether the disk is encrypted at rest — BitLocker, FileVault, LUKS — and whether the keys are escrowed."
  },
  antimalware: {
    label: "Antimalware",
    description: "Whether malware protection is installed, enabled, and up to date."
  }
};

/**
 * Display name for a category key. Falls back to the key with
 * underscores turned into spaces, which is what both call sites did
 * before this file existed.
 */
export function categoryLabel(key) {
  const k = String(key || "").trim();
  if (!k) return "Uncategorized";
  return CATEGORY_META[k]?.label ?? k.replace(/_/g, " ");
}

/**
 * One-line explanation, or null when we have nothing useful to say.
 * Callers must handle null by rendering no tooltip at all — an empty
 * tooltip that opens onto nothing is worse than none.
 */
export function categoryDescription(key) {
  return CATEGORY_META[String(key || "").trim()]?.description ?? null;
}

export default CATEGORY_META;
