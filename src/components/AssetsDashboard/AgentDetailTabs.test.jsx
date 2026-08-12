import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";

// MobileCommandsPanel owns its own fetches; stub it so the AgentTab tests stay
// focused on the tab's own rendering.
vi.mock("../AssetManagement/MobileCommandsPanel", () => ({
  default: ({ deviceId }) => <div data-testid="mobile-commands">{deviceId}</div>,
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
