// src/components/Compliance/frameworkRefs.test.js
//
// Walkthrough 25-sep #8: chips labelled with raw ids (`iso_27001_2022`) and
// links that, for 20 of 21 frameworks, opened the same generic page for every
// control. The ids below are the real ones in the control DB (29-sep).

import { describe, expect, it } from "vitest";
import { controlReference, controlReferenceHint, frameworkLongLabel, frameworkShortLabel } from "./frameworkRefs";

describe("frameworkShortLabel", () => {
  it("never shows a raw snake_case id", () => {
    expect(frameworkShortLabel("iso_27001_2022")).toBe("ISO 27001");
    expect(frameworkShortLabel("pci_dss_v4_0_1")).toBe("PCI DSS");
    expect(frameworkShortLabel("soc2_tsc_2017")).toBe("SOC 2");
    expect(frameworkShortLabel("hipaa_security_rule")).toBe("HIPAA");
    expect(frameworkShortLabel("cis_ubuntu_24_v2.0.0")).toBe("CIS");
    expect(frameworkShortLabel("nist_csf_2.0")).toBe("CSF");
    expect(frameworkShortLabel("nist_800_53_rev5")).toBe("NIST");
    expect(frameworkShortLabel("stig_edge_v2r5")).toBe("STIG");
  });

  it("an unknown framework is prettified, not raw", () => {
    expect(frameworkShortLabel("cmmc_level_2")).toBe("cmmc level 2");
    expect(frameworkShortLabel("cmmc_level_2")).not.toContain("_");
  });
});

describe("controlReference — precise where the text is public", () => {
  it("NIST 800-53: the control, and an enhancement is its own page (SC-7(5) used to open SC-7)", () => {
    expect(controlReference("nist_800_53_rev5", "AC-11", "https://csrc.nist.gov/publications/detail/sp/800-53/rev-5/final")).toEqual({
      url: "https://csf.tools/reference/nist-sp-800-53/r5/ac/ac-11/",
      precise: true,
    });
    expect(controlReference("nist_800_53_rev5", "SC-7(5)").url).toBe("https://csf.tools/reference/nist-sp-800-53/r5/sc/sc-7/sc-7-5/");
    expect(controlReference("nist_800_53_rev5", "AC-6(10)").url).toBe("https://csf.tools/reference/nist-sp-800-53/r5/ac/ac-6/ac-6-10/");
  });

  it("NIST CSF 2.0: the subcategory", () => {
    expect(controlReference("nist_csf_2.0", "DE.CM-01", "https://www.nist.gov/cyberframework")).toEqual({
      url: "https://csf.tools/reference/nist-cybersecurity-framework/v2-0/de/de-cm/de-cm-01/",
      precise: true,
    });
  });

  it("HIPAA: the eCFR section, anchored at the paragraph", () => {
    expect(controlReference("hipaa_security_rule", "164.308(a)(1)(ii)(D)").url).toBe(
      "https://www.ecfr.gov/current/title-45/section-164.308#p-164.308(a)(1)(ii)(D)"
    );
    expect(controlReference("hipaa_security_rule", "164.312(d)").url).toBe("https://www.ecfr.gov/current/title-45/section-164.312#p-164.312(d)");
  });

  it("an id that does not parse falls back to the stored URL, marked not precise", () => {
    expect(controlReference("nist_800_53_rev5", "weird", "https://x/pub")).toEqual({ url: "https://x/pub", precise: false });
  });
});

