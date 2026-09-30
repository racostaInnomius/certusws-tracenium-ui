import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, waitFor, cleanup, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/**
 * La pantalla de Billing, en lo que puede costar dinero o dejar al cliente
 * atascado. No se prueba la maquetación: se prueban las decisiones.
 *
 * Nació de un fallo concreto: se dejaba contratar sin tarjeta, Stripe creaba la
 * suscripción `incomplete` y una `incomplete` NO SE PUEDE MODIFICAR. Después se
 * añadieron los del recorrido del 30-09-2026: un tenant en prueba no podía
 * contratar el plan que tenía delante, guardar la tarjeta borraba la selección,
 * los errores salían donde no se veían y la pantalla decía "Up to date — $500"
 * a quien no pagaba nada.
 */

const summary = vi.fn();
const httpPostJson = vi.fn(async () => ({ status: "active" }));
let invoicesResponse = () => ({ invoices: [] });
let catalogResponse = () => ({ prices: CATALOG, addons: addonsInCatalog });

// Una porción representativa del catálogo real de plugins.
const PLUGIN_CATALOG = [
  { key: "amp", label: "AMP", title: "Asset Management", description: "Hardware and software inventory.", required: true, tier_required: "starter" },
  { key: "scp", label: "SCP", title: "Security Compliance", description: "Compliance facts.", tier_required: "professional" },
  { key: "pmp", label: "PMP", title: "Patch Management", description: "Patch scan and install.", tier_required: "business" },
];

vi.mock("../../api/http", async (importOriginal) => {
  // El módulo real respalda la caché de usePluginCatalog; sólo se sustituyen
  // las dos llamadas.
  const actual = await importOriginal();
  return {
    ...actual,
    httpGetJson: vi.fn(async (url) => {
      if (url.includes("summary")) return summary();
      // "catalog" a secas es ambiguo: precios y plugins son dos endpoints.
      if (url.includes("billing/catalog")) return catalogResponse();
      if (url.includes("plugins/catalog")) return { catalog: PLUGIN_CATALOG };
      if (url.includes("plugin-coverage")) return { total: 10, byPlugin: [{ plugin: "scp", count: 7 }] };
      if (url.includes("billing/invoices")) return invoicesResponse();
      return {};
    }),
    httpPostJson: (...a) => httpPostJson(...a),
  };
});

// Stripe.js no se carga en jsdom. El doble deja "guardar la tarjeta" para
// probar lo que la página hace DESPUÉS, que es donde estaba el fallo.
vi.mock("./PaymentMethodCard", () => ({
  default: ({ onSaved, embedded }) =>
    embedded ? (
      <button type="button" onClick={() => onSaved?.()}>
        fake-save-card
      </button>
    ) : null,
}));

let addonsInCatalog = [];
const COVERAGE = {
  key: "cdp_coverage",
  title: "CDP Coverage",
  plugin: "cdp",
  description: "Crypto Discovery beyond the devices you license.",
  prices: [
    { interval: "monthly", unitAmount: 250000, currency: "usd" },
    { interval: "yearly", unitAmount: 2500000, currency: "usd" },
  ],
};

const CATALOG = [
  { line: "endpoint", tier: "starter", interval: "monthly", unitAmount: 200, currency: "usd" },
  { line: "endpoint", tier: "professional", interval: "monthly", unitAmount: 600, currency: "usd" },
  { line: "endpoint", tier: "business", interval: "monthly", unitAmount: 1000, currency: "usd" },
  { line: "mdm", tier: "professional", interval: "monthly", unitAmount: 400, currency: "usd" },
  { line: "endpoint", tier: "starter", interval: "yearly", unitAmount: 2000, currency: "usd" },
  { line: "endpoint", tier: "professional", interval: "yearly", unitAmount: 6000, currency: "usd" },
  { line: "endpoint", tier: "business", interval: "yearly", unitAmount: 10000, currency: "usd" },
  { line: "mdm", tier: "professional", interval: "yearly", unitAmount: 4000, currency: "usd" },
];

