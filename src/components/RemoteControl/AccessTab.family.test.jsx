// src/components/RemoteControl/AccessTab.family.test.jsx
//
// ⚠️ El registro de accesos de Remote Control enseñaba rotaciones de
// certificado entre las sesiones remotas.
//
// `access_requests` la comparten todos los plugins que piden acceso
// privilegiado (ADR-0011): `rcp.*` lo escriben las sesiones remotas y
// `cert.rotate` lo escribe CDP. En T111, el 2026-09-19, eso eran 54 filas de
// rotación contra 11 de `rcp.file`. Y como la respuesta viene recortada a las
// 100 más recientes, no era sólo ruido: las sesiones remotas de hace unas
// semanas no caben en la lista.
//
// De ahí que la aserción que importa sea lo que se PIDE, no lo que se pinta.
// Recortar aquí las filas ya traídas daría "las de rcp que quepan entre las
// 100 últimas" — una tabla vacía que se lee como "no ha entrado nadie".
//
// El segundo test es de PUERTA: hoy esta pestaña es la única del portal que
// lee esa tabla, así que filtrar sin dejar forma de ver el resto habría
// escondido las rotaciones de todas partes.

import * as React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, within, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const listAccessRequests = vi.fn();
vi.mock("../../api/remoteControl", () => ({
  listAccessRequests: (...a) => listAccessRequests(...a)
}));

import AccessTab from "./AccessTab";

function fila(id, capability, over = {}) {
  return {
    requestId: id,
    capability,
    deviceId: "9f1c2d3e-4a5b-4c6d-8e9f-0a1b2c3d4e5f",
    hostname: "SRV-DC01",
    operatorUserId: "operador@cliente.com",
    reason: "Reiniciar el servicio",
    ticketRef: "TCK-1",
    status: "consumed",
    createdAt: "2026-09-14T10:00:00.000Z",
    ...over
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  listAccessRequests.mockResolvedValue({
    ok: true,
    items: [fila("r1", "rcp.shell")]
  });
});
afterEach(() => cleanup());

const ultimaQuery = () =>
  listAccessRequests.mock.calls[listAccessRequests.mock.calls.length - 1][0];

describe("⚠️ el registro pide sólo la familia que enseña", () => {
  it("al abrir pide family=rcp, no el registro entero", async () => {
    render(<AccessTab />);
    await waitFor(() => expect(listAccessRequests).toHaveBeenCalled());
    expect(ultimaQuery()).toMatchObject({ family: "rcp" });
  });

  it("⚠️ el filtro viaja al servidor y no se aplica a lo ya traído", async () => {
    // Si alguien lo mueve al cliente, esta es la que se pone roja: la
    // petición dejaría de llevar `family`.
    render(<AccessTab />);
    await waitFor(() => expect(listAccessRequests).toHaveBeenCalled());
    expect(ultimaQuery()).toHaveProperty("family");
  });

  it("se pueden ver las rotaciones de certificado sin salir de aquí", async () => {
    const user = userEvent.setup();
    render(<AccessTab />);
    await waitFor(() => expect(listAccessRequests).toHaveBeenCalled());

    await user.click(screen.getByText("Remote control"));
    await user.click(
      within(screen.getByRole("listbox")).getByText("Certificate rotation")
    );

    await waitFor(() => expect(ultimaQuery()).toMatchObject({ family: "cert" }));
  });

  it("«All privileged access» NO manda family: el expediente completo es válido", async () => {
    const user = userEvent.setup();
    render(<AccessTab />);
    await waitFor(() => expect(listAccessRequests).toHaveBeenCalled());

    await user.click(screen.getByText("Remote control"));
    await user.click(
      within(screen.getByRole("listbox")).getByText("All privileged access")
    );

    await waitFor(() =>
      expect(listAccessRequests).toHaveBeenLastCalledWith({ limit: 100 })
    );
  });

  it("⚠️ vacío con filtro no dice «no ha entrado nadie»", async () => {
    // Con un filtro puesto, la tabla vacía significa «nadie con estas
    // capacidades». Decir lo otro en la pantalla de auditoría es un silencio
    // indistinguible del bueno.
    listAccessRequests.mockResolvedValue({ ok: true, items: [] });
    render(<AccessTab />);
    await waitFor(() =>
      expect(screen.getByText(/No access of this kind/i)).toBeInTheDocument()
    );
  });
});

describe("los estados de la tabla se leen", () => {
  it("«consumed» se enseña como Used, no como texto crudo", async () => {
    // Es el estado MÁS frecuente —lo escribe el servicio en cuanto el acceso
    // se usa— y no estaba en el mapa, así que caía al fallback gris: el
    // mismo aspecto que un estado que no sabemos interpretar.
    render(<AccessTab />);
    await waitFor(() => expect(screen.getByText("Used")).toBeInTheDocument());
  });
});
