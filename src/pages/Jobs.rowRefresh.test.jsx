// src/pages/Jobs.rowRefresh.test.jsx
//
// El botón de refrescar de UNA fila del historial (1-oct): ver si «el job que
// acabo de enviar» ya salió de `pending`, sin recargar las 200 filas ni esperar
// al auto-refresco.
//
// 🔴 LO QUE MÁS IMPORTA AQUÍ NO ES QUE EL BOTÓN EXISTA, sino que SALGA A LA RED.
// `getJob` pasa por la caché de 60 s de `httpGetJson`: un botón que la usara
// devolvería durante un minuto la misma fila guardada y parecería no hacer
// nada. Es el mismo fallo que tuvo el Refresh de toda la página. Por eso el
// servidor de pruebas CUENTA las peticiones, y el estado que devuelve cambia
// entre una y otra.

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { server, http, HttpResponse } from "../test/msw/server";
import { ConfirmProvider } from "../components/common/ConfirmDialog";
import { clearApiCache } from "../api/http";

vi.mock("../api/roles", () => ({
  getMyCapabilities: () => Promise.resolve({ role: "ADMIN", permissions: ["jobs"] }),
}));
vi.mock("../auth/AuthContext", () => ({
  useAuthContext: () => ({
    auth: { tenantId: 1, tenantMember: { role: "ADMIN", isActive: true, tenantId: 1 } },
    loading: false,
    refreshAuth: vi.fn(),
  }),
  AuthProvider: ({ children }) => children,
}));
vi.mock("../msp/MspContext", () => ({
  useMspOptional: () => ({ activeTenant: null }),
}));

import Jobs from "./Jobs";

afterEach(() => {
  cleanup();
  server.resetHandlers();
  // ⚠️ La caché de httpGetJson es del MÓDULO y sobrevive entre tests: sin
  // vaciarla, un test se serviría de lo que pidió el anterior.
  clearApiCache();
});

const ahora = new Date().toISOString();

const job = (id, status, extra = {}) => ({
  job_id: id,
  device_id: `dev-${id}`,
  job_type: "patch_scan",
  status,
  attempts: 1,
  max_attempts: 5,
  created_at: ahora,
  updated_at: ahora,
  ...extra,
});

/**
 * El job que la página abre sola al cargar.
 *
 * ⚠️ Al cargar, la página selecciona `items[0]` y abre su detalle, que hace su
 * propio `GET /jobs/:id`. Si el job bajo prueba fuera el primero, esa petición
 * se contaría como del botón y gastaría la primera respuesta de `detail`. Por
 * eso cada montaje pone delante este job terminado, que se lleva la
 * autoselección, y espera a que su petición salga antes de devolver.
 */
const AUTO = "j-auto";

/**
 * Monta la página. `detail` decide qué devuelve `GET /jobs/:id` en cada
 * llamada (la n-ésima recibe `detail[n]`, y la última se repite), y `calls`
 * cuenta cuántas veces salió esa petición a la red.
 */
async function mount(items, detail = {}) {
  const calls = {};
  server.use(
    http.all(/.*\/api\/.*/, ({ request }) => {
      const url = new URL(request.url);
      if (/\/tenants\/[^/]+\/jobs$/.test(url.pathname)) {
        return HttpResponse.json({ ok: true, items: [job(AUTO, "completed"), ...items], truncated: false });
      }
      const one = url.pathname.match(/\/jobs\/([^/]+)$/);
      if (one && request.method === "GET") {
        const id = decodeURIComponent(one[1]);
        calls[id] = (calls[id] ?? 0) + 1;
        const seq = detail[id] ?? [];
        const body = seq[Math.min(calls[id] - 1, seq.length - 1)];
        return HttpResponse.json({ ok: true, job: body ?? null });
      }
      return HttpResponse.json({ ok: true, items: [], jobs: [], devices: [], types: [], total: 0, buckets: [] });
    })
  );
  window.history.replaceState({}, "", "/?page=jobs");
  render(<ConfirmProvider><Jobs onNavigate={vi.fn()} /></ConfirmProvider>);
  await waitFor(() => expect(calls[AUTO]).toBe(1));
  return calls;
}

/**
 * La fila del historial de un job. El DataGrid pone el id del job en
 * `data-id`; la celda de dispositivo enseña el hostname, no el id, así que
 * buscar por texto no sirve.
 */