const DAY = 86_400_000;

/** Un cliente que paga por Stripe: Professional × 50, mensual. */
const SUB = {
  tier: "professional",
  effectiveTier: "professional",
  quantity: 50,
  licensedQuantity: 50,
  mdmTier: null,
  mdmQuantity: null,
  billingInterval: "monthly",
  status: "active",
  billedByStripe: true,
  hasPaymentMethod: true,
  paymentMethod: { brand: "visa", last4: "4242", expMonth: 8, expYear: 2028 },
  entitledPluginKeys: ["amp", "scp"],
  addons: [],
  currentPeriodEnd: new Date(Date.now() + 20 * DAY).toISOString(),
  usage: { endpoint: 43, mdm: 0 },
};

/** T109/T113: Business × 50 sembrado por el alta, en prueba, SIN Stripe. */
const TRIAL_UNBILLED = {
  ...SUB,
  tier: "business",
  effectiveTier: "business",
  billingInterval: null,
  billedByStripe: false,
  currentPeriodEnd: null,
  inTrial: true,
  trialEndsAt: new Date(Date.now() + 57 * DAY).toISOString(),
  entitledPluginKeys: ["amp", "scp", "pmp"],
  usage: { endpoint: 3, mdm: 0 },
};

import Billing from "./Billing";
import { LICENSE_STATE_CHANGED_EVENT } from "../../utils/licenseEvents";

const withSub = (subscription) => summary.mockReturnValue({ configured: true, publishableKey: "pk_test", subscription });

beforeEach(() => {
  httpPostJson.mockReset();
  httpPostJson.mockImplementation(async () => ({ status: "active" }));
  addonsInCatalog = [];
  invoicesResponse = () => ({ invoices: [] });
  catalogResponse = () => ({ prices: CATALOG, addons: addonsInCatalog });
  withSub(SUB);
});

afterEach(cleanup);

const ready = () => waitFor(() => expect(screen.getByText("Billing")).toBeTruthy());
const openChange = async () =>
  userEvent.click(await screen.findByRole("button", { name: /^(Change plan|Choose a plan)$/ }));
const panel = () => within(screen.getByRole("region", { name: /^(Change plan|Choose a plan)$/ }));
// Con un diálogo abierto (o cerrándose) MUI marca el resto con aria-hidden, y
// las regiones no se encuentran por rol hasta que termina la transición.
const regionAfterDialog = async (name) => within(await screen.findByRole("region", { name }));
const radio = (name) => screen.getByRole("radio", { name: new RegExp(`^${name}`) });

describe("backend sin configurar", () => {
  it("NOMBRA la variable que falta, en vez de mandar al proveedor", async () => {
    // A esta página sólo llega el OWNER, que en un despliegue propio ES el
    // proveedor.
    summary.mockReturnValue({
      configured: false,
      missingConfig: ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"],
      subscription: null,
    });
    render(<Billing />);
    await ready();

    expect(screen.getByText("STRIPE_SECRET_KEY")).toBeTruthy();
    expect(screen.getByText("STRIPE_WEBHOOK_SECRET")).toBeTruthy();
    expect(screen.getByText(/restart the process/)).toBeTruthy();
  });

  it("sin lista de variables no inventa un diagnóstico", async () => {
    summary.mockReturnValue({ configured: false, subscription: null });
    render(<Billing />);
    await ready();

    expect(screen.getByText(/Contact your service provider/)).toBeTruthy();
  });
});

