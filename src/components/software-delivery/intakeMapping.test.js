// src/components/software-delivery/intakeMapping.test.js
//
// Unit tests for the intake → PackageDialog item mapping (mirrors the backend
// approve-mapping; display-only, but the operator sees these values so they
// must be right).

import { describe, expect, it } from "vitest";
import { mapProposalDetectionRule, intakeToPackageItem } from "./intakeMapping";

describe("mapProposalDetectionRule", () => {
  it("maps registry_uninstall to displayNameLike + minVersion (productCode dropped)", () => {
    expect(
      mapProposalDetectionRule(
        { type: "registry_uninstall", productCode: "{GUID}", displayNamePattern: "7-Zip%", versionPattern: "23" },
        { name: "7-Zip" }
      )
    ).toEqual({ type: "registry_uninstall", displayNameLike: "7-Zip%", minVersion: "23" });
  });

  it("falls back to a <name>% pattern when displayNamePattern is empty", () => {
    expect(
      mapProposalDetectionRule(
        { type: "registry_uninstall", displayNamePattern: null, versionPattern: null },
        { name: "App" }
      )
    ).toEqual({ type: "registry_uninstall", displayNameLike: "App%" });
  });

  it("splits package_installed into dpkg/rpm by format", () => {
    const gen = { type: "package_installed", packageName: "7zip", versionPattern: "23" };
    expect(mapProposalDetectionRule(gen, { format: "deb" })).toEqual({
      type: "dpkg_installed",
      packageName: "7zip",
      minVersion: "23",
    });
    expect(mapProposalDetectionRule(gen, { format: "rpm" })).toEqual({
      type: "rpm_installed",
      packageName: "7zip",
      minVersion: "23",
    });
  });

  it("maps file_exists (dropping versionPattern) and returns null for no rule", () => {
    expect(mapProposalDetectionRule({ type: "file_exists", path: "/opt/x", versionPattern: "1" }, {})).toEqual({
      type: "file_exists",
      path: "/opt/x",
    });
    expect(mapProposalDetectionRule(null, {})).toBeNull();
    expect(mapProposalDetectionRule(undefined, {})).toBeNull();
  });
});

describe("intakeToPackageItem", () => {
  const intake = {
    sha256: "a".repeat(64),
    sizeBytes: 1234,
    blobName: "intake/7/abc/app.exe",
    facts: { name: "App", vendor: "Acme", version: "1.0", platform: "windows", format: "exe" },
    proposedConfig: {
      silentInstallArgs: "/S",
      expectedExitCodes: [0, 3010],
      requiresReboot: true,
      description: "App installer",
      detectionRule: { type: "registry_uninstall", productCode: null, displayNamePattern: "App%", versionPattern: null },
    },
  };

  it("fills the dialog item from facts + proposal, arch=any and blank downloadPath", () => {
    const item = intakeToPackageItem(intake);
    expect(item).toMatchObject({
      name: "App",
      vendor: "Acme",
      version: "1.0",
      platform: "windows",
      arch: "any",
      format: "exe",
      downloadPath: "", // operator must supply a resolvable URL
      sha256: "a".repeat(64),
      sizeBytes: 1234,
      silentInstallArgs: "/S",
      requiresReboot: true,
      signingRequired: false,
    });
    expect(item.detectionRule).toEqual({ type: "registry_uninstall", displayNameLike: "App%" });
  });

  it("survives an intake whose AI step failed (no proposedConfig)", () => {
    const item = intakeToPackageItem({ ...intake, proposedConfig: null });
    expect(item.silentInstallArgs).toBe("");
    expect(item.detectionRule).toBeNull();
    expect(item.expectedExitCodes).toEqual([0, 3010]);
  });
});
