// src/components/patch-management/VerificationChecksPanel.test.jsx
//
// ADR-0038 F1 — comprobaciones post-parche por grupo.

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { server, http, HttpResponse } from "../../test/msw/server";
import { ConfirmProvider } from "../common/ConfirmDialog";
import { clearApiCache } from "../../api/http";
import VerificationChecksPanel from "./VerificationChecksPanel";

afterEach(() => {
  cleanup();
  server.resetHandlers();
  clearApiCache();
});

const SQL = { id: 1, assetGroupId: 5, name: "ERP database", kind: "port", params: { port: 1433 }, enabled: true };
const TEMPLATES = [
  { key: "sql_server", label: "SQL Server", checks: [
    { name: "SQL Server service", kind: "service", params: { name: "MSSQLSERVER" } },
    { name: "SQL port", kind: "port", params: { port: 1433 } },
  ] },
];

const SUGGESTIONS = {
  ok: true, assetGroupId: null, devicesInScope: null, devicesReported: 3, oldestObservation: "2026-10-01T00:00:00.000Z",
  items: [{ key: "port:1433", name: "SQL Server listening (1433)", kind: "port", params: { port: 1433 }, devices: 3, reported: 3, process: "sqlservr.exe", service: "MSSQLSERVER" }],
};

function mount(items, { canManage = true, suggestions = SUGGESTIONS, discover } = {}) {
  const posts = [];
  server.use(
    http.get(/.*\/verification-checks\/suggestions.*/, () => HttpResponse.json(suggestions)),
    http.post(/.*\/verification-checks\/discover$/, async ({ request }) => {
      discover?.push(await request.json());
      return HttpResponse.json({ ok: true, asked: 2, agentTooOld: 1, overLimit: 0 }, { status: 202 });
    }),
    http.get(/.*\/asset-groups.*/, () => HttpResponse.json({ ok: true, items: [{ id: 5, name: "SQL servers" }] })),
    http.get(/.*\/verification-checks\/templates$/, () => HttpResponse.json({ ok: true, items: TEMPLATES })),
    http.get(/.*\/verification-checks$/, () => HttpResponse.json({ ok: true, items })),
    http.post(/.*\/verification-checks$/, async ({ request }) => {
      posts.push(await request.json());
      return HttpResponse.json({ ok: true, check: {} }, { status: 201 });
    })
  );
  render(
    <ConfirmProvider>
      <VerificationChecksPanel canManage={canManage} notify={vi.fn()} />
    </ConfirmProvider>
  );
  return posts;
}

describe("VerificationChecksPanel — sugerencias (ADR-0038 F2)", () => {
  it("⭐ lo que escuchan los equipos se añade con un clic, al alcance elegido", async () => {
    const user = userEvent.setup();
    const posts = mount([]);
    const row = (await screen.findByText("SQL Server listening (1433)")).closest("tr");
    expect(within(row).getByText("On 3 of 3 devices that reported (sqlservr.exe · MSSQLSERVER)")).toBeInTheDocument();
    await user.click(within(row).getByRole("button", { name: "Add SQL Server listening (1433)" }));
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0]).toEqual({ name: "SQL Server listening (1433)", kind: "port", params: { port: 1433 }, assetGroupId: null, enabled: true });
  });

  it("«Ask the devices now» pregunta al alcance; sin observaciones lo explica", async () => {
    const user = userEvent.setup();
    const discover = [];
    mount([], { suggestions: { ...SUGGESTIONS, devicesReported: 0, items: [] }, discover });
    expect(await screen.findByText(/No device here has reported what it listens on yet/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Ask the devices now" }));
    await waitFor(() => expect(discover).toEqual([{ assetGroupId: null }]));
  });

  it("sin patch_management se ven, pero ni se añaden ni se pregunta", async () => {
    mount([], { canManage: false });
    await screen.findByText("SQL Server listening (1433)");
    expect(screen.queryByRole("button", { name: /Add SQL Server/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "Ask the devices now" })).toBeNull();
  });
});

describe("VerificationChecksPanel", () => {
  it("lists each check as a sentence with the group it applies to", async () => {
    mount([SQL]);
    const row = (await screen.findByText("ERP database")).closest("tr");
    expect(within(row).getByText("Port 1433 is listening")).toBeInTheDocument();
    await waitFor(() => expect(within(row).getByText("SQL servers")).toBeInTheDocument());
  });

  it("⭐ a server role adds each of its checks to the chosen group", async () => {
    const user = userEvent.setup();
    const posts = mount([]);
    await user.click(await screen.findByRole("button", { name: "From a server role" }));
    const dialog = await screen.findByRole("dialog");
    // Every device is the default — and it warns, because role checks fail where the role isn't installed.
    expect(within(dialog).getByText(/will fail wherever that role is not installed/)).toBeInTheDocument();
    await user.click(within(dialog).getByLabelText("Applies to"));
    await user.click(await screen.findByRole("option", { name: "SQL servers" }));
    await user.click(within(dialog).getByRole("button", { name: "Add 2 checks" }));
    await waitFor(() => expect(posts).toHaveLength(2));
    expect(posts[0]).toEqual({ name: "SQL Server service", kind: "service", params: { name: "MSSQLSERVER" }, assetGroupId: 5, enabled: true });
  });

  it("warns when a group carries more checks than the agent runs", async () => {
    const many = Array.from({ length: 26 }, (_, i) => ({ ...SQL, id: i + 1, name: `c${i}` }));
    mount(many);
    expect(await screen.findByRole("alert")).toHaveTextContent(/More than 25 checks apply to SQL servers/);
  });

  it("read-only: no add, edit or delete", async () => {
    mount([SQL], { canManage: false });
    await screen.findByText("ERP database");
    expect(screen.queryByRole("button", { name: "Add check" })).toBeNull();
    expect(screen.queryByRole("button", { name: /Delete ERP database/ })).toBeNull();
  });
});
