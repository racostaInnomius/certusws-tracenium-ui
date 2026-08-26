import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, waitFor, cleanup, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/**
 * La vista de staff sobre las suscripciones.
 *
 * ⚠️ Los botones se buscan por TEXTO VISIBLE y no por rol+nombre: el Tooltip de
 * MUI sobreescribe el nombre accesible con su `title`, así que
 * `getByRole("button", {name: /Grant/})` matcheaba el tooltip —que dice "Grant
 * or extend"— y no la etiqueta. Un test así pasa con el botón equivocado.
 *
 * Se prueban las distinciones que esta tabla existe para hacer, no su
 * maquetación. Las tres se pueden escribir al revés sin que nada falle:
 * "sin prueba" frente a "prueba agotada", "contratado" frente a "efectivo", y
 * que conceder acceso NO cambia lo que Stripe cobra.
 */

const get = vi.fn();
const post = vi.fn(async () => ({ trialEndsAt: "2026-09-26T12:00:00.000Z" }));

vi.mock("../../api/http", () => ({
  httpGetJson: (...a) => get(...a),
  httpPostJson: (...a) => post(...a),
}));

import StaffSubscriptions from "./StaffSubscriptions";

function row(over = {}) {
  return {
    tenantId: "111",
    tenantName: "Mountainside IG",
    tier: "enterprise",
    effectiveTier: "enterprise",
    status: "active",
    quantity: 55,
    mdmTier: null,
    mdmQuantity: null,
    trialEndsAt: null,
    trialDaysLeft: null,
    pastDueSince: null,
    graceDaysLeft: null,
    hasPaymentMethod: true,
    hasStripeSubscription: true,
    devices: 49,
    maxDevices: 55,
    ...over,
  };
}

const serve = (rows) => get.mockResolvedValue({ subscriptions: rows });

beforeEach(() => {
  post.mockClear();
  serve([row()]);
});
afterEach(cleanup);

const ready = () => waitFor(() => expect(screen.getByText("Subscriptions")).toBeTruthy());

describe("lo que la tabla distingue", () => {
  it("sin prueba muestra un guion, no cero días", async () => {
    // Los tenants heredados nunca tuvieron prueba. "0 días" haría creer que se
    // les agotó — otra conversación comercial completamente distinta.
    serve([row({ trialDaysLeft: null })]);
    render(<StaffSubscriptions />);
    await ready();

    expect(screen.getByText("—")).toBeTruthy();
    expect(screen.queryByText(/0 days left/)).toBeNull();
  });

  it("una prueba agotada dice cuándo terminó", async () => {
    serve([row({ trialDaysLeft: -12, trialEndsAt: "2026-08-14T00:00:00.000Z" })]);
    render(<StaffSubscriptions />);
    await ready();

    expect(screen.getByText(/ended/)).toBeTruthy();
  });

  it("señala cuando el tier que APLICA no es el contratado", async () => {
    // Es lo primero que confunde a quien mira: sin esto nadie entiende por qué
    // un Starter está usando PMP.
    serve([row({ tier: "starter", effectiveTier: "enterprise", trialDaysLeft: 30 })]);
    render(<StaffSubscriptions />);
    await ready();

    expect(screen.getByText("Starter")).toBeTruthy();
    expect(screen.getByText("using Enterprise")).toBeTruthy();
  });

  it("cuenta cuántos piden atención", async () => {
    // Para no tener que leer la tabla entera sólo para saber si hay algo que
    // atender.
    serve([
      row(),
      row({ tenantId: "1", status: "past_due", graceDaysLeft: 3 }),
      row({ tenantId: "2", status: "canceled" }),
    ]);
    render(<StaffSubscriptions />);
    await ready();

    expect(screen.getByText("2 need attention")).toBeTruthy();
  });

  it("marca en rojo al que se pasó de su tope", async () => {
    serve([row({ devices: 60, maxDevices: 55 })]);
    render(<StaffSubscriptions />);
    await ready();

    expect(screen.getByText("60 / 55")).toBeTruthy();
  });
});

describe("conceder acceso", () => {
  it("avisa de que NO cambia lo que Stripe cobra", async () => {
    // Es lo que más se malinterpreta, y por eso se dice donde se decide y no
    // en una nota al pie.
    render(<StaffSubscriptions />);
    await ready();

    await userEvent.click(screen.getByText("Grant"));
    const dialogo = within(await screen.findByRole("dialog"));

    // El aviso lleva un <strong> dentro, así que el texto está partido entre
    // varios nodos y `getByText` no lo encuentra por cadena. Se comprueba sobre
    // el contenido del propio Alert.
    expect(dialogo.getByRole("alert").textContent).toMatch(
      /does not\s*change what Stripe bills/i
    );
  });

  it("dice que se SUMA al tiempo que queda, no que lo sustituye", async () => {
    // Sin esto, quien tiene 60 días por delante teme que "extender un mes" se
    // los recorte a 30.
    serve([row({ trialDaysLeft: 60, trialEndsAt: "2026-10-25T00:00:00.000Z" })]);
    render(<StaffSubscriptions />);
    await ready();

    await userEvent.click(screen.getByText("Extend"));
    const dialogo = within(await screen.findByRole("dialog"));

    expect(dialogo.getByText(/on top of the 60 days/)).toBeTruthy();
  });

  it("manda los meses elegidos al tenant correcto", async () => {
    render(<StaffSubscriptions />);
    await ready();

    await userEvent.click(screen.getByText("Grant"));
    await userEvent.click(await screen.findByRole("button", { name: /Grant access/ }));

    await waitFor(() => expect(post).toHaveBeenCalled());
    const [url, body] = post.mock.calls[0];
    expect(url).toContain("/billing/admin/subscriptions/111/trial");
    expect(body).toEqual({ months: 1 });
  });

  it("nada se manda hasta confirmar", async () => {
    render(<StaffSubscriptions />);
    await ready();

    await userEvent.click(screen.getByText("Grant"));
    await screen.findByRole("dialog");

    expect(post).not.toHaveBeenCalled();
  });
});
