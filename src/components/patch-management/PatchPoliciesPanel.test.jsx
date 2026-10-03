// src/components/patch-management/PatchPoliciesPanel.test.jsx
//
// ADR-0038 F4 — recurring patch policies with rings.

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { server, http, HttpResponse } from "../../test/msw/server";
import { ConfirmProvider } from "../common/ConfirmDialog";
import { clearApiCache } from "../../api/http";
import PatchPoliciesPanel from "./PatchPoliciesPanel";

afterEach(() => {
  cleanup();
  server.resetHandlers();
  clearApiCache();
});

const RUN = {
  id: 9, policyId: 4, startedAt: "2026-10-16T03:00:00Z", patchIds: ["KB1"], status: "halted", currentRing: 0, haltedReason: "Pilot: only 50% checked healthy (1 of 2)",
  deadlineAt: null, trigger: "schedule", finishedAt: null,
  rings: [
    { position: 0, name: "Pilot", devices: 2, dispatchedAt: "2026-10-16T03:00:00Z", jobsCreated: 2, decision: "halted", reason: "only 50% checked healthy (1 of 2)", stats: { green: 1, failed: 1 } },
    { position: 1, name: "Everyone else", devices: 40, dispatchedAt: null, jobsCreated: null, decision: null },
  ],
};
const POLICY = {
  id: 4, name: "Windows servers", enabled: true, scopeAssetGroupId: null, platforms: ["windows"], severities: ["critical", "important"], requireApproval: false,
  cadence: { kind: "patch_tuesday", offsetDays: 2, atMinute: 1320, timezone: "America/Chicago" }, rebootIfRequired: true, windowMode: "window", deadlineDays: 7,
  deadlineIgnoresWindow: false, promoteThresholdPct: 80, promoteMinDevices: 3, nextRunAt: "2026-11-13T04:00:00Z",
  rings: [{ name: "Pilot", assetGroupId: 11, soakHours: 24 }, { name: "Everyone else", assetGroupId: null, soakHours: 0 }], lastRun: RUN,
};

function mount({ canManage = true } = {}) {
  const posts = { create: [], promote: [] };
  server.use(
    http.get(/.*\/asset-groups.*/, () => HttpResponse.json({ ok: true, items: [{ id: 11, name: "Pilot servers" }] })),
    http.get(/.*\/patch-management\/policies$/, () => HttpResponse.json({ ok: true, items: [POLICY] })),
    http.get(/.*\/patch-management\/policies\/4\/runs$/, () => HttpResponse.json({ ok: true, items: [RUN] })),
    http.post(/.*\/patch-management\/policies$/, async ({ request }) => {
      posts.create.push(await request.json());
      return HttpResponse.json({ ok: true, policy: POLICY }, { status: 201 });
    }),
    http.post(/.*\/patch-management\/policies\/runs\/9\/promote$/, () => {
      posts.promote.push(9);
      return HttpResponse.json({ ok: true });
    })
  );
  render(
    <ConfirmProvider>
      <PatchPoliciesPanel canManage={canManage} notify={vi.fn()} />
    </ConfirmProvider>
  );
  return posts;
}

describe("PatchPoliciesPanel", () => {
  it("⭐ each policy reads: whom, when, rings, and where its last run stands", async () => {
    mount();
    const row = (await screen.findByText("Windows servers")).closest("tr");
    expect(within(row).getByText("Patch Tuesday + 2 days, 22:00 America/Chicago")).toBeInTheDocument();
    expect(within(row).getByText("Pilot → Everyone else")).toBeInTheDocument();
    expect(within(row).getByText("Halted at Pilot")).toBeInTheDocument();
    expect(within(row).getByText(/deadline 7 d/)).toBeInTheDocument();
  });

  it("⭐ a halted run can be promoted, with a confirmation", async () => {
    const user = userEvent.setup();
    const posts = mount();
    await user.click(await screen.findByText("Halted at Pilot"));
    const runs = await screen.findByRole("dialog");
    expect(await within(runs).findByText(/only 50% checked healthy/)).toBeInTheDocument();
    await user.click(within(runs).getByRole("button", { name: "Promote anyway" }));
    const confirm = (await screen.findAllByRole("dialog")).at(-1);
    await user.click(within(confirm).getByRole("button", { name: "Promote anyway" }));
    await waitFor(() => expect(posts.promote).toEqual([9]));
  });

  it("creates a policy from the editor", async () => {
    const user = userEvent.setup();
    const posts = mount();
    await user.click(await screen.findByRole("button", { name: "New policy" }));
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText("Name"), "Workstations");
    // El piloto necesita grupo: sin él, lo dice.
    await user.click(within(dialog).getByRole("button", { name: "Create policy" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(/Ring 1 needs a group/);
    await user.click(within(dialog).getAllByLabelText("Devices")[0]);
    await user.click(await screen.findByRole("option", { name: "Pilot servers" }));
    await user.click(within(dialog).getByRole("button", { name: "Create policy" }));
    await waitFor(() => expect(posts.create).toHaveLength(1));
    expect(posts.create[0]).toMatchObject({ name: "Workstations", severities: ["critical", "important"], rings: [{ name: "Pilot", assetGroupId: 11, soakHours: 24 }, { name: "Everyone else", assetGroupId: null, soakHours: 0 }] });
  });

  it("read-only without patch_management", async () => {
    mount({ canManage: false });
    await screen.findByText("Windows servers");
    expect(screen.queryByRole("button", { name: "New policy" })).toBeNull();
    expect(screen.queryByRole("button", { name: /Run Windows servers now/ })).toBeNull();
  });
});