describe("⭐ la página mira; el selector sólo aparece si se pide", () => {
  it("quien ya paga ve su plan, su cargo y su tarjeta — sin tarjetas de planes", async () => {
    render(<Billing />);
    await ready();

    const plan = within(await screen.findByRole("region", { name: "Your plan" }));
    expect(plan.getByText("Professional")).toBeTruthy();
    expect(plan.getByText("Active")).toBeTruthy();
    expect(plan.getByText("Next charge (estimated)")).toBeTruthy();
    expect(plan.getByText("$300.00/mo")).toBeTruthy();
    expect(plan.getByText("43 of 50 devices")).toBeTruthy();
    // Ni periodicidad ni planes hasta pulsar "Change plan".
    expect(screen.queryByRole("radio")).toBeNull();
    expect(screen.queryByRole("group", { name: "Billing period" })).toBeNull();
  });

  it("'Change plan' abre el selector con lo contratado, y Cancel lo cierra", async () => {
    render(<Billing />);
    await ready();

    await openChange();
    expect(radio("Professional").getAttribute("aria-checked")).toBe("true");
    expect(radio("Professional").getAttribute("aria-label")).toMatch(/\(current plan\)/);
    expect(screen.getByLabelText("Endpoints licenses").value).toBe("50");

    await userEvent.click(panel().getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("radio")).toBeNull();
  });

  it("sin cambios el botón no se puede pulsar, y dice por qué", async () => {
    render(<Billing />);
    await ready();
    await openChange();

    expect(panel().getByText("No changes yet.")).toBeTruthy();
    expect(panel().getByRole("button", { name: "Review change" })).toBeDisabled();
  });

  it("el descuento anual sale de los precios de Stripe", async () => {
    render(<Billing />);
    await ready();
    await openChange();

    expect(screen.getByRole("button", { name: "Yearly · 2 months free" })).toBeTruthy();
  });
});

describe("el tope contratado frente al que se aplica", () => {
  it("avisa cuando no coinciden", async () => {
    // Pasó en producción: el gate aceptaba altas hasta 55 mientras la pantalla
    // decía 1.
    withSub({ ...SUB, quantity: 1, licensedQuantity: 55, usage: { endpoint: 49, mdm: 0 } });
    render(<Billing />);
    await ready();

    expect(await screen.findByText(/Enrollment enforces a cap of/)).toBeTruthy();
  });

  it("sin cantidad contratada NO preselecciona 1", async () => {
    // Ese 1 quedaba preseleccionado y confirmar cualquier otro cambio recortaba
    // el tope del cliente a un equipo.
    withSub({ ...SUB, quantity: null, licensedQuantity: 55, usage: { endpoint: 49, mdm: 0 } });
    render(<Billing />);
    await ready();
    await openChange();

    expect(screen.getByLabelText("Endpoints licenses").value).toBe("55");
  });
});

describe("una línea sin cantidad NO está contratada", () => {
  const conMdmFantasma = { ...SUB, mdmTier: "professional", mdmQuantity: null };

  it("no la preselecciona en 1", async () => {
    // Quien entraba a cambiar OTRA cosa se llevaba una licencia de móvil.
    withSub(conMdmFantasma);
    render(<Billing />);
    await ready();
    await openChange();

    expect(screen.getByRole("checkbox", { name: /MDM \/ MAM/ })).not.toBeChecked();
    expect(screen.queryByLabelText("MDM / MAM licenses")).toBeNull();
  });

  it("añadirla se cobra YA, no se programa como bajada", async () => {
    withSub(conMdmFantasma);
    render(<Billing />);
    await ready();
    await openChange();

    await userEvent.click(screen.getByRole("checkbox", { name: /MDM \/ MAM/ }));
    await userEvent.click(panel().getByRole("button", { name: "Review change" }));

    const dialogo = within(await screen.findByRole("dialog"));
    expect(dialogo.getByText(/not subscribed/)).toBeTruthy();
    expect(dialogo.getByRole("button", { name: /Confirm and pay/ })).toBeTruthy();
    expect(dialogo.queryByText(/end of the current cycle/)).toBeNull();
  });
});

