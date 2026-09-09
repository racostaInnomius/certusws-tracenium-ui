import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";

// MobileCommandsPanel owns its own fetches; stub it so the AgentTab tests stay
// focused on the tab's own rendering.
vi.mock("../AssetManagement/MobileCommandsPanel", () => ({
  default: ({ deviceId }) => <div data-testid="mobile-commands">{deviceId}</div>,
}));

// El mapa del historial arrastra Leaflet, que en jsdom no pinta nada util. Se
// sustituye por un doble que expone lo que la pestana le pasa: que reciba las
// entradas y la seleccion ES el contrato entre lista y mapa, y es lo unico de
// el que esta pestana puede romper.
vi.mock("./DeviceLocationHistoryMap", () => ({
  default: ({ entries, selectedId, onSelect }) => (
    <div data-testid="history-map" data-selected={selectedId ?? ""}>
      <span data-testid="history-map-count">{entries.filter((e) => e.mappable).length}</span>
      <button type="button" onClick={() => onSelect("geo:oficina")}>
        pick-pin
      </button>
    </div>
  ),
}));

import { AgentTab, HardwareTab, SoftwareTab, PrintersTab } from "./AgentDetailTabs";

afterEach(cleanup);

describe("AgentTab", () => {
  const base = {
    hostname: "host-1",
    agentId: "agent-1",
    platform: "windows",
    agentVersion: "1.2.3",
    profile: { lastLogonUser: "jdoe", localIp: "10.0.0.5" },
    hardware: {},
    connected: true,
    isMobileDevice: false,
    commandDeviceId: "dev-uuid",
    platformKey: "windows",
  };

  it("renders the identity fields and online status", () => {
    render(<AgentTab {...base} />);
    expect(screen.getByText("host-1")).toBeInTheDocument();
    expect(screen.getByText("agent-1")).toBeInTheDocument();
    expect(screen.getByText("jdoe")).toBeInTheDocument();
    expect(screen.getByText("Online")).toBeInTheDocument();
  });

  it("shows Offline when not connected", () => {
    render(<AgentTab {...base} connected={false} />);
    expect(screen.getByText("Offline")).toBeInTheDocument();
  });

  it("hides the managed-device panel for desktop devices", () => {
    render(<AgentTab {...base} />);
    expect(screen.queryByText("Managed device")).not.toBeInTheDocument();
    expect(screen.queryByTestId("mobile-commands")).not.toBeInTheDocument();
  });

  it("shows the derived location, preferring the mapped site name", () => {
    render(
      <AgentTab
        {...base}
        profile={{ ...base.profile, locationSite: "Oficina CDMX", locationSubnet: "10.20.30.0/24" }}
      />
    );
    expect(screen.getByText("Oficina CDMX")).toBeInTheDocument();
  });

  it("falls back to the raw subnet when no site mapping exists yet", () => {
    render(<AgentTab {...base} profile={{ ...base.profile, locationSubnet: "10.20.30.0/24" }} />);
    expect(screen.getByText("10.20.30.0/24")).toBeInTheDocument();
  });

  it("hides location history for a device that has never moved", () => {
    render(
      <AgentTab
        {...base}
        profile={{
          ...base.profile,
          locationSubnet: "10.20.30.0/24",
          locationHistory: [{ locationKey: "subnet:10.20.30.0/24", subnetCidr: "10.20.30.0/24", hitCount: 9 }],
        }}
      />
    );
    // A single position tells the operator nothing the field above doesn't.
    expect(screen.queryByText("Location history")).not.toBeInTheDocument();
  });

  it("shows location history once the device has been at more than one site", () => {
    render(
      <AgentTab
        {...base}
        profile={{
          ...base.profile,
          locationSubnet: "10.20.90.0/24",
          locationHistory: [
            { locationKey: "subnet:10.20.90.0/24", subnetCidr: "10.20.90.0/24", hitCount: 2 },
            { locationKey: "subnet:10.20.30.0/24", siteName: "Oficina CDMX", hitCount: 41 },
          ],
        }}
      />
    );
    expect(screen.getByText("Location history")).toBeInTheDocument();
    expect(screen.getByText("Oficina CDMX")).toBeInTheDocument();
    // hit_count is surfaced so "primary site" is distinguishable from "passed through".
    expect(screen.getByText("41×")).toBeInTheDocument();
  });

  it("⚠️ una posicion GPS sin sitio muestra sus coordenadas, no un guion", () => {
    // Era el fallo original: las filas que SI traen posicion se pintaban como
    // un guion, que se lee como "no sabemos donde estuvo".
    render(
      <AgentTab
        {...base}
        profile={{
          ...base.profile,
          locationHistory: [
            { locationKey: "geo:a", lat: 19.319696, lon: -99.242192, accuracyM: 35, hitCount: 25,
              firstSeenAt: "2026-08-13T13:58:00Z", lastSeenAt: "2026-09-08T15:53:00Z" },
            { locationKey: "subnet:x", subnetCidr: "192.168.3.0/24", hitCount: 8,
              firstSeenAt: "2026-09-03T21:16:00Z", lastSeenAt: "2026-09-04T12:23:00Z" },
          ],
        }}
      />
    );
    // Las dos filas se identifican por lo que SABEN: una por sus coordenadas y
    // la otra por su rango. Antes las dos caian al mismo guion.
    //
    // Se afirma sobre las etiquetas y no sobre el texto de la pestana: otros
    // campos vacios pintan "—" legitimamente, y una asercion global sobre el
    // guion se rompe por razones que no tienen nada que ver con el historial.
    // La regla del guion vive en buildLocationHistory y alli esta cubierta.
    expect(screen.getByText("19.3197, -99.2422")).toBeInTheDocument();
    expect(screen.getByText("192.168.3.0/24")).toBeInTheDocument();
    expect(screen.getByText("±35 m")).toBeInTheDocument();
  });

  it("dice cuando el nombre del sitio vino de la cercania y no del rango", () => {
    render(
      <AgentTab
        {...base}
        profile={{
          ...base.profile,
          locationHistory: [
            { locationKey: "geo:a", siteName: "Cowork", siteMatch: "proximity", lat: 19.3, lon: -99.2, hitCount: 3 },
            { locationKey: "subnet:x", siteName: "Cowork", siteMatch: "cidr", subnetCidr: "10.0.0.0/24", hitCount: 1 },
          ],
        }}
      />
    );
    // Una sola insignia: la fila resuelta por rango no la lleva.
    expect(screen.getAllByText("by proximity")).toHaveLength(1);
  });

  it("⚠️ no dibuja una flecha entre las dos fechas", () => {
    // hitCount cuenta TICKS, no visitas, y los rangos SE SOLAPAN entre filas.
    // Una flecha se lee como una estancia continua que nadie ha medido.
    const { container } = render(
      <AgentTab
        {...base}
        profile={{
          ...base.profile,
          locationHistory: [
            { locationKey: "a", subnetCidr: "10.0.0.0/24", hitCount: 2, firstSeenAt: "2026-08-01T00:00:00Z", lastSeenAt: "2026-09-01T00:00:00Z" },
            { locationKey: "b", subnetCidr: "10.0.1.0/24", hitCount: 1, firstSeenAt: "2026-08-05T00:00:00Z", lastSeenAt: "2026-08-06T00:00:00Z" },
          ],
        }}
      />
    );
    expect(container.textContent).not.toContain("\u2192");
    expect(container.textContent).toContain("seen");
  });

  it("el mapa del historial no se monta hasta que se pide", async () => {
    render(
      <AgentTab
        {...base}
        profile={{
          ...base.profile,
          locationHistory: [
            { locationKey: "geo:a", lat: 19.3, lon: -99.2, hitCount: 2 },
            { locationKey: "geo:oficina", lat: 19.4, lon: -99.1, hitCount: 1 },
          ],
        }}
      />
    );
    expect(screen.queryByTestId("history-map")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Map 2/ }));
    expect(await screen.findByTestId("history-map")).toBeInTheDocument();
  });

  it("⚠️ ofrece mapear solo las posiciones que TIENEN coordenadas", async () => {
    // El mapa es siempre un subconjunto: subnet y public_ip no tienen ninguna.
    render(
      <AgentTab
        {...base}
        profile={{
          ...base.profile,
          locationHistory: [
            { locationKey: "geo:a", lat: 19.3, lon: -99.2, hitCount: 2 },
            { locationKey: "subnet:x", subnetCidr: "10.0.0.0/24", hitCount: 5 },
            { locationKey: "city:us", hitCount: 1 },
          ],
        }}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /Map 1/ }));
    expect((await screen.findByTestId("history-map-count")).textContent).toBe("1");
  });

  it("no ofrece mapa cuando ninguna posicion tiene coordenadas", () => {
    render(
      <AgentTab
        {...base}
        profile={{
          ...base.profile,
          locationHistory: [
            { locationKey: "subnet:a", subnetCidr: "10.0.0.0/24", hitCount: 2 },
            { locationKey: "subnet:b", subnetCidr: "10.0.1.0/24", hitCount: 1 },
          ],
        }}
      />
    );
    expect(screen.getByText("Location history")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Map / })).not.toBeInTheDocument();
  });

  it("seleccionar una fila resalta su pin, y el pin resalta la fila", async () => {
    // El acoplamiento en los dos sentidos es lo que resuelve "cual es cual" sin
    // numerar diez pines encima del mapa.
    render(
      <AgentTab
        {...base}
        profile={{
          ...base.profile,
          locationHistory: [
            { locationKey: "geo:casa", siteName: "Casa", lat: 19.3, lon: -99.2, hitCount: 9 },
            { locationKey: "geo:oficina", siteName: "Oficina", lat: 19.4, lon: -99.1, hitCount: 3 },
          ],
        }}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /Map 2/ }));
    expect((await screen.findByTestId("history-map")).dataset.selected).toBe("");

    // Lista → mapa.
    fireEvent.click(screen.getByText("Casa"));
    expect(screen.getByTestId("history-map").dataset.selected).toBe("geo:casa");

    // Mapa → lista (el doble emite geo:oficina).
    fireEvent.click(screen.getByText("pick-pin"));
    expect(screen.getByTestId("history-map").dataset.selected).toBe("geo:oficina");

    // Y volver a pulsar la misma fila la deselecciona.
    fireEvent.click(screen.getByText("Oficina"));
    expect(screen.getByTestId("history-map").dataset.selected).toBe("");
  });

  it("⚠️ dice lo que la lista NO es, sin que haya que deducirlo", () => {
    // Tres lecturas equivocadas que el formato invita a hacer: que estén TODAS
    // las posiciones que hubo, que los numeros sean visitas, y que las filas
    // en columna sean una secuencia.
    render(
      <AgentTab
        {...base}
        profile={{
          ...base.profile,
          locationHistory: [
            { locationKey: "a", subnetCidr: "10.0.0.0/24", hitCount: 25 },
            { locationKey: "b", subnetCidr: "10.0.1.0/24", hitCount: 2 },
          ],
        }}
      />
    );
    const nota = screen.getByText(/Distinct positions, newest first/i);
    expect(nota).toBeInTheDocument();
    expect(nota.textContent).toMatch(/older ones drop off/i);
    expect(nota.textContent).toMatch(/check-ins, not visits/i);
    expect(nota.textContent).toMatch(/date ranges overlap/i);
    expect(nota.textContent).toMatch(/not a timeline/i);
  });

  it("⚠️ esa nota DESAPARECE cuando hay línea de tiempo", () => {
    // Dice literalmente "esto no es una línea de tiempo". Pintarla debajo de
    // una línea de tiempo contradice lo que el operador está viendo.
    render(
      <AgentTab
        {...base}
        timeline={{
          retentionDays: 30,
          episodes: [
            { id: "1", siteName: "Oficina", tickCount: 3,
              firstSeenAt: "2026-09-01T09:00:00Z", lastSeenAt: "2026-09-02T18:00:00Z",
              endedAt: null },
          ],
        }}
        profile={{
          ...base.profile,
          locationHistory: [
            { locationKey: "a", subnetCidr: "10.0.0.0/24", hitCount: 25 },
            { locationKey: "b", subnetCidr: "10.0.1.0/24", hitCount: 2 },
          ],
        }}
      />
    );
    expect(screen.queryByText(/so this is not a timeline/i)).not.toBeInTheDocument();
    // Y lo que se ve es la estancia, no la lista de lugares.
    expect(screen.getByText(/^confirmed /i)).toBeInTheDocument();
  });

  it("el contador dice que cuenta reportes, no visitas", async () => {
    render(
      <AgentTab
        {...base}
        profile={{
          ...base.profile,
          locationHistory: [
            { locationKey: "a", subnetCidr: "10.0.0.0/24", hitCount: 25 },
            { locationKey: "b", subnetCidr: "10.0.1.0/24", hitCount: 1 },
          ],
        }}
      />
    );
    fireEvent.mouseOver(screen.getByText("25×"));
    expect(
      await screen.findByText(/25 inventory check-ins — not 25 separate visits/i)
    ).toBeInTheDocument();
  });

  it("shows coordinates for a mobile GPS fix", () => {
    render(
      <AgentTab
        {...base}
        isMobileDevice
        platformKey="ios"
        profile={{ ...base.profile, locationLat: 20.673611, locationLon: -103.343611, locationAccuracyM: 12 }}
      />
    );
    expect(screen.getByText("20.67361, -103.34361 ±12 m")).toBeInTheDocument();
  });

  it("omits the Coordinates field entirely on desktop", () => {
    render(<AgentTab {...base} profile={{ ...base.profile, locationSubnet: "10.20.30.0/24" }} />);
    expect(screen.queryByText("Coordinates")).not.toBeInTheDocument();
  });

  it("omits Coordinates when the payload carries explicit nulls, not just missing keys", () => {
    // REGRESSION: the API sends locationLat/Lon as null for every desktop
    // device, and Number(null) is 0 — the drawer showed "0.00000, 0.00000".
    render(
      <AgentTab
        {...base}
        profile={{
          ...base.profile,
          locationSubnet: "10.20.30.0/24",
          locationLat: null,
          locationLon: null,
          locationAccuracyM: null,
        }}
      />
    );
    expect(screen.queryByText("Coordinates")).not.toBeInTheDocument();
    expect(screen.queryByText(/0\.00000/)).not.toBeInTheDocument();
  });

  it("shows the managed-device panel + commands for mobile devices", () => {
    render(
      <AgentTab
        {...base}
        isMobileDevice
        platformKey="ios"
        profile={{ ...base.profile, operatingMode: "mdmMam", storageHealth: "ok" }}
      />
    );
    expect(screen.getByText("Managed device")).toBeInTheDocument();
    expect(screen.getByText(/fully managed/i)).toBeInTheDocument();
    expect(screen.getByText("ok")).toBeInTheDocument();
    expect(screen.getByTestId("mobile-commands")).toHaveTextContent("dev-uuid");
  });
});

