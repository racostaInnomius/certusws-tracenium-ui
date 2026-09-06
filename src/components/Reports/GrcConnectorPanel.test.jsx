// src/components/Reports/GrcConnectorPanel.test.jsx
//
// ADR-0014 E4. The key is revealed exactly once after creation; a target
// is posted with the kind-specific contract; the "New target" button is
// disabled when the server cannot store secrets.

import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { server, respond } from "../../test/msw/server";

import { ConfirmProvider } from "../common/ConfirmDialog";
import GrcConnectorPanel from "./GrcConnectorPanel";

afterEach(() => {
  cleanup();
  server.resetHandlers();
});

const BASE = "/api/v1/reports";

describe("GrcConnectorPanel", () => {
  it("creates a key and reveals the secret once", async () => {
    respond("get", `${BASE}/api-keys`, { ok: true, keys: [], scopes: ["reports:read"] });
    respond("get", `${BASE}/grc/targets`, { ok: true, targets: [], secretsConfigured: true });
    const posted = respond("post", `${BASE}/api-keys`, { ok: true, key: { id: 1, label: "Vanta reader" }, secret: "trk_SECRET_VALUE" }, { status: 201 });
    render(<ConfirmProvider><GrcConnectorPanel /></ConfirmProvider>);
    await screen.findByTestId("api-keys-empty");
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /new key/i }));
    await user.type(screen.getByLabelText("Label"), "Vanta reader");
    await user.click(screen.getByRole("button", { name: /create key/i }));
    expect(await screen.findByTestId("revealed-key")).toHaveTextContent("trk_SECRET_VALUE");
    expect(posted[0].body).toEqual({ label: "Vanta reader" });
  });

  it("posts a webhook target with url + secret and lists it afterwards", async () => {
    respond("get", `${BASE}/api-keys`, { ok: true, keys: [], scopes: ["reports:read"] });
    let targets = [];
    respond("get", `${BASE}/grc/targets`, { ok: true, targets, secretsConfigured: true });
    const posted = respond("post", `${BASE}/grc/targets`, { ok: true, target: { id: 3 } }, { status: 201 });
    render(<ConfirmProvider><GrcConnectorPanel /></ConfirmProvider>);
    await screen.findByTestId("grc-targets-empty");
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /new target/i }));
    await user.type(screen.getByLabelText("Label"), "Drata hook");
    await user.type(screen.getByLabelText("URL"), "https://grc.example.com/tracenium");
    await user.type(screen.getByLabelText("Shared secret"), "0123456789abcdef");
    targets = [{ id: 3, kind: "webhook", label: "Drata hook", config: { url: "https://grc.example.com/tracenium" }, enabled: true }];
    respond("get", `${BASE}/grc/targets`, { ok: true, targets, secretsConfigured: true });
    await user.click(screen.getByRole("button", { name: /create target/i }));
    await waitFor(() => expect(posted).toHaveLength(1));
    expect(posted[0].body).toEqual({ kind: "webhook", label: "Drata hook", config: { url: "https://grc.example.com/tracenium" }, secret: "0123456789abcdef" });
    expect(await screen.findByText("Drata hook")).toBeTruthy();
    expect(screen.getAllByText("Signed webhook").length).toBeGreaterThan(0);
  });

  it("without GRC_SECRETS_KEY on the server the target button is disabled", async () => {
    respond("get", `${BASE}/api-keys`, { ok: true, keys: [{ id: 9, label: "old", keyPrefix: "trk_abcdefgh", revokedAt: "2026-08-01T00:00:00Z" }], scopes: ["reports:read"] });
    respond("get", `${BASE}/grc/targets`, { ok: true, targets: [], secretsConfigured: false });
    render(<ConfirmProvider><GrcConnectorPanel /></ConfirmProvider>);
    await screen.findByText("Revoked");
    expect(screen.getByRole("button", { name: /new target/i }).disabled).toBe(true);
  });

  // El endpoint de entregas existía desde E4 y nadie lo llamaba: `grc_deliveries`
  // se llenaba y sólo se podía mirar entrando a la base de datos. "¿Llegó el
  // informe de este mes?" no tenía respuesta en el portal.
  it("muestra las entregas recientes, con el motivo del fallo a la vista", async () => {
    respond("get", `${BASE}/api-keys`, { ok: true, keys: [], scopes: ["reports:read"] });
    respond("get", `${BASE}/grc/targets`, {
      ok: true,
      secretsConfigured: true,
      targets: [{ id: 3, kind: "webhook", label: "Drata hook", config: { url: "https://grc.example.com/t" }, enabled: true }],
    });
    respond("get", `${BASE}/grc/deliveries`, {
      ok: true,
      deliveries: [
        { id: 11, targetId: 3, runId: 42, status: "failed", httpStatus: 500, error: "webhook returned 500", startedAt: "2026-09-05T06:00:00Z" },
        { id: 10, targetId: 3, runId: 41, status: "ok", httpStatus: 200, error: null, startedAt: "2026-08-01T06:00:00Z" },
      ],
    });

    render(<ConfirmProvider><GrcConnectorPanel /></ConfirmProvider>);

    await screen.findByTestId("grc-deliveries");
    // El motivo va como texto, no en un tooltip: es lo único accionable de una
    // entrega fallida, y un tooltip no existe para el teclado ni se copia.
    expect(screen.getByText("webhook returned 500")).toBeTruthy();
    expect(screen.getByText("run 42")).toBeTruthy();
    // La entrega guarda el id del destino; la etiqueta se resuelve contra la
    // lista de destinos para que la fila diga algo a un humano.
    expect(screen.getAllByText("Drata hook").length).toBeGreaterThan(0);
  });

  it("si el historial de entregas falla, el panel sigue en pie", async () => {
    // Aditivo: una lista informativa no puede llevarse por delante las claves
    // y los destinos, que es lo que de verdad se administra aquí.
    respond("get", `${BASE}/api-keys`, { ok: true, keys: [], scopes: ["reports:read"] });
    respond("get", `${BASE}/grc/targets`, { ok: true, targets: [], secretsConfigured: true });
    respond("get", `${BASE}/grc/deliveries`, { error: "boom" }, { status: 500 });

    render(<ConfirmProvider><GrcConnectorPanel /></ConfirmProvider>);

    expect(await screen.findByTestId("grc-targets-empty")).toBeTruthy();
    expect(await screen.findByTestId("grc-deliveries-empty")).toBeTruthy();
  });
});
