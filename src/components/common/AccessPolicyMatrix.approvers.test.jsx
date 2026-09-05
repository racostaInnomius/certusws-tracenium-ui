// src/components/common/AccessPolicyMatrix.approvers.test.jsx
//
// ⚠️ Encender una regla en un tenant que no puede aprobar nada.
//
// La autoaprobación está prohibida a propósito: un vistobueno de uno mismo
// no es un vistobueno. La consecuencia es que hacen falta DOS personas con
// rol ADMIN u OWNER, y en un tenant con una sola —o con ninguna— encender
// una celda de esta matriz no añade un control: convierte el break-glass en
// el único camino, que es exactamente lo que no debe volverse costumbre.
//
// ADR-0009 lo pide con estas palabras entre sus costes: "hay que detectarlo
// y avisarlo al configurar la política, no descubrirlo la primera noche".
//
// Y no es hipotético. Medido en producción el 2026-09-05: de los tres
// tenants con equipos, uno tiene dos aprobadores, otro uno, y el tercero
// ninguno.

import * as React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const getAccessPolicy = vi.fn();
const setAccessPolicyCell = vi.fn(async () => ({ ok: true }));
vi.mock("../../api/remoteControl", () => ({
  getAccessPolicy: (...a) => getAccessPolicy(...a),
  setAccessPolicyCell: (...a) => setAccessPolicyCell(...a)
}));

import AccessPolicyMatrix from "./AccessPolicyMatrix";

const CELL = {
  capability: "rcp.shell",
  deviceClass: "server",
  requiresApproval: false,
  jitMinutes: 60
};

/**
 * La matriz nace plegada a propósito —para que nadie cambie una celda sin
 * querer—, así que el aviso vive dentro: se ve al ABRIR a configurar, que es
 * el momento en que ADR-0009 pide avisar.
 */
async function openMatrix() {
  const user = userEvent.setup();
  await waitFor(() => expect(getAccessPolicy).toHaveBeenCalled());
  await user.click(screen.getByRole("button", { name: /expand access policy/i }));
}

function renderMatrix() {
  return render(
    <AccessPolicyMatrix
      prefix="rcp."
      title="Approval policy"
      description="Who needs a second person's approval."
    />
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  getAccessPolicy.mockResolvedValue({
    ok: true,
    items: [CELL],
    approvers: { eligible: 2, canApprove: true }
  });
});
afterEach(() => cleanup());

describe("⚠️ el aviso de que no hay quien apruebe", () => {
  it("con un solo administrador, lo dice antes de tocar nada", async () => {
    getAccessPolicy.mockResolvedValue({
      ok: true,
      items: [CELL],
      approvers: { eligible: 1, canApprove: false }
    });
    renderMatrix();
    await openMatrix();

    // El texto va partido en varios nodos (un ternario más la coletilla
    // común), así que se mira el aviso entero y no un nodo suelto.
    const aviso = await screen.findByText((_t, el) =>
      /Only one person in this tenant can approve/i.test(el?.textContent || "") &&
      el?.className?.includes?.("MuiAlert-message")
    );
    expect(aviso.textContent).toMatch(/Only one person in this tenant can approve/i);
    // Y dice qué hacer, no solo qué pasa.
    expect(aviso.textContent).toMatch(/Add a second Admin or Owner first/i);
  });

  it("sin ninguno, la frase es otra: el problema no es el mismo", async () => {
    // "Solo hay una persona" y "no hay nadie con el rol" se arreglan de
    // forma distinta: una añadiendo a alguien, la otra dando el rol.
    getAccessPolicy.mockResolvedValue({
      ok: true,
      items: [CELL],
      approvers: { eligible: 0, canApprove: false }
    });
    renderMatrix();
    await openMatrix();

    const aviso = await screen.findByText((_t, el) =>
      /no member has the Admin or Owner role/i.test(el?.textContent || "") &&
      el?.className?.includes?.("MuiAlert-message")
    );
    expect(aviso.textContent).toMatch(/no member has the Admin or Owner role/i);
  });

  it("con dos o más no se avisa de nada", async () => {
    renderMatrix();
    await openMatrix();
    expect(
      screen.queryByText((_t, el) =>
        /break-glass as the only way in/i.test(el?.textContent || "") &&
        el?.className?.includes?.("MuiAlert-message")
      )
    ).not.toBeInTheDocument();
  });

  it("⚠️ si el backend no pudo contar, tampoco se avisa", async () => {
    // Un aviso alarmante nacido de una avería de lectura enseña a ignorar
    // los avisos. El backend manda `eligible: -1` y `canApprove: true`
    // justamente para no acusar a nadie en la duda.
    getAccessPolicy.mockResolvedValue({
      ok: true,
      items: [CELL],
      approvers: { eligible: -1, canApprove: true }
    });
    renderMatrix();
    await openMatrix();
    expect(
      screen.queryByText((_t, el) =>
        /break-glass as the only way in/i.test(el?.textContent || "") &&
        el?.className?.includes?.("MuiAlert-message")
      )
    ).not.toBeInTheDocument();
  });

  it("un backend antiguo, sin el dato, no rompe la pantalla", async () => {
    // El navegador puede estar hablando con un backend anterior a esto.
    getAccessPolicy.mockResolvedValue({ ok: true, items: [CELL] });
    renderMatrix();
    await openMatrix();
    expect(
      screen.queryByText((_t, el) =>
        /break-glass as the only way in/i.test(el?.textContent || "") &&
        el?.className?.includes?.("MuiAlert-message")
      )
    ).not.toBeInTheDocument();
  });
});
