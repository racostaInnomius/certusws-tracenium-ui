// src/pages/RolesAdministrator.test.jsx
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup, within } from "@testing-library/react";

vi.mock("../api/roles", () => ({
  listTenantRoles: vi.fn(),
  listCapabilities: vi.fn(),
  createTenantRole: vi.fn(),
  updateTenantRole: vi.fn(),
  deleteTenantRole: vi.fn(),
}));

vi.mock("../auth/AuthContext", () => ({
  useAuthContext: () => ({
    auth: { tenantId: 7, tenantMember: { role: "OWNER" } },
    loading: false,
    refreshAuth: vi.fn(),
  }),
  AuthProvider: ({ children }) => children,
}));

import {
  listTenantRoles,
  listCapabilities,
  createTenantRole,
  updateTenantRole,
  deleteTenantRole,
} from "../api/roles";
import RolesAdministrator from "./RolesAdministrator";

const OWNER = { id: 1, name: "OWNER", isSystem: true, permissions: ["jobs", "alerts", "remote_control", "reports"] };
const ADMIN = { id: 2, name: "ADMIN", isSystem: true, permissions: ["jobs", "alerts"] };
const USER = { id: 3, name: "USER", isSystem: true, permissions: ["jobs"] };
const CUSTOM = { id: 10, name: "IT Support", isSystem: false, permissions: ["jobs", "alerts"] };

const CAPABILITIES = [
  { key: "jobs", label: "Jobs", description: "Dispatch and manage jobs.", group: "Operations", plugin: null, entitled: true, enforced: true },
  { key: "alerts", label: "Alerts", description: "Manage alert rules.", group: "Operations", plugin: null, entitled: true, enforced: true },
  {
    key: "remote_control",
    label: "Remote Control",
    description: "Open a remote session.",
    group: "Operations",
    plugin: "rcp",
    entitled: false,
    enforced: true,
  },
  {
    key: "reports",
    label: "Reports",
    description: "Access the reports catalog.",
    group: "Visibility",
    plugin: null,
    entitled: true,
    enforced: false,
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  listTenantRoles.mockResolvedValue({ items: [OWNER, ADMIN, USER, CUSTOM] });
  listCapabilities.mockResolvedValue({ items: CAPABILITIES });
});

afterEach(cleanup);

describe("RolesAdministrator — list", () => {
  it("lists every role and locks the 3 built-ins", async () => {
    render(<RolesAdministrator />);

    expect(await screen.findByText("OWNER")).toBeInTheDocument();
    expect(screen.getByText("ADMIN")).toBeInTheDocument();
    expect(screen.getByText("USER")).toBeInTheDocument();
    expect(screen.getByText("IT Support")).toBeInTheDocument();

    expect(screen.getByLabelText("Edit OWNER")).toBeDisabled();
    expect(screen.getByLabelText("Delete OWNER")).toBeDisabled();
    expect(screen.getByLabelText("Edit IT Support")).not.toBeDisabled();
    expect(screen.getByLabelText("Delete IT Support")).not.toBeDisabled();
  });
});

