// La búsqueda por fecha: dónde estuvo un equipo, y quién estuvo en un sitio.
//
// ⚠️ Lo que estos tests vigilan no es el maquetado, son las tres formas que
// tiene esta vista de AFIRMAR algo que no sabe:
//
//   1. Una fecha caducada presentada como "no estuvo en ningún sitio".
//   2. Una lista de sitios que no cargó presentada como "no hay sitios".
//   3. Una petición fallida presentada como una respuesta vacía.

import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import LocationExplorer, { todayInputValue } from "./LocationExplorer";
import DeviceLocationTimeline from "./DeviceLocationTimeline";

const getDeviceTimeline = vi.fn();
const getSiteAttendance = vi.fn();
vi.mock("../../api/episodes", () => ({
  getDeviceTimeline: (...a) => getDeviceTimeline(...a),
  getSiteAttendance: (...a) => getSiteAttendance(...a),
}));


const EQUIPOS = [
  { agentId: "a-1", hostname: "JPR-MacBookPro" },
  { agentId: "a-2", hostname: "ETE-3X5P8F4" },
];
const SITIOS = [
  { id: 4, siteName: "City Towers Black" },
  { id: 5, siteName: "Cowork - Cruz Blanca" },
];

beforeEach(() => {
  getDeviceTimeline.mockReset();
  getSiteAttendance.mockReset();
  getDeviceTimeline.mockResolvedValue({ episodes: [], retentionDays: 30, beyondRetention: false });
  getSiteAttendance.mockResolvedValue({ episodes: [], deviceCount: 0, retentionDays: 30, beyondRetention: false });
});

/** Monta la vista con las listas que le pasa el contenedor del tab. */
async function montada(props = {}) {
  render(<LocationExplorer devices={EQUIPOS} sites={SITIOS} {...props} />);
  await screen.findByRole("combobox", { name: /device/i });
}
afterEach(cleanup);

async function elegirEquipo(nombre) {
  // Por rol y una sola vez: al abrirse el desplegable, el rótulo "Device"
  // aparece en más de un nodo y getByLabelText deja de ser unívoco. Y se hace
  // clic en la opción por su nombre en vez de teclear + ArrowDown, que elige la
  // primera de la lista y haría pasar el test con el equipo equivocado.
  const input = screen.getByRole("combobox", { name: /device/i });
  fireEvent.keyDown(input, { key: "ArrowDown" });
  fireEvent.click(await screen.findByRole("option", { name: nombre }));
}

