import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

/**
 * El TERCER motivo de bloqueo: una factura vencida.
 *
 * No se arregla como los otros dos, y por eso tiene pantalla propia:
 *
 *   · un ajuste de licencias -> un clic aquí mismo;
 *   · una prueba vencida     -> elegir plan en Billing;
 *   · una factura vencida    -> pagar ESA factura, que se salda en la página
 *     que sirve Stripe. Nuestra pantalla de Billing cobra el ciclo vivo y no
 *     reabre uno pasado, así que mandar ahí sería mandar a un sitio donde la
 *     acción que se pide no se puede hacer.
 */

vi.mock("../../api/licensing", () => ({ acceptLicenseAdjustment: vi.fn() }));

import LicenseBlockedScreen from "./LicenseBlockedScreen";

afterEach(cleanup);

const IMPAGO = {
  consoleBlocked: true,
  blockReason: "payment_overdue",
  adjustment: null,
  trialEndedAt: null,
  payment: {
    outstandingCents: 55_400,
    currency: "usd",
    invoiceCount: 1,
    daysOverdue: 20,
    limitedOn: "2026-08-15T00:00:00.000Z",
    daysUntilLimit: -6,
    payUrl: "https://pay.stripe.com/in_aug",
  },
};

describe("la salida que ofrece", () => {
  it("manda a pagar LA factura, fuera del portal", () => {
    render(<LicenseBlockedScreen state={IMPAGO} />);

    const link = screen.getByText("Pay the outstanding invoice").closest("a");
    expect(link.getAttribute("href")).toBe("https://pay.stripe.com/in_aug");
    // Abrir fuera exige cortar el acceso al opener: es una página de pago.
    expect(link.getAttribute("rel")).toContain("noopener");
  });

  it("sin enlace de Stripe cae a Billing en vez de dejar sin salida", () => {
    // Un candado cuya llave no está en ninguna parte es una incidencia de
    // soporte, no una palanca comercial.
    render(<LicenseBlockedScreen state={{ ...IMPAGO, payment: { ...IMPAGO.payment, payUrl: null } }} />);
    expect(screen.getByText("Go to Billing")).toBeTruthy();
  });
});

describe("lo que dice y lo que NO dice", () => {
  it("dice cuánto se debe", () => {
    render(<LicenseBlockedScreen state={IMPAGO} />);
    expect(screen.getByText(/554\.00/)).toBeTruthy();
  });

  it("NO le pide elegir un plan: ya tiene uno", () => {
    // El mensaje de prueba vencida mandaría a contratar a alguien que ya
    // contrató y lo que tiene es una factura sin pagar.
    render(<LicenseBlockedScreen state={IMPAGO} />);
    expect(screen.queryByText(/Your trial has ended/)).toBeNull();
    expect(screen.queryByText(/choose a plan/)).toBeNull();
  });

  it("promete que el acceso vuelve solo al pagar", () => {
    // Es cierto —el bloqueo se deriva de las facturas abiertas, no de un flag
    // que alguien tenga que apagar— y decirlo evita la llamada de "ya pagué,
    // ¿cuánto tarda en activarse?".
    render(<LicenseBlockedScreen state={IMPAGO} />);
    expect(screen.getByText(/Paying restores access immediately/)).toBeTruthy();
  });

  it("aclara que no se ha borrado nada", () => {
    render(<LicenseBlockedScreen state={IMPAGO} />);
    expect(screen.getByText(/nothing\s+has been deleted/)).toBeTruthy();
  });

  it("cuenta las facturas cuando es más de una", () => {
    render(
      <LicenseBlockedScreen
        state={{ ...IMPAGO, payment: { ...IMPAGO.payment, invoiceCount: 2 } }}
      />
    );
    expect(screen.getByText(/unpaid\s+invoices/)).toBeTruthy();
  });
});