describe("controlReference — the standard's page where it is not", () => {
  it("CIS: the right product, not the catalog of every benchmark", () => {
    const generic = "https://www.cisecurity.org/cis-benchmarks";
    expect(controlReference("cis_windows_11_v5.1.0", "1.1.1", generic).url).toBe("https://www.cisecurity.org/benchmark/microsoft_windows_desktop");
    expect(controlReference("cis_windows_server_2022_v5.1.0", "1.1.1", generic).url).toBe("https://www.cisecurity.org/benchmark/microsoft_windows_server");
    expect(controlReference("cis_macos_15_v2.1.0", "1.1", generic).url).toBe("https://www.cisecurity.org/benchmark/apple_os");
    expect(controlReference("cis_ubuntu_24_v2.0.0", "1.1.1.1", generic)).toEqual({
      url: "https://www.cisecurity.org/benchmark/ubuntu_linux",
      precise: false,
    });
  });

  it("⭐ ISO / PCI / SOC 2 / STIG: UNA página por estándar, la misma en todos sus chips, sea cual sea la URL guardada", () => {
    // 2-oct en prod: PCI 8.3.1 iba a la biblioteca y 8.3.6 a un PDF con 403;
    // SOC 2 CC6.1 y CC6.2, a dos páginas distintas de AICPA.
    const pci = ["https://www.pcisecuritystandards.org/document_library/", "https://docs-prv.pcisecuritystandards.org/PCI%20DSS/Standard/PCI-DSS-v4_0_1.pdf", null]
      .map((stored) => controlReference("pci_dss_v4_0_1", "8.3.6", stored));
    expect(new Set(pci.map((r) => r.url))).toEqual(new Set(["https://www.pcisecuritystandards.org/document_library/"]));
    expect(pci.every((r) => r.precise === false)).toBe(true);
    const soc2 = ["https://www.aicpa-cima.com/resources/landing/system-and-organization-controls-soc-suite-of-services", null]
      .map((stored) => controlReference("soc2_tsc_2017", "CC6.2", stored).url);
    expect(new Set(soc2).size).toBe(1);
    expect(controlReference("iso_27001_2022", "A.8.8", null)).toEqual({ url: "https://www.iso.org/standard/27001", precise: false });
    expect(controlReference("stig_edge_v2r5", "EDGE-00-000001", null).url).toBe("https://public.cyber.mil/stigs/downloads/");
  });

  it("un framework sin página propia sigue con la URL guardada; sin ella, sin enlace", () => {
    expect(controlReference("gdpr", "Art.32", "https://gdpr.example/art-32")).toEqual({ url: "https://gdpr.example/art-32", precise: false });
    expect(controlReference("gdpr", "Art.32", null)).toBeNull();
  });
});

describe("controlReferenceHint", () => {
  it("says what a non-precise link really opens", () => {
    const ref = controlReference("iso_27001_2022", "A.8.8", "https://www.iso.org/standard/27001");
    expect(controlReferenceHint("iso_27001_2022", "Management of technical vulnerabilities", ref)).toBe(
      "Management of technical vulnerabilities\nOpens the ISO/IEC 27001 page, not this control: there is no public link per control."
    );
  });

  it("a precise link needs only the title", () => {
    const ref = controlReference("nist_800_53_rev5", "AC-11");
    expect(controlReferenceHint("nist_800_53_rev5", "Device Lock", ref)).toBe("Device Lock");
  });
});

describe("frameworkLongLabel — one benchmark, readable", () => {
  it("names each benchmark of a family, so two «CIS 5.1.19» can be told apart", () => {
    expect(frameworkLongLabel("cis_ubuntu_22_v3.0.0")).toBe("CIS Ubuntu 22 v3.0.0");
    expect(frameworkLongLabel("cis_ubuntu_24_v2.0.0")).toBe("CIS Ubuntu 24 v2.0.0");
    expect(frameworkLongLabel("cis_windows_server_2022_v5.1.0")).toBe("CIS Windows Server 2022 v5.1.0");
    expect(frameworkLongLabel("cis_macos_15_v2.1.0")).toBe("CIS macOS 15 v2.1.0");
    expect(frameworkLongLabel("stig_edge_v2r5")).toBe("STIG Edge v2r5");
  });

  it("the single standards", () => {
    expect(frameworkLongLabel("nist_800_53_rev5")).toBe("NIST 800-53 rev5");
    expect(frameworkLongLabel("nist_csf_2.0")).toBe("CSF 2.0");
    expect(frameworkLongLabel("iso_27001_2022")).toBe("ISO 27001:2022");
    expect(frameworkLongLabel("pci_dss_v4_0_1")).toBe("PCI DSS v4.0.1");
    expect(frameworkLongLabel("soc2_tsc_2017")).toBe("SOC 2 TSC 2017");
    expect(frameworkLongLabel("hipaa_security_rule")).toBe("HIPAA Security Rule");
  });
});

