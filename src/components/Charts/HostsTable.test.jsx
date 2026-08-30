// src/components/Charts/HostsTable.test.jsx
//
// Covers the split button in the Action column: Delete keeps its exact
// prior behavior (disabled until the row is checked, calls onDeleteDevice),
// and the new caret opens a menu of plain links to Patch Management /
// Remote Control / Jobs — each just calls onOpenInPage(pageKey, row) so
// the page (AssetsDashboard.jsx) can carry the device id over as a
// `?highlightAgentId=` deep link. Menu contents, not navigation itself:
// AssetsDashboard.jsx owns building the actual URL/onNavigate call.

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

describe("Delete (unchanged behavior)", () => {
  it("is disabled until the row is checked", () => {
    render(<HostsTable rows={[row()]} />);
    expect(screen.getByRole("button", { name: /^Delete$/ })).toBeDisabled();
  });

  it("calls onDeleteDevice with the row when checked and clicked", async () => {
    const onDeleteDevice = vi.fn();
    render(
      <HostsTable
        rows={[row()]}
        selectedForDecommissionIds={new Set(["agent-1"])}
        onDeleteDevice={onDeleteDevice}
      />
    );
    await userEvent.click(screen.getByRole("button", { name: /^Delete$/ }));
    expect(onDeleteDevice).toHaveBeenCalledWith(expect.objectContaining({ agentId: "agent-1" }));
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
