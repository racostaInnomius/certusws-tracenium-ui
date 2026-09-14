// src/components/Charts/HostsTable.test.jsx
//
// Covers the split button in the Action column: Delete keeps its exact
// prior behavior (disabled until the row is checked, calls onDeleteDevice),
// and the new caret opens a menu of plain links to Patch Management /
// Remote Control / Jobs — each just calls onOpenInPage(pageKey, row) so
// the page (AssetsDashboard.jsx) can carry the device id over as a
// `?highlightAgentId=` deep link. Menu contents, not navigation itself:
// AssetsDashboard.jsx owns building the actual URL/onNavigate call.
//
// Delete and the row checkbox only exist with `canDecommission`: the backend
// gates decommission on the `device_management` capability, and a button a
// role can see but not use just ends in a 403. Default is hidden.

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import HostsTable from "./HostsTable";

afterEach(cleanup);

function row(over = {}) {
  return {
    agentId: "agent-1",
    hostname: "MYHOST-01",
    osPlatform: "windows",
    agentVersion: "1.2.3",
    lastLogonUser: "jdoe",
    localIp: "10.0.0.5",
    ...over,
  };
}

describe("without canDecommission", () => {
  it("renders no Delete button and no row checkbox", () => {
    render(<HostsTable rows={[row()]} selectedForDecommissionIds={new Set(["agent-1"])} />);
    expect(screen.queryByRole("button", { name: /^Delete$/ })).toBeNull();
    expect(screen.queryByRole("checkbox")).toBeNull();
  });

  it("keeps the More actions menu — it is navigation, not decommission", () => {
    render(<HostsTable rows={[row()]} />);
    expect(screen.getByRole("button", { name: /More actions for this device/i })).toBeEnabled();
  });

  it("keeps the empty-state row spanning every remaining column", () => {
    const { container } = render(<HostsTable rows={[]} />);
    const headerCells = container.querySelectorAll("thead th").length;
    expect(screen.getByText("No hosts found.").closest("td").getAttribute("colspan")).toBe(String(headerCells));
  });
});

describe("Delete (with canDecommission)", () => {
  it("is disabled until the row is checked", () => {
    render(<HostsTable rows={[row()]} canDecommission />);
    expect(screen.getByRole("button", { name: /^Delete$/ })).toBeDisabled();
  });

  it("calls onDeleteDevice with the row when checked and clicked", async () => {
    const onDeleteDevice = vi.fn();
    render(
      <HostsTable
        rows={[row()]}
        canDecommission
        selectedForDecommissionIds={new Set(["agent-1"])}
        onDeleteDevice={onDeleteDevice}
      />
    );
    await userEvent.click(screen.getByRole("button", { name: /^Delete$/ }));
    expect(onDeleteDevice).toHaveBeenCalledWith(expect.objectContaining({ agentId: "agent-1" }));
  });

  it("keeps the empty-state row spanning every column, checkbox included", () => {
    const { container } = render(<HostsTable rows={[]} canDecommission />);
    const headerCells = container.querySelectorAll("thead th").length;
    expect(screen.getByText("No hosts found.").closest("td").getAttribute("colspan")).toBe(String(headerCells));
  });
});

describe("More actions menu", () => {
  it("is always enabled, independent of the row's decommission-select state", () => {
    render(<HostsTable rows={[row()]} />);
    expect(screen.getByRole("button", { name: /More actions for this device/i })).toBeEnabled();
  });

  it("lists Patch Management, Remote Control and Jobs", async () => {
    render(<HostsTable rows={[row()]} />);
    await userEvent.click(screen.getByRole("button", { name: /More actions for this device/i }));
    const menu = screen.getByRole("menu");
    expect(within(menu).getByText("Patch Management")).toBeTruthy();
    expect(within(menu).getByText("Remote Control")).toBeTruthy();
    expect(within(menu).getByText("Jobs")).toBeTruthy();
  });

  it.each([
    ["Patch Management", "patch"],
    ["Remote Control", "remote-control"],
    ["Jobs", "jobs"],
  ])("clicking %s calls onOpenInPage(%s, row) and closes the menu", async (label, pageKey) => {
    const onOpenInPage = vi.fn();
    const theRow = row();
    render(<HostsTable rows={[theRow]} onOpenInPage={onOpenInPage} />);

    await userEvent.click(screen.getByRole("button", { name: /More actions for this device/i }));
    await userEvent.click(screen.getByText(label));

    expect(onOpenInPage).toHaveBeenCalledWith(pageKey, expect.objectContaining({ agentId: "agent-1" }));
    expect(screen.queryByRole("menu")).toBeNull();
  });
});
