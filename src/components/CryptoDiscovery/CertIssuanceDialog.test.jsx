// src/components/CryptoDiscovery/CertIssuanceDialog.test.jsx
//
// ADR-0011 fase 3 — el diálogo de emisión e instalación.
//
// Lo que se defiende aquí, además de que MONTE (que es el fallo que ya
// dejó en blanco la pestaña de anclas — identificadores usados sin
// importar son ReferenceError en tiempo de render, no de compilación):
//
//   · que `pending_approval` y `held_for_window` se pinten como
//     INFORMACIÓN y no como error. Ya se cometió ese fallo con el 202 de
//     Remote Control, que salía como «Failed to start session» cuando el
//     gate estaba haciendo exactamente su trabajo.
//   · que el keyId aparezca. Es lo único que ata el certificado firmado
//     a la clave que espera en el equipo, y sin él ese material queda
//     inservible.

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const generateCdpCsr = vi.fn();
const installCdpCert = vi.fn();
const getJob = vi.fn();

vi.mock("../../api/cdp", () => ({
  generateCdpCsr: (...a) => generateCdpCsr(...a),
  installCdpCert: (...a) => installCdpCert(...a)
}));
vi.mock("../../api/jobs", () => ({ getJob: (...a) => getJob(...a) }));

import CertIssuanceDialog from "./CertIssuanceDialog";

const DEVICES = [{ id: "dev-1", name: "web01" }];

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function abrir() {
  return render(
    <CertIssuanceDialog open onClose={() => {}} devices={DEVICES} deviceId="dev-1" />
  );
}

/** Rellena el paso 1 hasta dejar «Pedir CSR» habilitado. */
async function rellenarPaso1(user) {
  await user.type(screen.getByLabelText(/CN \(common name\)/i), "web01.corp");
  await user.type(screen.getByLabelText(/Reason/i), "certificado del portal interno");
  await user.type(screen.getByLabelText(/^Ticket/i), "OPS-42");
}

describe("CertIssuanceDialog", () => {
  it("monta y dice desde el principio que Tracenium no firma", () => {
    abrir();
    expect(screen.getByText(/Issue and install a certificate/i)).toBeInTheDocument();
    // El operador que espere que firmemos perdería el tiempo hasta el
    // paso 2; decirlo arriba es más barato que descubrirlo entonces.
    expect(screen.getByText(/does not sign/i)).toBeInTheDocument();
  });

  it("el expediente es obligatorio: sin motivo ni ticket no se puede pedir", async () => {
    const user = userEvent.setup();
    abrir();
    const boton = screen.getByRole("button", { name: /Request CSR/i });
    expect(boton).toBeDisabled();

    await user.type(screen.getByLabelText(/CN \(common name\)/i), "web01.corp");
    // Con CN pero sin expediente sigue bloqueado.
    expect(screen.getByRole("button", { name: /Request CSR/i })).toBeDisabled();

    await user.type(screen.getByLabelText(/Reason/i), "certificado del portal interno");
    await user.type(screen.getByLabelText(/^Ticket/i), "OPS-42");
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Request CSR/i })).toBeEnabled()
    );
  });

  it("compone el sujeto a partir de CN, O y OU", async () => {
    const user = userEvent.setup();
    abrir();
    await user.type(screen.getByLabelText(/CN \(common name\)/i), "web01.corp");
    await user.type(screen.getByLabelText(/O \(organization\)/i), "Acme");
    expect(screen.getByText("CN=web01.corp,O=Acme")).toBeInTheDocument();
  });

  it("⭐ pending_approval NO es un error: se pinta como información", async () => {
    const user = userEvent.setup();
    generateCdpCsr.mockResolvedValue({
      ok: false,
      status: "pending_approval",
      message: "la política exige visto bueno para un equipo server",
      requestId: "r1"
    });
    abrir();
    await rellenarPaso1(user);
    await user.click(screen.getByRole("button", { name: /Request CSR/i }));

    const aviso = await screen.findByText(/Waiting for approval/i);
    expect(aviso).toBeInTheDocument();
    expect(aviso.closest(".MuiAlert-root")).toHaveClass("MuiAlert-standardInfo");
    // Y se dice que TODAVÍA no hay clave: la decisión 9.a genera tarde
    // justo para que la espera humana no deje huérfanas.
    expect(screen.getByText(/created once approved/i)).toBeInTheDocument();
  });

  it("⭐ muestra el keyId y el CSR cuando el equipo responde", async () => {
    const user = userEvent.setup();
    generateCdpCsr.mockResolvedValue({ ok: true, status: "dispatched", jobId: "j1", keyId: "kabc123" });
    getJob.mockResolvedValue({
      job: { status: "completed", result_json: { csrPem: "-----BEGIN CERTIFICATE REQUEST-----\nZZ\n-----END CERTIFICATE REQUEST-----" } }
    });
    abrir();
    await rellenarPaso1(user);
    await user.click(screen.getByRole("button", { name: /Request CSR/i }));

    // El keyId es lo que hay que guardar; sin él el material del equipo
    // queda inservible.
    expect(await screen.findByText("kabc123", {}, { timeout: 8000 })).toBeInTheDocument();
    expect(screen.getByText(/Keep this identifier/i)).toBeInTheDocument();
    expect(screen.getByDisplayValue(/BEGIN CERTIFICATE REQUEST/)).toBeInTheDocument();
  }, 15000);

  it("acepta un result_json que llega como cadena", async () => {
    // Algunos agentes lo doblan en JSON. Si esto se rompiera, el CSR
    // no aparecería y el operador se quedaría con la clave creada y sin
    // poder usarla.
    const user = userEvent.setup();
    generateCdpCsr.mockResolvedValue({ ok: true, jobId: "j1", keyId: "k2" });
    getJob.mockResolvedValue({
      job: { status: "completed", result_json: JSON.stringify({ csrPem: "-----BEGIN CERTIFICATE REQUEST-----\nQQ\n-----END CERTIFICATE REQUEST-----" }) }
    });
    abrir();
    await rellenarPaso1(user);
    await user.click(screen.getByRole("button", { name: /Request CSR/i }));
    expect(await screen.findByText("k2", {}, { timeout: 8000 })).toBeInTheDocument();
  }, 15000);

  it("un job fallido se reporta con el motivo del equipo", async () => {
    const user = userEvent.setup();
    generateCdpCsr.mockResolvedValue({ ok: true, jobId: "j1", keyId: "k3" });
    getJob.mockResolvedValue({ job: { status: "failed", last_error: "keyId invalido" } });
    abrir();
    await rellenarPaso1(user);
    await user.click(screen.getByRole("button", { name: /Request CSR/i }));
    expect(await screen.findByText(/keyId invalido/i, {}, { timeout: 8000 })).toBeInTheDocument();
  }, 15000);
});

