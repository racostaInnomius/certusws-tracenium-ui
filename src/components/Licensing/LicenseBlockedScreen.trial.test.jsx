import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/**
 * La pantalla de consola bloqueada, con sus DOS motivos.
 *
 * Uno es un ajuste de licencias sin responder (ADR-0005 D6) y se resuelve con
 * un clic o borrando equipos. El otro es una prueba vencida sin contratar
 * (ADR-0010) y sólo se resuelve pagando.
 *
 * Enseñar "ajusta tus licencias" a quien tiene una prueba vencida lo manda a
 * arreglar algo que no está roto, y le esconde el único sitio donde SÍ puede
 * arreglarlo. Por eso lo que se prueba aquí es que cada motivo ofrezca su
 * salida — no cómo se ve.
 */

vi.mock("../../api/licensing", () => ({ acceptLicenseAdjustment: vi.fn() }));

import LicenseBlockedScreen from "./LicenseBlockedScreen";

afterEach(cleanup);

const AJUSTE = {
  consoleBlocked: true,
  blockReason: "adjustment_expired",
  used: 60,
  maxDevices: 50,
  adjustment: {
    id: 1,
    fleetAtDetection: 60,
    previousMaxDevices: 50,
    proposedMaxDevices: 60,
    detectedAt: "2026-08-01T00:00:00.000Z",
    dueAt: "2026-08-15T00:00:00.000Z",
  },
};

const PRUEBA = {
  consoleBlocked: true,
  blockReason: "trial_expired",
  trialEndedAt: "2026-11-24T00:00:00.000Z",
  used: 10,
  maxDevices: 50,
  adjustment: null,
};

describe("prueba vencida", () => {
  it("ofrece Billing, que es la ÚNICA salida", async () => {
    const onNavigate = vi.fn();
    render(<LicenseBlockedScreen state={PRUEBA} onNavigate={onNavigate} />);

    await userEvent.click(screen.getByRole("button", { name: /Go to Billing/ }));
    expect(onNavigate).toHaveBeenCalledWith("billing");
  });

  it("no habla de ajustar licencias, que no es su problema", async () => {
    render(<LicenseBlockedScreen state={PRUEBA} onNavigate={vi.fn()} />);

    expect(screen.getByText(/Your trial has ended/)).toBeTruthy();
    expect(screen.queryByText(/adjust your licenses/i)).toBeNull();
    expect(screen.queryByText(/Set my licenses to/)).toBeNull();
  });

  it("promete lo que de verdad pasa con los equipos", async () => {
    // Ni "no se apagó nada" —falso: los plugins caen al suelo— ni un silencio
    // que haga temer que se perdió la configuración. Lo cierto: siguen
    // enrolados, siguen inventariando, el resto está en pausa.
    render(<LicenseBlockedScreen state={PRUEBA} onNavigate={vi.fn()} />);

    expect(screen.getByText(/keep reporting their inventory/)).toBeTruthy();
    expect(screen.getByText(/still here/)).toBeTruthy();
  });
});

describe("ajuste vencido", () => {
  it("sigue ofreciendo su propia salida", async () => {
    // El motivo viejo no puede romperse al añadir el nuevo.
    render(<LicenseBlockedScreen state={AJUSTE} onNavigate={vi.fn()} />);

    expect(screen.getByText(/Your license needs attention/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /Set my licenses to 60/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Go to Billing/ })).toBeNull();
  });
});