describe("cambiar de plan", () => {
  it("confirma en dos pasos, con el antes y el después en el diálogo", async () => {
    render(<Billing />);
    await ready();
    await openChange();

    await userEvent.click(radio("Business"));
    await userEvent.click(panel().getByRole("button", { name: "Review change" }));

    const dialogo = within(await screen.findByRole("dialog"));
    expect(dialogo.getByText(/Confirm plan change/)).toBeTruthy();
    expect(dialogo.getByText("$300.00")).toBeTruthy();
    expect(dialogo.getByText(/\$500/)).toBeTruthy();
    expect(dialogo.getByText(/difference is charged now/)).toBeTruthy();
    expect(httpPostJson).not.toHaveBeenCalled();

    await userEvent.click(dialogo.getByRole("button", { name: /Confirm and pay/ }));
    await waitFor(() => expect(httpPostJson).toHaveBeenCalled());

    const [, body] = httpPostJson.mock.calls[0];
    expect(body.endpoint).toEqual({ tier: "business", quantity: 50 });
    expect(body.interval).toBe("monthly");
    expect(body.isUpgrade).toBe(true);
    expect(await screen.findByText("Subscription updated.")).toBeTruthy();
    // El selector se cierra: el cambio ya está hecho.
    expect(screen.queryByRole("radio")).toBeNull();
  });

  it("⭐ una bajada dice cuándo aplica — y ya no promete retener datos 90 días", async () => {
    render(<Billing />);
    await ready();
    await openChange();

    await userEvent.click(radio("Starter"));
    await userEvent.click(panel().getByRole("button", { name: "Review change" }));

    const dialogo = within(await screen.findByRole("dialog"));
    expect(dialogo.getByText(/end of the current cycle/)).toBeTruthy();
    expect(dialogo.getByRole("button", { name: "Schedule change" })).toBeTruthy();
    expect(screen.queryByText(/90 days/)).toBeNull();
  });

  it("⭐ un error de Stripe sale DENTRO del selector, junto al botón", async () => {
    // Arriba de la página no lo veía nadie: el usuario está abajo, confirmando.
    httpPostJson.mockRejectedValueOnce(new Error("Your card was declined."));
    render(<Billing />);
    await ready();
    await openChange();

    await userEvent.click(radio("Business"));
    await userEvent.click(panel().getByRole("button", { name: "Review change" }));
    await userEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: /Confirm and pay/ }));

    const selector = await regionAfterDialog(/^Change plan$/);
    expect(await selector.findByText("Your card was declined.")).toBeTruthy();
    // La selección sigue ahí para reintentar.
    expect(radio("Business").getAttribute("aria-checked")).toBe("true");
  });
});

describe("licencias frente a flota real", () => {
  it("avisa cuando las licencias no dan para los equipos que ya hay", async () => {
    render(<Billing />);
    await ready();
    await openChange();

    const licencias = screen.getByLabelText("Endpoints licenses");
    // Borrar y teclear: forzar el mínimo en cada tecla daba 110 en vez de 10.
    await userEvent.clear(licencias);
    await userEvent.type(licencias, "10");
    expect(licencias.value).toBe("10");

    expect(await screen.findByText(/You already have 43 devices/)).toBeTruthy();
  });

  it("ofrece adoptar el número real de equipos", async () => {
    render(<Billing />);
    await ready();
    await openChange();

    const licencias = screen.getByLabelText("Endpoints licenses");
    await userEvent.clear(licencias);
    await userEvent.type(licencias, "10");

    await userEvent.click(await screen.findByRole("button", { name: "Use 43" }));
    expect(licencias.value).toBe("43");
  });
});

