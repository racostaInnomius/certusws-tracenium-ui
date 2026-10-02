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

function mount(items, { canManage = true } = {}) {
  const posts = [];
  server.use(
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
