// src/components/Reports/ScheduleReportDialog.test.jsx
//
// ADR-0014 E3. What matters: the dialog never asks for dates (the server
// derives them from the period), it preselects SOC 2, it refuses to save
// without a recipient, and the POST body is the schedule contract.

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { server, respond } from "../../test/msw/server";

vi.mock("../../auth/AuthContext", () => ({
  useAuthContext: () => ({ auth: { tenantId: 7 }, loading: false, refreshAuth: vi.fn() }),
  AuthProvider: ({ children }) => children,
}));

// El contexto MSP, controlable por caso. Por defecto NO hay cliente abierto
// —la sesión normal— para que el resto del fichero siga hablando del tenant 7
// del token; un caso lo enciende para probar el drill-in.
let clienteAbierto = null;
vi.mock("../../msp/MspContext", () => ({
  useMspOptional: () => (clienteAbierto ? { activeTenant: clienteAbierto } : null),
}));

import ScheduleReportDialog from "./ScheduleReportDialog";

afterEach(() => {
  cleanup();
  server.resetHandlers();
  clienteAbierto = null;
});

const PACK = {
  key: "scp.evidence-pack",
  label: "Evidence Pack",
  formats: ["pdf", "json"],
  params: [
    { name: "framework", label: "Framework", kind: "framework", required: true },
    { name: "from", label: "From month", kind: "month", required: true },
    { name: "to", label: "To month", kind: "month", required: true },
    { name: "assetGroupId", label: "Asset group", kind: "asset_group", required: false },
  ],
};

function seed() {
  respond("get", "/api/v1/tenants/7/members", { items: [{ id: 11, email: "admin@acme.test", role: "ADMIN", isActive: true }] });
  respond("get", "/api/v1/security/compliance/frameworks", {
    ok: true,
    frameworks: [
      { framework: "cis_windows_11_v4.0", shortName: "CIS Win11" },
      { framework: "soc2_tsc_2017", shortName: "SOC 2" },
    ],
  });
  respond("get", "/api/v1/asset-groups", { items: [{ id: 3, name: "Laptops" }] });
}

describe("ScheduleReportDialog", () => {
  it("asks for format, period, framework and recipients — never for dates", async () => {
    seed();
    render(<ScheduleReportDialog open reportType={PACK} onClose={() => {}} />);
    await screen.findByText("admin@acme.test", { exact: false });
    expect(screen.getByLabelText("Format")).toBeTruthy();
    expect(screen.getByLabelText("Period")).toBeTruthy();
    expect(screen.queryByLabelText("From month")).toBeNull();
    expect(screen.queryByLabelText("To month")).toBeNull();
    // SOC 2 preselected: the reason the pack exists.
    await waitFor(() => expect(screen.getByLabelText("Framework")).toHaveTextContent("SOC 2"));
  });

  it("cannot save without a recipient; posts the schedule contract once one is picked", async () => {
    seed();
    const posted = respond("post", "/api/v1/reports/schedules", { ok: true, schedule: { id: 5 } }, { status: 201 });
    const onCreated = vi.fn();
    const onClose = vi.fn();
    render(<ScheduleReportDialog open reportType={PACK} onClose={onClose} onCreated={onCreated} />);
    const member = await screen.findByText("admin@acme.test", { exact: false });
    await waitFor(() => expect(screen.getByLabelText("Framework")).toHaveTextContent("SOC 2"));

    const save = screen.getByRole("button", { name: /create schedule/i });
    expect(save.disabled).toBe(true);

    const user = userEvent.setup();
    await user.click(within(member.closest("label")).getByRole("checkbox"));
    await user.type(screen.getByLabelText(/external emails/i), "auditor@example.com");
    await waitFor(() => expect(save.disabled).toBe(false));
    await user.click(save);

    await waitFor(() => expect(posted).toHaveLength(1));
    expect(posted[0].body).toEqual({
      reportKey: "scp.evidence-pack",
      format: "pdf",
      params: { framework: "soc2_tsc_2017" },
      periodMonths: 1,
      recipientMemberIds: [11],
      recipientExternal: ["auditor@example.com"],
    });
    expect(onCreated).toHaveBeenCalledWith({ id: 5 });
    expect(onClose).toHaveBeenCalled();
  });

  it("a type without params has no period and no framework field", async () => {
    respond("get", "/api/v1/tenants/7/members", { items: [] });
    render(<ScheduleReportDialog open reportType={{ key: "cdp.cbom", label: "CBOM", formats: ["json"] }} onClose={() => {}} />);
    await screen.findByText(/no active members/i);
    expect(screen.queryByLabelText("Period")).toBeNull();
    expect(screen.queryByLabelText("Framework")).toBeNull();
  });
});

// ── El tenant EFECTIVO, no el del token (plan R0, punto 4) ──────────
//
// En una sesión de MSP con un cliente abierto, `auth.tenantId` es el del
// operador, no el del cliente que se está mirando. El diálogo pedía los
// miembros de ese tenant: la lista salía vacía y no se podía programar ni
// enviar nada para el cliente. Es la trampa del tenant efectivo, ya
// documentada, y aquí volvía a estar.


describe("ScheduleReportDialog — sesión de MSP con cliente abierto", () => {
  it("pide los miembros del cliente ABIERTO, no los del operador", async () => {
    clienteAbierto = { id: 42, name: "Cliente" };
    const calls = respond("get", "/api/v1/tenants/:tenantId/members", { ok: true, items: [] });

    render(<ScheduleReportDialog open reportType={PACK} onClose={() => {}} />);

    await waitFor(() => expect(calls.length).toBeGreaterThan(0));
    // 42 es el cliente en el que el operador ha entrado; 7 es su propio tenant.
    expect(calls[0].params.tenantId).toBe("42");
  });
});