describe("la tarjeta va antes que el alta", () => {
  it("SIN tarjeta no se puede confirmar, y el motivo está junto al botón", async () => {
    withSub({ ...SUB, hasPaymentMethod: false, paymentMethod: null });
    render(<Billing />);
    await ready();
    await openChange();

    await userEvent.click(radio("Business"));
    expect(panel().getByText("Add a card to continue.")).toBeTruthy();
    expect(panel().getByRole("button", { name: "Review change" })).toBeDisabled();
  });

  it("⭐ guardar la tarjeta NO borra el plan que se estaba eligiendo", async () => {
    // Recargar ponía el spinner a pantalla completa y reiniciaba la selección:
    // el usuario elegía, guardaba la tarjeta que le faltaba... y volvía a
    // empezar.
    withSub({ ...SUB, hasPaymentMethod: false, paymentMethod: null });
    render(<Billing />);
    await ready();
    await openChange();

    await userEvent.click(radio("Business"));
    const licencias = screen.getByLabelText("Endpoints licenses");
    await userEvent.clear(licencias);
    await userEvent.type(licencias, "60");

    withSub(SUB);
    await userEvent.click(screen.getByRole("button", { name: "fake-save-card" }));

    await waitFor(() => expect(panel().getByRole("button", { name: "Review change" })).not.toBeDisabled());
    expect(radio("Business").getAttribute("aria-checked")).toBe("true");
    expect(screen.getByLabelText("Endpoints licenses").value).toBe("60");
  });
});

describe("⭐ prueba sin suscripción en Stripe (T109, T113)", () => {
  it("no dice 'al día' ni un importe que nadie paga", async () => {
    withSub(TRIAL_UNBILLED);
    render(<Billing />);
    await ready();

    const plan = within(await screen.findByRole("region", { name: "Your plan" }));
    expect(plan.getByText("Trial · not billed")).toBeTruthy();
    expect(plan.getByText("Nothing billed yet")).toBeTruthy();
    expect(plan.queryByText("Active")).toBeNull();
    expect(plan.queryByText(/\$500/)).toBeNull();
    expect(screen.getByText(/Choose a plan before then/)).toBeTruthy();
  });

  it("⭐ puede contratar EL PLAN QUE TIENE DELANTE sin tocar nada, y no se cobra hasta el fin de la prueba", async () => {
    // Antes el plan asignado contaba como contratado: "sin cambios", ningún
    // botón, y el cliente no podía pagar.
    withSub(TRIAL_UNBILLED);
    const events = vi.fn();
    window.addEventListener(LICENSE_STATE_CHANGED_EVENT, events);
    httpPostJson.mockResolvedValueOnce({ status: "trialing" });
    render(<Billing />);
    await ready();

    await openChange();
    expect(radio("Business").getAttribute("aria-checked")).toBe("true");
    expect(screen.getByLabelText("Endpoints licenses").value).toBe("50");
    expect(panel().getByText(/Nothing is charged today/)).toBeTruthy();

    await userEvent.click(panel().getByRole("button", { name: "Review subscription" }));
    const dialogo = within(await screen.findByRole("dialog"));
    expect(dialogo.getByText("Confirm subscription")).toBeTruthy();
    expect(dialogo.getByText(/Nothing is charged today/)).toBeTruthy();
    // Un alta no es "la diferencia prorrateada".
    expect(dialogo.queryByText(/difference/)).toBeNull();

    await userEvent.click(dialogo.getByRole("button", { name: "Subscribe" }));
    await waitFor(() => expect(httpPostJson).toHaveBeenCalled());
    const [, body] = httpPostJson.mock.calls[0];
    expect(body).toMatchObject({ endpoint: { tier: "business", quantity: 50 }, isUpgrade: true });

    expect(await screen.findByText(/Nothing is charged until your trial ends/)).toBeTruthy();
    // Levanta el bloqueo de consola sin recargar.
    await waitFor(() => expect(events).toHaveBeenCalled());
    window.removeEventListener(LICENSE_STATE_CHANGED_EVENT, events);
  });

  it("con la prueba vencida: consola en pausa, y el alta se cobra ya", async () => {
    withSub({
      ...TRIAL_UNBILLED,
      inTrial: false,
      trialLapsed: true,
      trialEndsAt: new Date(Date.now() - 2 * DAY).toISOString(),
      entitledPluginKeys: ["amp"],
    });
    render(<Billing />);
    await ready();

    expect(screen.getByText(/Your trial ended/)).toBeTruthy();
    expect(within(screen.getByRole("region", { name: "Your plan" })).getByText("Trial ended")).toBeTruthy();
    expect(screen.getByLabelText(/SCP — Security Compliance: Paused until you choose a plan/)).toBeTruthy();

    await openChange();
    expect(panel().getByText(/charged now/)).toBeTruthy();
    await userEvent.click(panel().getByRole("button", { name: "Review subscription" }));
    expect(within(await screen.findByRole("dialog")).getByRole("button", { name: "Confirm and pay" })).toBeTruthy();
  });
});

