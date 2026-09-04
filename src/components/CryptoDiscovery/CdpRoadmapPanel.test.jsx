// src/components/CryptoDiscovery/CdpRoadmapPanel.test.jsx
//
// Fase 3: la hoja de ruta se puede LEER y DISCUTIR.
//
// Tres propiedades: la ola sugerida y la asignada se distinguen a la
// vista (sugerir no es decidir); excluir exige motivo (nada desaparece
// sin explicación); y un solo snapshot no se pinta como tendencia.

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react";

const getCdpRoadmap = vi.fn();
const getCdpReadinessHistory = vi.fn();
const putCdpRoadmapPlan = vi.fn();
vi.mock("../../api/cdp", () => ({
  getCdpRoadmap: (...a) => getCdpRoadmap(...a),
  getCdpRoadmapSystem: vi.fn(async () => ({ ok: true, members: [] })),
  putCdpRoadmapPlan: (...a) => putCdpRoadmapPlan(...a),
  getCdpReadinessHistory: (...a) => getCdpReadinessHistory(...a),
  postCdpReadinessSnapshot: vi.fn(async () => ({ ok: true })),
  getCdpPqcReadiness: vi.fn(async () => ({ ok: true, pqc: null }))
}));

import CdpRoadmapPanel, { WaveChip, PlanDialog, ReadinessTrend } from "./CdpRoadmapPanel";

const WAVES = [
  { wave: 0, label: "Key exchange exposed today", why: "w0" },
  { wave: 1, label: "Broken today", why: "w1" },
  { wave: 2, label: "Outlives 2035", why: "w2" },
  { wave: 3, label: "Outlives 2030", why: "w3" },
  { wave: 4, label: "Renews on its own cycle", why: "w4" }
];
const SYSTEM = {
  key: "process:svchost.exe",
  kind: "process",
  name: "Served by svchost.exe",
  sampleSubject: "SRV.corp",
  sampleIssuer: "SRV.corp",
  factors: { certs: 40, uniqueCerts: 40, devices: 40, withPrivateKey: 40, isCa: 0, serverAuth: 40, listeners: 40, kemClassical: 40, kemHybrid: 0, kemUnknown: 0, brokenToday: 0, beyondDeprecation: 40, beyondDisallowed: 40, agilityBlockedDevices: 0, minNotAfter: null, maxNotAfter: null },
  score: 80,
  scoreBreakdown: { kemClassical: 30, beyondDisallowed: 25, serverAuth: 5, blastRadius: 20 },
  suggestedWave: 0,
  plan: null,
  recommendations: [{ kind: "platform", text: "Self-signed per host…", source: "Microsoft Learn" }]
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("WaveChip", () => {
  it("⭐ sugerida y asignada se distinguen", () => {
    const { rerender } = render(<WaveChip wave={0} suggested waves={WAVES} />);
    expect(screen.getByText("suggested wave 0")).toBeInTheDocument();
    rerender(<WaveChip wave={0} waves={WAVES} />);
    expect(screen.getByText("wave 0")).toBeInTheDocument();
    rerender(<WaveChip wave={null} waves={WAVES} />);
    expect(screen.getByText("unassigned")).toBeInTheDocument();
  });
});

describe("PlanDialog", () => {
  it("⭐ excluir exige motivo: el botón no se habilita sin él", async () => {
    render(<PlanDialog system={SYSTEM} waves={WAVES} open onClose={() => {}} onSaved={() => {}} />);
    const save = screen.getByRole("button", { name: /Save plan/i });
    expect(save).toBeEnabled();
    fireEvent.click(screen.getByLabelText(/Exclude from the roadmap/i));
    expect(screen.getByRole("button", { name: /Save plan/i })).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/Why \(required\)/i), { target: { value: "rotated by AWS" } });
    expect(screen.getByRole("button", { name: /Save plan/i })).toBeEnabled();
  });

  it("guarda la ola como número y la ausencia como null", async () => {
    putCdpRoadmapPlan.mockResolvedValue({ ok: true });
    const onSaved = vi.fn();
    render(<PlanDialog system={SYSTEM} waves={WAVES} open onClose={() => {}} onSaved={onSaved} />);
    fireEvent.click(screen.getByRole("button", { name: /Save plan/i }));
    await waitFor(() => expect(putCdpRoadmapPlan).toHaveBeenCalledWith("process:svchost.exe", expect.objectContaining({ wave: null, excluded: false })));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
  });
});

describe("ReadinessTrend", () => {
  it("⭐ un solo snapshot no es una tendencia, y se dice", () => {
    render(<ReadinessTrend snapshots={[{ date: "2026-09-04", ownBeyondDisallowed: 58 }]} onSnapshot={() => {}} />);
    expect(screen.getByText(/a trend needs at least two/i)).toBeInTheDocument();
  });

  it("sin snapshots explica cuándo llega el primero", () => {
    render(<ReadinessTrend snapshots={[]} onSnapshot={() => {}} />);
    expect(screen.getByText(/recorded tonight/i)).toBeInTheDocument();
  });
});

describe("CdpRoadmapPanel", () => {
  it("lista los sistemas por prioridad con su ola sugerida y abre el detalle con el desglose", async () => {
    getCdpRoadmap.mockResolvedValue({ ok: true, systems: [SYSTEM], waves: WAVES, weights: { kemClassical: 30, brokenToday: 20, beyondDisallowed: 25, beyondDeprecation: 15, isCa: 15, agilityBlocked: 10, serverAuth: 5, blastRadiusMax: 20 } });
    getCdpReadinessHistory.mockResolvedValue({ ok: true, snapshots: [] });
    render(<CdpRoadmapPanel refreshNonce={0} onDrillDown={() => {}} />);
    const row = await screen.findByRole("button", { name: /Open Served by svchost.exe/i });
    expect(screen.getByText("suggested wave 0")).toBeInTheDocument();
    fireEvent.click(row);
    expect(await screen.findByText(/Why this priority \(80\)/i)).toBeInTheDocument();
    expect(screen.getByText("Classical key exchange exposed")).toBeInTheDocument();
    expect(screen.getByText(/Source: Microsoft Learn/i)).toBeInTheDocument();
  });

  it("lo excluido no se lista por defecto, pero se puede ver", async () => {
    getCdpRoadmap.mockResolvedValue({
      ok: true,
      waves: WAVES,
      weights: {},
      systems: [{ ...SYSTEM, key: "issuer:aws", name: "Issued by AWS", plan: { excluded: true, excludeReason: "rotated by AWS", wave: null } }]
    });
    getCdpReadinessHistory.mockResolvedValue({ ok: true, snapshots: [] });
    render(<CdpRoadmapPanel refreshNonce={0} onDrillDown={() => {}} />);
    await screen.findByText(/Systems to migrate \(0\)/i);
    fireEvent.click(screen.getByLabelText(/Show excluded/i));
    expect(await screen.findByText("Issued by AWS")).toBeInTheDocument();
    expect(screen.getByText("excluded")).toBeInTheDocument();
  });
});
