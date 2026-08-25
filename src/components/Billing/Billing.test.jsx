import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, waitFor, cleanup, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/**
 * La pantalla de Billing, en lo que puede costar dinero o dejar al cliente
 * atascado. No se prueba la maquetación: se prueban las decisiones.
 *
 * La razón de que exista es un fallo concreto. La versión anterior dejaba
 * contratar sin tarjeta guardada; Stripe creaba entonces la suscripción en
 * estado `incomplete`, y una suscripción `incomplete` NO SE PUEDE MODIFICAR —
 * el cliente quedaba con un ladrillo del que no salía ni pagando ni cambiando
 * de plan. Nada en el frontend lo impedía, y ningún test lo habría visto.
 */

const summary = vi.fn();
const httpPostJson = vi.fn(async () => ({ status: "active" }));

vi.mock("../../api/http", () => ({
  httpGetJson: vi.fn(async (url) => {
    if (url.includes("summary")) return summary();
    if (url.includes("catalog")) return { prices: CATALOG };
    return { invoices: [] };
  }),
  httpPostJson: (...a) => httpPostJson(...a),
}));

// Stripe.js no se carga en jsdom, y no hace falta: lo que se prueba aquí es la
// pantalla, no el iframe de la tarjeta.
vi.mock("./PaymentMethodCard", () => ({ default: () => null }));

const CATALOG = [
  { line: "endpoint", tier: "starter", interval: "monthly", unitAmount: 200, currency: "usd" },
  { line: "endpoint", tier: "professional", interval: "monthly", unitAmount: 600, currency: "usd" },
  { line: "endpoint", tier: "enterprise", interval: "monthly", unitAmount: 1000, currency: "usd" },
  { line: "mdm", tier: "professional", interval: "monthly", unitAmount: 400, currency: "usd" },
];

const SUB = {
  tier: "professional",
  effectiveTier: "professional",
  quantity: 50,
  mdmTier: null,
  mdmQuantity: null,
  billingInterval: "monthly",
  status: "active",
  hasPaymentMethod: true,
  usage: { endpoint: 43, mdm: 0 },
};

import Billing from "./Billing";

beforeEach(() => {
  httpPostJson.mockClear();
  summary.mockReturnValue({ configured: true, publishableKey: "pk_test", subscription: SUB });
});

afterEach(cleanup);

const ready = () => waitFor(() => expect(screen.getByText("Billing")).toBeTruthy());

describe("backend sin configurar", () => {
  it("NOMBRA la variable que falta, en vez de mandar al proveedor", async () => {
    // A esta página sólo llega el OWNER, que en un despliegue propio ES el
    // proveedor. "Contacta con tu proveedor" era mandarlo a hablar consigo
    // mismo sin decirle qué arreglar.
    summary.mockReturnValue({
      configured: false,
      missingConfig: ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"],
      subscription: null,
    });
    render(<Billing />);
    await ready();

    expect(screen.getByText("STRIPE_SECRET_KEY")).toBeTruthy();
    expect(screen.getByText("STRIPE_WEBHOOK_SECRET")).toBeTruthy();
    // El paso que se olvida: ponerlas y no reiniciar deja la pantalla igual, y
    // parece que el cambio no sirvió.
    expect(screen.getByText(/reinicia el proceso/)).toBeTruthy();
  });

  it("sin lista de variables no inventa un diagnóstico", async () => {
    // Un backend viejo no manda `missingConfig`. Enseñar una lista vacía sería
    // afirmar que no falta nada, que es lo contrario de lo que pasa.
    summary.mockReturnValue({ configured: false, subscription: null });
    render(<Billing />);
    await ready();

    expect(screen.getByText(/Contacta con tu proveedor de servicio/)).toBeTruthy();
  });
});

describe("la tarjeta va primero", () => {
  it("SIN tarjeta no se puede confirmar un cambio", async () => {
    // El backend lo rechaza, pero dejar pulsar el botón convierte un paso que
    // falta en un fallo aparente.
    summary.mockReturnValue({
      configured: true,
      publishableKey: "pk_test",
      subscription: { ...SUB, hasPaymentMethod: false },
    });
    render(<Billing />);
    await ready();

    expect(screen.getByText(/Guarda una tarjeta para poder contratar/)).toBeTruthy();

    await userEvent.click(screen.getAllByText("Enterprise")[0]);
    const boton = await screen.findByRole("button", { name: /Revisar cambio/ });
    expect(boton).toBeDisabled();
  });
});

describe("la barra de cambios", () => {
  it("no aparece si no has tocado nada", async () => {
    // Un botón permanente no distingue "no he cambiado nada" de "tengo un
    // cambio pendiente".
    render(<Billing />);
    await ready();

    expect(screen.queryByRole("button", { name: /Revisar cambio/ })).toBeNull();
  });

  it("aparece al cambiar de plan, y confirma en dos pasos", async () => {
    render(<Billing />);
    await ready();

    await userEvent.click(screen.getAllByText("Enterprise")[0]);
    await userEvent.click(await screen.findByRole("button", { name: /Revisar cambio/ }));

    // El diálogo enseña el ANTES y el DESPUÉS: "de $300 a $500" responde la
    // pregunta real, que dos cifras en pantallas distintas no responden.
    const dialogo = within(await screen.findByRole("dialog"));
    expect(dialogo.getByText(/Confirmar cambio de plan/)).toBeTruthy();
    // El importe viejo tachado junto al nuevo. Se busca DENTRO del diálogo:
    // la cabecera enseña el mismo número, y confundirlos daría un test que
    // pasa sin que el diálogo diga nada.
    expect(dialogo.getByText("$300.00")).toBeTruthy();
    expect(dialogo.getByText(/\$500/)).toBeTruthy();

    // Nada se ha mandado todavía: el segundo gesto es el que cobra.
    expect(httpPostJson).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: /Confirmar y pagar/ }));
    await waitFor(() => expect(httpPostJson).toHaveBeenCalled());

    const [, body] = httpPostJson.mock.calls[0];
    expect(body.endpoint).toEqual({ tier: "enterprise", quantity: 50 });
    expect(body.interval).toBe("monthly");
    // Sube de tier: se cobra ya, aunque el importe pudiera bajar.
    expect(body.isUpgrade).toBe(true);
  });
});

describe("licencias frente a flota real", () => {
  it("avisa cuando las licencias no dan para los equipos que ya hay", async () => {
    // Es la decisión más cara de la pantalla y se tomaba a ciegas.
    render(<Billing />);
    await ready();

    const licencias = screen.getAllByLabelText("Licencias")[0];
    // Borrar y teclear: si el campo forzara el mínimo en cada tecla, esto
    // acabaría en 110 en vez de 10 — que fue justo el bug que este test
    // destapó al escribirlo.
    await userEvent.clear(licencias);
    await userEvent.type(licencias, "10");
    expect(licencias.value).toBe("10");

    expect(await screen.findByText(/Ya tienes 43 equipos/)).toBeTruthy();
  });

  it("ofrece adoptar el número real de equipos", async () => {
    render(<Billing />);
    await ready();

    const licencias = screen.getAllByLabelText("Licencias")[0];
    await userEvent.clear(licencias);
    await userEvent.type(licencias, "10");

    // Sin atajo, "tienes 43" es un dato que hay que teclear a mano — y ahí es
    // donde se cuela el 4 o el 430.
    await userEvent.click(await screen.findByRole("button", { name: /usar 43/ }));
    expect(licencias.value).toBe("43");
  });
});
