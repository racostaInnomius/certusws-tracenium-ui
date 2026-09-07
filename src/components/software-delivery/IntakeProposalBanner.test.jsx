// src/components/software-delivery/IntakeProposalBanner.test.jsx

import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import IntakeProposalBanner, { proposalFields, splitNotes } from "./IntakeProposalBanner";

afterEach(cleanup);

describe("IntakeProposalBanner", () => {
  it("shows the AI confidence badge and notes", () => {
    render(
      <IntakeProposalBanner
        intake={{ proposedConfig: { confidence: "low", notes: "NSIS installer — verify /S is silent." } }}
      />
    );
    expect(screen.getByText("Low confidence")).toBeInTheDocument();
    expect(screen.getByText(/NSIS installer/)).toBeInTheDocument();
  });

  it("renders the confidence badge even with no notes", () => {
    render(<IntakeProposalBanner intake={{ proposedConfig: { confidence: "high", notes: null } }} />);
    expect(screen.getByText("High confidence")).toBeInTheDocument();
    expect(screen.queryByText(/Notes:/)).toBeNull();
  });

  it("renders nothing when there is no proposal (blocked / AI-failed intake)", () => {
    const { container } = render(<IntakeProposalBanner intake={{ proposedConfig: null }} />);
    expect(container).toBeEmptyDOMElement();
  });
});


// La propuesta REAL que el pipeline generó para el MSI de Google Chrome
// Enterprise 152.0.7977.83 el 7-sep-2026 — la primera que salió sin ai_error.
const CHROME_CFG = {
  confidence: "high",
  description:
    "Deploys Google Chrome 152.0.7977.83 (Enterprise MSI) silently via msiexec with no user interaction and suppressed restart. Detection is keyed on the MSI ProductCode under the Windows uninstall registry hive.",
  silentInstallArgs: "/qn /norestart",
  silentUninstallArgs: "/qn /norestart",
  expectedExitCodes: [0, 3010, 1641],
  requiresReboot: false,
  detectionRule: {
    type: "registry_uninstall",
    productCode: "{D73883EB-7167-37B2-A69C-06A4744F64D2}",
    versionPattern: "152.0.7977.83",
    displayNamePattern: "Google Chrome",
  },
  notes:
    "Full command lines: install = msiexec /i GoogleChromeStandaloneEnterprise64.msi /qn /norestart ; uninstall = msiexec /x {D73883EB-7167-37B2-A69C-06A4744F64D2} /qn /norestart. Chrome's ProductCode changes with nearly every release, so the detection rule must be updated per version. Reboot is not normally required.",
};

describe("splitNotes · un muro de 900 caracteres se parte en frases", () => {
  it("parte las notas reales de Chrome en varias", () => {
    const parts = splitNotes(CHROME_CFG.notes);
    expect(parts.length).toBeGreaterThan(1);
    expect(parts.some((p) => /ProductCode changes/.test(p))).toBe(true);
  });

  // ⚠️ LA PARTE FRÁGIL, Y LA QUE ESTO FIJA.
  //
  // Partir por puntos a lo bruto trocea "152.0.7977.83" y las rutas del
  // registro. El corte exige que antes del punto NO haya un dígito.
  it("no parte por dentro de una versión", () => {
    const parts = splitNotes("Version 152.0.7977.83 ships now. Check the registry view.");
    expect(parts).toHaveLength(2);
    expect(parts[0]).toContain("152.0.7977.83");
  });

  it("una nota de una sola frase se queda entera", () => {
    expect(splitNotes("Reboot is not required.")).toEqual(["Reboot is not required."]);
  });

  it("sin notas, nada", () => {
    expect(splitNotes("")).toEqual([]);
    expect(splitNotes(null)).toEqual([]);
    expect(splitNotes(undefined)).toEqual([]);
  });
});

describe("proposalFields · los parámetros, separados", () => {
  // ⚠️ Esto es lo que faltaba: el bloque se titulaba "AI proposal" y no
  // enseñaba la propuesta — los argumentos y la detección iban sólo al
  // formulario de abajo.
  it("saca los argumentos y los códigos de salida", () => {
    const rows = proposalFields(CHROME_CFG);
    const byLabel = Object.fromEntries(rows.map((r) => [r.label, r.value]));
    expect(byLabel["Install arguments"]).toBe("/qn /norestart");
    expect(byLabel["Success exit codes"]).toBe("0, 3010, 1641");
    expect(byLabel["Reboot"]).toBe("Not required");
  });

  it("aplana la regla de detección para no enseñar JSON", () => {
    const byLabel = Object.fromEntries(proposalFields(CHROME_CFG).map((r) => [r.label, r.value]));
    expect(byLabel["Detection"]).toBe("registry_uninstall");
    expect(byLabel["Product code"]).toBe("{D73883EB-7167-37B2-A69C-06A4744F64D2}");
    expect(byLabel["Display name"]).toBe("Google Chrome");
  });

  // Una fila vacía ocupa lo mismo que una llena y no dice nada.
  it("omite lo que no viene", () => {
    const rows = proposalFields({ silentInstallArgs: "/S" });
    expect(rows.map((r) => r.label)).toEqual(["Install arguments"]);
  });

  // `false` es un valor, no una ausencia: "no requiere reinicio" es información.
  it("distingue requiresReboot false de ausente", () => {
    expect(proposalFields({ requiresReboot: false }).map((r) => r.value)).toEqual(["Not required"]);
    expect(proposalFields({}).length).toBe(0);
  });

  it("aguanta una propuesta ausente", () => {
    expect(proposalFields(null)).toEqual([]);
  });
});

describe("IntakeProposalBanner · con la propuesta real de Chrome", () => {
  it("enseña los parámetros, no sólo la confianza", () => {
    render(<IntakeProposalBanner intake={{ proposedConfig: CHROME_CFG }} />);
    expect(screen.getByText("Install arguments")).toBeInTheDocument();
    expect(screen.getAllByText("/qn /norestart").length).toBeGreaterThan(0);
    expect(screen.getByText("0, 3010, 1641")).toBeInTheDocument();
  });

  it("las advertencias van en lista, no en un párrafo", () => {
    render(<IntakeProposalBanner intake={{ proposedConfig: CHROME_CFG }} />);
    expect(screen.getByText(/things to check/i)).toBeInTheDocument();
    expect(screen.getAllByRole("listitem").length).toBeGreaterThan(1);
  });

  it("sin propuesta no se pinta nada", () => {
    const { container } = render(<IntakeProposalBanner intake={{ proposedConfig: null }} />);
    expect(container).toBeEmptyDOMElement();
  });
});
