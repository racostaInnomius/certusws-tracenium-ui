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
const getHostLocations = vi.fn();
const listGeofences = vi.fn();
vi.mock("../../api/episodes", () => ({
  getDeviceTimeline: (...a) => getDeviceTimeline(...a),
  getSiteAttendance: (...a) => getSiteAttendance(...a),
}));
// La vista se carga lo suyo: es una pestaña, no un panel alimentado por el
// dashboard de equipos.
vi.mock("../../api/dashboard", () => ({
  dashboardApi: { getHostLocations: (...a) => getHostLocations(...a) },
}));
vi.mock("../../api/geofences", () => ({
  listGeofences: (...a) => listGeofences(...a),
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
  getHostLocations.mockReset();
  listGeofences.mockReset();
  getDeviceTimeline.mockResolvedValue({ episodes: [], retentionDays: 30, beyondRetention: false });
  getSiteAttendance.mockResolvedValue({ episodes: [], deviceCount: 0, retentionDays: 30, beyondRetention: false });
  getHostLocations.mockResolvedValue({ devices: EQUIPOS });
  listGeofences.mockResolvedValue({ sites: SITIOS });
});

/** Espera a que las dos listas propias de la vista hayan cargado. */
async function montada() {
  render(<LocationExplorer />);
  await waitFor(() => expect(getHostLocations).toHaveBeenCalled());
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

    fireEvent.change(screen.getByLabelText("On"), { target: { value: "2026-09-03" } });
    await waitFor(() => expect(getDeviceTimeline).toHaveBeenCalledTimes(2));
    expect(getDeviceTimeline.mock.calls.at(-1)[1].from).toBe("2026-09-03T00:00:00.000Z");
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
    listGeofences.mockRejectedValue(new Error("500"));
    await montada();
    expect(await screen.findByText(/site list could not be loaded/i)).toBeInTheDocument();
    expect(screen.queryByText(/No sites declared yet/i)).not.toBeInTheDocument();
  });

  it("un tenant sin sitios sí lo dice, y dice qué hacer", async () => {
    listGeofences.mockResolvedValue({ sites: [] });
    await montada();
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
