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
  openDeployment: null,
  lastInstall: null,
  inventoryLastSeen: null,
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

  it("🔴 el equipo con un job del mismo paquete en vuelo NO entra en el envío", async () => {
    // El caso de campo: #52 mandó Edge a 8 equipos, 2 se quedaron en `pending`
    // y 20 h después el botón mandaba el MISMO paquete otra vez. El segundo job
    // se encola detrás del primero.
    seed([
      device({ agentId: "libre", hostname: "PC-LIBRE" }),
      device({
        agentId: "camino",
        hostname: "PC-CAMINO",
        openDeployment: { deploymentId: 52, version: "152.0.7977.83", outcome: "pending", createdAt: "2026-09-24T01:28:00Z" },
      }),
    ]);
    const onDeploy = vi.fn();
    open({ onDeploy });

    // El botón principal cuenta UNO, no dos.
    await userEvent.click(await screen.findByRole("button", { name: /Update 152\.0\.7977\.83 on 1 device$/i }));
    expect(onDeploy).toHaveBeenCalledWith(expect.objectContaining({ deviceIds: ["libre"] }));

    // Y el otro se enseña, con su motivo. No desaparece.
    expect(screen.getByText(/Already on the way \(1\)/)).toBeInTheDocument();
    expect(screen.getByText("PC-CAMINO")).toBeInTheDocument();
  });

  it("⚠️ pero se puede reenviar a propósito: no se bloquea", async () => {
    // A veces se reenvía justo PORQUE el job se atascó.
    seed([
      device({
        agentId: "camino",
        openDeployment: { deploymentId: 52, version: "152.0.7977.83", outcome: "pending", createdAt: "2026-09-24T01:28:00Z" },
      }),
    ]);
    const onDeploy = vi.fn();
    open({ onDeploy });

    await userEvent.click(await screen.findByRole("button", { name: /Update anyway on 1 device/i }));
    expect(onDeploy).toHaveBeenCalledWith(expect.objectContaining({ deviceIds: ["camino"] }));
  });

  it("y desde ahí se puede abrir el despliegue que ya va en camino", async () => {
    seed([
      device({
        agentId: "camino",
        openDeployment: { deploymentId: 52, version: "152.0.7977.83", outcome: "pending", createdAt: "2026-09-24T01:28:00Z" },
      }),
    ]);
    const onOpenDeployment = vi.fn();
    open({ onOpenDeployment });

    await userEvent.click(await screen.findByText(/open deployment #52/i));
    expect(onOpenDeployment).toHaveBeenCalledWith(52);
  });

  it("⭐ el que instaló DESPUÉS de la última lectura tampoco entra", async () => {
    // La lectura es más vieja que el install: no puede reflejarlo. Reenviar
    // ahí sólo produce un `already_installed`.
    seed([
      device({ agentId: "libre" }),
      device({
        agentId: "dudoso",
        hostname: "PC-DUDOSO",
        lastInstall: { deploymentId: 40, outcome: "success", finishedAt: "2026-09-24T02:00:00Z", reportedVersion: "152.0.7977.83" },
        inventoryLastSeen: "2026-09-24T01:00:00Z",
      }),
    ]);
    const onDeploy = vi.fn();
    open({ onDeploy });

    await userEvent.click(await screen.findByRole("button", { name: /Update 152\.0\.7977\.83 on 1 device$/i }));
    expect(onDeploy).toHaveBeenCalledWith(expect.objectContaining({ deviceIds: ["libre"] }));
    expect(screen.getByText(/Installed after this reading \(1\)/)).toBeInTheDocument();
  });

  it("⭐ una lectura vieja se dice en la fila", async () => {
    // Los dos equipos del caso llevaban 220 h y 151 h sin reportar, y se veían
    // igual que el que reportó hace diez minutos.
    vi.setSystemTime(new Date("2026-09-24T12:00:00Z"));
    seed([device({ inventoryLastSeen: "2026-09-15T08:00:00Z" })]);
    open();

    expect(await screen.findByText(/last reported 9 days ago/i)).toBeInTheDocument();
    vi.useRealTimers();
  });

  it("una lectura fresca no ensucia la fila", async () => {
    vi.setSystemTime(new Date("2026-09-24T12:00:00Z"));
    seed([device({ inventoryLastSeen: "2026-09-24T11:00:00Z" })]);
    open();

    await screen.findByText("PC-ANA");
    expect(screen.queryByText(/last reported/i)).toBeNull();
    vi.useRealTimers();
  });

  it("pide la celda al servidor con su título y su estado", async () => {
    const calls = seed([device()]);
    open({ state: "behind" });

    await waitFor(() => expect(calls.length).toBe(1));
    expect(calls[0].pathname).toMatch(/\/analytics\/catalog-coverage\/google-chrome\/devices$/);
    expect(calls[0].search).toEqual({ state: "behind" });
  });
});
