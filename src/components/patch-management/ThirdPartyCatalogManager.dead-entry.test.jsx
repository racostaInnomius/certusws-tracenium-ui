// src/components/patch-management/ThirdPartyCatalogManager.dead-entry.test.jsx
//
// 🔴 25-sep, T1: «winrar-x64-723es.exe» y «MicrosoftEdge» no casaban con ninguna
// app instalada, así que nunca daban un desactualizado — y en la lista se veían
// igual que las sanas.

import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

vi.mock("../../api/patchManagement", () => ({
  listThirdPartyCatalog: vi.fn(async () => ({
    ok: true,
    items: [
      { id: 9, title: "winrar-x64-723es.exe", platform: "windows", matchName: "winrar 723es exe", latestVersion: "7.2.3", packageId: 15, source: "sdp_intake", isActive: true, matchesInstalled: false },
      { id: 5, title: "Google Chrome", platform: "windows", matchName: "google chrome", latestVersion: "154.0", packageId: 13, source: "sdp_intake", isActive: true, matchesInstalled: true },
      { id: 7, title: "Legacy", platform: "windows", matchName: "legacy", latestVersion: "1", packageId: null, source: "manual", isActive: true },
    ],
  })),
  createThirdPartyCatalog: vi.fn(),
  updateThirdPartyCatalog: vi.fn(),
  deleteThirdPartyCatalog: vi.fn(),
}));

import ThirdPartyCatalogManager from "./ThirdPartyCatalogManager";

afterEach(cleanup);

describe("ThirdPartyCatalogManager — entradas muertas", () => {
  it("marca sólo la que no casa con nada; «no se sabe» (sin el campo) no se marca", async () => {
    render(<ThirdPartyCatalogManager canManage notify={vi.fn()} />);
    const dead = (await screen.findByText("winrar-x64-723es.exe")).closest("tr");
    expect(dead).toHaveTextContent("Matches no installed app");
    expect(screen.getByText("Google Chrome").closest("tr")).not.toHaveTextContent("Matches no installed app");
    expect(screen.getByText("Legacy").closest("tr")).not.toHaveTextContent("Matches no installed app");
  });
});
