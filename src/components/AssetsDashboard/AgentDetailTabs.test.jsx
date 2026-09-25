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

vi.mock("./DeviceLocationMap", () => ({
  default: ({ pin }) => <div data-testid="current-map">{pin?.label}</div>,
}));

import { AgentTab, HardwareTab, LocationTab, SoftwareTab, PrintersTab } from "./AgentDetailTabs";

afterEach(cleanup);

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

describe("AgentTab", () => {
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

  it("⭐ enseña lo que antes eran las tarjetas de la cabecera: versión, serie y apps", () => {
    render(<AgentTab {...base} hardware={{ serial: "SN-42" }} softwareCount={214} />);
    expect(screen.getByText("1.2.3")).toBeInTheDocument();
    expect(screen.getByText("SN-42")).toBeInTheDocument();
    expect(screen.getByText("214 apps")).toBeInTheDocument();
  });

  it("la tarjeta de software abre la pestaña Software", () => {
    const onOpenTab = vi.fn();
    render(<AgentTab {...base} softwareCount={3} onOpenTab={onOpenTab} />);
    fireEvent.click(screen.getByRole("button", { name: /open the software tab/i }));
    expect(onOpenTab).toHaveBeenCalledWith("software");
  });

  it("dice si el agente va por detrás de la última versión", () => {
    render(<AgentTab {...base} versionBucket="one_behind" latestVersion="1.2.5" />);
    expect(screen.getByText("Update available · 1.2.5")).toBeInTheDocument();
  });

  it("sin última versión conocida no opina", () => {
    render(<AgentTab {...base} versionBucket="unknown" />);
    expect(screen.queryByText(/up to date|update available/i)).not.toBeInTheDocument();
  });

  it("la ubicación ya no vive aquí (tiene su pestaña)", () => {
    render(<AgentTab {...base} profile={{ ...base.profile, locationSite: "Oficina CDMX" }} />);
    expect(screen.queryByText("Oficina CDMX")).not.toBeInTheDocument();
    expect(screen.queryByText("Location")).not.toBeInTheDocument();
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

describe("LocationTab", () => {
  it("shows the derived location, preferring the mapped site name", () => {
    render(
      <LocationTab
        {...base}
        profile={{ ...base.profile, locationSite: "Oficina CDMX", locationSubnet: "10.20.30.0/24" }}
      />
    );
    expect(screen.getByText("Oficina CDMX")).toBeInTheDocument();
  });

  it("falls back to the raw subnet when no site mapping exists yet", () => {
    render(<LocationTab {...base} profile={{ ...base.profile, locationSubnet: "10.20.30.0/24" }} />);
    expect(screen.getByText("10.20.30.0/24")).toBeInTheDocument();
  });

  it("hides location history for a device that has never moved", () => {
    render(
      <LocationTab
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
      <LocationTab
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
      <LocationTab
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
      <LocationTab
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
      <LocationTab
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

  it("⭐ el mapa sale sin pedirlo (sin posición actual, el del historial)", async () => {
    render(
      <LocationTab
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
    expect(await screen.findByTestId("history-map")).toBeInTheDocument();
  });

  it("⚠️ ofrece mapear solo las posiciones que TIENEN coordenadas", async () => {
    // El mapa es siempre un subconjunto: subnet y public_ip no tienen ninguna.
    render(
      <LocationTab
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
    expect((await screen.findByTestId("history-map-count")).textContent).toBe("1");
  });

  it("no ofrece mapa cuando ninguna posicion tiene coordenadas", () => {
    render(
      <LocationTab
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
      <LocationTab
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
      <LocationTab
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
      <LocationTab
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
      <LocationTab
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
      <LocationTab
        {...base}
        isMobileDevice
        platformKey="ios"
        profile={{ ...base.profile, locationLat: 20.673611, locationLon: -103.343611, locationAccuracyM: 12 }}
      />
    );
    expect(screen.getByText("20.67361, -103.34361 ±12 m")).toBeInTheDocument();
  });

  it("omits the Coordinates field entirely on desktop", () => {
    render(<LocationTab {...base} profile={{ ...base.profile, locationSubnet: "10.20.30.0/24" }} />);
    expect(screen.queryByText("Coordinates")).not.toBeInTheDocument();
  });

  it("omits Coordinates when the payload carries explicit nulls, not just missing keys", () => {
    // REGRESSION: the API sends locationLat/Lon as null for every desktop
    // device, and Number(null) is 0 — the drawer showed "0.00000, 0.00000".
    render(
      <LocationTab
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

  it("⭐ con posición actual, el mapa la enseña sin botón, y «Map N» cambia al historial", async () => {
    render(
      <LocationTab
        {...base}
        profile={{
          ...base.profile,
          locationSite: "Oficina CDMX",
          locationMapLat: 19.43,
          locationMapLon: -99.13,
          locationMapSource: "site",
          locationHistory: [
            { locationKey: "geo:a", lat: 19.3, lon: -99.2, hitCount: 2 },
            { locationKey: "geo:oficina", lat: 19.4, lon: -99.1, hitCount: 1 },
          ],
        }}
      />
    );
    expect(await screen.findByTestId("current-map")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /view on map/i })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Map 2/ }));
    expect(await screen.findByTestId("history-map")).toBeInTheDocument();
    expect(screen.queryByTestId("current-map")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /current position/i }));
    expect(await screen.findByTestId("current-map")).toBeInTheDocument();
  });

  it("sin ninguna posición no hay columna de mapa", () => {
    render(<LocationTab {...base} profile={{ ...base.profile, locationSubnet: "10.20.30.0/24" }} />);
    expect(screen.queryByTestId("current-map")).not.toBeInTheDocument();
    expect(screen.queryByTestId("history-map")).not.toBeInTheDocument();
  });

  it("⭐ pinta la línea de tiempo que le pasa la ficha", () => {
    // La ficha recibía `timeline` y no lo pasaba a ninguna pestaña: la línea de
    // tiempo de ubicación no se pintó nunca.
    render(
      <LocationTab
        {...base}
        timeline={{
          retentionDays: 30,
          episodes: [
            { id: "1", siteName: "Oficina", tickCount: 3,
              firstSeenAt: "2026-09-01T09:00:00Z", lastSeenAt: "2026-09-02T18:00:00Z", endedAt: null },
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
    expect(screen.getByText(/^confirmed /i)).toBeInTheDocument();
  });
});

describe("HardwareTab", () => {
  it("renders hardware fields with formatted values", () => {
    render(<HardwareTab hardware={{ serial: "SN1", manufacturer: "Dell", diskUsagePct: 42.34 }} />);
    expect(screen.getByText("SN1")).toBeInTheDocument();
    expect(screen.getByText("Dell")).toBeInTheDocument();
    expect(screen.getByText("42.3%")).toBeInTheDocument();
  });

  it("sin inventario lo dice, en vez de una rejilla de guiones", () => {
    render(<HardwareTab hardware={null} />);
    expect(screen.getByText(/no hardware inventory reported/i)).toBeInTheDocument();
  });

  it("⭐ el disco lleva medidor y contexto: usado, total y libre", () => {
    const GB = 1024 ** 3;
    render(
      <HardwareTab
        hardware={{ diskUsagePct: 90, diskUsedBytes: 450 * GB, diskTotalBytes: 500 * GB }}
      />
    );
    expect(screen.getByRole("meter", { name: "Disk usage" })).toHaveAttribute("aria-valuenow", "90");
    expect(screen.getByText("450.0 GB of 500.0 GB used · 50.0 GB free")).toBeInTheDocument();
  });

  it("sin batería no pinta 0 %: dice que no la hay", () => {
    render(<HardwareTab hardware={{ manufacturer: "Dell", batteryPercent: null }} />);
    expect(screen.getByText("No battery reported")).toBeInTheDocument();
    expect(screen.queryByRole("meter", { name: "Battery charge" })).not.toBeInTheDocument();
  });
});

describe("SoftwareTab", () => {
  const rows = [
    { id: 1, name: "Chrome", publisher: "Google", source: "msi" },
    { id: 2, name: "Slack", publisher: "Salesforce", source: "exe" },
  ];

  it("⭐ enseña el día de instalación que mandó el equipo, y — si no lo sabe", () => {
    render(
      <SoftwareTab
        softwareRows={[
          { id: 1, name: "7-Zip", source: "win32-registry", installedOn: "2024-03-15" },
          { id: 2, name: "Viejo", source: "win32-registry" },
        ]}
        softwareLoading={false}
        softwareCount={2}
        softwarePage={0}
        softwarePageSize={8}
      />
    );
    expect(screen.getByText("Installed")).toBeInTheDocument();
    expect(screen.getByText("Mar 15, 2024")).toBeInTheDocument();
  });

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

  // A blind Windows read used to render as "No printers configured" — the
  // portal stated a fact about the device it had not been able to observe.
  it("says it could not read printers, with the reason, when a scope is not collected", () => {
    render(<PrintersTab printerRows={[]} printerScan={{ machineScope: "timeout", userScope: "no_user_hive" }} />);
    expect(screen.getByText(
      "Could not read printers (the print spooler query timed out; no user signed in, so per-user network printers were not visible)"
    )).toBeInTheDocument();
    expect(screen.queryByText(/No printers configured/i)).not.toBeInTheDocument();
    expect(screen.queryByText("0 printers detected")).not.toBeInTheDocument();
    expect(screen.getByText("Not read")).toBeInTheDocument();
  });

  it("keeps the real empty state when every scope was collected", () => {
    render(<PrintersTab printerRows={[]} printerScan={{ machineScope: "collected", userScope: "collected" }} />);
    expect(screen.getByText(/No printers configured/i)).toBeInTheDocument();
  });

  it("flags a partial read above a non-empty list", () => {
    render(
      <PrintersTab
        printerRows={[{ id: 1, name: "HP-1", isNetwork: false, status: "online" }]}
        printerScan={{ machineScope: "collected", userScope: "no_user_hive" }}
      />
    );
    expect(screen.getByText("HP-1")).toBeInTheDocument();
    expect(screen.getByText(
      "Printer list may be incomplete (no user signed in, so per-user network printers were not visible)"
    )).toBeInTheDocument();
  });
});
