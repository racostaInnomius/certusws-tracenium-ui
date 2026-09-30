// src/components/Compliance/BulkFixDialog.test.jsx
//
// «Apply fixes (N)» desde la ficha de un equipo. Lo que se fija:
//   · el diálogo sólo manda los checks que SE PUEDEN aplicar, y dice qué deja
//     fuera (guardados, manuales, los que ya no fallan);
//   · simular y aplicar son dos botones, como en el cajón de un solo fix;
//   · lo que el backend no pudo lanzar se LEE, con su motivo;
//   · el progreso del lote se sondea en UNA llamada, no una por remediación.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";

vi.mock("../../api/patchManagement", () => ({
  remediateBatch: vi.fn(),
  getRemediationsBatch: vi.fn(),
}));

vi.mock("../../api/jobs", () => ({
  createDeviceJob: vi.fn().mockResolvedValue({ ok: true, jobId: "j1" }),
  listDeviceJobs: vi.fn().mockResolvedValue({ ok: true, jobs: [] }),
}));

import { remediateBatch, getRemediationsBatch } from "../../api/patchManagement";
import { createDeviceJob } from "../../api/jobs";
import BulkFixDialog from "./BulkFixDialog";

const f = (over) => ({ id: over.checkId, checkId: over.checkId, title: `T ${over.checkId}`, status: "fail", agentRemediable: true, ...over });

const FINDINGS = [
  f({ checkId: "a" }),
  f({ checkId: "b" }),
  f({ checkId: "g", agentRemediable: false, remediationPlan: { guard: "LSA settings can break logons" } }),
  f({ checkId: "m", agentRemediable: false }),
  f({ checkId: "done", status: "remediated" }),
];

beforeEach(() => {
  vi.clearAllMocks();
  remediateBatch.mockResolvedValue({
    items: [
      { id: 1, checkId: "a", status: "queued", counts: {} },
      { id: 2, checkId: "b", status: "queued", counts: {} },
    ],
    skipped: [],
  });
  getRemediationsBatch.mockResolvedValue({
    items: [
      { id: 1, checkId: "a", status: "completed", counts: { applied: 1 } },
      { id: 2, checkId: "b", status: "completed", counts: { already_compliant: 1 } },
    ],
  });
});
afterEach(cleanup);

const open = (props = {}) =>
  render(
    <BulkFixDialog
      open findings={FINDINGS} deviceId="dev-1" hostname="WS-ALPHA" canManage
      onClose={vi.fn()} onChanged={vi.fn()} notify={vi.fn()} {...props}
    />
  );

describe("lo que promete el botón", () => {
  it("⭐ dice qué se aplica y qué NO, antes de lanzar nada", () => {
    open();
    expect(screen.getByTestId("bulk-fix-summary")).toHaveTextContent(
      "2 can be applied from here · 1 export as a file (guarded) · 1 need a person · 1 no longer failing"
    );
    expect(screen.getByRole("button", { name: /Dry-run 2/ })).toBeEnabled();
    expect(screen.getByRole("button", { name: /Apply 2/ })).toBeEnabled();
    expect(remediateBatch).not.toHaveBeenCalled();
  });

  it("⭐ sólo viajan los checks aplicables, sobre el equipo abierto", async () => {
    open();
    fireEvent.click(screen.getByRole("button", { name: /Apply 2/ }));
    await waitFor(() => expect(remediateBatch).toHaveBeenCalledTimes(1));
    expect(remediateBatch.mock.calls[0][0]).toEqual({
      checkIds: ["a", "b"], deviceIds: ["dev-1"], mode: "apply",
    });
  });

  it("⭐ al APLICAR avisa al llamante (que suelta la selección); simular no", async () => {
    const onLaunched = vi.fn();
    open({ onLaunched });
    fireEvent.click(screen.getByRole("button", { name: /Dry-run 2/ }));
    await waitFor(() => expect(remediateBatch).toHaveBeenCalledTimes(1));
    expect(onLaunched).not.toHaveBeenCalled();
    cleanup();
    open({ onLaunched });
    fireEvent.click(screen.getByRole("button", { name: /Apply 2/ }));
    await waitFor(() => expect(onLaunched).toHaveBeenCalledTimes(1));
    // Dice QUÉ salió, para que el llamante deje marcados los que no.
    expect(onLaunched).toHaveBeenCalledWith(["a", "b"]);
  });

  it("si el lote no se pudo lanzar, la selección se queda", async () => {
    const onLaunched = vi.fn();
    remediateBatch.mockRejectedValueOnce(new Error("boom"));
    open({ onLaunched });
    fireEvent.click(screen.getByRole("button", { name: /Apply 2/ }));
    await waitFor(() => expect(remediateBatch).toHaveBeenCalledTimes(1));
    expect(onLaunched).not.toHaveBeenCalled();
  });

  it("simular es un botón aparte, no un paso obligatorio", async () => {
    open();
    fireEvent.click(screen.getByRole("button", { name: /Dry-run 2/ }));
    await waitFor(() => expect(remediateBatch).toHaveBeenCalledTimes(1));
    expect(remediateBatch.mock.calls[0][0].mode).toBe("dry_run");
  });

  it("⭐ lo que el backend no pudo lanzar se lee, con su motivo", async () => {
    remediateBatch.mockResolvedValue({
      items: [{ id: 1, checkId: "a", status: "queued", counts: {} }],
      skipped: [{ checkId: "b", error: "PATCH_REMEDIATION_EMPTY_TARGET", message: "the device no longer fails this check" }],
    });
    open();
    fireEvent.click(screen.getByRole("button", { name: /Apply 2/ }));
    const warn = await screen.findByTestId("bulk-fix-skipped");
    expect(warn).toHaveTextContent("T b");
    expect(warn).toHaveTextContent("no longer fails this check");
  });

  it("⭐ el progreso del lote se pide en UNA llamada", async () => {
    open();
    fireEvent.click(screen.getByRole("button", { name: /Apply 2/ }));
    await waitFor(() => expect(getRemediationsBatch).toHaveBeenCalled());
    expect(getRemediationsBatch.mock.calls[0][0]).toEqual([1, 2]);
    // Y el resultado por fix se ve, no sólo un «hecho».
    await screen.findByTestId("bulk-fix-progress");
    await waitFor(() => expect(screen.getByTestId("bulk-fix-progress")).toHaveTextContent("applied: 1"));
    // ⭐ Lo aplicado se distingue a simple vista: chip en verde, no en gris.
    expect(screen.getByText("applied: 1").closest("[data-tone]")).toHaveAttribute("data-tone", "success");
  });

  it("sin nada aplicable no se puede lanzar", () => {
    open({ findings: [f({ checkId: "m", agentRemediable: false })] });
    expect(screen.getByRole("button", { name: /Dry-run 0/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Apply 0/ })).toBeDisabled();
  });

  it("quien sólo lee no lanza", () => {
    open({ canManage: false });
    expect(screen.getByRole("button", { name: /Apply 2/ })).toBeDisabled();
  });
});

