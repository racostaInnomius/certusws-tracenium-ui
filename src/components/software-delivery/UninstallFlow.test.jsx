// UninstallFlow.test.jsx
//
// ADR-0019 F2 — los casos de abajo no son ilustrativos. Desinstalar no tiene
// «deshacer» ni copia, así que cada uno es una forma conocida de hacer daño:
// saltarse la vista previa, mandar a un equipo protegido, esconder los que no
// se van a tocar, o fundir dos apps que sólo se parecen en el nombre.

import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import UninstallFlow from "./UninstallFlow";
import * as inventoryApi from "../../api/inventoryDashboard";
import * as sdpApi from "../../api/softwareDelivery";

vi.mock("../../api/inventoryDashboard");
vi.mock("../../api/softwareDelivery");

// Dropbox tal y como está en T111: cuatro equipos, dos versiones, y nunca fue
// un paquete del catálogo — que es justo el hueco que F1 abrió.
const DROPBOX_ROWS = [
  { agentId: "d1", hostname: "T111-VENTAS", name: "Dropbox", version: "212.4.5754", publisher: "Dropbox, Inc.", source: "win32-registry" },
  { agentId: "d2", hostname: "T111-ALMACEN", name: "Dropbox", version: "212.4.5754", publisher: "Dropbox, Inc.", source: "win32-registry" },
  { agentId: "d3", hostname: "T111-RECEPCION", name: "Dropbox", version: "198.4.6543", publisher: "Dropbox, Inc.", source: "win32-registry" },
];

beforeEach(() => {
  vi.resetAllMocks();
  inventoryApi.getSoftwareInventoryDetail.mockResolvedValue({
    items: DROPBOX_ROWS,
    total: DROPBOX_ROWS.length,
  });
});

afterEach(() => cleanup());

function open(props = {}) {
  const notify = vi.fn();
  render(<UninstallFlow onDone={() => {}} notify={notify} {...props} />);
  return { notify };
}

async function searchAndPick(user, term = "Dropbox", label = "Dropbox") {
  await user.type(screen.getByLabelText("Application name"), term);
  await user.click(screen.getByRole("button", { name: "Search" }));
  await user.click(await screen.findByText(label));
}

describe("D5 — la vista previa no se puede saltar", () => {
  it("no hay forma de despachar sin haberla pedido antes", async () => {
    const user = userEvent.setup();
    open();
    await searchAndPick(user);

    // En el paso de equipos NO existe un botón que ejecute. El único camino
    // adelante es «Preview». Si alguien añadiera un atajo, esto cae.
    expect(screen.queryByRole("button", { name: /^Uninstall on/ })).toBeNull();
    expect(screen.getByRole("button", { name: "Preview" })).toBeTruthy();
    expect(sdpApi.uninstallDetected).not.toHaveBeenCalled();
  });

  it("enseña el comando EXACTO que correrá en cada equipo", async () => {
    const user = userEvent.setup();
    sdpApi.previewUninstall.mockResolvedValue({
      actionable: [
        {
          deviceId: "d1",
          hostname: "T111-VENTAS",
          plan: { ok: true, preview: "msiexec /x {AAAA-1111} /qn /norestart" },
        },
      ],
      blocked: [],
      notInstalled: [],
    });
    open();
    await searchAndPick(user);
    await user.click(screen.getByRole("button", { name: "Preview" }));

    // No «se desinstalará»: el comando literal. Es la última pantalla antes de
    // algo irreversible.
    expect(await screen.findByText("msiexec /x {AAAA-1111} /qn /norestart")).toBeTruthy();
  });
});

describe("lo que NO se va a tocar se enseña", () => {
  it("⚠️ un equipo bloqueado es visible, con su motivo, y no se manda", async () => {
    // Un objetivo que desaparece en silencio es cómo se cree haber apuntado a
    // 3 habiendo apuntado a 2.
    const user = userEvent.setup();
    sdpApi.previewUninstall.mockResolvedValue({
      actionable: [{ deviceId: "d1", hostname: "T111-VENTAS", plan: { ok: true, preview: "C:\\u.exe /S" } }],
      blocked: [
        { deviceId: "d2", hostname: "T111-ALMACEN", plan: { ok: false, reason: "protected", detail: "x" } },
      ],
      notInstalled: [{ deviceId: "d3", hostname: null, plan: null }],
    });
    sdpApi.uninstallDetected.mockResolvedValue({ deployment: { id: 31 } });

    open();
    await searchAndPick(user);
    await user.click(screen.getByRole("button", { name: "Preview" }));

    expect(await screen.findByText("T111-ALMACEN")).toBeTruthy();
    expect(screen.getByText(/dejaría al equipo sin agente/)).toBeTruthy();
    expect(screen.getByText(/1 equipo\(s\) ya no la tienen/)).toBeTruthy();

    // Y el botón cuenta 1, no 3: la cifra que el operador lee antes de pulsar
    // es la que de verdad se va a ejecutar.
    await user.click(screen.getByRole("button", { name: "Uninstall on 1 device(s)" }));

    await waitFor(() => expect(sdpApi.uninstallDetected).toHaveBeenCalled());
    // ⚠️ SÓLO el accionable. Mandar el protegido y confiar en que el backend lo
    // rechace pone la única defensa real a un fallo de distancia.
    expect(sdpApi.uninstallDetected).toHaveBeenCalledWith({
      appName: "Dropbox",
      deviceIds: ["d1"],
    });
  });

  it("sin ningún accionable no deja ejecutar", async () => {
    const user = userEvent.setup();
    sdpApi.previewUninstall.mockResolvedValue({
      actionable: [],
      blocked: [{ deviceId: "d1", hostname: "T111-VENTAS", plan: { ok: false, reason: "no_identity", detail: "x" } }],
      notInstalled: [],
    });
    open();
    await searchAndPick(user);
    await user.click(screen.getByRole("button", { name: "Preview" }));

    const fire = await screen.findByRole("button", { name: "Uninstall on 0 device(s)" });
    expect(fire.disabled).toBe(true);
  });
});

