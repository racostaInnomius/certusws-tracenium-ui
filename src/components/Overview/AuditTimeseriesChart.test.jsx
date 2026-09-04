import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/**
 * La gráfica de actividad de auditoría.
 *
 * ⚠️ LO QUE SE PRUEBA AQUÍ ES UNA DISTINCIÓN, NO UN DIBUJO: "no hay eventos"
 * frente a "no pude leerlos".
 *
 * Se pintaban igual, y eso escondió un error de sintaxis en el SQL del backend
 * durante SEIS DÍAS. El endpoint devolvía 500 con la base llena —hasta 456
 * eventos en un día— y las dos tarjetas que lo consumen afirmaban tranquilamente
 * que no había pasado nada. Nadie mira dos veces un "sin eventos" en una consola
 * tranquila; un "no se pudo cargar" se reporta el primer día.
 *
 * El fallo llega de dos formas según la página: Overview pasa el sobre de
 * `Promise.allSettled` tal cual, y Audit pasa `null` cuando su fetch falló.
 * Las dos tienen que acabar en el mismo sitio.
 */

const fetchSeries = vi.fn();
vi.mock("../../api/overview", () => ({
  getAuditTimeseries: (...a) => fetchSeries(...a),
}));

import AuditTimeseriesChart from "./AuditTimeseriesChart";

afterEach(() => {
  cleanup();
  fetchSeries.mockReset();
});

const bucket = (day, over = {}) => ({
  bucket: day,
  ok: 0,
  rejected: 0,
  error: 0,
  categories: {},
  ...over,
});

const fulfilled = (buckets, windowDays = 7) => ({
  status: "fulfilled",
  value: { windowDays, buckets },
});

/** Siete días con actividad, como los devuelve el backend arreglado. */
const conDatos = fulfilled([
  bucket("2026-08-29", { ok: 120, categories: { Policy: 120 } }),
  bucket("2026-08-30", { ok: 210, categories: { Policy: 210 } }),
  bucket("2026-08-31", { ok: 60, categories: { Policy: 60 } }),
]);

describe("cuando la carga FALLA", () => {
  it("lo dice, en vez de afirmar que no hay actividad", async () => {
    // El sobre de allSettled rechazado — como llega desde Overview.
    render(<AuditTimeseriesChart result={{ status: "rejected", reason: new Error("500") }} />);

    expect(screen.getByText(/Couldn't load activity/i)).toBeTruthy();
    expect(screen.queryByText(/No events in window/i)).toBeNull();
  });

  it("explica que no es lo mismo que no tener actividad", async () => {
    // Sin esta frase, "couldn't load" se lee como un tecnicismo y se ignora
    // igual que el mensaje anterior.
    render(<AuditTimeseriesChart result={{ status: "rejected" }} />);
    expect(screen.getByText(/not the same as/i)).toBeTruthy();
  });

  it("un `null` —como lo pasa la página de Audit— también es un fallo", async () => {
    // Esa página traduce su error a `null` antes de llegar aquí. Si sólo
    // mirásemos `status === "rejected"`, la mitad de los fallos seguiría
    // pintándose como "sin eventos".
    render(<AuditTimeseriesChart result={null} loading={false} />);
    expect(screen.getByText(/Couldn't load activity/i)).toBeTruthy();
  });

  it("mientras carga NO acusa un fallo", async () => {
    // `result` todavía no existe y eso es normal; llamarlo error aquí sería
    // el error simétrico.
    render(<AuditTimeseriesChart result={null} loading />);
    expect(screen.queryByText(/Couldn't load activity/i)).toBeNull();
  });
});

describe("cuando de verdad NO hay eventos", () => {
  it("lo dice sin alarmar", async () => {
    // Siete cubos a cero es una respuesta VÁLIDA del backend: una consola
    // tranquila. Confundirla con un fallo sería el error contrario.
    render(<AuditTimeseriesChart result={fulfilled([bucket("2026-09-01"), bucket("2026-09-02")])} />);

    expect(screen.getByText(/No events in window/i)).toBeTruthy();
    expect(screen.queryByText(/Couldn't load/i)).toBeNull();
  });
});

describe("con datos", () => {
  it("pinta la gráfica y no ningún mensaje", async () => {
    render(<AuditTimeseriesChart result={conDatos} />);

    expect(screen.queryByText(/No events in window/i)).toBeNull();
    expect(screen.queryByText(/Couldn't load/i)).toBeNull();
    expect(screen.getByText(/Audit events — last 7 days/)).toBeTruthy();
  });

  it("por categoría cambia el título y las series salen de los datos", async () => {
    render(<AuditTimeseriesChart result={conDatos} variant="category" />);
    expect(screen.getByText(/Activity by area — last 7 days/)).toBeTruthy();
  });
});

describe("el selector de ventana", () => {
  it("si la recarga falla, NO se cae en silencio a los datos del padre", async () => {
    // El selector diría "30 días" mientras se enseñan los 7 del padre. Quien
    // mire se lleva una cifra que no es la que pidió — la misma clase de
    // mentira silenciosa que motivó todo este fichero.
    fetchSeries.mockRejectedValue(new Error("500"));
    render(<AuditTimeseriesChart result={conDatos} />);

    await userEvent.click(screen.getByRole("button", { name: /30d/i }));

    await waitFor(() => {
      expect(screen.getByText(/Couldn't load activity/i)).toBeTruthy();
    });
  });

  it("si la recarga va bien, enseña la ventana pedida", async () => {
    fetchSeries.mockResolvedValue({
      windowDays: 30,
      buckets: [bucket("2026-09-01", { ok: 5, categories: { Policy: 5 } })],
    });
    render(<AuditTimeseriesChart result={conDatos} />);

    await userEvent.click(screen.getByRole("button", { name: /30d/i }));

    await waitFor(() => {
      expect(screen.getByText(/last 30 days/)).toBeTruthy();
    });
    expect(screen.queryByText(/Couldn't load/i)).toBeNull();
  });
});
