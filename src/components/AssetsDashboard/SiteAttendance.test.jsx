// Quién estuvo en un sitio — y la distinción que impide una afirmación falsa.
//
// ⚠️ "No hay estancias ese día" y "ese día ya no se guarda" NO son lo mismo, y
// la segunda tiene que decirse. Una lista vacía se leería como "ese día no
// estuvo nadie aquí", que es una afirmación sobre el paradero de personas
// sostenida por datos que se borraron.

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import SiteAttendance from "./SiteAttendance";
import { dayWindow, lastDaysRange, rangeWindow } from "./hostHelpers";

afterEach(cleanup);

const datos = (over = {}) => ({
  episodes: [
    {
      id: "1", agentId: "abc-123", hostname: "MSIGFINANJJ",
      firstSeenAt: "2026-09-03T09:20:00Z", lastSeenAt: "2026-09-03T17:40:00Z",
      endedAt: "2026-09-04T02:05:00Z",
    },
  ],
  deviceCount: 1,
  beyondRetention: false,
  retentionDays: 30,
  retentionFloor: "2026-08-10T12:00:00Z",
  ...over,
});

describe("SiteAttendance", () => {
  it("⚠️ una fecha caducada NO se presenta como 'no estuvo nadie'", () => {
    render(
      <SiteAttendance siteName="Mountainside IG" from="2026-06-01" to="2026-06-01"
        data={datos({ episodes: [], deviceCount: 0, beyondRetention: true })}
        onRangeChange={vi.fn()} />
    );
    const aviso = screen.getByText(/no longer stored/i);
    expect(aviso.textContent).toMatch(/not the same as nobody having been here/i);
    expect(aviso.textContent).toMatch(/30 days/);
    // Y dice desde cuándo SÍ hay datos, en vez de dejar al operador a ciegas.
    expect(aviso.textContent).toMatch(/Data starts from/i);
  });

  it("un día vacío dentro de la ventana explica por qué puede estarlo", () => {
    render(
      <SiteAttendance siteName="X" from="2026-09-03" to="2026-09-03"
        data={datos({ episodes: [], deviceCount: 0 })} onRangeChange={vi.fn()} />
    );
    const t = screen.getByText(/No device was recorded at this site that day/i).textContent;
    // ⚠️ Un equipo que estuvo pero no reportó no aparece. Callarlo convertiría
    // la lista en un censo, y no lo es.
    expect(t).toMatch(/a device that was here but never reported does not appear/i);
  });

  it("⚠️ cuenta EQUIPOS, no estancias", () => {
    // Un equipo que entró y salió dos veces es un equipo. Contar estancias
    // inflaría la cifra que un operador lee de un vistazo.
    render(
      <SiteAttendance siteName="X" from="2026-09-03" to="2026-09-03" onRangeChange={vi.fn()}
        data={datos({
          episodes: [
            { id: "1", agentId: "a", hostname: "PC-1", firstSeenAt: "2026-09-03T08:00:00Z", lastSeenAt: "2026-09-03T12:00:00Z", endedAt: "2026-09-03T13:00:00Z" },
            { id: "2", agentId: "a", hostname: "PC-1", firstSeenAt: "2026-09-03T15:00:00Z", lastSeenAt: "2026-09-03T18:00:00Z", endedAt: null },
          ],
          deviceCount: 1,
        })} />
    );
    expect(screen.getByText("1 device")).toBeInTheDocument();
    // Pero las DOS estancias se listan: entró, salió y volvió es justo lo que se
    // viene a ver, y agruparlas lo escondería.
    expect(screen.getAllByText("PC-1")).toHaveLength(2);
  });

  it("las horas son de observación, no de entrada y salida", () => {
    render(<SiteAttendance siteName="X" from="2026-09-03" to="2026-09-03" data={datos()} onRangeChange={vi.fn()} />);
    expect(screen.getByText(/^confirmed /i)).toBeInTheDocument();
    expect(screen.getByText(/left before/i)).toBeInTheDocument();
  });

  it("⚠️ un rango no se describe como un día, y un recorte se dice", () => {
    render(
      <SiteAttendance siteName="X" from="2026-09-01" to="2026-09-07"
        data={datos({ episodes: [], deviceCount: 0 })} onRangeChange={vi.fn()} />
    );
    expect(screen.getByText(/in those dates/i)).toBeInTheDocument();
    expect(screen.queryByText(/that day/i)).not.toBeInTheDocument();

    cleanup();
    render(
      <SiteAttendance siteName="X" from="2026-09-01" to="2026-09-07"
        data={datos({ truncated: true, limit: 200 })} onRangeChange={vi.fn()} />
    );
    expect(screen.getByText(/Only the 200 most recent stays/i)).toBeInTheDocument();
  });

  it("cambiar el rango avisa al padre, que es quien recarga", () => {
    const onDateChange = vi.fn();
    render(<SiteAttendance siteName="X" from="2026-09-03" to="2026-09-03" data={datos()} onRangeChange={onDateChange} />);
    fireEvent.change(screen.getByLabelText(/^From$/i), { target: { value: "2026-09-01" } });
    expect(onDateChange).toHaveBeenCalledWith({ from: "2026-09-01", to: "2026-09-03" });
    fireEvent.change(screen.getByLabelText(/^To$/i), { target: { value: "2026-09-05" } });
    expect(onDateChange).toHaveBeenCalledWith({ from: "2026-09-03", to: "2026-09-05" });
  });
});

describe("dayWindow", () => {
  it("convierte un día en la ventana completa", () => {
    const w = dayWindow("2026-09-03");
    expect(w.from).toBe("2026-09-03T00:00:00.000Z");
    // Hasta el último milisegundo: usar 00:00 del día siguiente incluiría
    // estancias que empezaron ya en el día siguiente.
    expect(w.to).toBe("2026-09-03T23:59:59.999Z");
  });

  it("una fecha inservible no produce una ventana inventada", () => {
    expect(dayWindow("")).toBeNull();
    expect(dayWindow("ayer")).toBeNull();
    expect(dayWindow("2026-13-45")).toBeNull();
    expect(dayWindow(null)).toBeNull();
  });
});

describe("rangeWindow / lastDaysRange", () => {
  it("un rango cubre desde el primer instante del primer día hasta el último del último", () => {
    expect(rangeWindow("2026-09-01", "2026-09-07")).toEqual({
      from: "2026-09-01T00:00:00.000Z",
      to: "2026-09-07T23:59:59.999Z",
    });
    // Un solo día sigue siendo el día entero: el caso de antes no cambia.
    expect(rangeWindow("2026-09-03", "2026-09-03")).toEqual(dayWindow("2026-09-03"));
  });

  it("⚠️ del revés o con basura no se inventa ventana", () => {
    expect(rangeWindow("2026-09-20", "2026-09-02")).toBeNull();
    expect(rangeWindow("", "2026-09-02")).toBeNull();
    expect(rangeWindow("2026-09-02", "ayer")).toBeNull();
  });

  it("los atajos cuentan HOY dentro de los N días", () => {
    const now = new Date("2026-09-17T10:00:00");
    expect(lastDaysRange(1, now)).toEqual({ from: "2026-09-17", to: "2026-09-17" });
    expect(lastDaysRange(7, now)).toEqual({ from: "2026-09-11", to: "2026-09-17" });
    expect(lastDaysRange(30, now)).toEqual({ from: "2026-08-19", to: "2026-09-17" });
  });
});