describe("dos apps que se parecen son dos apps", () => {
  it("⚠️ no funde nombres distintos que casan con la misma búsqueda", async () => {
    // El backend casa el nombre por IGUALDAD. Agrupar «Google Chrome» con
    // «Google Chrome Beta» porque la búsqueda devolvió los dos desinstalaría
    // de más — y no hay vuelta atrás.
    const user = userEvent.setup();
    inventoryApi.getSoftwareInventoryDetail.mockResolvedValue({
      items: [
        { agentId: "d1", hostname: "H1", name: "Google Chrome", source: "win32-registry" },
        { agentId: "d2", hostname: "H2", name: "Google Chrome Beta", source: "win32-registry" },
      ],
      total: 2,
    });
    sdpApi.previewUninstall.mockResolvedValue({ actionable: [], blocked: [], notInstalled: [] });

    open();
    await user.type(screen.getByLabelText("Application name"), "Chrome");
    await user.click(screen.getByRole("button", { name: "Search" }));

    expect(await screen.findByText("Google Chrome")).toBeTruthy();
    expect(screen.getByText("Google Chrome Beta")).toBeTruthy();

    await user.click(screen.getByText("Google Chrome"));
    await user.click(screen.getByRole("button", { name: "Preview" }));

    // Se pregunta por el nombre EXACTO elegido, con su único equipo.
    await waitFor(() =>
      expect(sdpApi.previewUninstall).toHaveBeenCalledWith("Google Chrome", ["d1"])
    );
  });
});

describe("la lista de equipos", () => {
  it("los identifica por hostname, que es como el operador los ubica", async () => {
    const user = userEvent.setup();
    open();
    await searchAndPick(user);

    expect(screen.getByText("T111-VENTAS")).toBeTruthy();
    expect(screen.getByText("T111-RECEPCION")).toBeTruthy();
    expect(screen.queryByText("d1")).toBeNull();
  });

  it("desmarcar un equipo lo saca de la pregunta", async () => {
    const user = userEvent.setup();
    sdpApi.previewUninstall.mockResolvedValue({ actionable: [], blocked: [], notInstalled: [] });
    open();
    await searchAndPick(user);

    await user.click(screen.getByText("T111-RECEPCION"));
    await user.click(screen.getByRole("button", { name: "Preview" }));

    await waitFor(() =>
      expect(sdpApi.previewUninstall).toHaveBeenCalledWith("Dropbox", ["d1", "d2"])
    );
  });

  it("⚠️ avisa cuando la búsqueda no cupo entera", async () => {
    // Ver 100 filas de 1.400 y creer que es la flota es apuntar a una parte
    // pensando que es el todo.
    inventoryApi.getSoftwareInventoryDetail.mockResolvedValue({
      items: DROPBOX_ROWS,
      total: 1400,
    });
    const user = userEvent.setup();
    open();
    await user.type(screen.getByLabelText("Application name"), "a");
    await user.click(screen.getByRole("button", { name: "Search" }));

    expect(await screen.findByText(/más resultados de los que se pueden listar/)).toBeTruthy();
  });
});

describe("cuando el backend rechaza", () => {
  it("el motivo se queda a la vista y el diálogo no se cierra", async () => {
    // El backend rechaza por cosas que hay que leer —un equipo dado de baja,
    // ProductCodes en conflicto—. Un snackbar de 4 s no da tiempo, y el
    // operador se queda creyendo que el botón no hizo nada.
    const user = userEvent.setup();
    sdpApi.previewUninstall.mockResolvedValue({
      actionable: [{ deviceId: "d1", hostname: "T111-VENTAS", plan: { ok: true, preview: "x" } }],
      blocked: [],
      notInstalled: [],
    });
    sdpApi.uninstallDetected.mockRejectedValue({
      body: { message: "T111-VENTAS está dado de baja." },
    });

    const onClose = vi.fn();
    open({ onClose });
    await searchAndPick(user);
    await user.click(screen.getByRole("button", { name: "Preview" }));
    await user.click(await screen.findByRole("button", { name: "Uninstall on 1 device(s)" }));

    expect(await screen.findByText("T111-VENTAS está dado de baja.")).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();
  });
});
