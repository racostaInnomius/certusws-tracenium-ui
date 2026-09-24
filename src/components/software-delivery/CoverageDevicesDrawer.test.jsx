// src/components/software-delivery/CoverageDevicesDrawer.test.jsx
//
// El cajón que convierte «29 por detrás» en 29 equipos y un botón.
//
// Lo que se fija: que el botón aparezca donde ayuda y NO donde hace daño
// (sobre «ahead» degradaría la flota), que un fallo de carga se diga en vez de
// parecer «no hay equipos», y que el permiso se respete.

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { server, respond } from "../../test/msw/server";
import CoverageDevicesDrawer from "./CoverageDevicesDrawer";

afterEach(() => {
  cleanup();
  server.resetHandlers();
});

const DEVICES_PATH = /\/analytics\/catalog-coverage\/[^/]+\/devices/;

const device = (over = {}) => ({
  agentId: "a",
  hostname: "PC-ANA",
  platform: "windows",
  installedVersion: "151.0.0.1",
  packageId: 9,
  catalogVersion: "152.0.7977.83",
  state: "behind",
  ...over,
});

function seed(devices, { state = "behind", status = 200 } = {}) {
  return respond(
    "get",
    DEVICES_PATH,
    { ok: true, titleKey: "google-chrome", name: "Google Chrome", state, devices },
    { status }
  );
}

function open(props = {}) {
  return render(
    <CoverageDevicesDrawer
      open
      titleKey="google-chrome"
      name="Google Chrome"
      state="behind"
      canManage
      onClose={() => {}}
      {...props}
    />
  );
}

describe("CoverageDevicesDrawer", () => {
  it("⭐ enseña los equipos del tramo con lo que tienen puesto", async () => {
    seed([device(), device({ agentId: "b", hostname: "PC-BETO", installedVersion: "151.0.0.2" })]);
    open();

    expect(await screen.findByText("PC-ANA")).toBeInTheDocument();
    expect(screen.getByText("PC-BETO")).toBeInTheDocument();
    expect(screen.getByText("151.0.0.1")).toBeInTheDocument();
    expect(screen.getByText("2 devices")).toBeInTheDocument();
  });

  it("⭐ el botón manda el paquete de ese grupo y SUS equipos", async () => {
    // Es lo que faltaba para que la gráfica sirviera de algo: de «29 por
    // detrás» a un despliegue sobre esos 29.
    seed([device(), device({ agentId: "b", hostname: "PC-BETO" })]);
    const onDeploy = vi.fn();
    open({ onDeploy });

    const boton = await screen.findByRole("button", { name: /Update 152\.0\.7977\.83 on 2 devices/i });
    await userEvent.click(boton);

    expect(onDeploy).toHaveBeenCalledWith({
      packageId: 9,
      deviceIds: ["a", "b"],
      hostnames: { a: "PC-ANA", b: "PC-BETO" },
    });
  });

  it("🔴 sobre «ahead» NO hay botón: sería degradar la flota", async () => {
    // Chrome y Edge se auto-actualizan; ir por delante es lo normal. Un botón
    // aquí mandaría la versión vieja del catálogo a toda la casa.
    seed([device({ state: "ahead", installedVersion: "153.0.1" })], { state: "ahead" });
    open({ state: "ahead" });

    expect(await screen.findByText("PC-ANA")).toBeInTheDocument();
    // ⚠️ Se busca por la FORMA del botón («… on N devices») y no por el verbo:
    // un estado no desplegable no tiene verbo, así que buscar /Update|Install/
    // pasaba aunque el botón estuviera ahí con la etiqueta a medias.
    expect(screen.queryByRole("button", { name: /on \d+ device/i })).toBeNull();
    expect(screen.getByText(/would downgrade them/i)).toBeInTheDocument();
  });

  it("los que no lo tienen se instalan, y se ve que no tienen versión", async () => {
    seed([device({ state: "missing", installedVersion: null })], { state: "missing" });
    open({ state: "missing" });

    expect(await screen.findByText("not installed")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Install 152\.0\.7977\.83 on 1 device$/i })).toBeInTheDocument();
  });

  it("⚠️ sin permiso se ve la lista pero no el botón", async () => {
    seed([device()]);
    open({ canManage: false });

    expect(await screen.findByText("PC-ANA")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /on \d+ device/i })).toBeNull();
    expect(screen.getByText(/do not have permission/i)).toBeInTheDocument();
  });

  it("⚠️ si la carga falla lo DICE, no se queda vacío", async () => {
    // Un cajón vacío se lee como «no hay equipos», que es otra respuesta.
    seed([], { status: 500 });
    open();

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.queryByText(/No devices in this segment/i)).toBeNull();
  });

  it("un tramo que se quedó sin equipos lo dice en una línea", async () => {
    seed([]);
    open();
    expect(await screen.findByText(/No devices in this segment/i)).toBeInTheDocument();
  });

  it("⚠️ dos plataformas en el mismo tramo son dos envíos, no uno", async () => {
    // Un despliegue es de UN paquete: los Windows y los Mac atrasados no se
    // pueden mandar juntos.
    seed([
      device({ agentId: "w", hostname: "PC-1", packageId: 9, platform: "windows" }),
      device({ agentId: "m", hostname: "MAC-1", packageId: 22, platform: "macos", catalogVersion: "152.0" }),
    ]);
    open();

    await screen.findByText("PC-1");
    const botones = screen.getAllByRole("button", { name: /on 1 device/i });
    expect(botones).toHaveLength(2);
  });

  it("pide la celda al servidor con su título y su estado", async () => {
    const calls = seed([device()]);
    open({ state: "behind" });

    await waitFor(() => expect(calls.length).toBe(1));
    expect(calls[0].pathname).toMatch(/\/analytics\/catalog-coverage\/google-chrome\/devices$/);
    expect(calls[0].search).toEqual({ state: "behind" });
  });
});