async function rowOf(jobId) {
  let row = null;
  await waitFor(() => {
    row = document.querySelector(`[role="row"][data-id="${jobId}"]`);
    expect(row, `no encuentro la fila de ${jobId}`).toBeTruthy();
  });
  return row;
}

describe("refrescar una sola fila del historial", () => {
  it("⭐ un job en curso tiene botón; uno terminado no", async () => {
    // Un job terminado no cambia (Retry ya refresca por su cuenta): el botón
    // sólo sale donde puede servir.
    await mount([job("j-pend", "pending"), job("j-done", "completed")]);

    const pend = await rowOf("j-pend");
    expect(within(pend).getByRole("button", { name: /refresh this job/i })).toBeInTheDocument();

    const done = await rowOf("j-done");
    expect(within(done).queryByRole("button", { name: /refresh this job/i })).toBeNull();
  });

  it("⭐ pulsarlo trae el estado nuevo y lo pinta EN ESA FILA", async () => {
    const user = userEvent.setup();
    await mount([job("j1", "pending")], { j1: [job("j1", "running")] });

    const row = await rowOf("j1");
    expect(within(row).getByText("Pending")).toBeInTheDocument();

    await user.click(within(row).getByRole("button", { name: /refresh this job/i }));

    await waitFor(async () => expect(within(await rowOf("j1")).getByText("Running")).toBeInTheDocument());
  });

  it("🔴 cada clic SALE A LA RED: la caché de 60 s no se lo traga", async () => {
    // El fallo que esto evita: sin `cache: "reload"`, el segundo clic dentro
    // del mismo minuto devolvía la fila guardada y no salía ninguna petición.
    const user = userEvent.setup();
    const calls = await mount([job("j2", "pending")], {
      j2: [job("j2", "running"), job("j2", "completed")],
    });

    const boton = async () =>
      within(await rowOf("j2")).getByRole("button", { name: /refresh this job/i });

    await user.click(await boton());
    await waitFor(() => expect(calls.j2).toBe(1));
    await waitFor(async () => expect(within(await rowOf("j2")).getByText("Running")).toBeInTheDocument());

    await user.click(await boton());
    await waitFor(() => expect(calls.j2).toBe(2));
    await waitFor(async () => expect(within(await rowOf("j2")).getByText("Completed")).toBeInTheDocument());
  });

  it("⚠️ el clic NO abre el detalle de la fila: una sola petición por clic", async () => {
    // La fila entera abre el detalle al pulsarla, y el detalle hace su propio
    // GET /jobs/:id. Si el clic del botón subiera hasta la fila, saldrían DOS.
    const user = userEvent.setup();
    const calls = await mount([job("j3", "pending")], { j3: [job("j3", "running")] });

    await user.click(within(await rowOf("j3")).getByRole("button", { name: /refresh this job/i }));
    await waitFor(() => expect(calls.j3).toBe(1));
    // Margen para que una segunda petición, si existiera, llegara a salir.
    await new Promise((r) => setTimeout(r, 50));
    expect(calls.j3).toBe(1);
  });

  it("⚠️ al terminar, el botón desaparece: ya no hay nada que refrescar", async () => {
    const user = userEvent.setup();
    await mount([job("j4", "running")], { j4: [job("j4", "completed")] });

    await user.click(within(await rowOf("j4")).getByRole("button", { name: /refresh this job/i }));

    await waitFor(async () => {
      const row = await rowOf("j4");
      expect(within(row).getByText("Completed")).toBeInTheDocument();
      expect(within(row).queryByRole("button", { name: /refresh this job/i })).toBeNull();
    });
  });

  it("⚠️ si la petición falla, la fila no cambia y se avisa", async () => {
    const user = userEvent.setup();
    await mount([job("j5", "pending")]);
    // Se añade DESPUÉS de montar: MSW da preferencia al último `server.use`,
    // así que este gana al manejador genérico de mount().
    server.use(
      http.get(/.*\/api\/.*\/jobs\/j5$/, () => HttpResponse.json({ error: "boom" }, { status: 500 }))
    );

    await user.click(within(await rowOf("j5")).getByRole("button", { name: /refresh this job/i }));

    expect(await screen.findByText(/failed to refresh this job/i)).toBeInTheDocument();
    expect(within(await rowOf("j5")).getByText("Pending")).toBeInTheDocument();
  });
});
