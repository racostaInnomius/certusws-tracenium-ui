import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";

vi.mock("../../api/assetGroups", () => ({
  listUngroupedDevices: vi.fn(),
}));
import { listUngroupedDevices } from "../../api/assetGroups";
import UngroupedDevicesDrawer from "./UngroupedDevicesDrawer";

const devices = {
  items: [
    { deviceId: "dev-1", hostname: "host-1", platform: "linux", serial: "SN-1", agentVersion: "1.0.0" },
    { deviceId: "dev-2", hostname: "host-2", platform: "windows", serial: "SN-2", agentVersion: "1.1.0" },
  ],
  total: 2,
};

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe("UngroupedDevicesDrawer", () => {
  it("does not fetch while closed", () => {
    listUngroupedDevices.mockResolvedValue(devices);
    render(<UngroupedDevicesDrawer open={false} onClose={() => {}} notify={() => {}} />);
    expect(listUngroupedDevices).not.toHaveBeenCalled();
  });

  it("fetches on open and renders the device rows", async () => {
    listUngroupedDevices.mockResolvedValue(devices);
    render(<UngroupedDevicesDrawer open onClose={() => {}} notify={() => {}} />);
    await waitFor(() => expect(listUngroupedDevices).toHaveBeenCalled());
    expect(await screen.findByText("host-1")).toBeInTheDocument();
    expect(screen.getByText("host-2")).toBeInTheDocument();
    expect(screen.getByText("Ungrouped devices")).toBeInTheDocument();
  });

  it("wires the close button", async () => {
    listUngroupedDevices.mockResolvedValue(devices);
    const onClose = vi.fn();
    render(<UngroupedDevicesDrawer open onClose={onClose} notify={() => {}} />);
    await waitFor(() => expect(listUngroupedDevices).toHaveBeenCalled());
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("surfaces a fetch error and notifies the parent", async () => {
    listUngroupedDevices.mockRejectedValue({ body: { message: "load failed" } });
    const notify = vi.fn();
    render(<UngroupedDevicesDrawer open onClose={() => {}} notify={notify} />);
    await waitFor(() => expect(screen.getByText("load failed")).toBeInTheDocument());
    expect(notify).toHaveBeenCalledWith("error", "load failed");
  });
});
