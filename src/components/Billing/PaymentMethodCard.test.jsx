import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

// Stripe.js sólo se carga al abrir el formulario; aquí no se abre.
vi.mock("@stripe/stripe-js", () => ({ loadStripe: vi.fn() }));

import PaymentMethodCard from "./PaymentMethodCard";

afterEach(cleanup);

describe("PaymentMethodCard", () => {
  it("⭐ la tarjeta guardada se reconoce: marca, últimos 4 y caducidad", () => {
    // Antes decía "A card is on file" y nada más: ¿cuál?
    render(
      <PaymentMethodCard
        publishableKey="pk_test"
        hasPaymentMethod
        paymentMethod={{ brand: "visa", last4: "4242", expMonth: 8, expYear: 2028 }}
      />
    );
    expect(screen.getByText("Visa ···· 4242")).toBeTruthy();
    expect(screen.getByText("Expires 08/28")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Update" })).toBeTruthy();
  });

  it("sin detalle de Stripe sigue diciendo que hay tarjeta, sin inventar marca", () => {
    render(<PaymentMethodCard publishableKey="pk_test" hasPaymentMethod paymentMethod={null} />);
    expect(screen.getByText("A card is on file")).toBeTruthy();
  });

  it("sin tarjeta ofrece añadirla", () => {
    render(<PaymentMethodCard publishableKey="pk_test" hasPaymentMethod={false} />);
    expect(screen.getByText("No card on file")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Add card" })).toBeTruthy();
  });

  it("embebida en el selector no pinta su propia tarjeta ni título", () => {
    render(<PaymentMethodCard embedded publishableKey="pk_test" hasPaymentMethod={false} />);
    expect(screen.queryByRole("region", { name: "Payment method" })).toBeNull();
    expect(screen.getByRole("button", { name: "Add card" })).toBeTruthy();
  });
});
