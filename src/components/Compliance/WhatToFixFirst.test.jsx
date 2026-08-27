// La sección que responde "¿qué arreglo primero?".
//
// Lo que se fija aquí es sobre todo el CONTRATO DE TIER, porque es donde la
// directiva de producto se vuelve pixels: SCP muestra el hallazgo, PMP es
// quien lo arregla. Sin PMP la fila no desaparece ni se apaga — cambia de
// verbo. Esconderla dejaría al tenant sin ver lo que le pasa, que es
// exactamente lo que sí ha comprado.

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const getTopFailingChecks = vi.fn();
vi.mock("../../api/compliance", () => ({
  getTopFailingChecks: (...a) => getTopFailingChecks(...a),
}));

import WhatToFixFirst from "./WhatToFixFirst";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const ROWS = {
  ok: true,
  items: [
    {
      checkId: "windows.firewall.profiles_enabled",
      title: "Firewall enabled on all profiles",
      category: "firewall",
      severity: "critical",
      deviceCount: 17,
      agentRemediable: true,
    },
    {
      checkId: "macos.password_policy.min_length",
      title: "Minimum password length below 14",
      category: "identity_policy",
      severity: "high",
      deviceCount: 9,
      agentRemediable: false,
    },
  ],
};

describe("WhatToFixFirst", () => {
  it("nombra el control y CUÁNTOS equipos lo incumplen", async () => {
    // El volumen es la información que no existía: un operador podía ver 17
    // equipos en rojo sin saber que fallaban lo mismo.
    getTopFailingChecks.mockResolvedValue(ROWS);
    render(<WhatToFixFirst onRemediate={vi.fn()} />);
    expect(await screen.findByText("Firewall enabled on all profiles")).toBeInTheDocument();
    expect(screen.getByText("17")).toBeInTheDocument();
    expect(screen.getAllByText("devices")).toHaveLength(2); // una por fila
  });

  it("la severidad se dice en TEXTO, no sólo con el color de la barra", async () => {
    getTopFailingChecks.mockResolvedValue(ROWS);
    render(<WhatToFixFirst />);
    expect(await screen.findByText(/Critical · firewall/)).toBeInTheDocument();
    expect(screen.getByText(/High · identity_policy/)).toBeInTheDocument();
  });

  it("con derecho: ofrece arreglar, y dice a cuántos equipos", async () => {
    const onRemediate = vi.fn();
    getTopFailingChecks.mockResolvedValue(ROWS);
    render(<WhatToFixFirst onRemediate={onRemediate} />);
    const btn = await screen.findByRole("button", { name: /Fix 17/ });
    fireEvent.click(btn);
    await waitFor(() => expect(onRemediate).toHaveBeenCalledTimes(1));
    expect(onRemediate.mock.calls[0][0].checkId).toBe("windows.firewall.profiles_enabled");
  });

  it("sin derecho la fila SIGUE, con guía en vez de acción", async () => {
    getTopFailingChecks.mockResolvedValue(ROWS);
    render(<WhatToFixFirst onRemediate={vi.fn()} onOpenCheck={vi.fn()} />);
    // La segunda fila no es remediable por el agente.
    expect(await screen.findByText("Minimum password length below 14")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Show me how/ })).toBeInTheDocument();
    // …y sólo hay UN botón de arreglar, el de la fila que sí lo permite.
    expect(screen.queryAllByRole("button", { name: /^Fix / })).toHaveLength(1);
  });

  it("sin handler de remediación, ninguna fila ofrece arreglar", async () => {
    // Es el caso del tenant sin PMP: la página no pasa el handler.
    getTopFailingChecks.mockResolvedValue(ROWS);
    render(<WhatToFixFirst onOpenCheck={vi.fn()} />);
    await screen.findByText("Firewall enabled on all profiles");
    expect(screen.queryAllByRole("button", { name: /^Fix / })).toHaveLength(0);
    expect(screen.getAllByRole("button", { name: /Show me how/ })).toHaveLength(2);
  });

  it("flota limpia: lo dice, no deja un hueco", async () => {
    getTopFailingChecks.mockResolvedValue({ ok: true, items: [] });
    render(<WhatToFixFirst />);
    expect(await screen.findByText(/Nothing is failing right now/)).toBeInTheDocument();
  });

  it("si la sección falla, lo dice — un hueco mudo se lee como 'no hay nada'", async () => {
    getTopFailingChecks.mockRejectedValue(new Error("boom"));
    render(<WhatToFixFirst />);
    expect(await screen.findByRole("alert")).toHaveTextContent("boom");
  });
});
