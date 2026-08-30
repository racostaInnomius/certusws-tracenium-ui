// src/components/software-delivery/CatalogTab.consolidation.test.jsx
//
// One door into the catalog, and it is the analysed one.
//
// The catalog used to offer two equal ways in. "New package" took a URL and a
// hash the operator typed and checked the SHAPE of those fields — nothing
// verified the file was signed, that the hash matched what the URL serves, or
// that the install arguments worked. The intake tab meanwhile ran the whole
// analysis pipeline over an uploaded binary and derived the install config from
// it. Two doors, wildly different guarantees, indistinguishable results.
//
// These tests pin the three things that make that true and would silently rot:
// which dialog the primary button opens, that the URL path still EXISTS (it is
// needed — the upload has a size ceiling), and that a package which came in
// that way says so in the grid.

import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import CatalogTab from "./CatalogTab";
import * as sdpApi from "../../api/softwareDelivery";

vi.mock("../../api/softwareDelivery");

const VERIFIED = {
  id: 1,
  name: "WinZip",
  version: "27.0",
  platform: "windows",
  arch: "x64",
  format: "exe",
  downloadPath: "blob:intake/111/4800de/winzip.exe",
  sha256: "a".repeat(64),
  isActive: true,
};

const TYPED_IN = {
  id: 2,
  name: "7-Zip",
  version: "23.01",
  platform: "windows",
  arch: "x64",
  format: "msi",
  downloadPath: "https://vendor.example/7z.msi",
  sha256: "b".repeat(64),
  isActive: true,
};

function setup({ packages = [VERIFIED, TYPED_IN], intakes = [] } = {}) {
  sdpApi.listPackages.mockResolvedValue({ items: packages });
  sdpApi.listIntakes.mockResolvedValue({ items: intakes });
  return render(
    <CatalogTab canManage notify={vi.fn()} onDeployFire={vi.fn()} onNavigateTab={vi.fn()} />
  );
}

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe("CatalogTab — the primary way in is the analysed one", () => {
  // ⚠️ ASSERTS THE DIALOG THAT *IS* OPEN, NOT ONE THAT ISN'T.
  //
  // The first version of this test only checked that the URL form's field was
  // absent — which passes just as happily when NO dialog opens at all. Pointing
  // the button back at the typed-in form did not fail it. Naming the dialog we
  // expect is what makes the assertion mean something.
  it("opens the upload dialog, not the typed-in form", async () => {
    setup();
    await screen.findByText("WinZip");

    await userEvent.click(screen.getByRole("button", { name: /add package/i }));

    expect(await screen.findByText(/upload installer/i)).toBeTruthy();
    expect(screen.queryByText("Add Software Package")).toBeNull();
  });

  // ⚠️ The URL path must not disappear. The upload has a 200 MiB ceiling and a
  // vendor artifact may already sit on a trusted host — removing it would be
  // over-correcting a real problem into a different one.
  it("keeps the URL path available, behind the secondary menu", async () => {
    setup();
    await screen.findByText("WinZip");

    expect(screen.queryByText(/add from url/i)).toBeNull();

    await userEvent.click(
      screen.getByRole("button", { name: /more ways to add a package/i })
    );
    expect(await screen.findByText(/add from url/i)).toBeTruthy();
  });

  it("says what the URL path costs, right where it is chosen", async () => {
    setup();
    await screen.findByText("WinZip");
    await userEvent.click(
      screen.getByRole("button", { name: /more ways to add a package/i })
    );
    expect(await screen.findByText(/no analysis/i)).toBeTruthy();
  });

  it("offers neither door to a read-only operator", async () => {
    sdpApi.listPackages.mockResolvedValue({ items: [VERIFIED] });
    sdpApi.listIntakes.mockResolvedValue({ items: [] });
    render(<CatalogTab canManage={false} notify={vi.fn()} />);
    await screen.findByText("WinZip");

    expect(screen.queryByRole("button", { name: /add package/i })).toBeNull();
    expect(
      screen.queryByRole("button", { name: /more ways to add a package/i })
    ).toBeNull();
  });
});

describe("CatalogTab — provenance is visible in the row", () => {
  it("marks the package that was typed in, not the one that was analysed", async () => {
    setup();
    await screen.findByText("7-Zip");

    const badges = screen.getAllByText("Unverified");
    expect(badges).toHaveLength(1);
    // And nothing shouts on the analysed one: a badge on every row is wallpaper.
    expect(screen.queryByText("Analyzed")).toBeNull();
  });

  it("marks nothing when every package came through analysis", async () => {
    setup({ packages: [VERIFIED] });
    await screen.findByText("WinZip");
    expect(screen.queryByText("Unverified")).toBeNull();
  });
});

describe("CatalogTab — the empty state points at a control that exists", () => {
  // ⚠️ FOUND BY LOOKING AT IT, NOT BY A TEST.
  //
  // Renaming the button left this text saying "Click 'New package'" — a button
  // that no longer existed anywhere on screen. Every test above passed: they
  // asserted on the button, and nothing read the sentence beside it. An empty
  // catalog is exactly the moment an operator has nothing else to go on.
  //
  // So this reads the name off the RENDERED button rather than repeating a
  // string, which is what makes it survive the next rename.
  it("names the primary button as it is actually labelled", async () => {
    setup({ packages: [] });
    const button = await screen.findByRole("button", { name: /add package/i });

    const empty = screen.getByText(/no packages in the catalog yet/i);
    expect(empty.textContent).toContain(button.textContent.trim());
  });

  it("does not tell a read-only operator to press anything", async () => {
    sdpApi.listPackages.mockResolvedValue({ items: [] });
    sdpApi.listIntakes.mockResolvedValue({ items: [] });
    render(<CatalogTab canManage={false} notify={vi.fn()} />);

    const empty = await screen.findByText(/no packages in the catalog yet/i);
    expect(empty.textContent).not.toMatch(/add package|click/i);
  });
});

describe("CatalogTab — the review queue surfaces where the packages are going", () => {
  it("announces uploads waiting for review", async () => {
    setup({
      intakes: [
        { id: 1, status: "pending_review" },
        { id: 2, status: "pending_review" },
        { id: 3, status: "approved" },
      ],
    });
    expect(await screen.findByText(/2 uploaded packages are analyzed/i)).toBeTruthy();
  });

  it("counts only what is actually waiting", async () => {
    setup({ intakes: [{ id: 1, status: "approved" }, { id: 2, status: "rejected" }] });
    await screen.findByText("WinZip");
    expect(screen.queryByText(/waiting for review/i)).toBeNull();
  });

  it("gets the grammar right for one", async () => {
    setup({ intakes: [{ id: 1, status: "pending_review" }] });
    expect(await screen.findByText(/1 uploaded package is analyzed/i)).toBeTruthy();
  });

  // The count is a nicety; the catalog is the job. A failing intake call must
  // not take the table with it.
  it("still renders the catalog when the queue cannot be counted", async () => {
    sdpApi.listPackages.mockResolvedValue({ items: [VERIFIED] });
    sdpApi.listIntakes.mockRejectedValue(new Error("intake down"));
    render(<CatalogTab canManage notify={vi.fn()} />);

    expect(await screen.findByText("WinZip")).toBeTruthy();
    expect(screen.queryByText(/waiting for review/i)).toBeNull();
  });
});
