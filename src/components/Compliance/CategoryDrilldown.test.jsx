// src/components/Compliance/CategoryDrilldown.test.jsx
//
// The drill-in under a "Posture by category" row. It used to render every
// failing device with every failing check as a chip — 15,706 chips for
// Integrity in a 54-device tenant, ~350,000 at 1,200 devices. What these
// tests pin is the property that makes it scale: nothing is ever fetched
// whole (every call carries a page size), the default axis is the check,
// and the devices are one click away, paginated and searchable.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

vi.mock("../../api/compliance", () => ({
  getCategoryFailingChecks: vi.fn(),
  getCategoryCheckDevices: vi.fn(),
  getCategoryDevices: vi.fn(),
}));
import { getCategoryFailingChecks, getCategoryCheckDevices, getCategoryDevices } from "../../api/compliance";
import CategoryDrilldown, { CHECKS_PAGE, DEVICES_PAGE } from "./CategoryDrilldown";

const check = (checkId, title, severity, deviceCount, devicesEvaluated, agentRemediable = false) => ({
  checkId, title, severity, deviceCount, devicesEvaluated, agentRemediable, category: "integrity",
});

beforeEach(() => {
  getCategoryFailingChecks.mockResolvedValue({
    ok: true,
    items: [check("c.secureboot", "Secure Boot must be enabled", "critical", 32, 62, true), check("c.tpm", "TPM 2.0 present", "high", 5, 5)],
    total: 3,
  });
  getCategoryCheckDevices.mockResolvedValue({
    ok: true,
    items: [
      { agentId: "a1", hostname: "WS-01", platform: "windows", severity: "critical", failingSince: "2026-09-01T00:00:00.000Z" },
      { agentId: "a2", hostname: "WS-02", platform: "windows", severity: "critical", failingSince: null },
    ],
    total: 32,
  });
  getCategoryDevices.mockResolvedValue({
    ok: true,
    items: [{ agentId: "a1", hostname: "WS-01", platform: "windows", failingChecks: 2, highSeverityFails: 1, checks: [] }],
    total: 52,
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("CategoryDrilldown — by check (default)", () => {
  it("lists the failing checks with how many devices fail each out of where it was evaluated", async () => {
    render(<CategoryDrilldown category="integrity" />);
    expect(await screen.findByText("Secure Boot must be enabled")).toBeInTheDocument();
    expect(screen.getByText(/3 failing checks/)).toBeInTheDocument();
    const row = screen.getByRole("button", { name: /Devices failing Secure Boot must be enabled/ });
    expect(within(row).getByText("32")).toBeInTheDocument();
    expect(within(row).getByText(/\/ 62/)).toBeInTheDocument();
    expect(within(row).getByText("Agent fix")).toBeInTheDocument();
    // The first page is a page: it never asks for the whole category.
    expect(getCategoryFailingChecks).toHaveBeenCalledWith("integrity", { limit: CHECKS_PAGE, offset: 0 });
    // And it does not load any device until a check is opened.
    expect(getCategoryCheckDevices).not.toHaveBeenCalled();
    expect(getCategoryDevices).not.toHaveBeenCalled();
  });

  it("says how much is left and loads the next page on demand, appending", async () => {
    render(<CategoryDrilldown category="integrity" />);
    await screen.findByText("Secure Boot must be enabled");
    expect(screen.getByText("Showing 2 of 3 checks")).toBeInTheDocument();
    getCategoryFailingChecks.mockResolvedValueOnce({ ok: true, items: [check("c.aslr", "ASLR enabled", "medium", 50, 60)], total: 3 });
    fireEvent.click(screen.getByRole("button", { name: "Show 1 more" }));
    expect(await screen.findByText("ASLR enabled")).toBeInTheDocument();
    expect(getCategoryFailingChecks).toHaveBeenLastCalledWith("integrity", { limit: CHECKS_PAGE, offset: 2 });
    expect(screen.getByText("Secure Boot must be enabled")).toBeInTheDocument();
    expect(screen.queryByText(/Showing/)).not.toBeInTheDocument();
  });

  it("opening a check pages its devices, and a device opens its drawer", async () => {
    const onOpenDevice = vi.fn();
    render(<CategoryDrilldown category="integrity" onOpenDevice={onOpenDevice} />);
    fireEvent.click(await screen.findByRole("button", { name: /Devices failing Secure Boot must be enabled/ }));

    expect(await screen.findByText("WS-01")).toBeInTheDocument();
    expect(getCategoryCheckDevices).toHaveBeenCalledWith("integrity", "c.secureboot", { limit: DEVICES_PAGE, offset: 0, q: "" });
    expect(screen.getByText("32 devices failing this check")).toBeInTheDocument();
    expect(screen.getByText("Showing 2 of 32 devices")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "WS-02" }));
    expect(onOpenDevice).toHaveBeenCalledWith("a2");
  });

  it("searches the devices of a check on the server, not in the page it has", async () => {
    render(<CategoryDrilldown category="integrity" />);
    fireEvent.click(await screen.findByRole("button", { name: /Devices failing Secure Boot must be enabled/ }));
    await screen.findByText("WS-01");
    fireEvent.change(screen.getByRole("textbox", { name: "Search devices" }), { target: { value: " ws-0 " } });
    await waitFor(() =>
      expect(getCategoryCheckDevices).toHaveBeenLastCalledWith("integrity", "c.secureboot", { limit: DEVICES_PAGE, offset: 0, q: "ws-0" })
    );
  });
});

describe("CategoryDrilldown — by device", () => {
  it("is a paginated list of counts, not every device's checks", async () => {
    render(<CategoryDrilldown category="integrity" />);
    await screen.findByText("Secure Boot must be enabled");
    fireEvent.click(screen.getByRole("button", { name: "By device" }));

    expect(await screen.findByText("WS-01")).toBeInTheDocument();
    expect(getCategoryDevices).toHaveBeenCalledWith("integrity", { limit: DEVICES_PAGE, offset: 0, q: "", fields: "counts" });
    expect(screen.getByText("2 failing")).toBeInTheDocument();
    expect(screen.getByText("1 critical/high")).toBeInTheDocument();
    expect(screen.getByText(/52 devices failing/)).toBeInTheDocument();
    expect(screen.getByText("Showing 1 of 52 devices")).toBeInTheDocument();
  });
});

describe("CategoryDrilldown — failure", () => {
  it("says the list failed instead of pretending the category is clean", async () => {
    getCategoryFailingChecks.mockRejectedValueOnce({ body: { message: "boom" } });
    render(<CategoryDrilldown category="integrity" />);
    expect(await screen.findByText("boom")).toBeInTheDocument();
    expect(screen.queryByText(/No checks are failing/)).not.toBeInTheDocument();
  });
});
