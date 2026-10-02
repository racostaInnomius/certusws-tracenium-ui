// src/components/patch-management/PatchCatalogPanel.test.jsx
//
// ADR-0038 F3 (D7) — the fleet patch catalog.

import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { server, http, HttpResponse } from "../../test/msw/server";
import { clearApiCache } from "../../api/http";
import PatchCatalogPanel from "./PatchCatalogPanel";

afterEach(() => {
  cleanup();
  server.resetHandlers();
  clearApiCache();
});

const ITEM = {
  patchId: "KB5122882", title: "2026-09 Cumulative Update for Microsoft server operating system", platform: "windows", severity: "critical",
  outOfBand: false, devicesPending: 2, oldestPendingSince: "2026-09-29T10:00:00Z", oldestPendingBackfilled: true,
  sla: { breached: 2, at_risk: 0, on_time: 0, no_target: 0, excluded: 0 },
  approval: null, approvalReason: null, deferredUntil: null, knownIssue: null, supersededBy: null,
  traceniumKnownIssue: { summary: "Remote Desktop Services might stop responding.", fixedBy: "KB5129237", impact: "critical" },
  confidence: { score: 0.81, devices: 12, attempts: 14, failedAttempts: 2, uninstalls: 0, evidence: "moderate" },
};
const LIST = { ok: true, targets: { critical: 7, high: 30, medium: null, low: null }, totals: { breached: 2, at_risk: 0, on_time: 0, no_target: 0, excluded: 0 }, pctWithinTarget: 0, items: [ITEM] };

function mount({ canManage = true } = {}) {
  const patches = [];
  server.use(
    http.get(/.*\/patch-management\/catalog\/KB5122882$/, () =>
      HttpResponse.json({ ok: true, patchId: "KB5122882", devices: [{ deviceId: "d2", hostname: "MSI-ERP", firstSeenAt: "2026-09-29T10:00:00Z", firstSeenBackfilled: true, sla: { status: "breached", targetDays: 7 } }] })
    ),
    http.get(/.*\/patch-management\/catalog(\?.*)?$/, () => HttpResponse.json(LIST)),
    http.patch(/.*\/patch-management\/catalog\/KB5122882$/, async ({ request }) => {
      patches.push(await request.json());
      return HttpResponse.json({ ok: true });
    })
  );
  render(<PatchCatalogPanel canManage={canManage} notify={() => {}} />);
  return patches;
}

describe("PatchCatalogPanel", () => {
  it("⭐ shows how long it has been missing, the known issue and what fixes it", async () => {
    mount();
    const row = (await screen.findByText("KB5122882")).closest("tr");
    expect(within(row).getByText("Known issue · fixed by KB5129237")).toBeInTheDocument();
    expect(within(row).getByText("Overdue · 2")).toBeInTheDocument();
    expect(within(row).getByText(/^≥ \d+ days$/)).toBeInTheDocument();
    expect(within(row).getByText("81%")).toBeInTheDocument();
    expect(screen.getByText(/Critical 7 d · Important 30 d/)).toBeInTheDocument();
  });

  it("lists the devices missing it, with the date as a floor", async () => {
    const user = userEvent.setup();
    mount();
    await user.click(await screen.findByRole("button", { name: "2 devices" }));
    const dialog = await screen.findByRole("dialog");
    expect(await within(dialog).findByText("MSI-ERP")).toBeInTheDocument();
    expect(within(dialog).getByText(/at least since/)).toBeInTheDocument();
  });

  it("⭐ blocking asks why, then sends the decision", async () => {
    const user = userEvent.setup();
    const patches = mount();
    await user.click(await screen.findByRole("button", { name: "Decide on KB5122882" }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("radio", { name: /Blocked/ }));
    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(/Say why/);
    await user.type(within(dialog).getByLabelText("Why (required)"), "RDS hang on the TS");
    await user.type(within(dialog).getByLabelText("Superseded by"), "KB5129237");
    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(patches).toHaveLength(1));
    expect(patches[0]).toEqual({ approval: "blocked", reason: "RDS hang on the TS", knownIssue: null, supersededBy: "KB5129237" });
  });

  it("without patch_management: no Decide", async () => {
    mount({ canManage: false });
    await screen.findByText("KB5122882");
    expect(screen.queryByRole("button", { name: /Decide on/ })).toBeNull();
  });
});
