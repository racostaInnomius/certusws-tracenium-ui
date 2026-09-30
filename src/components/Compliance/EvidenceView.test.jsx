import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import EvidenceView from "./EvidenceView";
import { evidenceRows, displayPath, expectationOf, formatValue, benchmarkLabel, notApplicableText } from "./evidenceRows";

afterEach(cleanup);

const K = (s) => `registry.HKLM\\SYSTEM\\CurrentControlSet\\${s}`;

describe("evidenceRows — the evaluator's shapes, one row per probe", () => {
  it("single rule: path, value, expectation", () => {
    expect(evidenceRows({ path: "smb.smb1.status", value: "enabled", expected: "disabled" }, "fail")).toEqual([
      { path: "smb.smb1.status", value: "enabled", expected: "= disabled", status: "fail" },
    ]);
  });

  it("strips the registry. prefix so the key reads as it does in regedit", () => {
    expect(displayPath(K("Services\\mrxsmb10:Start"))).toBe("HKLM\\SYSTEM\\CurrentControlSet\\Services\\mrxsmb10:Start");
    expect(displayPath("firewall.enabled")).toBe("firewall.enabled");
  });

  it("all_equal: one row per path sharing the expectation", () => {
    const rows = evidenceRows({ paths: [{ path: "crypto.tls10Enabled", value: false }, { path: "crypto.tls11Enabled", value: true }], expected: false }, "fail");
    expect(rows).toHaveLength(2);
    expect(rows[1]).toEqual({ path: "crypto.tls11Enabled", value: "true", expected: "= false", status: "fail" });
  });

  it("composite: sub-check status rides on each row, not-reported keys become their own row", () => {
    const rows = evidenceRows({
      composite: "all_of",
      sub_evidence: [
        { status: "pass", evidence: { path: K("Services\\mrxsmb10:Start"), value: 4, expected: 4 } },
        { status: "fail", evidence: { path: K("Services\\LanmanServer\\Parameters:SMB1"), value: 1, expected: 0 } },
        { status: "not_applicable", reason: "path 'registry.X' not reported" },
      ],
    });
    expect(rows.map((r) => r.status)).toEqual(["pass", "fail", "not_applicable"]);
    expect(rows[1].path).toBe("HKLM\\SYSTEM\\CurrentControlSet\\Services\\LanmanServer\\Parameters:SMB1");
    expect(rows[2]).toMatchObject({ path: null, value: "path 'registry.X' not reported" });
  });

  it("other primitives get a readable expectation", () => {
    expect(expectationOf({ rejected: "yes" })).toBe("≠ yes");
    expect(expectationOf({ allowed: ["a", "b"] })).toBe("in {a, b}");
    expect(expectationOf({ threshold: 14 })).toBe("≥ 14");
    expect(expectationOf({ threshold: 0, inclusive: false })).toBe("> 0");
    expect(expectationOf({ min: 1, max: 8 })).toBe("1 … 8");
    expect(expectationOf({ minVersion: "14.0" })).toBe("≥ 14.0");
    expect(expectationOf({ pattern: "^no$" })).toBe("matches ^no$");
    expect(expectationOf({ length: 3 })).toBe("empty");
    expect(expectationOf({ something: 1 })).toBeNull();
  });

  it("unknown shapes are not tabulated (caller falls back to JSON)", () => {
    expect(evidenceRows({ foo: 1 })).toBeNull();
    expect(evidenceRows("text")).toBeNull();
  });

  it("formatValue keeps null, undefined and long strings distinguishable", () => {
    expect(formatValue(undefined)).toBe("not reported");
    expect(formatValue(null)).toBe("null");
    expect(formatValue("x".repeat(200))).toMatch(/^x{117}…$/);
    expect(formatValue([1, "a"])).toBe("1, a");
  });
});