describe("RolesAdministrator — create", () => {
  it("disables a capability the caller doesn't hold, and one the tenant isn't entitled to", async () => {
    render(<RolesAdministrator />);
    fireEvent.click(await screen.findByText("New role"));

    const dialog = await screen.findByRole("dialog");
    // Caller here is OWNER (holds everything) — re-render as ADMIN to
    // exercise the "you don't have this yourself" branch instead.
    const remoteControlSwitch = within(dialog)
      .getByText("Remote Control")
      .closest("div").parentElement.querySelector('input[type="checkbox"]');
    expect(remoteControlSwitch).toBeDisabled();
    expect(within(dialog).getByText(/not included in your tenant's current plan/i)).toBeInTheDocument();
  });

  it("creates a role with the toggled capabilities", async () => {
    createTenantRole.mockResolvedValue({ id: 11, name: "Support Lead", isSystem: false, permissions: ["jobs"] });

    render(<RolesAdministrator />);
    fireEvent.click(await screen.findByText("New role"));
    const dialog = await screen.findByRole("dialog");

    fireEvent.change(within(dialog).getByLabelText(/Role name/i), { target: { value: "Support Lead" } });

    const jobsRow = within(dialog).getByText("Jobs").closest("div").parentElement;
    fireEvent.click(within(jobsRow).getByRole("switch"));

    fireEvent.click(within(dialog).getByText("Create role"));

    await waitFor(() =>
      expect(createTenantRole).toHaveBeenCalledWith(7, { name: "Support Lead", permissions: ["jobs"] })
    );
    expect(await screen.findByText(/role created/i)).toBeInTheDocument();
  });

  it("edits a custom role, pre-filling its existing name and granted capabilities", async () => {
    updateTenantRole.mockResolvedValue({ id: 10, name: "IT Support", isSystem: false, permissions: ["jobs", "alerts", "reports"] });

    render(<RolesAdministrator />);
    fireEvent.click(await screen.findByLabelText("Edit IT Support"));
    const dialog = await screen.findByRole("dialog");

    expect(within(dialog).getByLabelText(/Role name/i)).toHaveValue("IT Support");

    // CUSTOM already grants jobs + alerts — add reports too.
    const reportsRow = within(dialog).getByText("Reports").closest("div").parentElement;
    fireEvent.click(within(reportsRow).getByRole("switch"));

    fireEvent.click(within(dialog).getByText("Save changes"));

    await waitFor(() =>
      expect(updateTenantRole).toHaveBeenCalledWith(7, 10, {
        name: "IT Support",
        permissions: ["jobs", "alerts", "reports"],
      })
    );
    expect(await screen.findByText(/role updated/i)).toBeInTheDocument();
  });

  it("labels a not-yet-enforced capability without disabling its toggle", async () => {
    render(<RolesAdministrator />);
    fireEvent.click(await screen.findByText("New role"));
    const dialog = await screen.findByRole("dialog");

    expect(within(dialog).getByText(/not yet enforced/i)).toBeInTheDocument();

    // Reports: entitled, and OWNER (the caller here) holds it — the
    // switch must stay togglable even though enforced:false, since
    // that field is informational, not a gate.
    const reportsRow = within(dialog).getByText("Reports").closest("div").parentElement;
    const reportsSwitch = within(reportsRow).getByRole("switch");
    expect(reportsSwitch).not.toBeDisabled();
  });

  it("surfaces the escalation-guard error with a specific message", async () => {
    const err = new Error("HTTP 400");
    err.status = 400;
    err.body = { error: "PERMISSIONS_EXCEED_ASSIGNER" };
    createTenantRole.mockRejectedValue(err);

    render(<RolesAdministrator />);
    fireEvent.click(await screen.findByText("New role"));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText(/Role name/i), { target: { value: "X" } });
    fireEvent.click(within(dialog).getByText("Create role"));

    expect(
      await screen.findByText(/you can't grant more permissions than you have yourself/i)
    ).toBeInTheDocument();
  });
});

describe("RolesAdministrator — delete", () => {
  it("shows the member count when a role is still in use (409)", async () => {
    const err = new Error("HTTP 409");
    err.status = 409;
    err.body = { error: "ROLE_IN_USE", memberCount: 3 };
    deleteTenantRole.mockRejectedValue(err);

    render(<RolesAdministrator />);
    fireEvent.click(await screen.findByLabelText("Delete IT Support"));

    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete" }));

    expect(
      await screen.findByText(/3 members currently have this role — reassign them first/i)
    ).toBeInTheDocument();
    expect(deleteTenantRole).toHaveBeenCalledWith(7, 10);
  });

  it("deletes an unused custom role", async () => {
    deleteTenantRole.mockResolvedValue({ message: "Role deleted successfully" });

    render(<RolesAdministrator />);
    fireEvent.click(await screen.findByLabelText("Delete IT Support"));

    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete" }));

    expect(await screen.findByText(/role deleted/i)).toBeInTheDocument();
  });
});
