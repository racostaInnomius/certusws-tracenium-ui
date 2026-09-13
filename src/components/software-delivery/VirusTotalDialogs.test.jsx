// VirusTotalDialogs.test.jsx
//
// ADR-0022 — lo que fijan estos tests son las dos condiciones que tienen cara:
// el consentimiento EXPLÍCITO antes de compartir un binario (condición 2) y el
// botón de subir sólo donde tiene sentido (condición 1).

import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { VirusTotalConsentDialog, PendingReputationApproveDialog } from "./VirusTotalDialogs";
import IntakeVerdictBanner, { canSubmitToVirusTotal } from "./IntakeVerdictBanner";

afterEach(cleanup);

describe("condición 2 — consentimiento explícito", () => {
  function openDialog(onConfirm = vi.fn()) {
    render(
      <VirusTotalConsentDialog open filename="InternalApp.msi" submitting={false} error={null} onClose={vi.fn()} onConfirm={onConfirm} />
    );
    return onConfirm;
  }

  it("⚠️ no se puede subir sin marcar las DOS casillas", async () => {
    const onConfirm = openDialog();
    const submit = screen.getByRole("button", { name: /submit to virustotal/i });
    expect(submit).toBeDisabled();

    await userEvent.click(screen.getByRole("checkbox", { name: /shared with virustotal/i }));
    // Con una sola, sigue sin poder.
    expect(submit).toBeDisabled();

    await userEvent.click(screen.getByRole("checkbox", { name: /right to share/i }));
    expect(submit).toBeEnabled();
    await userEvent.click(submit);
    expect(onConfirm).toHaveBeenCalledWith({ acknowledgeSharing: true, rightToShare: true });
  });

  it("dice lo que de verdad pasa: se comparte y el borrado no está garantizado", () => {
    openDialog();
    expect(screen.getByText(/shared with the VirusTotal community/i)).toBeInTheDocument();
    expect(screen.getByText(/deletion is not guaranteed/i)).toBeInTheDocument();
  });

  it("el rechazo del servidor se queda a la vista", () => {
    render(
      <VirusTotalConsentDialog open filename="x.msi" submitting={false} error="No VirusTotal provider is configured" onClose={vi.fn()} onConfirm={vi.fn()} />
    );
    expect(screen.getByText(/no virustotal provider is configured/i)).toBeInTheDocument();
  });
});

describe("condición 3 — aprobar sin esperar es una decisión explícita", () => {
  it("ofrece esperar o aprobar sin esperar, y explica la consecuencia", async () => {
    const onConfirm = vi.fn();
    render(<PendingReputationApproveDialog open submitting={false} onClose={vi.fn()} onConfirm={onConfirm} />);
    expect(screen.getByText(/already be in the catalog/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /approve without waiting/i }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});

describe("condición 1 — el botón de subir sólo cuando VirusTotal no conoce el fichero", () => {
  const base = (reputation, over = {}) => ({
    id: 1,
    filename: "InternalApp.msi",
    status: "pending_review",
    verification: { verdict: "warn", reasons: [], reputation },
    ...over,
  });
  const NO_RECORD = { verdict: "unknown", source: "virustotal" };

  it("sí: consultado y sin registro", () => {
    expect(canSubmitToVirusTotal(base(NO_RECORD))).toBe(true);
  });

  it("sí: una subida anterior falló", () => {
    expect(canSubmitToVirusTotal(base({ ...NO_RECORD, submission: { phase: "failed" } }))).toBe(true);
  });

  it("⚠️ no: la consulta por hash no se hizo", () => {
    expect(canSubmitToVirusTotal(base({ verdict: "not_checked", source: null }))).toBe(false);
  });

  it("no: sin clave configurada (unknown sin fuente) — subir fallaría igual", () => {
    expect(canSubmitToVirusTotal(base({ verdict: "unknown", source: null }))).toBe(false);
  });

  it("no: VirusTotal ya lo conoce, o ya está analizando", () => {
    expect(canSubmitToVirusTotal(base({ verdict: "clean", source: "virustotal" }))).toBe(false);
    expect(canSubmitToVirusTotal(base({ ...NO_RECORD, verdict: "pending", submission: { phase: "analyzing" } }))).toBe(false);
  });

  it("no: el intake ya no está en revisión", () => {
    expect(canSubmitToVirusTotal(base(NO_RECORD, { status: "approved" }))).toBe(false);
  });

  it("el banner enseña el botón sólo a quien puede gestionar", () => {
    const intake = base(NO_RECORD);
    const { rerender } = render(<IntakeVerdictBanner intake={intake} canManage onSubmitToVirusTotal={vi.fn()} />);
    expect(screen.getByRole("button", { name: /submit file to virustotal/i })).toBeInTheDocument();
    rerender(<IntakeVerdictBanner intake={intake} canManage={false} onSubmitToVirusTotal={vi.fn()} />);
    expect(screen.queryByRole("button", { name: /submit file to virustotal/i })).toBeNull();
  });

  it("con análisis en curso lo dice, y con resultado enlaza el informe", () => {
    const { rerender } = render(
      <IntakeVerdictBanner intake={base({ ...NO_RECORD, verdict: "pending", submission: { phase: "analyzing" } })} canManage onSubmitToVirusTotal={vi.fn()} />
    );
    expect(screen.getByText(/analysis in progress/i)).toBeInTheDocument();
    rerender(
      <IntakeVerdictBanner
        intake={base({ verdict: "clean", source: "virustotal", permalink: "https://www.virustotal.com/gui/file/abc" })}
        canManage
        onSubmitToVirusTotal={vi.fn()}
      />
    );
    expect(screen.getByRole("link", { name: /view virustotal report/i })).toHaveAttribute("href", "https://www.virustotal.com/gui/file/abc");
  });
});
