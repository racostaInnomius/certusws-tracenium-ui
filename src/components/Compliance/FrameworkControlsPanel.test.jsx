// src/components/Compliance/FrameworkControlsPanel.test.jsx
//
// El panel que responde "¿qué controles SÍ cumplo?" — la pregunta que un
// auditor hace y que el resto de la página invierte.
//
// Lo que se fija aquí: que el titular cuente los cumplidos (es la frase
// que se lleva el auditor), que "Not assessed" no se disfrace de
// aprobado, que la evidencia viaje con el veredicto, y que un fallo se
// diga en vez de dejar un hueco que se lee como "no hay controles".

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

const getFrameworkControls = vi.fn();
vi.mock("../../api/compliance", () => ({
  getFrameworkControls: (...args) => getFrameworkControls(...args),
}));

import FrameworkControlsPanel from "./FrameworkControlsPanel";

beforeEach(() => {
  getFrameworkControls.mockReset();
});
afterEach(cleanup);

// Forma real de prod (CIS Windows 11 en T111).
const CONTROLS = [
  {
    controlId: "18.9.12",
    controlTitle: "BitLocker Drive Encryption",
    controlLevel: "L2",
    checks: [{ checkId: "windows.bitlocker.system_drive_encrypted", title: "BitLocker", severity: "high" }],
    devicesPassing: 0,
    devicesFailing: 50,
    devicesNotAssessed: 0,
    status: "fail",
  },
  {
    controlId: "19.1.3.3",
    controlTitle: "Password protect the screen saver",
    controlLevel: "L1",
    checks: [{ checkId: "windows.screen_lock.screensaver_secure", title: "Screensaver", severity: "medium" }],
    devicesPassing: 0,
    devicesFailing: 0,
    devicesNotAssessed: 50,
    notAssessedReasons: ["path 'screenLock.screenSaverSecure' not reported"],
    status: "not_assessed",
  },
  {
    controlId: "18.3.2",
    controlTitle: "Legacy cryptographic protocols and ciphers",
    controlLevel: "L1",
    checks: [
      { checkId: "windows.crypto.legacy_tls_disabled", title: "Legacy TLS", severity: "high" },
      { checkId: "windows.crypto.weak_ciphers_disabled", title: "Weak ciphers", severity: "high" },
    ],
    devicesPassing: 50,
    devicesFailing: 0,
    devicesNotAssessed: 0,
    status: "pass",
  },
];

const ok = (controls) => ({ ok: true, framework: "cis_windows_11_v3.0", controls });

