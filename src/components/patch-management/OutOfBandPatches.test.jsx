// src/components/patch-management/OutOfBandPatches.test.jsx
//
// ADR-0038 F3 (D11) — out-of-band (.msu) patches in Patch Management.

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { server, http, HttpResponse } from "../../test/msw/server";
import { clearApiCache } from "../../api/http";
import OutOfBandPatches from "./OutOfBandPatches";
import { guessFromMsuName, registrationPayload } from "./patchCatalog";

afterEach(() => {
  cleanup();
  server.resetHandlers();
  clearApiCache();
});

const PKG = { patchId: "KB5129237", title: "OOB fix for RDS", severity: "critical", osBuild: "10.0.20348", arch: "x64", fixedRevision: 5655, fixes: "KB5122882" };

function mount({ uploads = [], installReply } = {}) {
  const posts = { register: [], install: [] };
  server.use(
    http.get(/.*\/patch-management\/out-of-band$/, () => HttpResponse.json({ ok: true, packages: [PKG], uploads })),
    http.post(/.*\/patch-management\/out-of-band$/, async ({ request }) => {
      posts.register.push(await request.json());
      return HttpResponse.json({ ok: true }, { status: 201 });
    }),
    http.post(/.*\/out-of-band\/KB5129237\/install$/, async ({ request }) => {
      posts.install.push(await request.json());
      return HttpResponse.json(installReply ?? { ok: true, jobs: [{ deviceId: "d1", jobId: "j1", status: "pending" }] }, { status: 202 });
    })
  );
  render(<OutOfBandPatches canManage notify={vi.fn()} catalogItems={[{ patchId: "KB5129237", devicesPending: 10 }]} />);
  return posts;
}

describe("out-of-band helpers", () => {
  it("guesses KB and arch from a Microsoft Update Catalog file name", () => {
    expect(guessFromMsuName("windows10.0-kb5129237-x64_3f1c.msu")).toEqual({ patchId: "KB5129237", arch: "x64" });
    expect(guessFromMsuName("update.msu")).toEqual({ patchId: "", arch: "x64" });
  });
  it("the revision is the part after the dot of “OS Build 20348.5655”", () => {
    const f = { intakeId: 3, patchId: "kb5129237", title: "x", severity: "critical", osBuild: "10.0.20348", arch: "x64", fixedRevision: "20348.5655", fixes: "" };
    expect(registrationPayload(f).error).toMatch(/revision/);
    expect(registrationPayload({ ...f, fixedRevision: "5655" }).body).toMatchObject({ patchId: "KB5129237", fixedRevision: 5655, fixes: null });
  });
});

describe("OutOfBandPatches", () => {
  it("⭐ lists what it applies to and installs on the devices missing it", async () => {
    const user = userEvent.setup();
    const posts = mount();
    const row = (await screen.findByText("KB5129237")).closest("tr");
    expect(within(row).getByText("10.0.20348 below .5655 · x64")).toBeInTheDocument();
    expect(within(row).getByText("10 devices")).toBeInTheDocument();
    await user.click(within(row).getByRole("button", { name: "Install KB5129237" }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByLabelText("Restart if the update asks for it"));
    await user.click(within(dialog).getByRole("button", { name: "Install" }));
    await waitFor(() => expect(posts.install).toEqual([{ rebootIfRequired: true }]));
  });

  it("names the devices not sent and why (old agent)", async () => {
    const user = userEvent.setup();
    mount({ installReply: { ok: true, jobs: [{ deviceId: "d1", jobId: "j1" }, { deviceId: "d2", jobId: null, status: "blocked", reason: "agent_too_old_for_out_of_band" }] } });
    await user.click(await screen.findByRole("button", { name: "Install KB5129237" }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Install" }));
    expect(await within(dialog).findByText(/d2: its agent is too old/)).toBeInTheDocument();
  });

  it("an upload waiting for registration opens the form, prefilled from the file name", async () => {
    const user = userEvent.setup();
    const posts = mount({ uploads: [{ intakeId: 9, filename: "windows10.0-kb5130000-x64.msu", uploadedAt: "2026-10-02T00:00:00Z" }] });
    await user.click(await screen.findByRole("button", { name: "Register" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByLabelText("KB")).toHaveValue("KB5130000");
    await user.type(within(dialog).getByLabelText("Title"), "OOB update");
    await user.type(within(dialog).getByLabelText("OS build"), "10.0.20348");
    await user.type(within(dialog).getByLabelText("Brings revision to"), "5700");
    await user.click(within(dialog).getByRole("button", { name: "Register patch" }));
    await waitFor(() => expect(posts.register).toHaveLength(1));
    expect(posts.register[0]).toMatchObject({ intakeId: 9, patchId: "KB5130000", osBuild: "10.0.20348", fixedRevision: 5700, arch: "x64", severity: "important" });
  });
});