describe("LocationExplorer", () => {
  // ⚠️ El rango arranca en "hoy → hoy", así que si "From = 1-sep" es un rango
  // válido o uno del revés depende del reloj. Se fija "hoy" en el 10-sep para
  // todo el bloque (sólo Date: waitFor necesita timers reales), y las fechas
  // de los tests se leen contra ese día y no contra el de quien los corre.
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 8, 10, 12, 0, 0));
  });
  afterEach(() => vi.useRealTimers());

  it("no consulta nada hasta que se elige equipo o sitio", async () => {
    await montada();
    expect(getDeviceTimeline).not.toHaveBeenCalled();
    expect(getSiteAttendance).not.toHaveBeenCalled();
    expect(screen.getByText(/Select a device to see where it was/i)).toBeInTheDocument();
  });

  it("elegir un equipo pide SU día completo, no un rango abierto", async () => {
    await montada();
    await elegirEquipo("ETE-3X5P8F4");

    await waitFor(() => expect(getDeviceTimeline).toHaveBeenCalled());
    const [agentId, ventana] = getDeviceTimeline.mock.calls.at(-1);
    expect(agentId).toBe("a-2");
    // ⚠️ Hasta el último milisegundo del día: usar 00:00 del siguiente
    // incluiría estancias que empezaron ya en el día siguiente.
    expect(ventana.from).toMatch(/T00:00:00\.000Z$/);
    expect(ventana.to).toMatch(/T23:59:59\.999Z$/);
  });

  it("cambiar la fecha vuelve a preguntar por el nuevo día", async () => {
    await montada();
    await elegirEquipo("ETE-3X5P8F4");
    await waitFor(() => expect(getDeviceTimeline).toHaveBeenCalledTimes(1));

    fireEvent.change(screen.getAllByLabelText("From")[0], { target: { value: "2026-09-03" } });
    await waitFor(() => expect(getDeviceTimeline).toHaveBeenCalledTimes(2));
    expect(getDeviceTimeline.mock.calls.at(-1)[1].from).toBe("2026-09-03T00:00:00.000Z");
  });

  it("⭐ un RANGO se pregunta de una vez: del primer instante del 1 al último del 7", async () => {
    await montada();
    await elegirEquipo("ETE-3X5P8F4");
    await waitFor(() => expect(getDeviceTimeline).toHaveBeenCalledTimes(1));

    fireEvent.change(screen.getAllByLabelText("From")[0], { target: { value: "2026-09-01" } });
    await waitFor(() => expect(getDeviceTimeline).toHaveBeenCalledTimes(2));
    fireEvent.change(screen.getAllByLabelText("To")[0], { target: { value: "2026-09-07" } });
    await waitFor(() => expect(getDeviceTimeline).toHaveBeenCalledTimes(3));

    const ventana = getDeviceTimeline.mock.calls.at(-1)[1];
    expect(ventana.from).toBe("2026-09-01T00:00:00.000Z");
    expect(ventana.to).toBe("2026-09-07T23:59:59.999Z");
  });

  it("⚠️ un rango del revés NO se pregunta: una lista vacía se leería como 'no estuvo'", async () => {
    // ⚠️ Escrito el 17-sep, "From = 20-sep" ya invertía el rango; desde el
    // 20-sep era un rango legítimo que SÍ debe preguntarse, y el test contaba
    // esa llamada como si fuera la del revés. El paso válido se hace explícito
    // para que lo que se cuente sea únicamente lo que ocurre DESPUÉS de
    // invertir el rango.
    await montada();
    await elegirEquipo("ETE-3X5P8F4");
    await waitFor(() => expect(getDeviceTimeline).toHaveBeenCalledTimes(1));

    // Del 1 a hoy (10-sep): válido, se pregunta.
    fireEvent.change(screen.getAllByLabelText("From")[0], { target: { value: "2026-09-01" } });
    await waitFor(() => expect(getDeviceTimeline).toHaveBeenCalledTimes(2));
    expect(getDeviceTimeline.mock.calls.at(-1)[1]).toEqual({
      from: "2026-09-01T00:00:00.000Z",
      to: "2026-09-10T23:59:59.999Z",
    });

    // Del 1 al 25 de agosto: del revés. Ni una llamada más.
    fireEvent.change(screen.getAllByLabelText("To")[0], { target: { value: "2026-08-25" } });
    await waitFor(() =>
      expect(screen.getAllByText(/end date is before the start date/i).length).toBeGreaterThan(0)
    );
    // La consulta sale tras un import() dinámico: se deja correr la cola antes
    // de contar, o una llamada tardía pasaría desapercibida.
    await new Promise((r) => setTimeout(r, 50));
    expect(getDeviceTimeline).toHaveBeenCalledTimes(2);
    for (const [, ventana] of getDeviceTimeline.mock.calls) {
      expect(Date.parse(ventana.from)).toBeLessThanOrEqual(Date.parse(ventana.to));
    }
  });

  it("⚠️ un recorte del servidor se dice: 'las N más recientes', no 'esto es todo'", async () => {
    getDeviceTimeline.mockResolvedValue({
      episodes: [], retentionDays: 30, beyondRetention: false, retentionFloor: "2026-08-18T00:00:00.000Z",
      truncated: true, limit: 200,
    });
    await montada();
    await elegirEquipo("ETE-3X5P8F4");
    expect(await screen.findByText(/Only the 200 most recent stays/i)).toBeInTheDocument();
  });

  it("⚠️ una petición que FALLA no se presenta como un día sin estancias", async () => {
    getDeviceTimeline.mockRejectedValue(new Error("boom"));
    await montada();
    await elegirEquipo("ETE-3X5P8F4");

    await waitFor(() => expect(screen.getByText("boom")).toBeInTheDocument());
    // Y NO el texto de "todavía no hay estancias", que afirmaría algo del equipo.
    expect(screen.queryByText(/No stay recorded for this device/i)).not.toBeInTheDocument();
  });

  it("⚠️ sin sitios NO se dice que no los haya si la lista no cargó", async () => {
    await montada({ sites: null, sitesError: "500" });
    expect(await screen.findByText(/site list could not be loaded/i)).toBeInTheDocument();
    expect(screen.queryByText(/No sites declared yet/i)).not.toBeInTheDocument();
  });

  it("un tenant sin sitios sí lo dice, y dice qué hacer", async () => {
    await montada({ sites: [] });
    expect(await screen.findByText(/No sites declared yet/i)).toBeInTheDocument();
  });

  it("⚠️ declara que las horas son de confirmación, no de llegada ni salida", async () => {
    await montada();
    const nota = screen.getByText(/not the moment it arrived or left/i);
    expect(nota).toBeInTheDocument();
    // Y que una estancia a caballo de dos días sale en los dos.
    expect(nota.textContent).toMatch(/crosses midnight appears on both days/i);
  });
});

describe("todayInputValue", () => {
  it("usa la fecha LOCAL, no la UTC", () => {
    // 31-dic 20:00 en UTC-6 es 1-ene en UTC. Un operador que teclea "hoy"
    // espera su hoy, no el del servidor.
    const d = new Date(2026, 11, 31, 20, 0, 0);
    expect(todayInputValue(d)).toBe("2026-12-31");
  });

  it("rellena mes y día a dos cifras", () => {
    expect(todayInputValue(new Date(2026, 0, 5))).toBe("2026-01-05");
  });
});

// ── La rama nueva de la línea de tiempo ───────────────────────────────────
//
// Sólo aparece cuando alguien busca POR FECHA: el cajón del equipo no manda
// fecha y nunca la ve. Sin ella, preguntar por el 1 de julio contestaría "no
// hay ninguna estancia registrada todavía" — una afirmación sobre el paradero
// del equipo sostenida por datos que se borraron.
describe("DeviceLocationTimeline · fecha fuera de retención", () => {
  it("dice que ya no se guarda, y NO que no estuviera en ningún sitio", () => {
    render(
      <DeviceLocationTimeline
        episodes={[]}
        retentionDays={30}
        beyondRetention
        retentionFloor="2026-08-10T12:00:00Z"
      />
    );
    const t = screen.getByText(/no longer stored/i).textContent;
    expect(t).toMatch(/not the same as the device having been nowhere/i);
    expect(t).toMatch(/30 days/);
    expect(t).toMatch(/Data starts from/i);
    expect(screen.queryByText(/No stay recorded for this device/i)).not.toBeInTheDocument();
  });

  it("sin fecha pedida, el cajón sigue viendo su mensaje de siempre", () => {
    render(<DeviceLocationTimeline episodes={[]} retentionDays={30} />);
    expect(screen.getByText(/No stay recorded for this device yet/i)).toBeInTheDocument();
  });
});
