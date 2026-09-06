// src/components/Reports/EmailReportDialog.test.jsx
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

import EmailReportDialog from "./EmailReportDialog";

afterEach(() => {
  cleanup();
  server.resetHandlers();
  clienteAbierto = null;
});

const REPORT_TYPE = {
  key: "cdp.cbom",
  label: "Crypto Bill of Materials (CBOM)",
  formats: ["json"],
};

const MEMBERS = {
  items: [
    { id: 1, email: "alice@acme.com", role: "OWNER", isActive: true, subject: "auth0|alice" },
    { id: 2, email: "bob@acme.com", role: "USER", isActive: true, subject: "auth0|bob" },
    { id: 3, email: "inactive@acme.com", role: "USER", isActive: false, subject: "auth0|gone" },
  ],
};

describe("EmailReportDialog", () => {
  it("lists only active members with an email — inactive ones are filtered out", async () => {
    respond("get", "/api/v1/tenants/7/members", MEMBERS);
    render(<EmailReportDialog open reportType={REPORT_TYPE} onClose={vi.fn()} onResult={vi.fn()} />);

    expect(await screen.findByText(/alice@acme.com/)).toBeInTheDocument();
    expect(screen.getByText(/bob@acme.com/)).toBeInTheDocument();
    expect(screen.queryByText(/inactive@acme.com/)).not.toBeInTheDocument();
  });

  it("sends the checked member's id and the parsed external emails, defaulting to the first available format", async () => {
    respond("get", "/api/v1/tenants/7/members", MEMBERS);
    const emailCalls = respond("post", "/api/v1/reports/cdp.cbom/email", { ok: true, sent: ["alice@acme.com", "auditor@example.com"], failed: [] });
    const onResult = vi.fn();
    const onClose = vi.fn();

    render(<EmailReportDialog open reportType={REPORT_TYPE} onClose={onClose} onResult={onResult} />);

    const aliceRow = await screen.findByText(/alice@acme.com/);
    await userEvent.click(within(aliceRow.closest("label")).getByRole("checkbox"));

    await userEvent.type(
      screen.getByLabelText(/external emails/i),
      "auditor@example.com"
    );

    await userEvent.click(screen.getByRole("button", { name: /^send$/i }));

    await waitFor(() => expect(emailCalls).toHaveLength(1));
    expect(emailCalls[0].body).toEqual({
      format: "json",
      memberIds: [1],
      externalEmails: ["auditor@example.com"],
    });
    expect(onResult).toHaveBeenCalledWith({ ok: true, sent: ["alice@acme.com", "auditor@example.com"], failed: [] });
    expect(onClose).toHaveBeenCalled();
  });

  it("blocks sending and shows an error for a malformed external email, without calling the API", async () => {
    respond("get", "/api/v1/tenants/7/members", { items: [] });
    const emailCalls = respond("post", "/api/v1/reports/cdp.cbom/email", { ok: true, sent: [], failed: [] });

    render(<EmailReportDialog open reportType={REPORT_TYPE} onClose={vi.fn()} onResult={vi.fn()} />);

    await userEvent.type(screen.getByLabelText(/external emails/i), "not-an-email");
    await userEvent.click(screen.getByRole("button", { name: /^send$/i }));

    expect(await screen.findByText(/not a valid email/i)).toBeInTheDocument();
    expect(emailCalls).toHaveLength(0);
  });

  it("disables Send until there is at least one recipient", async () => {
    respond("get", "/api/v1/tenants/7/members", { items: [] });
    render(<EmailReportDialog open reportType={REPORT_TYPE} onClose={vi.fn()} onResult={vi.fn()} />);

    await waitFor(() => expect(screen.getByRole("button", { name: /^send$/i })).toBeDisabled());
  });
});

// ── El tenant EFECTIVO, no el del token (plan R0, punto 4) ──────────
//
// En una sesión de MSP con un cliente abierto, `auth.tenantId` es el del
// operador, no el del cliente que se está mirando. El diálogo pedía los
// miembros de ese tenant: la lista salía vacía y no se podía programar ni
// enviar nada para el cliente. Es la trampa del tenant efectivo, ya
// documentada, y aquí volvía a estar.


describe("EmailReportDialog — sesión de MSP con cliente abierto", () => {
  it("pide los miembros del cliente ABIERTO, no los del operador", async () => {
    clienteAbierto = { id: 42, name: "Cliente" };
    const calls = respond("get", "/api/v1/tenants/:tenantId/members", { ok: true, items: [] });

    render(<EmailReportDialog open reportType={REPORT_TYPE} onClose={vi.fn()} onResult={vi.fn()} />);

    await waitFor(() => expect(calls.length).toBeGreaterThan(0));
    // 42 es el cliente en el que el operador ha entrado; 7 es su propio tenant.
    expect(calls[0].params.tenantId).toBe("42");
  });
});
