// src/components/CryptoDiscovery/ProcessLibrariesPanel.test.jsx
//
// Ola 1.5 — el panel montado de verdad.
//
// ⭐ Lo que defiende: una versión deducida de la soname se VE distinta de
// una leída, y el panel lo dice arriba en vez de esconderlo en un tooltip.
// Si el recuento de bloqueos de la hoja de ruta se apoya en versiones que
// nadie leyó, quien lo lea tiene que saberlo antes de cerrar un ticket.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

const listCdpProcessLibraries = vi.fn();
vi.mock("../../api/cdp", () => ({
  listCdpProcessLibraries: (...a) => listCdpProcessLibraries(...a)
}));

import ProcessLibrariesPanel from "./ProcessLibrariesPanel";

const row = (over = {}) => ({
  agentId: "a1",
  host: "web-prod-01",
  process: "nginx",
  imagePath: "/usr/sbin/nginx",
  service: "nginx.service",
  library: "openssl",
  libraryPath: "/usr/lib/x86_64-linux-gnu/libssl.so.3",
  version: "3.0.2",
  versionSource: "file",
  ports: [443],
  ...over
});

beforeEach(() => {
  listCdpProcessLibraries.mockResolvedValue({ ok: true, items: [] });
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("⭐ an inferred version never looks like a read one", () => {
  it("marks the soname entry and warns above the list, naming the threshold it cannot settle", async () => {
    listCdpProcessLibraries.mockResolvedValue({ ok: true, items: [row({ versionSource: "soname" })] });
    render(<ProcessLibrariesPanel refreshNonce={0} />);

    // El aviso va arriba, no en un tooltip: afecta a cómo se lee el
    // recuento de bloqueos entero.
    const warn = await screen.findByText(/not read from the library/i);
    const alert = warn.closest(".MuiAlert-message");
    expect(alert.textContent).toMatch(/1 of 1 versions/);
    expect(alert.textContent).toMatch(/libssl\.so\.3 is the same soname for OpenSSL 3\.0\.2 and for 3\.6\.2/);
    expect(alert.textContent).toMatch(/3\.5/);
    // Y la propia entrada queda marcada, no sólo el bloque.
    expect(screen.getByText("openssl 3.0.2 ⚠")).toBeInTheDocument();
  });

  it("a version read from the file carries no warning at all", async () => {
    listCdpProcessLibraries.mockResolvedValue({ ok: true, items: [row({ versionSource: "file" })] });
    render(<ProcessLibrariesPanel refreshNonce={0} />);
    expect(await screen.findByText("openssl 3.0.2")).toBeInTheDocument();
    expect(screen.queryByText(/not read from the library/i)).not.toBeInTheDocument();
    expect(screen.queryByText("openssl 3.0.2 ⚠")).not.toBeInTheDocument();
  });

  it("⭐ a version with no stated provenance is warned about too, not assumed read", async () => {
    listCdpProcessLibraries.mockResolvedValue({ ok: true, items: [row({ versionSource: null })] });
    render(<ProcessLibrariesPanel refreshNonce={0} />);
    expect(await screen.findByText("openssl 3.0.2 ⚠")).toBeInTheDocument();
    expect(screen.getByText(/not read from the library/i)).toBeInTheDocument();
  });
});

describe("what you restart", () => {
  it("lists the device, the service by name and what it has loaded", async () => {
    listCdpProcessLibraries.mockResolvedValue({
      ok: true,
      items: [row(), row({ agentId: "a2", host: "db-01", service: "postgresql.service", ports: [5432], libraryPath: "/opt/pg/libssl.so.3" })]
    });
    render(<ProcessLibrariesPanel refreshNonce={0} />);

    expect(await screen.findByText("web-prod-01")).toBeInTheDocument();
    expect(screen.getByText("db-01")).toBeInTheDocument();
    expect(screen.getByText("nginx.service")).toBeInTheDocument();
    expect(screen.getByText("tcp/443")).toBeInTheDocument();
    // La ruta real de la librería: dos OpenSSL en la misma máquina se
    // distinguen por ahí y por nada más.
    expect(screen.getByText("/usr/lib/x86_64-linux-gnu/libssl.so.3")).toBeInTheDocument();
    expect(screen.getByText(/2 services on 2 devices/)).toBeInTheDocument();
  });

  it("says whether it is naming a service, a process or just an executable", async () => {
    listCdpProcessLibraries.mockResolvedValue({ ok: true, items: [row({ service: null })] });
    render(<ProcessLibrariesPanel refreshNonce={0} />);
    expect(await screen.findByText("nginx")).toBeInTheDocument();
    // «nginx» y «nginx.service» no se reinician igual, así que cuál de los
    // dos se está enseñando se dice.
    expect(screen.getByText("· process")).toBeInTheDocument();
  });

  it("a device with no hostname is shown by its agent id, and said so", async () => {
    listCdpProcessLibraries.mockResolvedValue({ ok: true, items: [row({ host: null })] });
    render(<ProcessLibrariesPanel refreshNonce={0} />);
    expect(await screen.findByText("a1")).toBeInTheDocument();
    expect(screen.getByText(/no hostname/i)).toBeInTheDocument();
  });
});

describe("⭐ honest states", () => {
  it("an API error is not rendered as «nothing loads a crypto library»", async () => {
    listCdpProcessLibraries.mockRejectedValue(new Error("upstream said no"));
    render(<ProcessLibrariesPanel refreshNonce={0} />);
    expect(await screen.findByText(/could not be read: upstream said no/i)).toBeInTheDocument();
    expect(screen.queryByText(/No device has reported a loaded crypto library/i)).not.toBeInTheDocument();
  });

  it("the empty state is about what was collected, not about the fleet", async () => {
    render(<ProcessLibrariesPanel refreshNonce={0} />);
    const empty = await screen.findByText(/No device has reported a loaded crypto library/i);
    expect(empty.textContent).toMatch(/says nothing about machines that have not reported one/i);
  });

  it("rows with no device are reported as dropped instead of vanishing", async () => {
    listCdpProcessLibraries.mockResolvedValue({ ok: true, items: [row(), { library: "openssl", libraryPath: "/l.so" }] });
    render(<ProcessLibrariesPanel refreshNonce={0} />);
    expect(await screen.findByText(/1 row came back without a device or a library name/i)).toBeInTheDocument();
  });
});