describe("plugins del plan: una pastilla con el nombre completo", () => {
  it("⭐ el tooltip dice el nombre completo y el estado", async () => {
    render(<Billing />);
    await ready();

    const scp = await screen.findByLabelText(/^SCP — Security Compliance: Included in your plan$/);
    await userEvent.hover(scp);
    const tip = await screen.findByRole("tooltip");
    expect(within(tip).getByText("SCP — Security Compliance")).toBeTruthy();
    expect(within(tip).getByText("Reporting on 7 of 10 devices")).toBeTruthy();
  });

  it("también desde el teclado: se llega con Tab y su nombre accesible es el completo", async () => {
    // jsdom no implementa :focus-visible, que es lo que abre el tooltip de MUI
    // con teclado; lo comprobable aquí es que la pastilla recibe el foco y que
    // un lector de pantalla oye el nombre completo, no "AMP".
    render(<Billing />);
    await ready();

    const amp = await screen.findByLabelText(/^AMP — Asset Management/);
    for (let i = 0; i < 40 && document.activeElement !== amp; i += 1) await userEvent.tab();
    expect(document.activeElement).toBe(amp);
    expect(amp.getAttribute("aria-label")).toBe("AMP — Asset Management: Included in your plan");
  });

  it("lo que no está en el plan dice qué plan lo incluye", async () => {
    render(<Billing />);
    await ready();

    expect(await screen.findByLabelText(/^PMP — Patch Management: Requires Business$/)).toBeTruthy();
  });

  it("⭐ en prueba, lo que se usa NO sale como 'Requires Business'", async () => {
    // Se deducía del rango: un tenant Starter en prueba veía el candado en lo
    // que estaba usando.
    withSub({ ...SUB, tier: "starter", inTrial: true, trialEndsAt: new Date(Date.now() + 5 * DAY).toISOString(), entitledPluginKeys: ["amp", "scp", "pmp"] });
    render(<Billing />);
    await ready();

    expect(
      await screen.findByLabelText(/^PMP — Patch Management: Included in your trial — needs Business after it ends$/)
    ).toBeTruthy();
  });

  it("⭐ las opciones del selector se nombran enteras: precio y plugins por su nombre completo", async () => {
    // En Chrome la opción salía como "radio" SIN nombre: dentro llevaba
    // pastillas enfocables, un control anidado en otro.
    render(<Billing />);
    await ready();
    await openChange();

    expect(radio("Business").getAttribute("aria-label")).toBe(
      // CDP y ASP no están en el catálogo de prueba: caen a su clave.
      "Business, $10.00 per device per month, adds Patch Management, CDP, ASP"
    );
    // Nada enfocable dentro de la opción.
    expect(radio("Business").querySelector("[tabindex='0']")).toBeNull();
  });
});

