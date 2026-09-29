// src/components/jobs/JobDetailSections.test.jsx
//
// Lo que se pide al panel: el crudo empieza PLEGADO, lo legible va arriba, y
// lo que se copia o se despliega sale con lo sensible tapado.

import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { JobOutcomeSection, JobRawDataSection, JobRequestSection } from "./JobDetailSections";

afterEach(cleanup);

const b64url = (obj) =>
  btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(obj))))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

const SAS = "https://x.blob.core.windows.net/a.msi?sv=2026&sig=FIRMAVIVA&rscd=attachment";

const installJob = {
  job_id: "j1",
  job_type: "software_install",
  status: "completed",
  result_json: { source: "agent_ack", message: "software_install:success;deploymentId=59;exit=0;duration=52915;src=origin" },
  payload_json: {
    mode: "install",
    deploymentId: 59,
    sources: [{ url: SAS, tier: "origin" }],
    packageSnapshot: { name: "Google Chrome", version: "154.0.8037.58", platform: "macos", format: "dmg", arch: "any" },
  },
};

describe("Raw data — plegado por defecto", () => {
  it("⭐ ni el result ni el payload crudos se ven hasta que se piden", async () => {
    const user = userEvent.setup();
    render(<JobRawDataSection job={installJob} />);

    const rawResult = screen.getByRole("button", { name: "Raw result" });
    const rawPayload = screen.getByRole("button", { name: "Raw payload" });
    expect(rawResult).toHaveAttribute("aria-expanded", "false");
    expect(rawPayload).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText(/"packageSnapshot"/)).not.toBeInTheDocument();
    expect(screen.queryByText(/software_install:success/)).not.toBeInTheDocument();

    await user.click(rawPayload);
    expect(rawPayload).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText(/"packageSnapshot"/)).toBeInTheDocument();
    // Abrir uno no abre el otro.
    expect(rawResult).toHaveAttribute("aria-expanded", "false");
  });

  it("🔴 el payload desplegado NO enseña la firma SAS", async () => {
    const user = userEvent.setup();
    render(<JobRawDataSection job={installJob} />);
    await user.click(screen.getByRole("button", { name: "Raw payload" }));

    expect(screen.queryByText(/FIRMAVIVA/)).not.toBeInTheDocument();
    expect(screen.getByText(/sig=REDACTED/)).toBeInTheDocument();
  });

  it("🔴 «Copy JSON» copia la versión TAPADA", async () => {
    const user = userEvent.setup();
    render(<JobRawDataSection job={installJob} />);
    await user.click(screen.getByRole("button", { name: "Raw payload" }));
    await user.click(screen.getByRole("button", { name: /copy json/i }));

    const copied = await navigator.clipboard.readText();
    expect(copied).toContain('"packageSnapshot"');
    expect(copied).toContain("sig=REDACTED");
    expect(copied).not.toContain("FIRMAVIVA");
    expect(screen.getByRole("button", { name: /copied/i })).toBeInTheDocument();
  });

  it("sin resultado no hay «Raw result», pero el payload sigue", () => {
    render(<JobRawDataSection job={{ ...installJob, result_json: null }} />);
    expect(screen.queryByRole("button", { name: "Raw result" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Raw payload" })).toBeInTheDocument();
  });
});

describe("What happened", () => {
  it("🔴 un agent_update `completed` con `update_started` NO dice éxito", () => {
    const { container } = render(
      <JobOutcomeSection
        job={{ job_type: "agent_update", status: "completed", result_json: { source: "agent_ack", message: "update_started;src=dp" } }}
      />
    );
    expect(screen.getByText(/installer started \(from Distribution Point\)/i)).toBeInTheDocument();
    expect(container.querySelector("[data-tone]")).toHaveAttribute("data-tone", "info");
    expect(screen.queryByText(/^success$/i)).not.toBeInTheDocument();
    // El código literal del agente queda a la vista, en pequeño.
    expect(screen.getByText("update_started")).toBeInTheDocument();
  });

  it("datos legibles: duración en tiempo, origen con nombre", () => {
    render(<JobOutcomeSection job={installJob} />);
    expect(screen.getByText("Installed")).toBeInTheDocument();
    expect(screen.getByText("53 s")).toBeInTheDocument();
    expect(screen.getByText("Cloud (origin)")).toBeInTheDocument();
    expect(screen.getByText("#59")).toBeInTheDocument();
  });

  it("un job fallido cuyo último ack era un progreso lo dice bajo el titular", () => {
    render(
      <JobOutcomeSection
        job={{ job_type: "asp_assess", status: "failed", result_json: { source: "agent_ack", message: "asp_run_started;run=r1" } }}
      />
    );
    expect(screen.getByText("Assessment started")).toBeInTheDocument();
    expect(screen.getByText(/the job then ended as failed/i)).toBeInTheDocument();
  });

  it("sin resultado no pinta nada (un job en curso no es «no devolvió nada»)", () => {
    const { container } = render(<JobOutcomeSection job={{ job_type: "patch_scan", result_json: null }} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("una remediación enseña el ajuste antes → después, no un base64", () => {
    const before = { state: { writes: [{ key: "HKLM\\SOFTWARE\\X", name: "AllowRecall", present: false, current: null, expected: "HKLM\\SOFTWARE\\X:AllowRecall=0", matches: false }] }, isCompliant: false };
    const after = { state: { writes: [{ key: "HKLM\\SOFTWARE\\X", name: "AllowRecall", present: true, current: 0, expected: "HKLM\\SOFTWARE\\X:AllowRecall=0", matches: true }] }, isCompliant: true };
    render(
      <JobOutcomeSection
        job={{
          job_type: "patch_remediate",
          result_json: { source: "agent_ack", message: `patch_remediate:applied;remediationId=645;stateBefore=${b64url(before)};stateAfter=${b64url(after)}` },
        }}
      />
    );
    const table = screen.getByRole("table", { name: /setting changes/i });
    expect(within(table).getByText("AllowRecall")).toBeInTheDocument();
    expect(within(table).getByText("Not set")).toBeInTheDocument();
    expect(within(table).getAllByText("0")).toHaveLength(2); // después y esperado
    expect(screen.getByText(/Compliant before: No · after: Yes/)).toBeInTheDocument();
    expect(screen.queryByText(/eyJ/)).not.toBeInTheDocument();
  });

  it("un lote largo enseña 25 y deja ver el resto", async () => {
    const user = userEvent.setup();
    const items = Array.from({ length: 30 }, (_, i) => `patch_remediate:applied;remediationId=${700 + i}`);
    render(
      <JobOutcomeSection
        job={{ job_type: "patch_remediate", result_json: { source: "agent_ack", message: `patch_remediate_batch:done;items=${b64url(items)}` } }}
      />
    );
    expect(screen.getByText(/Batch finished — 30 fixes: 30 applied/)).toBeInTheDocument();
    expect(screen.getAllByText(/^Fix applied/)).toHaveLength(25);
    await user.click(screen.getByRole("button", { name: /show all 30/i }));
    expect(screen.getAllByText(/^Fix applied/)).toHaveLength(30);
  });

  it("un blob desconocido va plegado, decodificado", async () => {
    const user = userEvent.setup();
    render(<JobOutcomeSection job={{ job_type: "x", result_json: { message: `x:ok;extra=${b64url({ deep: 1 })}` } }} />);
    const toggle = screen.getByRole("button", { name: "Extra" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    await user.click(toggle);
    expect(screen.getByText(/"deep": 1/)).toBeInTheDocument();
  });
});

describe("What was requested", () => {
  it("el paquete y de dónde baja, sin URL", () => {
    render(<JobRequestSection job={installJob} />);
    expect(screen.getByText("Google Chrome 154.0.8037.58")).toBeInTheDocument();
    expect(screen.getByText("macos · dmg")).toBeInTheDocument();
    expect(screen.getByText("Cloud (origin)")).toBeInTheDocument();
    expect(screen.queryByText(/blob\.core/)).not.toBeInTheDocument();
  });

  it("patch_install sin KBs lo dice", () => {
    render(<JobRequestSection job={{ job_type: "patch_install", payload_json: { mode: "install", kbArticleIds: [] } }} />);
    expect(screen.getByText("Updates")).toBeInTheDocument();
    expect(screen.getByText("None listed")).toBeInTheDocument();
  });

  it("sin payload: «No parameters.»", () => {
    render(<JobRequestSection job={{ job_type: "patch_scan", payload_json: {} }} />);
    expect(screen.getByText("No parameters.")).toBeInTheDocument();
  });
});
