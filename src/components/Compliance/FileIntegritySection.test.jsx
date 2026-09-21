// src/components/Compliance/FileIntegritySection.test.jsx
//
// ADR-0027 F4 — la integridad de ficheros en la ficha del equipo.

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

vi.mock("../../api/fileIntegrity", () => ({ getDeviceFileIntegrity: vi.fn() }));
import { getDeviceFileIntegrity } from "../../api/fileIntegrity";
import FileIntegritySection from "./FileIntegritySection";
import { fileIntegrityStatus } from "./fileIntegrityStatus";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const A = "a".repeat(64);
const B = "b".repeat(64);
const DATA = {
  ok: true,
  available: true,
  configured: true,
  windowDays: 30,
  scan: { scope: "collected", filesCount: 3, unreadable: 1, truncated: false, error: null, reportedAt: new Date().toISOString() },
  sets: [{ setId: "hosts", label: "Hosts file", purpose: "system", path: "C:\\etc", files: 3, unhashed: 1 }],
  recentChanges: [{ setId: "hosts", setLabel: "Hosts file", path: "C:\\Windows\\System32\\drivers\\etc\\hosts", change: "file_changed", previousSha256: A, sha256: B, occurredAt: "2026-09-20T10:00:00.000Z" }],
};

describe("fileIntegrityStatus", () => {
  it("⭐ las cuatro situaciones que una ficha pintaría igual como «0 cambios» se dicen distinto", () => {
    expect(fileIntegrityStatus({ available: false }).text).toMatch(/not enabled on this server/);
    expect(fileIntegrityStatus({ available: true, configured: false }).text).toMatch(/does not watch any files/);
    expect(fileIntegrityStatus({ available: true, configured: true, scan: null }).text).toMatch(/has not reported/);
    expect(fileIntegrityStatus({ available: true, configured: true, scan: { scope: "unavailable", error: "EIO" } }).text).toMatch(/could not be completed.*EIO/);
    expect(fileIntegrityStatus({ ...DATA, recentChanges: [] })).toMatchObject({ tone: "ok", text: "No changes in the last 30 days." });
    expect(fileIntegrityStatus(DATA)).toMatchObject({ tone: "attention", text: "1 change in the last 30 days." });
  });
});

describe("FileIntegritySection", () => {
  it("carga al desplegar, no antes, y enseña conjuntos, lo no verificado y el cambio con sus hashes", async () => {
    getDeviceFileIntegrity.mockResolvedValue(DATA);
    render(<FileIntegritySection agentId="agent-1" />);
    expect(getDeviceFileIntegrity).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Expand file integrity" }));
    expect(await screen.findByText("Hosts file")).toBeInTheDocument();
    expect(getDeviceFileIntegrity).toHaveBeenCalledWith("agent-1");
    expect(screen.getByText(/1 too large to hash/)).toBeInTheDocument();
    expect(screen.getByText(/1 could not be read/)).toBeInTheDocument();
    expect(screen.getByText("Changed")).toBeInTheDocument();
    expect(screen.getByText("C:\\Windows\\System32\\drivers\\etc\\hosts")).toBeInTheDocument();
    expect(screen.getByText(`${A.slice(0, 12)}… → ${B.slice(0, 12)}…`)).toBeInTheDocument();
  });

  it("sin conjuntos declarados lo dice y dice dónde se declaran", async () => {
    getDeviceFileIntegrity.mockResolvedValue({ ok: true, available: true, configured: false, scan: null, sets: [], recentChanges: [] });
    render(<FileIntegritySection agentId="agent-1" />);
    fireEvent.click(screen.getByRole("button", { name: "Expand file integrity" }));
    expect(await screen.findByText(/Declare them in Agent Settings → Security Compliance/)).toBeInTheDocument();
  });
});
