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

import { remediateBatch, getRemediationsBatch } from "../../api/patchManagement";
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
