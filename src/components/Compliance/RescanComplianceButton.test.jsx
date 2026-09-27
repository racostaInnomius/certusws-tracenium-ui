// src/components/Compliance/RescanComplianceButton.test.jsx
//
// «Rescan now» (27-sep): ver el efecto de un fix o un revert YA, sin esperar
// al escaneo programado — y nunca dos escaneos a la vez para el mismo equipo.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";

vi.mock("../../api/jobs", () => ({ createDeviceJob: vi.fn(), listDeviceJobs: vi.fn() }));
import { createDeviceJob, listDeviceJobs } from "../../api/jobs";
import RescanComplianceButton, { pendingComplianceScan } from "./RescanComplianceButton";

const job = (over = {}) => ({ job_id: "j1", job_type: "facts_snapshot", status: "pending", payload_json: { factType: "compliance" }, ...over });

beforeEach(() => {
  vi.clearAllMocks();
  listDeviceJobs.mockResolvedValue({ ok: true, jobs: [] });
  createDeviceJob.mockResolvedValue({ ok: true, jobId: "j9", status: "pending" });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("RescanComplianceButton", () => {
  it("⭐ lanza el facts_snapshot de compliance para ESE equipo", async () => {
    const onToast = vi.fn();
    render(<RescanComplianceButton agentId="d1" onToast={onToast} />);
    await waitFor(() => expect(listDeviceJobs).toHaveBeenCalled());
    fireEvent.click(screen.getByRole("button", { name: /Rescan now/ }));
    await waitFor(() => expect(createDeviceJob).toHaveBeenCalledWith("d1", { jobType: "facts_snapshot", payload: { factType: "compliance" } }));
    expect(await screen.findByRole("button", { name: /Scanning…/ })).toBeDisabled();
    expect(onToast).toHaveBeenCalledWith(expect.objectContaining({ severity: "info" }));
  });

  it("⭐ si ya hay una recolección de compliance pendiente, no deja lanzar otra", async () => {
    listDeviceJobs.mockResolvedValue({ ok: true, jobs: [job({ status: "sent" })] });
    render(<RescanComplianceButton agentId="d1" />);
    expect(await screen.findByRole("button", { name: /Scanning…/ })).toBeDisabled();
    expect(createDeviceJob).not.toHaveBeenCalled();
  });

  it("cuando la que lanzó termina, avisa y recarga (onFinished)", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const onFinished = vi.fn();
    const onToast = vi.fn();
    render(<RescanComplianceButton agentId="d1" onFinished={onFinished} onToast={onToast} />);
    await waitFor(() => expect(listDeviceJobs).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole("button", { name: /Rescan now/ }));
    await screen.findByRole("button", { name: /Scanning…/ });
    listDeviceJobs.mockResolvedValue({ ok: true, jobs: [job({ job_id: "j9", status: "completed" })] });
    await vi.advanceTimersByTimeAsync(5100);
    await waitFor(() => expect(onFinished).toHaveBeenCalledWith(true));
    expect(onToast).toHaveBeenLastCalledWith(expect.objectContaining({ severity: "success" }));
    expect(await screen.findByRole("button", { name: /Rescan now/ })).toBeEnabled();
  });

  it("si la lista aún no trae el job recién lanzado, sigue esperando (no lo da por fallido)", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const onFinished = vi.fn();
    render(<RescanComplianceButton agentId="d1" onFinished={onFinished} />);
    await waitFor(() => expect(listDeviceJobs).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole("button", { name: /Rescan now/ }));
    await screen.findByRole("button", { name: /Scanning…/ });
    await vi.advanceTimersByTimeAsync(5100); // la lista sigue vacía
    expect(onFinished).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /Scanning…/ })).toBeDisabled();
  });

  it("pendingComplianceScan: sólo compliance/all y sin terminar", () => {
    expect(pendingComplianceScan([job()])).toBeTruthy();
    expect(pendingComplianceScan([job({ payload_json: JSON.stringify({ factType: "all" }) })])).toBeTruthy();
    expect(pendingComplianceScan([job({ payload_json: { factType: "inventory" } })])).toBeNull();
    expect(pendingComplianceScan([job({ status: "completed" })])).toBeNull();
    expect(pendingComplianceScan([job({ job_type: "patch_scan" })])).toBeNull();
  });
});
