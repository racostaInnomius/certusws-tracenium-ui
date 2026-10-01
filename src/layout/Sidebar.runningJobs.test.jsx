// src/layout/Sidebar.runningJobs.test.jsx
//
// El aviso de la entrada «Jobs» del menú lateral mientras un agente ejecuta
// algo (1-oct). Para el operador que lanzó un job, cerró el tracker y ya no
// sabe dónde mirar.
//
// 🔴 Lo que más importa no es que el punto se pinte, sino QUÉ cuenta:
//   · `sent` (+ `running`), NUNCA `pending`: ningún job pasa por `running`
//     —nadie llama a markRunning—, y `pending` es lo que espera a equipos
//     apagados (58 en producción el 1-oct, el más viejo de hacía dos semanas).
//     Con cualquiera de los dos errores el aviso estaría siempre apagado o
//     siempre encendido, y ninguno de los dos avisa de nada.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";

window.matchMedia = (query) => ({
  matches: true,
  media: query,
  onchange: null,
  addEventListener: () => {},
  removeEventListener: () => {},
  addListener: () => {},
  removeListener: () => {},
  dispatchEvent: () => false,
});

let auth = {};
let msp = {};
const listTenantJobs = vi.fn();
vi.mock("../auth/AuthContext", () => ({ useAuthContext: () => ({ auth }) }));
vi.mock("../msp/MspContext", () => ({ useMsp: () => msp }));
vi.mock("../api/tenants", () => ({ getTenantById: async () => ({}) }));
vi.mock("../auth/logout", () => ({ performLogout: () => {} }));
vi.mock("../api/jobs", () => ({ listTenantJobs: (...args) => listTenantJobs(...args) }));

import Sidebar from "./Sidebar";
import { ACTIVE_POLL_MS, IDLE_POLL_MS } from "../hooks/useRunningJobs";

const job = (id, status = "sent", extra = {}) => ({
  job_id: id,
  job_type: "software_install",
  status,
  created_at: new Date().toISOString(),
  ...extra,
});

/** Responde a los sondeos en orden; el último se repite. */
function respond(...pages) {
  let n = 0;
  listTenantJobs.mockImplementation(async () => {
    const page = pages[Math.min(n, pages.length - 1)];
    n += 1;
    return { ok: true, items: page, truncated: false, ...(page.truncated ? { truncated: true } : {}) };
  });
}

/** Deja correr las promesas pendientes (el sondeo es asíncrono). */
const flush = () => act(async () => {});
const advance = (ms) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });

const indicator = () => screen.queryByRole("status", { name: /jobs? running/i });