describe("EvidenceView", () => {
  it("renders a composite as a table with a header line and a status mark per row", () => {
    render(
      <EvidenceView
        status="fail"
        evidence={{
          composite: "all_of",
          sub_evidence: [
            { status: "pass", evidence: { path: K("Control\\SecurityProviders\\SCHANNEL\\Protocols\\TLS 1.0\\Client:Enabled"), value: 0, expected: 0 } },
            { status: "fail", evidence: { path: K("Control\\SecurityProviders\\SCHANNEL\\Protocols\\TLS 1.0\\Server:Enabled"), value: undefined, expected: 0 } },
          ],
        }}
      />
    );
    expect(screen.getByText(/All of the following must hold · 2 probes, 1 failing/)).toBeInTheDocument();
    expect(screen.getByText("HKLM\\SYSTEM\\CurrentControlSet\\Control\\SecurityProviders\\SCHANNEL\\Protocols\\TLS 1.0\\Server:Enabled")).toBeInTheDocument();
    expect(screen.getByText("not reported")).toBeInTheDocument();
    expect(screen.getByLabelText("fail")).toBeInTheDocument();
    expect(screen.getByLabelText("pass")).toBeInTheDocument();
  });

  it("renders a not-assessed reason as prose", () => {
    render(<EvidenceView status="not_applicable" evidence={{ reason: "path 'registry' not reported" }} />);
    expect(screen.getByTestId("evidence-reason")).toHaveTextContent("path 'registry' not reported");
  });

  it("falls back to the raw block for strings and unknown shapes", () => {
    const { rerender } = render(<EvidenceView evidence="PermitRootLogin yes" />);
    expect(screen.getByText("PermitRootLogin yes")).toBeInTheDocument();
    rerender(<EvidenceView evidence={{ weird: { nested: true } }} />);
    expect(screen.getByText(/"weird"/)).toBeInTheDocument();
  });

  it("renders nothing for null evidence", () => {
    const { container } = render(<EvidenceView evidence={null} />);
    expect(container).toBeEmptyDOMElement();
  });
});

// ── «No aplica» por ser de otra versión del SO (backend 261493a0) ─────────
//
// La evidencia es EXACTAMENTE la que escribe evaluator.ts → otherOsVersionResult.
// Sin esto el portal pintaba «benchmark_for_other_os_version» en ~7.900
// hallazgos.
const OTHER_OS = {
  reason: "benchmark_for_other_os_version",
  detail: "Written for cis_ubuntu_26_v1.0.0; this device is measured by cis_ubuntu_24_v2.0.0.",
  checkBenchmarks: ["cis_ubuntu_26_v1.0.0"],
  ownBenchmark: "cis_ubuntu_24_v2.0.0",
};

describe("benchmarkLabel", () => {
  it.each([
    ["cis_ubuntu_24_v2.0.0", "CIS Ubuntu 24.04"],
    ["cis_ubuntu_26_v1.0.0", "CIS Ubuntu 26.04"],
    ["cis_macos_26_v1.1.0", "CIS macOS 26"],
    ["cis_windows_11_v5.1.0", "CIS Windows 11"],
    ["cis_windows_server_2022_v5.1.0", "CIS Windows Server 2022"],
    ["stig_macos_14", "STIG macOS 14"],
    ["stig_ubuntu_22", "STIG Ubuntu 22.04"],
    // Lo que no encaja sale tal cual: feo, pero no miente.
    ["stig_chrome_v2r11", "stig_chrome_v2r11"],
    ["soc2_tsc_2017", "soc2_tsc_2017"],
  ])("%s → %s", (id, label) => expect(benchmarkLabel(id)).toBe(label));
});

describe("🔴 un check de otra versión del SO se explica, no enseña el código", () => {
  it("se arma con los campos: el benchmark del check y el PROPIO del equipo", () => {
    expect(notApplicableText(OTHER_OS)).toBe(
      "Not applicable: written for CIS Ubuntu 26.04. This device is measured by its own benchmark, CIS Ubuntu 24.04."
    );
  });

  it("el respaldo (macOS 27 → CIS macOS 26) lo dice", () => {
    const t = notApplicableText({ ...OTHER_OS, checkBenchmarks: ["cis_macos_15_v2.1.0"], ownBenchmark: "cis_macos_26_v1.1.0", ownIsFallback: true });
    expect(t).toBe(
      "Not applicable: written for CIS macOS 15. This device is measured by CIS macOS 26, the newest benchmark published for its OS (there is none yet for its version)."
    );
  });

  it("sin campos estructurados cae a `detail`; sin detail, a una frase genérica — nunca al código", () => {
    expect(notApplicableText({ reason: OTHER_OS.reason, detail: "texto del backend" })).toBe("texto del backend");
    expect(notApplicableText({ reason: OTHER_OS.reason })).toMatch(/another version of the operating system/);
  });

  it("un «no evaluado» de siempre sigue enseñando su reason", () => {
    expect(notApplicableText({ reason: "path 'registry' not reported" })).toBe("path 'registry' not reported");
  });

  it("⭐ EvidenceView lo pinta así", () => {
    render(<EvidenceView status="not_applicable" evidence={OTHER_OS} />);
    const el = screen.getByTestId("evidence-reason");
    expect(el).toHaveTextContent("written for CIS Ubuntu 26.04");
    expect(el).toHaveTextContent("its own benchmark, CIS Ubuntu 24.04");
    expect(el).not.toHaveTextContent("benchmark_for_other_os_version");
  });
});
