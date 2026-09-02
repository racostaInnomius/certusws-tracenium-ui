// src/components/patch-management/gateway/CredentialDialog.test.jsx
//
// ADR-0013 (F) — el cableado, no la lógica.
//
// `sealTargetNotice.test.js` ya fija las decisiones. Lo que se prueba aquí es
// que el diálogo las USA: una comprobación perfecta conectada a un botón que no
// la mira no defiende nada, y ese es exactamente el error que se cuela sin
// hacer ruido.

import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const getGatewayPublicKey = vi.fn();
const provisionGatewayCredential = vi.fn();

vi.mock("../../../api/patchManagement", () => ({
  getGatewayPublicKey: (...a) => getGatewayPublicKey(...a),
  provisionGatewayCredential: (...a) => provisionGatewayCredential(...a),
}));

// El sellado real usa WebCrypto y un PEM de verdad; aquí estorba. Lo que
// importa es CON QUÉ se llama a provision, no el criptograma.
vi.mock("./sealCredential", async () => {
  const actual = await vi.importActual("./sealCredential");
  return { ...actual, sealCredential: vi.fn(async () => ({ v: 1, ct: "sealed" })) };
});

import CredentialDialog from "./CredentialDialog";

// El repo desmonta explícitamente; sin esto cada render se apila en el mismo
// documento y las aserciones empiezan a ver la salida del test anterior.
afterEach(cleanup);
beforeEach(() => {
  getGatewayPublicKey.mockReset();
  provisionGatewayCredential.mockReset().mockResolvedValue({ credentialState: "sealed_pending" });
});

const A = "a".repeat(64);
const B = "b".repeat(64);
const GATEWAY = { id: 7, name: "vc-lab" };

function renderDialog() {
  return render(
    <CredentialDialog open gateway={GATEWAY} onClose={() => {}} onDone={() => {}} />
  );
}

async function fillCredential(user) {
  await user.type(screen.getByLabelText(/vSphere username/i), "svc@vsphere.local");
  await user.type(screen.getByLabelText(/^Password/i), "hunter2");
  await user.click(screen.getByRole("checkbox", { name: /fingerprint matches/i }));
}

describe("el camino normal sigue funcionando", () => {
  it("sella y envía sin pedir nada extra", async () => {
    getGatewayPublicKey.mockResolvedValue({
      certPem: "PEM", certFingerprintSha256: A, source: "gateway_key",
      pinnedFingerprintSha256: A, fingerprintChanged: false,
    });
    const user = userEvent.setup();
    renderDialog();
    await screen.findByText(/Confirm the gateway's identity/i);

    await fillCredential(user);
    await user.click(screen.getByRole("button", { name: /Seal and send/i }));

    await waitFor(() => expect(provisionGatewayCredential).toHaveBeenCalled());
    // No hubo cambio que aprobar, así que la bandera NO viaja: mandarla siempre
    // desarmaría la comprobación del servidor desde el cliente.
    const [, , opts] = provisionGatewayCredential.mock.calls[0];
    expect(opts?.confirmFingerprintChange).toBeUndefined();
  });
});

describe("⭐ cuando el certificado cambió", () => {
  beforeEach(() => {
    getGatewayPublicKey.mockResolvedValue({
      certPem: "PEM", certFingerprintSha256: B, source: "gateway_key",
      pinnedFingerprintSha256: A, fingerprintChanged: true,
    });
  });

  it("enseña las dos huellas", async () => {
    renderDialog();
    await screen.findByText(/presenting a different certificate/i);

    expect(screen.getByText(/Previously approved/i)).toBeInTheDocument();
    expect(screen.getByText(/Presented now/i)).toBeInTheDocument();
  });

  it("no deja enviar aunque todo lo demás esté relleno", async () => {
    // El paso que sostiene la sección (F). Si el botón se activara igual, las
    // huellas de arriba serían decoración.
    const user = userEvent.setup();
    renderDialog();
    await screen.findByText(/presenting a different certificate/i);

    await fillCredential(user);

    expect(screen.getByRole("button", { name: /Seal and send/i })).toBeDisabled();
    expect(provisionGatewayCredential).not.toHaveBeenCalled();
  });

  it("envía la aprobación explícita cuando se marca la segunda casilla", async () => {
    const user = userEvent.setup();
    renderDialog();
    await screen.findByText(/presenting a different certificate/i);

    await fillCredential(user);
    await user.click(screen.getByRole("checkbox", { name: /verified this change/i }));
    await user.click(screen.getByRole("button", { name: /Seal and send/i }));

    await waitFor(() => expect(provisionGatewayCredential).toHaveBeenCalled());
    const [, , opts] = provisionGatewayCredential.mock.calls[0];
    expect(opts.confirmFingerprintChange).toBe(true);
  });
});

describe("el gateway todavía no ha aparecido", () => {
  it("lo cuenta como espera y no como avería", async () => {
    // Designar un gateway con la máquina apagada es normal. Pintarlo en rojo
    // manda a alguien a buscar un problema que no existe.
    getGatewayPublicKey.mockRejectedValue({
      body: { error: "no_device_certificate", message: "it must connect at least once" },
    });
    renderDialog();

    expect(await screen.findByText(/Waiting for the gateway host/i)).toBeInTheDocument();
  });
});

describe("el servidor rechaza al enviar", () => {
  it("enseña las dos huellas y dice que no se envió nada", async () => {
    // La carrera real: el agente republicó entre abrir el diálogo y enviar.
    getGatewayPublicKey.mockResolvedValue({
      certPem: "PEM", certFingerprintSha256: A, source: "gateway_key",
      pinnedFingerprintSha256: A, fingerprintChanged: false,
    });
    provisionGatewayCredential.mockRejectedValue({
      body: { error: "fingerprint_changed", pinned: A, current: B },
    });

    const user = userEvent.setup();
    renderDialog();
    await screen.findByText(/Confirm the gateway's identity/i);

    await fillCredential(user);
    await user.click(screen.getByRole("button", { name: /Seal and send/i }));

    expect(await screen.findByText(/changed while this dialog was open/i)).toBeInTheDocument();
    expect(screen.getByText(/Nothing was sent/i)).toBeInTheDocument();
  });
});
