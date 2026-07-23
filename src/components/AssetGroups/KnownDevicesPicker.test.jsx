import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";

vi.mock("../../api/jobs", () => ({
  listKnownDevices: vi.fn(),
}));
import { listKnownDevices } from "../../api/jobs";
import KnownDevicesPicker, {
  normalizeKnownDevice,
  normalizeKnownDeviceGroupAssignments,
} from "./KnownDevicesPicker";

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe("normalizeKnownDeviceGroupAssignments", () => {
  it("collects group names across the many backend shapes and dedupes", () => {
    const out = normalizeKnownDeviceGroupAssignments({
      groups: [{ name: "Alpha" }, "Beta"],
      groupNames: ["Beta", "Gamma"],
    });
    expect(out.isGrouped).toBe(true);
    expect(out.groupNames).toEqual(["Alpha", "Beta", "Gamma"]);
    expect(out.groupCount).toBeGreaterThanOrEqual(3);
    expect(out.groupCoverage).toBe("grouped");
  });

  it("marks a device ungrouped when nothing indicates a group", () => {
    const out = normalizeKnownDeviceGroupAssignments({ hostname: "x" });
    expect(out).toMatchObject({ isGrouped: false, groupCount: 0, groupCoverage: "ungrouped", groupNames: [] });
  });

  it("honors an explicit boolean grouped flag even without names", () => {
    const out = normalizeKnownDeviceGroupAssignments({ isGrouped: true });
    expect(out.isGrouped).toBe(true);
    expect(out.groupCount).toBe(1);
  });
});

describe("normalizeKnownDevice", () => {
  it("folds field-name variants into a stable row and includes group info", () => {
    const row = normalizeKnownDevice({
      deviceId: " dev-1 ",
      hostname: " host-1 ",
      osPlatform: "linux",
      agent_version: "1.2.3",
      connected: true,
      groups: ["Alpha"],
    });
    expect(row).toMatchObject({
      deviceId: "dev-1",
      hostname: "host-1",
      platform: "linux",
      agentVersion: "1.2.3",
      connected: true,
      isGrouped: true,
    });
  });
});

describe("KnownDevicesPicker", () => {
  const devices = {
    items: [
      { deviceId: "dev-1", hostname: "host-1", platform: "linux", connected: true, groups: ["Alpha"] },
      { deviceId: "dev-2", hostname: "host-2", platform: "windows", connected: false },
    ],
    total: 2,
  };

  it("does not fetch while closed", () => {
    listKnownDevices.mockResolvedValue(devices);
    render(
      <KnownDevicesPicker open={false} selectedIds={new Set()} onToggleDevice={() => {}} excludeIds={new Set()} />
    );
    expect(listKnownDevices).not.toHaveBeenCalled();
  });

  it("fetches on open and renders the device rows", async () => {
    listKnownDevices.mockResolvedValue(devices);
    render(
      <KnownDevicesPicker open selectedIds={new Set()} onToggleDevice={() => {}} excludeIds={new Set()} />
    );
    await waitFor(() => expect(screen.getByText("host-1")).toBeInTheDocument());
    expect(screen.getByText("host-2")).toBeInTheDocument();
    // dev-1 has a group → "Grouped" chip; dev-2 → "Ungrouped".
    expect(screen.getByText("Grouped")).toBeInTheDocument();
    expect(screen.getByText("Ungrouped")).toBeInTheDocument();
  });

  it("clicking a row toggles that device by id", async () => {
    listKnownDevices.mockResolvedValue(devices);
    const onToggleDevice = vi.fn();
    render(
      <KnownDevicesPicker open selectedIds={new Set()} onToggleDevice={onToggleDevice} excludeIds={new Set()} />
    );
    await waitFor(() => expect(screen.getByText("host-1")).toBeInTheDocument());
    fireEvent.click(screen.getByText("host-1"));
    expect(onToggleDevice).toHaveBeenCalledWith("dev-1");
  });

  it("filters out excluded device ids", async () => {
    listKnownDevices.mockResolvedValue(devices);
    render(
      <KnownDevicesPicker open selectedIds={new Set()} onToggleDevice={() => {}} excludeIds={new Set(["dev-2"])} />
    );
    await waitFor(() => expect(screen.getByText("host-1")).toBeInTheDocument());
    expect(screen.queryByText("host-2")).not.toBeInTheDocument();
  });

  it("shows the empty label when the fetch returns nothing", async () => {
    listKnownDevices.mockResolvedValue({ items: [], total: 0 });
    render(
      <KnownDevicesPicker open selectedIds={new Set()} onToggleDevice={() => {}} excludeIds={new Set()} emptyLabel="Nothing here" />
    );
    await waitFor(() => expect(screen.getByText("Nothing here")).toBeInTheDocument());
  });

  it("surfaces a fetch error", async () => {
    listKnownDevices.mockRejectedValue({ body: { message: "kaboom" } });
    render(
      <KnownDevicesPicker open selectedIds={new Set()} onToggleDevice={() => {}} excludeIds={new Set()} />
    );
    await waitFor(() => expect(screen.getByText("kaboom")).toBeInTheDocument());
  });
});