describe("FrameworkControlsPanel", () => {
  it("leads with how much of the standard we cover, then the verdict", async () => {
    // "Tracenium sólo te dice que cubres el 20% de un 10% del CIS." Las
    // dos frases van en este orden a propósito: la cobertura primero,
    // porque sin ella el veredicto se lee como si fuera sobre el total.
    getFrameworkControls.mockResolvedValue(ok(CONTROLS));
    render(<FrameworkControlsPanel framework="cis_windows_11_v3.0" />);

    expect(await screen.findByText(/covers 3 of 3 controls in this standard \(100%\)/i)).toBeInTheDocument();
    expect(screen.getByText(/Of those 3: 1 met/)).toBeInTheDocument();
    expect(screen.getByText(/1 not met/)).toBeInTheDocument();
    expect(screen.getByText(/1 not assessed/)).toBeInTheDocument();
  });

  it("cuenta los controles del estándar que no cubrimos", async () => {
    const conHueco = [
      ...CONTROLS,
      { controlId: "1.1.1", controlTitle: "Enforce password history", controlLevel: null,
        checks: [], devicesPassing: 0, devicesFailing: 0, devicesNotAssessed: 0,
        automated: true, status: "no_evidence" },
      { controlId: "1.1.9", controlTitle: "Review approved software", controlLevel: null,
        checks: [], devicesPassing: 0, devicesFailing: 0, devicesNotAssessed: 0,
        automated: false, status: "no_evidence" },
    ];
    getFrameworkControls.mockResolvedValue(ok(conHueco));
    render(<FrameworkControlsPanel framework="cis_windows_11_v3.0" />);

    expect(await screen.findByText(/covers 3 of 5 controls in this standard \(60%\)/i)).toBeInTheDocument();
    // De los 2 sin cubrir, sólo 1 es alcanzable por un agente.
    expect(screen.getByText(/1 of the 2 uncovered controls are machine-checkable/)).toBeInTheDocument();
  });

  it("distingue 'no cubierto' de 'no evaluado'", async () => {
    // not_assessed: lo medimos y no pudimos juzgarlo — falta el DATO.
    // no_evidence:  ni lo miramos — falta el TRABAJO.
    const conHueco = [...CONTROLS,
      { controlId: "1.1.1", controlTitle: "Enforce password history", controlLevel: null,
        checks: [], devicesPassing: 0, devicesFailing: 0, devicesNotAssessed: 0,
        automated: true, status: "no_evidence" }];
    getFrameworkControls.mockResolvedValue(ok(conHueco));
    render(<FrameworkControlsPanel framework="cis_windows_11_v3.0" />);

    const sinCubrir = (await screen.findByText("1.1.1")).closest("tr");
    expect(within(sinCubrir).getByText("Not covered")).toBeInTheDocument();
    expect(within(sinCubrir).getByText(/no check collects this yet/)).toBeInTheDocument();

    const sinEvaluar = screen.getByText("19.1.3.3").closest("tr");
    expect(within(sinEvaluar).getByText("Not assessed")).toBeInTheDocument();
  });

  it("dice cuándo un control no lo puede cerrar ningún agente", async () => {
    const manual = [{ controlId: "1.1.9", controlTitle: "Review approved software",
      controlLevel: null, checks: [], devicesPassing: 0, devicesFailing: 0,
      devicesNotAssessed: 0, automated: false, status: "no_evidence" }];
    getFrameworkControls.mockResolvedValue(ok(manual));
    render(<FrameworkControlsPanel framework="cis_windows_11_v3.0" />);

    expect(await screen.findByText(/manual review — no agent can check this/)).toBeInTheDocument();
  });

  it("renders each control with its verdict and device counts", async () => {
    getFrameworkControls.mockResolvedValue(ok(CONTROLS));
    render(<FrameworkControlsPanel framework="cis_windows_11_v3.0" />);

    const met = (await screen.findByText("18.3.2")).closest("tr");
    expect(within(met).getByText("Met")).toBeInTheDocument();
    expect(within(met).getByText("Legacy cryptographic protocols and ciphers")).toBeInTheDocument();

    const failed = screen.getByText("18.9.12").closest("tr");
    expect(within(failed).getByText("Not met")).toBeInTheDocument();
    expect(within(failed).getByText("50")).toBeInTheDocument();
  });

  it("does not dress absent evidence up as a pass", async () => {
    getFrameworkControls.mockResolvedValue(ok(CONTROLS));
    render(<FrameworkControlsPanel framework="cis_windows_11_v3.0" />);

    const row = (await screen.findByText("19.1.3.3")).closest("tr");
    expect(within(row).getByText("Not assessed")).toBeInTheDocument();
    expect(within(row).queryByText("Met")).toBeNull();
  });

  it("says WHY a control could not be assessed", async () => {
    // Without the reason, "Not assessed" reads as a verdict Tracenium
    // chose. It is the opposite: evidence that never arrived.
    getFrameworkControls.mockResolvedValue(ok(CONTROLS));
    render(<FrameworkControlsPanel framework="cis_windows_11_v3.0" />);

    const row = (await screen.findByText("19.1.3.3")).closest("tr");
    expect(within(row).getByText(/screenLock\.screenSaverSecure' not reported/)).toBeInTheDocument();
  });

  it("shows the checks behind a verdict, so it can be argued with", async () => {
    getFrameworkControls.mockResolvedValue(ok(CONTROLS));
    render(<FrameworkControlsPanel framework="cis_windows_11_v3.0" />);

    const row = (await screen.findByText("18.3.2")).closest("tr");
    expect(
      within(row).getByText(/windows\.crypto\.legacy_tls_disabled · windows\.crypto\.weak_ciphers_disabled/)
    ).toBeInTheDocument();
  });

  it("hides a control level that says nothing", async () => {
    // CIS L1/L2 and STIG CAT I/II are meaningful; NIST "baseline" is noise.
    getFrameworkControls.mockResolvedValue(
      ok([{ ...CONTROLS[0], controlId: "SC-28", controlLevel: "baseline" }])
    );
    render(<FrameworkControlsPanel framework="nist_800_53_rev5" />);

    await screen.findByText("SC-28");
    expect(screen.queryByText("baseline")).toBeNull();
  });

  it("scopes the request to the asset group and reloads when it changes", async () => {
    getFrameworkControls.mockResolvedValue(ok(CONTROLS));
    const { rerender } = render(
      <FrameworkControlsPanel framework="cis_windows_11_v3.0" assetGroupId="4" />
    );
    await waitFor(() =>
      expect(getFrameworkControls).toHaveBeenCalledWith({
        framework: "cis_windows_11_v3.0",
        assetGroupId: "4",
      })
    );

    rerender(<FrameworkControlsPanel framework="cis_windows_11_v3.0" assetGroupId="9" />);
    await waitFor(() => expect(getFrameworkControls).toHaveBeenCalledTimes(2));
  });

  it("says a framework has no mappings rather than showing an empty table", async () => {
    getFrameworkControls.mockResolvedValue(ok([]));
    render(<FrameworkControlsPanel framework="stig_macos_14" />);
    expect(await screen.findByText(/No catalog checks are mapped to this framework yet/)).toBeInTheDocument();
  });

  it("surfaces a failure instead of leaving a silent gap", async () => {
    // A blank panel here reads as "this framework has no controls",
    // which is the opposite of what happened.
    getFrameworkControls.mockRejectedValue(new Error("boom controls"));
    render(<FrameworkControlsPanel framework="cis_windows_11_v3.0" />);
    expect(await screen.findByRole("alert")).toHaveTextContent("boom controls");
  });

  // ── Revisión y "no aplica" (cierre de brecha CIS, sep-2026) ─────────
  it("shows 'Needs review' with the evidence the agent read, never as met", async () => {
    getFrameworkControls.mockResolvedValue(ok([
      { controlId: "2.1.4", controlTitle: "Ensure only approved services are listening", checks: [{ checkId: "linux.listen.listening_services_review_x" }], devicesPassing: 0, devicesFailing: 0, devicesReview: 3, devicesNotApplicable: 0, devicesNotAssessed: 0, reviewEvidence: { count: 2, sockets: ["tcp 0.0.0.0:22", "tcp 127.0.0.1:25"] }, status: "review" },
    ]));
    render(<FrameworkControlsPanel framework="cis_ubuntu_24_v2.0.0" />);
    const row = (await screen.findByText("2.1.4")).closest("tr");
    expect(within(row).getByText("Needs review")).toBeInTheDocument();
    expect(within(row).queryByText("Met")).toBeNull();
    expect(within(row).getByTestId("review-evidence-2.1.4").textContent).toMatch(/sockets: \["tcp 0\.0\.0\.0:22"/);
    expect(within(row).getByTestId("review-evidence-2.1.4").textContent).toMatch(/sample from one device/);
    expect(screen.getByText(/1 need review/)).toBeInTheDocument();
  });

  it("tells 'Not applicable' apart from 'Not assessed'", async () => {
    getFrameworkControls.mockResolvedValue(ok([
      { controlId: "2.2.1", controlTitle: "DC only thing", checks: [{ checkId: "windows.x" }], devicesPassing: 0, devicesFailing: 0, devicesReview: 0, devicesNotApplicable: 50, devicesNotAssessed: 0, notAssessedReasons: ["condition on 'domain.role' not met (value workstation)"], status: "not_applicable" },
    ]));
    render(<FrameworkControlsPanel framework="cis_windows_server_2022_v5.1.0" />);
    const row = (await screen.findByText("2.2.1")).closest("tr");
    expect(within(row).getByText("Not applicable")).toBeInTheDocument();
    expect(within(row).queryByText("Not assessed")).toBeNull();
    // El motivo de una guarda no es un hueco de evidencia: no se pinta como aviso.
    expect(within(row).queryByText(/condition on/)).toBeNull();
    expect(screen.getByText(/1 not applicable/)).toBeInTheDocument();
  });

  it("scopes to one device: passes agentId, hides the N/A column and drops the 'sample' label", async () => {
    getFrameworkControls.mockResolvedValue(ok([
      { controlId: "2.1.4", controlTitle: "Listening", checks: [{ checkId: "x" }], devicesPassing: 0, devicesFailing: 0, devicesReview: 1, devicesNotApplicable: 0, devicesNotAssessed: 0, reviewEvidence: { count: 1 }, status: "review" },
    ]));
    render(<FrameworkControlsPanel framework="cis_ubuntu_24_v2.0.0" agentId="agent-7" />);
    await waitFor(() => expect(getFrameworkControls).toHaveBeenCalledWith({ framework: "cis_ubuntu_24_v2.0.0", assetGroupId: undefined, agentId: "agent-7" }));
    await screen.findByText("2.1.4");
    expect(screen.queryByText("N/A")).toBeNull();
    expect(screen.getByTestId("review-evidence-2.1.4").textContent).not.toMatch(/sample/);
  });

  it("names organizational criteria for what they are and keeps them out of coverage", async () => {
    getFrameworkControls.mockResolvedValue({ ok: true, framework: "soc2_tsc_2017", controls: [
      { controlId: "CC6.1", controlTitle: "Logical access", checks: [{ checkId: "x" }], devicesPassing: 10, devicesFailing: 0, devicesNotAssessed: 0, status: "pass", automated: true },
      { controlId: "CC1.1", controlTitle: "Commitment to integrity and ethical values", checks: [], devicesPassing: 0, devicesFailing: 0, devicesNotAssessed: 0, status: "organizational", automated: false },
      { controlId: "CC1.2", controlTitle: "Board oversight", checks: [], devicesPassing: 0, devicesFailing: 0, devicesNotAssessed: 0, status: "organizational", automated: false },
    ] });
    render(<FrameworkControlsPanel framework="soc2_tsc_2017" />);
    const row = (await screen.findByText("CC1.1")).closest("tr");
    expect(within(row).getByText("Organizational")).toBeInTheDocument();
    expect(within(row).queryByText("Not covered")).toBeNull();
    expect(within(row).getByText(/policies, procedures and records/)).toBeInTheDocument();
    // La cobertura se mide sobre lo que un software puede evidenciar: 1 de 1, no 1 de 3.
    expect(screen.getByText(/covers 1 of the 1 device-evidenceable controls in this standard \(100%\)/)).toBeInTheDocument();
    expect(screen.getByText(/The other 2 are organizational/)).toBeInTheDocument();
  });

  // ── Baselines de 800-53 (punto 3 de NIST) ───────────────────────────
  it("filters 800-53 by baseline, Moderate by default, and recounts coverage on the visible set", async () => {
    getFrameworkControls.mockResolvedValue({ ok: true, framework: "nist_800_53_rev5", controls: [
      { controlId: "AC-7", controlTitle: "Unsuccessful Logon Attempts", checks: [{ checkId: "x" }], devicesPassing: 3, devicesFailing: 0, devicesNotAssessed: 0, status: "pass", automated: true, baselines: ["low", "moderate", "high"] },
      { controlId: "AC-2(1)", controlTitle: "Automated System Account Management", checks: [], devicesPassing: 0, devicesFailing: 0, devicesNotAssessed: 0, status: "no_evidence", automated: false, baselines: ["moderate", "high"] },
      { controlId: "AU-9(3)", controlTitle: "Cryptographic Protection", checks: [], devicesPassing: 0, devicesFailing: 0, devicesNotAssessed: 0, status: "no_evidence", automated: true, baselines: ["high"] },
      { controlId: "PM-1", controlTitle: "Program Plan", checks: [], devicesPassing: 0, devicesFailing: 0, devicesNotAssessed: 0, status: "organizational", automated: false, baselines: null },
    ] });
    render(<FrameworkControlsPanel framework="nist_800_53_rev5" />);
    await screen.findByText("AC-7");
    expect(screen.getByRole("button", { name: "moderate" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("AC-2(1)")).toBeInTheDocument();
    expect(screen.queryByText("AU-9(3)")).toBeNull();
    expect(screen.queryByText("PM-1")).toBeNull();
    expect(screen.getByText(/2 controls in the moderate baseline/)).toBeInTheDocument();
    expect(screen.getByText(/covers 1 of 2 controls in this baseline \(50%\)/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "high" }));
    expect(await screen.findByText("AU-9(3)")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "All" }));
    expect(await screen.findByText("PM-1")).toBeInTheDocument();
    expect(screen.getByText(/4 controls$/)).toBeInTheDocument();
  });

  it("shows no baseline selector for a standard without baselines", async () => {
    getFrameworkControls.mockResolvedValue(ok(CONTROLS));
    render(<FrameworkControlsPanel framework="cis_windows_11_v3.0" />);
    await screen.findByText("18.3.2");
    expect(screen.queryByRole("group", { name: "Baseline" })).toBeNull();
  });
});

// ── Familias: una sección por benchmark, nunca una fusión ────────────
//
// `family:cis` responde con `sections`: los benchmarks CIS presentes en el
// ámbito. "1.1.1" de Windows 11 no es "1.1.1" de Ubuntu 24.04, así que
// cada sección lleva su titular, su cobertura y su tabla.
describe("FrameworkControlsPanel — familia", () => {
  const labels = new Map([
    ["cis_ubuntu_24_v2.0.0", "CIS Ubuntu 24.04"],
    ["cis_windows_11_v5.1.0", "CIS Windows 11"],
  ]);

  it("pinta una sección por benchmark presente, rotulada con su nombre y su id", async () => {
    getFrameworkControls.mockResolvedValue({
      ok: true,
      framework: "family:cis",
      family: "cis",
      sections: [
        { framework: "cis_ubuntu_24_v2.0.0", controls: [{ controlId: "4.1", controlTitle: "Firewall", controlLevel: "L1", checks: [{ checkId: "linux.firewall.enabled" }], devicesPassing: 3, devicesFailing: 0, devicesNotAssessed: 0, status: "pass" }] },
        { framework: "cis_windows_11_v5.1.0", controls: CONTROLS },
      ],
    });
    render(<FrameworkControlsPanel framework="family:cis" frameworkLabels={labels} />);

    const ubuntu = await screen.findByTestId("family-section-cis_ubuntu_24_v2.0.0");
    expect(within(ubuntu).getByText("CIS Ubuntu 24.04")).toBeInTheDocument();
    expect(within(ubuntu).getByText("cis_ubuntu_24_v2.0.0")).toBeInTheDocument();
    expect(within(ubuntu).getByText(/covers 1 of 1 controls/i)).toBeInTheDocument();
    expect(within(ubuntu).getByText("4.1")).toBeInTheDocument();

    const windows = screen.getByTestId("family-section-cis_windows_11_v5.1.0");
    expect(within(windows).getByText("CIS Windows 11")).toBeInTheDocument();
    expect(within(windows).getByText(/covers 3 of 3 controls/i)).toBeInTheDocument();
    // Los controles de una sección no se cuelan en la otra.
    expect(within(ubuntu).queryByText("18.9.12")).toBeNull();
    // Y la llamada lleva la familia tal cual: el backend la expande.
    expect(getFrameworkControls).toHaveBeenCalledWith(expect.objectContaining({ framework: "family:cis" }));
  });

  it("sin benchmark presente en el ámbito lo dice, y no 'sin controles'", async () => {
    getFrameworkControls.mockResolvedValue({ ok: true, framework: "family:cis", family: "cis", sections: [] });
    render(<FrameworkControlsPanel framework="family:cis" agentId="dev-1" />);
    expect(await screen.findByText(/No device in scope has reported against a benchmark of this family yet/)).toBeInTheDocument();
    expect(screen.queryByText(/No catalog checks are mapped/)).toBeNull();
  });
});
