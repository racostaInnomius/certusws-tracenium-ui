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

describe("WhatToFixFirst — sólo lo impone un perfil (macOS, 1-oct)", () => {
  const intents = [{ key: "macos.passwordPolicy.minLength", value: 15 }];
  const rows = {
    ok: true,
    items: [{ checkId: "macos.password_policy.min_length", title: "Minimum password length below 14", category: "identity_policy", severity: "high", deviceCount: 9, agentRemediable: false, profileIntents: intents }],
  };

  it("⭐ ofrece añadirlo a la política macOS, no «Show me how»", async () => {
    getTopFailingChecks.mockResolvedValue(rows);
    const onAddToMacPolicy = vi.fn().mockResolvedValue({ added: intents });
    render(<WhatToFixFirst onAddToMacPolicy={onAddToMacPolicy} />);
    fireEvent.click(await screen.findByRole("button", { name: "Add to macOS policy" }));
    await waitFor(() => expect(onAddToMacPolicy).toHaveBeenCalledWith(intents));
    expect(screen.queryByRole("button", { name: /Show me how/ })).toBeNull();
  });

  it("⭐ ya en la política macOS: dice «In the macOS policy», no vuelve a ofrecer «Add»", async () => {
    getTopFailingChecks.mockResolvedValue(rows);
    const onAddToMacPolicy = vi.fn();
    render(
      <WhatToFixFirst onAddToMacPolicy={onAddToMacPolicy} macPolicyKeys={new Set(["macos.passwordPolicy.minLength"])} />
    );
    expect(await screen.findByText("In the macOS policy")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add to macOS policy" })).toBeNull();
  });

  it("sólo una parte en la política: «Add» sigue (añade lo que falta)", async () => {
    const two = [...intents, { key: "macos.passwordPolicy.requireAlnum", value: true }];
    getTopFailingChecks.mockResolvedValue({ ok: true, items: [{ ...rows.items[0], profileIntents: two }] });
    render(<WhatToFixFirst onAddToMacPolicy={vi.fn()} macPolicyKeys={new Set(["macos.passwordPolicy.minLength"])} />);
    expect(await screen.findByRole("button", { name: "Add to macOS policy" })).toBeTruthy();
  });

  it("sin Device Management, la guía de siempre", async () => {
    getTopFailingChecks.mockResolvedValue(rows);
    render(<WhatToFixFirst />);
    expect(await screen.findByRole("button", { name: /Show me how/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Add to macOS policy" })).toBeNull();
  });
});
