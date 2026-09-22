// src/components/CryptoDiscovery/CdpCryptoPolicyEditor.test.jsx
//
// Settings → Crypto policy. Lo que se fija:
//   · carga lo guardado en el formulario;
//   · ⭐ guardar manda las reglas escritas —y el formulario vacío manda {}—;
//   · ⭐ tras guardar se dice cuántos certificados se volvieron a puntuar;
//   · ⭐ un 400 marca SU campo; un 503 SCHEMA_NOT_MIGRATED se explica;
//   · ⭐ si la lectura falla, no se deja guardar (sobrescribiría con vacío).

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const getCdpCryptoPolicy = vi.fn();
const putCdpCryptoPolicy = vi.fn();
vi.mock("../../api/cdp", () => ({
  getCdpCryptoPolicy: (...a) => getCdpCryptoPolicy(...a),
  putCdpCryptoPolicy: (...a) => putCdpCryptoPolicy(...a)
}));

import CdpCryptoPolicyEditor, { rulesFromForm, formFromRules } from "./CdpCryptoPolicyEditor";

const apiError = (status, code) => Object.assign(new Error(`HTTP ${status}`), { status, code, body: { ok: false, error: code } });

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const saveButton = () => screen.getByRole("button", { name: /save policy/i });

describe("CdpCryptoPolicyEditor", () => {
  it("carga las reglas guardadas en sus campos", async () => {
    getCdpCryptoPolicy.mockResolvedValue({
      ok: true,
      rules: { minRsaBits: 3072, maxValidityDays: 398, allowedCurves: ["brainpoolp256r1", "p-256"], forbiddenSignatureHashes: ["sha1"], blockedIssuers: ["bad ca"], requireEku: true }
    });
    render(<CdpCryptoPolicyEditor />);

    await waitFor(() => expect(screen.getByLabelText(/minimum rsa key size/i)).toHaveValue("3072"));
    expect(screen.getByLabelText(/maximum validity/i)).toHaveValue("398");
    expect(screen.getByRole("checkbox", { name: "P-256" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "P-384" })).not.toBeChecked();
    expect(screen.getByLabelText(/other curves/i)).toHaveValue("brainpoolp256r1");
    expect(screen.getByRole("checkbox", { name: "SHA1" })).toBeChecked();
    expect(screen.getByLabelText(/blocked issuers/i)).toHaveValue("bad ca");
    expect(screen.getByRole("switch", { name: /require extended key usage/i })).toBeChecked();
  });

  it("⭐ guardar manda lo escrito y enseña cuántos se volvieron a puntuar", async () => {
    getCdpCryptoPolicy.mockResolvedValue({ ok: true, rules: {} });
    putCdpCryptoPolicy.mockResolvedValue({ ok: true, rules: { minRsaBits: 3072, forbiddenSignatureHashes: ["md5"] }, rescored: { scanned: 7012, updated: 41 } });
    render(<CdpCryptoPolicyEditor />);

    await waitFor(() => expect(saveButton()).toBeEnabled());
    fireEvent.change(screen.getByLabelText(/minimum rsa key size/i), { target: { value: "3072" } });
    fireEvent.click(screen.getByRole("checkbox", { name: "MD5" }));
    fireEvent.click(saveButton());

    await screen.findByText(/Rescored 7,012 certificates; 41 changed score/);
    expect(putCdpCryptoPolicy).toHaveBeenCalledWith({ minRsaBits: 3072, forbiddenSignatureHashes: ["md5"] });
  });

  it("⭐ el formulario vacío se guarda como «sin reglas»: {}", async () => {
    getCdpCryptoPolicy.mockResolvedValue({ ok: true, rules: { minRsaBits: 2048 } });
    putCdpCryptoPolicy.mockResolvedValue({ ok: true, rules: {}, rescored: { scanned: 1, updated: 1 } });
    render(<CdpCryptoPolicyEditor />);

    await waitFor(() => expect(screen.getByLabelText(/minimum rsa key size/i)).toHaveValue("2048"));
    fireEvent.change(screen.getByLabelText(/minimum rsa key size/i), { target: { value: "" } });
    fireEvent.click(saveButton());

    await screen.findByText(/Rescored 1 certificate; 1 changed score/);
    expect(putCdpCryptoPolicy).toHaveBeenCalledWith({});
  });

  it("⭐ un 400 marca el campo que el servidor rechazó", async () => {
    getCdpCryptoPolicy.mockResolvedValue({ ok: true, rules: {} });
    putCdpCryptoPolicy.mockRejectedValue(apiError(400, "MAX_VALIDITY_DAYS_INVALID"));
    render(<CdpCryptoPolicyEditor />);

    await waitFor(() => expect(saveButton()).toBeEnabled());
    fireEvent.change(screen.getByLabelText(/maximum validity/i), { target: { value: "99999" } });
    fireEvent.click(saveButton());

    expect(await screen.findByText(/between 1 and 3650/)).toBeInTheDocument();
    expect(screen.getByLabelText(/maximum validity/i)).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText(/minimum rsa key size/i)).toHaveAttribute("aria-invalid", "false");
    expect(screen.getByText(/Not saved: one of the rules is invalid/)).toBeInTheDocument();

    // Tocar el campo quita el rojo: el error era del valor anterior.
    fireEvent.change(screen.getByLabelText(/maximum validity/i), { target: { value: "398" } });
    expect(screen.getByLabelText(/maximum validity/i)).toHaveAttribute("aria-invalid", "false");
  });

  it("⭐ 503 SCHEMA_NOT_MIGRATED: lo explica y dice que reintentar no sirve", async () => {
    getCdpCryptoPolicy.mockResolvedValue({ ok: true, rules: {} });
    putCdpCryptoPolicy.mockRejectedValue(apiError(503, "SCHEMA_NOT_MIGRATED"));
    render(<CdpCryptoPolicyEditor />);

    await waitFor(() => expect(saveButton()).toBeEnabled());
    fireEvent.click(saveButton());

    expect(await screen.findByText(/migration 20261021_cdp_risk_score pending/)).toBeInTheDocument();
    expect(screen.getByText(/Retrying won't help/)).toBeInTheDocument();
  });

  it("guardado pero sin repuntuar (columna sin migrar): aviso, no éxito", async () => {
    getCdpCryptoPolicy.mockResolvedValue({ ok: true, rules: {} });
    putCdpCryptoPolicy.mockResolvedValue({ ok: true, rules: {}, rescored: { tenantDb: "t", scanned: 0, updated: 0, skipped: "not_migrated" } });
    render(<CdpCryptoPolicyEditor />);

    await waitFor(() => expect(saveButton()).toBeEnabled());
    fireEvent.click(saveButton());

    expect(await screen.findByText(/scores could not be recomputed/)).toBeInTheDocument();
    expect(screen.queryByText(/Rescored/)).toBeNull();
  });

  it("⭐ si la lectura falla, el formulario queda bloqueado (vacío ≠ no pude leer)", async () => {
    getCdpCryptoPolicy.mockRejectedValue(new Error("HTTP 500: down"));
    render(<CdpCryptoPolicyEditor />);

    expect(await screen.findByText(/Couldn't load the current policy: HTTP 500: down/)).toBeInTheDocument();
    expect(saveButton()).toBeDisabled();
    expect(screen.getByLabelText(/minimum rsa key size/i)).toBeDisabled();

    // Reintentar vuelve a leer y, si va, desbloquea.
    getCdpCryptoPolicy.mockResolvedValue({ ok: true, rules: {} });
    fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    await waitFor(() => expect(saveButton()).toBeEnabled());
  });
});

describe("rulesFromForm / formFromRules", () => {
  it("ida y vuelta, y lo vacío no viaja", () => {
    const rules = { minRsaBits: 4096, maxValidityDays: 90, allowedCurves: ["p-384", "x25519"], forbiddenSignatureHashes: ["md5", "sha1"], blockedIssuers: ["evil", "worse"], requireEku: true };
    expect(rulesFromForm(formFromRules(rules))).toEqual(rules);
    expect(rulesFromForm(formFromRules({}))).toEqual({});
    expect(rulesFromForm(formFromRules(null))).toEqual({});
  });
});
