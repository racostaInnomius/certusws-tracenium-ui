// src/components/Compliance/AddToBaselineButton.test.jsx
//
// ADR-0037 — «Add to baseline» desde el Catálogo y el hallazgo.

import * as React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const api = vi.hoisted(() => ({ listBaselines: vi.fn(), addBaselineEntries: vi.fn() }));
vi.mock("../../api/compliance", () => api);

import AddToBaselineButton, { baselineAccepts, checkPlatformOf } from "./AddToBaselineButton";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const WIN = { id: "b1", name: "Windows workstations", scopeKind: "platform", platform: "windows" };
const MAC = { id: "b2", name: "Macs", scopeKind: "platform", platform: "macos" };
const PCI = { id: "b3", name: "PCI scope", scopeKind: "asset_group", assetGroupId: 4, assetGroupName: "PCI" };

describe("AddToBaselineButton", () => {
  it("⭐ lista los baselines; el de otra plataforma sale apagado; elegir uno lo añade como «manual» y lo dice", async () => {
    api.listBaselines.mockResolvedValue({ baselines: [WIN, MAC, PCI] });
    api.addBaselineEntries.mockResolvedValue({ added: ["windows.registry.x"], alreadyIn: [], unknown: [] });
    const onToast = vi.fn();
    render(<AddToBaselineButton checkId="windows.registry.x" onToast={onToast} />);
    fireEvent.click(screen.getByRole("button", { name: /Add to baseline/ }));
    expect(await screen.findByText("Windows workstations")).toBeInTheDocument();
    expect(screen.getByText("macOS only").closest("li")).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByText("Group: PCI")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Windows workstations"));
    await waitFor(() => expect(api.addBaselineEntries).toHaveBeenCalledWith("b1", ["windows.registry.x"], "manual"));
    expect(onToast).toHaveBeenCalledWith({ severity: "success", message: "Added to «Windows workstations»." });
  });

  it("si ya estaba, lo dice en vez de fingir que lo añadió", async () => {
    api.listBaselines.mockResolvedValue({ baselines: [WIN] });
    api.addBaselineEntries.mockResolvedValue({ added: [], alreadyIn: ["windows.registry.x"], unknown: [] });
    const onToast = vi.fn();
    render(<AddToBaselineButton checkId="windows.registry.x" onToast={onToast} />);
    fireEvent.click(screen.getByRole("button", { name: /Add to baseline/ }));
    fireEvent.click(await screen.findByText("Windows workstations"));
    await waitFor(() => expect(onToast).toHaveBeenCalledWith({ severity: "info", message: "Already in «Windows workstations»." }));
  });

  it("sin baselines, lo dice y dónde se crean", async () => {
    api.listBaselines.mockResolvedValue({ baselines: [] });
    render(<AddToBaselineButton checkId="windows.registry.x" />);
    fireEvent.click(screen.getByRole("button", { name: /Add to baseline/ }));
    expect(await screen.findByText(/No baselines yet/)).toBeInTheDocument();
  });

  it("la plataforma sale del prefijo del check; uno multiplataforma o desconocido vale para cualquiera", () => {
    expect(checkPlatformOf("macos.pref.airdrop")).toBe("macos");
    expect(checkPlatformOf("browser.chrome.autofill")).toBeNull();
    expect(checkPlatformOf("x", "Linux")).toBe("linux");
    expect(baselineAccepts(WIN, "macos")).toBe(false);
    expect(baselineAccepts(WIN, "cross")).toBe(true);
    expect(baselineAccepts(WIN, null)).toBe(true);
    expect(baselineAccepts(PCI, "macos")).toBe(true);
  });
});
