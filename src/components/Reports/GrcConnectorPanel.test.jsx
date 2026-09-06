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
});