describe("tarjeta, facturas y estados que no son 'todo bien'", () => {
  it("facturas en la página, con el estado traducido", async () => {
    invoicesResponse = () => ({
      invoices: [
        { id: "in_1", number: "A-0002", status: "paid", amountDue: 30000, amountPaid: 30000, currency: "usd", created: "2026-09-01T00:00:00Z", pdfUrl: "https://x/pdf" },
        { id: "in_2", number: "A-0001", status: "open", amountDue: 30000, amountPaid: 0, currency: "usd", created: "2026-08-01T00:00:00Z", pdfUrl: null },
      ],
    });
    render(<Billing />);
    await ready();

    const facturas = within(await screen.findByRole("region", { name: "Invoices" }));
    expect(await facturas.findByText("Paid")).toBeTruthy();
    expect(facturas.getByText("Due")).toBeTruthy();
    expect(facturas.queryByText("open")).toBeNull();
    expect(facturas.getByRole("link", { name: /Download invoice A-0002/ })).toBeTruthy();
    // La cabecera "PDF" es sólo para lectores de pantalla. Con `width: 1` en sx
    // —que MUI lee como 100 %— ensanchaba la página 1.200 px.
    expect(getComputedStyle(facturas.getByText("PDF")).width).toBe("1px");
  });

  it("⭐ si Stripe no responde, dice que falló — no 'aún no hay facturas'", async () => {
    invoicesResponse = () => {
      throw new Error("stripe down");
    };
    render(<Billing />);
    await ready();

    expect(await screen.findByText(/Couldn't load invoices/)).toBeTruthy();
    expect(screen.queryByText(/will appear here/)).toBeNull();
  });

  it("más de cinco facturas: se enseñan cinco y se pueden ver todas", async () => {
    invoicesResponse = () => ({
      invoices: Array.from({ length: 7 }, (_, i) => ({
        id: `in_${i}`, number: `N-${i}`, status: "paid", amountDue: 100, amountPaid: 100, currency: "usd", created: "2026-09-01T00:00:00Z",
      })),
    });
    render(<Billing />);
    await ready();

    const facturas = within(await screen.findByRole("region", { name: "Invoices" }));
    expect(await facturas.findByText("N-4")).toBeTruthy();
    expect(facturas.queryByText("N-5")).toBeNull();
    await userEvent.click(facturas.getByRole("button", { name: "Show all 7" }));
    expect(facturas.getByText("N-6")).toBeTruthy();
  });

  it("⭐ un catálogo caído no se disfraza de 'no hay precios en Stripe'", async () => {
    catalogResponse = () => {
      throw new Error("stripe down");
    };
    render(<Billing />);
    await ready();

    expect(await screen.findByText(/Couldn't load prices from Stripe/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Change plan" })).toBeDisabled();
  });

  it("⭐ con la cancelación programada no hay 'próximo cargo'", async () => {
    withSub({ ...SUB, cancelAtPeriodEnd: true });
    render(<Billing />);
    await ready();

    const plan = within(await screen.findByRole("region", { name: "Your plan" }));
    expect(plan.getByText("Ends on")).toBeTruthy();
    expect(plan.queryByText(/Next charge/)).toBeNull();
    expect(screen.getByText(/won't renew/)).toBeTruthy();
  });
});

// Enterprise: plan gestionado por Tracenium, fuera de Stripe.
describe("plan gestionado (Enterprise)", () => {
  const MANAGED = {
    ...SUB,
    tier: "enterprise",
    effectiveTier: "enterprise",
    quantity: 2500,
    licensedQuantity: 2500,
    managed: true,
    billedByStripe: false,
    pluginKeys: ["scp"],
    entitledPluginKeys: ["amp", "scp"],
  };

  it("en lectura: sin selector, ni tarjeta, ni facturas", async () => {
    withSub(MANAGED);
    render(<Billing />);
    await ready();

    expect(await screen.findByText("Managed by Tracenium")).toBeTruthy();
    expect(screen.getByText(/Contact your account manager/)).toBeTruthy();
    expect(screen.getByText("By contract")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Change plan|Choose a plan/ })).toBeNull();
    expect(screen.queryByRole("region", { name: "Invoices" })).toBeNull();
    expect(httpPostJson).not.toHaveBeenCalled();
  });

  it("lo que falta es 'Not in your plan', no 'Requires Business'", async () => {
    withSub(MANAGED);
    render(<Billing />);
    await ready();

    expect(await screen.findByLabelText(/^PMP — Patch Management: Not in your plan$/)).toBeTruthy();
    expect(screen.queryByLabelText(/Requires Business/)).toBeNull();
  });
});

// ADR-0026 — CDP Coverage se contrata desde aquí.
describe("complemento CDP Coverage", () => {
  const STRIPE_SUB = { ...SUB, entitledPluginKeys: ["amp", "cdp", "scp"] };

  it("⭐ contratar pasa por un diálogo que dice que se cobra YA, y sólo entonces llama al backend", async () => {
    addonsInCatalog = [COVERAGE];
    withSub(STRIPE_SUB);
    render(<Billing />);
    await ready();

    await userEvent.click(await screen.findByRole("button", { name: "Add CDP Coverage" }));
    expect(httpPostJson).not.toHaveBeenCalled();
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/charged now to your card on file/)).toBeTruthy();
    expect(within(dialog).getByText(/nothing is added/)).toBeTruthy();

    withSub({ ...STRIPE_SUB, addons: ["cdp_coverage"] });
    await userEvent.click(within(dialog).getByRole("button", { name: "Add and pay now" }));
    await waitFor(() =>
      expect(httpPostJson).toHaveBeenCalledWith("/api/v1/billing/addons", { addon: "cdp_coverage", enabled: true })
    );
    expect(await screen.findByText("CDP Coverage added to your subscription.")).toBeTruthy();
    expect(await screen.findByRole("button", { name: "Remove CDP Coverage" })).toBeTruthy();
  });

  it("retirar avisa de que no se devuelve el resto del periodo", async () => {
    addonsInCatalog = [COVERAGE];
    withSub({ ...STRIPE_SUB, addons: ["cdp_coverage"] });
    render(<Billing />);
    await ready();

    expect(await screen.findByText("Subscribed")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Remove CDP Coverage" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/not refunded/)).toBeTruthy();
    await userEvent.click(within(dialog).getByRole("button", { name: "Remove now" }));
    await waitFor(() =>
      expect(httpPostJson).toHaveBeenCalledWith("/api/v1/billing/addons", { addon: "cdp_coverage", enabled: false })
    );
  });

  it("sin suscripción de Stripe no hay botón que acabe en 409: dice qué falta", async () => {
    addonsInCatalog = [COVERAGE];
    withSub({ ...STRIPE_SUB, billedByStripe: false });
    render(<Billing />);
    await ready();

    expect(await screen.findByText(/Subscribe to a plan first/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Add CDP Coverage" })).toBeDisabled();
  });

  it("un cargo rechazado se enseña con el mensaje de Stripe, en la tarjeta del complemento", async () => {
    addonsInCatalog = [COVERAGE];
    withSub(STRIPE_SUB);
    httpPostJson.mockRejectedValueOnce(new Error("Your card was declined."));
    render(<Billing />);
    await ready();

    await userEvent.click(await screen.findByRole("button", { name: "Add CDP Coverage" }));
    await userEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Add and pay now" }));
    const addons = await regionAfterDialog("Add-ons");
    expect(await addons.findByText("Your card was declined.")).toBeTruthy();
  });

  it("⭐ el próximo cargo suma el complemento contratado: es el que dirá la factura", async () => {
    addonsInCatalog = [COVERAGE];
    withSub({ ...STRIPE_SUB, addons: ["cdp_coverage"] });
    render(<Billing />);
    await ready();
    // Professional × 50 a $6 = $300 + CDP Coverage mensual $2.500.
    expect(await screen.findByText("$2,800.00/mo")).toBeTruthy();
    expect(screen.getByText("Add-ons: CDP Coverage")).toBeTruthy();
  });

  it("sin precio en Stripe no se ofrece", async () => {
    withSub(STRIPE_SUB);
    render(<Billing />);
    await ready();
    await screen.findByRole("region", { name: "Your plan" });
    expect(screen.queryByText("CDP Coverage")).toBeNull();
  });
});