beforeEach(() => {
  vi.useFakeTimers();
  auth = { tenantId: "1", tenantMember: { role: "ADMIN", isActive: true } };
  msp = { activeTenant: null, loading: false };
  listTenantJobs.mockReset();
  Object.defineProperty(document, "hidden", { configurable: true, get: () => false });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("qué cuenta el aviso de Jobs", () => {
  it("🔴 pide sent + running, sin caché — nunca pending", async () => {
    respond([]);
    render(<Sidebar selected="overview" />);
    await flush();

    expect(listTenantJobs).toHaveBeenCalledTimes(1);
    const [tenantId, params, options] = listTenantJobs.mock.calls[0];
    expect(tenantId).toBe("1");
    expect(params.status.split(",").sort()).toEqual(["running", "sent"]);
    // Un sondeo servido de la caché de 60 s diría un minuto tarde que algo
    // terminó.
    expect(options).toEqual({ cache: false });
  });

  it("⭐ con jobs ejecutándose, la entrada Jobs enseña el aviso y cuántos son", async () => {
    respond([job("a"), job("b")]);
    render(<Sidebar selected="overview" />);
    await flush();

    const status = indicator();
    expect(status).toHaveAccessibleName("2 jobs running");
    expect(status).toHaveTextContent("2");
    // Está DENTRO de la entrada Jobs, no en otra.
    expect(status.closest('[role="button"]')).toHaveTextContent(/^Jobs/);
  });

  it("sin nada ejecutándose no hay aviso", async () => {
    respond([]);
    render(<Sidebar selected="overview" />);
    await flush();

    expect(indicator()).toBeNull();
  });

  it("⚠️ un job atascado (plazo del servidor vencido) no cuenta como «running»", async () => {
    const past = new Date(Date.now() - 60_000).toISOString();
    respond([job("viejo", "sent", { stale_after: past })]);
    render(<Sidebar selected="overview" />);
    await flush();

    expect(indicator()).toBeNull();
  });

  it("si el servidor recorta la lista, el número lo dice («20+»)", async () => {
    const page = Array.from({ length: 20 }, (_v, i) => job(`j${i}`));
    page.truncated = true;
    respond(page);
    render(<Sidebar selected="overview" />);
    await flush();

    expect(indicator()).toHaveAccessibleName("20+ jobs running");
    expect(indicator()).toHaveTextContent("20+");
  });
});

describe("cuándo pregunta", () => {
  it("⭐ cuando el job termina, el aviso se apaga en el siguiente sondeo", async () => {
    respond([job("a")], []);
    render(<Sidebar selected="overview" />);
    await flush();
    expect(indicator()).not.toBeNull();

    await advance(ACTIVE_POLL_MS);
    expect(listTenantJobs).toHaveBeenCalledTimes(2);
    expect(indicator()).toBeNull();
  });

  it("en reposo pregunta cada 30 s; con algo corriendo, cada 10 s", async () => {
    respond([]);
    render(<Sidebar selected="overview" />);
    await flush();

    await advance(ACTIVE_POLL_MS);
    expect(listTenantJobs).toHaveBeenCalledTimes(1);
    await advance(IDLE_POLL_MS - ACTIVE_POLL_MS);
    expect(listTenantJobs).toHaveBeenCalledTimes(2);

    cleanup();
    listTenantJobs.mockReset();
    respond([job("a")]);
    render(<Sidebar selected="overview" />);
    await flush();
    await advance(ACTIVE_POLL_MS);
    expect(listTenantJobs).toHaveBeenCalledTimes(2);
  });

  it("con la pestaña oculta deja de preguntar, y al volver pregunta en el acto", async () => {
    let hidden = false;
    Object.defineProperty(document, "hidden", { configurable: true, get: () => hidden });
    respond([]);
    render(<Sidebar selected="overview" />);
    await flush();

    hidden = true;
    act(() => { document.dispatchEvent(new Event("visibilitychange")); });
    await advance(IDLE_POLL_MS * 3);
    expect(listTenantJobs).toHaveBeenCalledTimes(1);

    hidden = false;
    act(() => { document.dispatchEvent(new Event("visibilitychange")); });
    await flush();
    expect(listTenantJobs).toHaveBeenCalledTimes(2);
  });

  it("⚠️ si la pestaña se oculta CON UNA PETICIÓN EN CURSO, esa petición al acabar no reprograma", async () => {
    // El caso que el anterior no cubre: al ocultarse no había temporizador
    // que cancelar —la petición estaba en el aire— y es su `finally` quien
    // tiene que ver que la pestaña está oculta y no volver a programar.
    let hidden = false;
    Object.defineProperty(document, "hidden", { configurable: true, get: () => hidden });
    let release;
    listTenantJobs.mockImplementationOnce(
      () => new Promise((resolve) => { release = () => resolve({ ok: true, items: [], truncated: false }); })
    );
    render(<Sidebar selected="overview" />);
    await flush();

    hidden = true;
    act(() => { document.dispatchEvent(new Event("visibilitychange")); });
    await act(async () => { release(); });
    listTenantJobs.mockResolvedValue({ ok: true, items: [], truncated: false });
    await advance(IDLE_POLL_MS * 3);
    expect(listTenantJobs).toHaveBeenCalledTimes(1);
  });

  it("sin tenant no pregunta (no hay de quién contar)", async () => {
    auth = { tenantMember: { role: "ADMIN", isActive: true } };
    respond([job("a")]);
    render(<Sidebar selected="overview" />);
    await advance(IDLE_POLL_MS);

    expect(listTenantJobs).not.toHaveBeenCalled();
    expect(indicator()).toBeNull();
  });

  it("⚠️ mientras el portfolio MSP carga, espera: el tenant aún puede no ser el bueno", async () => {
    msp = { activeTenant: null, loading: true };
    respond([job("a")]);
    render(<Sidebar selected="overview" />);
    await advance(IDLE_POLL_MS);

    expect(listTenantJobs).not.toHaveBeenCalled();
  });

  it("un fallo de red no rompe el menú; el siguiente sondeo lo reintenta", async () => {
    listTenantJobs.mockRejectedValueOnce(new Error("offline"));
    listTenantJobs.mockResolvedValue({ ok: true, items: [job("a")], truncated: false });
    render(<Sidebar selected="overview" />);
    await flush();
    expect(screen.getByText("Jobs")).toBeInTheDocument();
    expect(indicator()).toBeNull();

    await advance(IDLE_POLL_MS);
    expect(indicator()).toHaveAccessibleName("1 job running");
  });
});
