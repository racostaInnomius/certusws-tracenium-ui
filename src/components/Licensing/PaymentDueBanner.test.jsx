import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

/**
 * El aviso de deuda mientras la consola TODAVÍA funciona.
 *
 * Existe porque el correo del rechazo lo recibe quien figura como OWNER, que no
 * siempre es quien usa la consola. Durante los 14 días de gracia el producto va
 * con normalidad, así que sin esto el primer aviso que llega al operador es el
 * corte.
 *
 * Lo que se prueba es lo que cambia una decisión: cuánto se debe, en qué fecha
 * se pierde el acceso, y que el aviso no se pueda hacer desaparecer sin pagar.
 */

import PaymentDueBanner from "./PaymentDueBanner";

afterEach(cleanup);

const deuda = (over = {}) => ({
  outstandingCents: 55_400,
  currency: "usd",
  invoiceCount: 1,
  daysOverdue: 3,
  limitedOn: "2026-09-15T00:00:00.000Z",
  daysUntilLimit: 11,
  payUrl: "https://pay.stripe.com/in_aug",
  ...over,
});

describe("qué dice", () => {
  it("el importe en unidades, no en céntimos", () => {
    render(<PaymentDueBanner payment={deuda()} />);
    expect(screen.getByText(/554\.00/)).toBeTruthy();
  });

  it("la FECHA del corte, no sólo los días", () => {
    // Los días sueltos obligan a calcular; lo que se apunta en el calendario
    // —o se le dice al jefe para que autorice el pago— es el día.
    render(<PaymentDueBanner payment={deuda()} />);
    expect(screen.getByText(/11 days from now/)).toBeTruthy();
    expect(screen.getByText(/September/)).toBeTruthy();
  });

  it("dice cuántas facturas cuando es más de una", () => {
    // Es el cliente que pagó el mes en curso y arrastra el anterior. Hablarle
    // de "su factura" le haría pensar que ya está al día.
    render(<PaymentDueBanner payment={deuda({ invoiceCount: 2, outstandingCents: 65_400 })} />);
    expect(screen.getByText(/2 unpaid invoices/)).toBeTruthy();
  });

  it("aclara que los equipos siguen reportando", () => {
    // Sin esto, el aviso se lee como "se apagó todo" y la llamada a soporte
    // llega antes que el pago.
    render(<PaymentDueBanner payment={deuda()} />);
    expect(screen.getByText(/devices keep reporting/)).toBeTruthy();
  });
});

describe("el tono", () => {
  it("es de aviso mientras queda margen", () => {
    // La mayoría de los rechazos se resuelven en los primeros reintentos de
    // Stripe. Pintar de rojo el día 1 gasta la señal para cuando importa.
    const { container } = render(<PaymentDueBanner payment={deuda({ daysUntilLimit: 11 })} />);
    expect(container.querySelector(".MuiAlert-standardWarning")).toBeTruthy();
  });

  it("sube a error en la última semana", () => {
    const { container } = render(<PaymentDueBanner payment={deuda({ daysUntilLimit: 5 })} />);
    expect(container.querySelector(".MuiAlert-standardError")).toBeTruthy();
  });
});

describe("qué no hace", () => {
  it("NO se puede cerrar", () => {
    // Anuncia la pérdida de acceso en una fecha concreta. Un aspa lo
    // convertiría en algo que se quita una vez y no se vuelve a ver hasta que
    // ya es tarde. Sólo desaparece pagando.
    render(<PaymentDueBanner payment={deuda()} />);
    expect(screen.queryByRole("button", { name: /close/i })).toBeNull();
  });

  it("sin deuda no se pinta nada", () => {
    const { container } = render(<PaymentDueBanner payment={null} />);
    expect(container.firstChild).toBeNull();

    const vacio = render(<PaymentDueBanner payment={deuda({ outstandingCents: 0 })} />);
    expect(vacio.container.firstChild).toBeNull();
  });

  it("sin enlace de pago sigue ofreciendo Billing", () => {
    // El enlace lo sirve Stripe y puede no estar todavía. Quedarse sin ninguna
    // salida convertiría el aviso en un callejón.
    render(<PaymentDueBanner payment={deuda({ payUrl: null })} />);
    expect(screen.queryByText("Pay now")).toBeNull();
    expect(screen.getByText("Billing")).toBeTruthy();
  });
});