describe("confirmar con un escaneo", () => {
  it("⭐ al terminar de APLICAR, ofrece «Rescan to confirm» y lo lanza para ese equipo", async () => {
    open({ canRescan: true });
    fireEvent.click(screen.getByRole("button", { name: /Apply 2/ }));
    const btn = await screen.findByRole("button", { name: /Rescan to confirm/ });
    fireEvent.click(btn);
    await waitFor(() => expect(createDeviceJob).toHaveBeenCalledWith("dev-1", { jobType: "facts_snapshot", payload: { factType: "compliance" } }));
  });

  it("ya lanzado: «Close» es el principal, a la derecha y con el foco; «Rescan to confirm» a la izquierda", async () => {
    open({ canRescan: true });
    fireEvent.click(screen.getByRole("button", { name: /Apply 2/ }));
    const rescan = await screen.findByRole("button", { name: /Rescan to confirm/ });
    const close = screen.getByRole("button", { name: "Close" });
    // En el orden del documento, reescanear va antes que cerrar.
    expect(rescan.compareDocumentPosition(close) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(close.className).toMatch(/MuiButton-contained/);
    expect(rescan.className).toMatch(/MuiButton-outlined/);
    expect(close).toHaveFocus();
  });

  it("tras una simulación, o sin la capacidad `jobs`, no se ofrece", async () => {
    open({ canRescan: true });
    fireEvent.click(screen.getByRole("button", { name: /Dry-run 2/ }));
    await screen.findByTestId("bulk-fix-progress");
    expect(screen.queryByRole("button", { name: /Rescan to confirm/ })).toBeNull();
    cleanup();
    open({ canRescan: false });
    fireEvent.click(screen.getByRole("button", { name: /Apply 2/ }));
    await screen.findByTestId("bulk-fix-progress");
    expect(screen.queryByRole("button", { name: /Rescan to confirm/ })).toBeNull();
  });
});

// 29-sep: reglas de auditd a un servidor sin auditd → «Fix «auditd packages are
// installed» first». Ahora se ofrece instalarlo y seguir, en el mismo job.
describe("requisito que se puede instalar — «¿instalo auditd y sigo?»", () => {
  const PREREQ = { key: "auditd", checkId: "linux.pkg.auditd_a00ddf", title: "auditd packages are installed", deviceIds: ["dev-1"] };

  it("⭐ los fixes retenidos por auditd se agrupan con un botón; pulsarlo relanza SÓLO esos con installPrerequisites", async () => {
    remediateBatch
      .mockResolvedValueOnce({
        items: [{ id: 1, checkId: "a", status: "queued", counts: {} }],
        skipped: [{ checkId: "b", error: "PATCH_REMEDIATION_PREREQUISITE_MISSING", message: "auditd is not installed…", prerequisite: PREREQ }],
      })
      .mockResolvedValueOnce({
        items: [
          { id: 7, checkId: "linux.pkg.auditd_a00ddf", status: "queued", counts: {} },
          { id: 8, checkId: "b", status: "queued", counts: {} },
        ],
        skipped: [],
        prerequisites: [{ ...PREREQ, remediationId: 7 }],
      });
    getRemediationsBatch.mockResolvedValue({ items: [] });
    open();
    fireEvent.click(screen.getByRole("button", { name: /^Apply 2/ }));

    const offer = await screen.findByTestId("bulk-fix-prerequisite-auditd");
    expect(offer).toHaveTextContent(/auditd is not installed on WS-ALPHA, so 1 fix was held back/);
    expect(offer).toHaveTextContent(/T b/);
    // No se mezcla con los omitidos por otros motivos.
    expect(screen.queryByTestId("bulk-fix-skipped")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Install auditd and apply 1" }));
    await waitFor(() => expect(remediateBatch).toHaveBeenCalledTimes(2));
    expect(remediateBatch.mock.calls[1][0]).toEqual({ checkIds: ["b"], deviceIds: ["dev-1"], mode: "apply", installPrerequisites: true });

    // La instalación sale en el progreso con su nombre, y el aviso se va.
    expect(await screen.findByText("auditd packages are installed")).toBeInTheDocument();
    expect(screen.queryByTestId("bulk-fix-prerequisite-auditd")).toBeNull();
  });

  it("en una simulación, el botón simula también (no promete instalar)", async () => {
    remediateBatch.mockResolvedValueOnce({
      items: [],
      skipped: [{ checkId: "a", error: "PATCH_REMEDIATION_PREREQUISITE_MISSING", message: "…", prerequisite: PREREQ }],
    });
    open();
    fireEvent.click(screen.getByRole("button", { name: /^Dry-run 2/ }));
    expect(await screen.findByRole("button", { name: "Dry-run 1 with auditd installed first" })).toBeInTheDocument();
  });

  it("sin permiso de gestión no hay botón", async () => {
    remediateBatch.mockResolvedValueOnce({
      items: [],
      skipped: [{ checkId: "a", error: "PATCH_REMEDIATION_PREREQUISITE_MISSING", message: "…", prerequisite: PREREQ }],
    });
    const { rerender } = open();
    fireEvent.click(screen.getByRole("button", { name: /^Apply 2/ }));
    await screen.findByTestId("bulk-fix-prerequisite-auditd");
    rerender(<BulkFixDialog open findings={FINDINGS} deviceId="dev-1" hostname="WS-ALPHA" canManage={false} onClose={vi.fn()} onChanged={vi.fn()} notify={vi.fn()} />);
    expect(screen.queryByRole("button", { name: /Install auditd/ })).toBeNull();
  });

  // 29-sep (jobs 846f7486 / ff4baf3e): los ajustes de pwquality no tienen fichero
  // sin libpam-pwquality, y su instalación activa pam_pwquality: el aviso lo dice
  // ANTES del botón.
  it("libpam-pwquality: su propio aviso, con su motivo y el efecto en PAM, separado del de auditd", async () => {
    const PWQ = { key: "libpam-pwquality", checkId: "linux.pkg.libpampwquality_6795b3", title: "libpam-pwquality is installed", consequence: "the password-quality settings would have no file to go in (/etc/security/pwquality.conf comes with it)", notice: "Installing libpam-pwquality turns password-quality checks on in PAM: from then on every new password must meet the policy, including one a user is made to choose at login because theirs expired. Open sessions and ordinary logins are not affected.", deviceIds: ["dev-1"] };
    remediateBatch.mockResolvedValueOnce({
      items: [],
      skipped: [
        { checkId: "a", error: "PATCH_REMEDIATION_PREREQUISITE_MISSING", message: "…", prerequisite: PREREQ },
        { checkId: "b", error: "PATCH_REMEDIATION_PREREQUISITE_MISSING", message: "…", prerequisite: PWQ },
      ],
    });
    open();
    fireEvent.click(screen.getByRole("button", { name: /^Apply 2/ }));
    const offer = await screen.findByTestId("bulk-fix-prerequisite-libpam-pwquality");
    expect(offer).toHaveTextContent(/libpam-pwquality is not installed on WS-ALPHA, so 1 fix was held back: without it the password-quality settings would have no file to go in/);
    expect(screen.getByTestId("bulk-fix-prerequisite-notice-libpam-pwquality")).toHaveTextContent(/turns password-quality checks on in PAM/);
    // El de auditd sigue con su motivo y sin aviso de PAM.
    expect(screen.getByTestId("bulk-fix-prerequisite-auditd")).toHaveTextContent(/without it audit rules would not be loaded/);
    expect(screen.queryByTestId("bulk-fix-prerequisite-notice-auditd")).toBeNull();
    expect(screen.getByRole("button", { name: "Install libpam-pwquality and apply 1" })).toBeInTheDocument();
  });
});