describe("CertIssuanceDialog — instalación", () => {
  /** Salta al paso 3 pasando por el 1 y el 2. */
  async function llegarAInstalar(user) {
    generateCdpCsr.mockResolvedValue({ ok: true, jobId: "j1", keyId: "kabc" });
    getJob.mockResolvedValue({
      job: { status: "completed", result_json: { csrPem: "-----BEGIN CERTIFICATE REQUEST-----\nZZ\n-----END CERTIFICATE REQUEST-----" } }
    });
    abrir();
    await rellenarPaso1(user);
    await user.click(screen.getByRole("button", { name: /Request CSR/i }));
    await screen.findByText("kabc", {}, { timeout: 8000 });
    await user.click(screen.getByRole("button", { name: /I have the signed certificate/i }));
  }

  it("⭐ held_for_window NO es un error: se pinta como aviso, con la próxima apertura", async () => {
    const user = userEvent.setup();
    await llegarAInstalar(user);

    installCdpCert.mockResolvedValue({
      ok: false,
      status: "held_for_window",
      message: "fuera de la ventana de mantenimiento del tenant",
      scheduledAt: "2026-09-08T03:00:00.000Z"
    });

    await user.type(
      screen.getByLabelText(/Signed certificate/i),
      "-----BEGIN CERTIFICATE-----\nAA\n-----END CERTIFICATE-----"
    );
    await user.click(screen.getByRole("button", { name: /^Install$/i }));

    // El texto sale dos veces —título y cuerpo, porque el mensaje del
    // backend lo repite—, así que se ancla en el TÍTULO del Alert.
    const titulo = await screen.findByText(
      /Outside the maintenance window/i,
      { selector: ".MuiAlertTitle-root" }
    );
    // `warning`, no `error`: el gate hizo su trabajo, no falló nada.
    expect(titulo.closest(".MuiAlert-root")).toHaveClass("MuiAlert-standardWarning");
    expect(screen.getByText(/Next opening/i)).toBeInTheDocument();
  }, 20000);

  it("el éxito dice que el inventario es quien lo confirma", async () => {
    const user = userEvent.setup();
    await llegarAInstalar(user);
    installCdpCert.mockResolvedValue({ ok: true, status: "dispatched", jobId: "j2" });

    await user.type(
      screen.getByLabelText(/Signed certificate/i),
      "-----BEGIN CERTIFICATE-----\nAA\n-----END CERTIFICATE-----"
    );
    await user.click(screen.getByRole("button", { name: /^Install$/i }));

    // «El agente dijo que sí» no es «el certificado está ahí». El rescan
    // de verificación es lo que lo separa, y la UI lo dice en vez de
    // dejar creer que ya está.
    expect(await screen.findByText(/If it doesn't show up, it wasn't installed/i)).toBeInTheDocument();
  }, 20000);

  it("no deja instalar sin certificado, aunque el resto esté relleno", async () => {
    const user = userEvent.setup();
    await llegarAInstalar(user);
    expect(screen.getByRole("button", { name: /^Install$/i })).toBeDisabled();
  }, 20000);
});