describe("HardwareTab", () => {
  it("renders hardware fields with formatted values", () => {
    render(<HardwareTab hardware={{ serial: "SN1", manufacturer: "Dell", diskUsagePct: 42.34 }} />);
    expect(screen.getByText("SN1")).toBeInTheDocument();
    expect(screen.getByText("Dell")).toBeInTheDocument();
    expect(screen.getByText("42.3%")).toBeInTheDocument();
  });

  it("falls back to em-dashes when hardware is missing", () => {
    render(<HardwareTab hardware={null} />);
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
  });
});

describe("SoftwareTab", () => {
  const rows = [
    { id: 1, name: "Chrome", publisher: "Google", source: "msi" },
    { id: 2, name: "Slack", publisher: "Salesforce", source: "exe" },
  ];

  it("renders the app rows and the detected-count chip", () => {
    render(
      <SoftwareTab
        softwareRows={rows}
        softwareLoading={false}
        softwareCount={2}
        softwarePage={0}
        softwarePageSize={8}
        onSoftwarePaginationModelChange={() => {}}
      />
    );
    expect(screen.getByText("Chrome")).toBeInTheDocument();
    expect(screen.getByText("Google")).toBeInTheDocument();
    expect(screen.getByText("2 apps detected")).toBeInTheDocument();
  });

  it("shows the empty state when there are no rows", () => {
    render(
      <SoftwareTab
        softwareRows={[]}
        softwareLoading={false}
        softwareCount={0}
        softwarePage={0}
        softwarePageSize={8}
        onSoftwarePaginationModelChange={() => {}}
      />
    );
    expect(screen.getByText(/No software inventory found/i)).toBeInTheDocument();
  });

  it("emits a pagination model change when the page advances", () => {
    const onSoftwarePaginationModelChange = vi.fn();
    render(
      <SoftwareTab
        softwareRows={rows}
        softwareLoading={false}
        softwareCount={50}
        softwarePage={0}
        softwarePageSize={8}
        onSoftwarePaginationModelChange={onSoftwarePaginationModelChange}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /next page/i }));
    expect(onSoftwarePaginationModelChange).toHaveBeenCalledWith({ page: 1, pageSize: 8 });
  });
});

describe("PrintersTab", () => {
  it("renders printers with Default/Shared badges and type", () => {
    render(
      <PrintersTab
        printerRows={[
          { id: 1, name: "HP-1", driver: "HP", port: "IP_10.0.0.9", isDefault: true, isNetwork: true, status: "online" },
        ]}
      />
    );
    expect(screen.getByText("HP-1")).toBeInTheDocument();
    expect(screen.getByText("Default")).toBeInTheDocument();
    expect(screen.getByText("Network")).toBeInTheDocument();
    expect(screen.getByText("online")).toBeInTheDocument();
    expect(screen.getByText("1 printer detected")).toBeInTheDocument();
  });

  it("pluralizes the count and shows the empty state", () => {
    render(<PrintersTab printerRows={[]} />);
    expect(screen.getByText("0 printers detected")).toBeInTheDocument();
    expect(screen.getByText(/No printers configured/i)).toBeInTheDocument();
  });

  it("shows a loading message while printers load", () => {
    render(<PrintersTab printerRows={[]} printersLoading />);
    expect(screen.getByText("Loading printers…")).toBeInTheDocument();
  });
});
