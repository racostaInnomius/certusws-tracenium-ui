// src/components/software-delivery/intakeMapping.js
//
// Maps an SDP intake record (extracted facts + AI-proposed install config) into
// the shape PackageDialog's `item` prop expects, so the operator reviews the
// proposal in the same editor they'd use to create a package by hand.
//
// This MIRRORS the backend's proposalToPackageInput/mapDetectionRule (see
// certusws-tracenium approve-mapping.ts). It's display-only: on approve the
// backend re-derives and validates from the stored proposal, so a small drift
// here can't corrupt a catalog row — worst case the operator sees a field they
// then adjust. The two documented lossy edges match the backend:
//   * the catalog registry_uninstall rule has no productCode → we fall back to a
//     display-name pattern;
//   * package_installed splits into dpkg_installed / rpm_installed by format.

// Map the AI-proposed detection rule onto the catalog detection-rule shape.
export function mapProposalDetectionRule(rule, ctx = {}) {
  if (!rule || !rule.type) return null;
  switch (rule.type) {
    case "registry_uninstall": {
      const displayNameLike =
        String(rule.displayNamePattern || "").trim() || `${ctx.name || ""}%`;
      const minVersion = String(rule.versionPattern || "").trim();
      return { type: "registry_uninstall", displayNameLike, ...(minVersion ? { minVersion } : {}) };
    }
    case "bundle_version": {
      const minVersion = String(rule.versionPattern || "").trim();
      return { type: "bundle_version", bundleId: rule.bundleId, ...(minVersion ? { minVersion } : {}) };
    }
    case "file_exists":
      return { type: "file_exists", path: rule.path };
    case "package_installed": {
      const minVersion = String(rule.versionPattern || "").trim();
      const isRpm = ctx.format === "rpm";
      return {
        type: isRpm ? "rpm_installed" : "dpkg_installed",
        packageName: rule.packageName,
        ...(minVersion ? { minVersion } : {}),
      };
    }
    default:
      return null;
  }
}

// Build a PackageDialog `item` from an intake. `downloadPath` is intentionally
// left blank: the stored blob path isn't a resolvable https URL, so the operator
// must supply one before the package can be deployed (the dialog enforces it).
export function intakeToPackageItem(intake) {
  const facts = intake?.facts || {};
  const cfg = intake?.proposedConfig || null;
  const platform = facts.platform || "windows";
  const format = facts.format || "msi";
  return {
    name: facts.name || "",
    vendor: facts.vendor || "",
    version: facts.version || "",
    platform,
    arch: "any", // not extractable from the binary — operator confirms
    format,
    downloadPath: "",
    sha256: intake?.sha256 || "",
    sizeBytes: intake?.sizeBytes ?? null,
    silentInstallArgs: cfg?.silentInstallArgs || "",
    expectedExitCodes: Array.isArray(cfg?.expectedExitCodes) ? cfg.expectedExitCodes : [0, 3010],
    requiresReboot: Boolean(cfg?.requiresReboot),
    signingRequired: false,
    description: cfg?.description || "",
    isActive: true,
    detectionRule: mapProposalDetectionRule(cfg?.detectionRule, {
      platform,
      format,
      name: facts.name || "",
    }),
  };
}
