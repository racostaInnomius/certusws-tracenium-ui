// src/components/patch-management/RollbackPointsPanel.test.jsx

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const api = vi.hoisted(() => ({
  listRollbackPoints: vi.fn(),
  releaseRollbackPoint: vi.fn(),
  extendRollbackPoint: vi.fn(),
  revertSnapshot: vi.fn(),
}));
vi.mock("../../api/patchManagement", () => api);

import RollbackPointsPanel from "./RollbackPointsPanel";

const H = 3_600_000;
const iso = (h) => new Date(Date.now() + h * H).toISOString();
const point = (over = {}) => ({
  id: 12, deviceId: "883e3a8b", hostname: "MSIG-QBOOKS", purpose: "patch", deploymentId: null,
  takenAt: iso(-50), deadline: iso(-26), maxUntil: iso(22), maxHoldHours: 72,
  state: "needs_decision", keepReason: "patch_failed", patchOutcome: "failed",
  releasedAt: null, extendedAt: null, ...over,
});

beforeEach(() => {
  Object.values(api).forEach((f) => f.mockReset());
});
afterEach(cleanup);

describe("RollbackPointsPanel", () => {
  it("sin puntos vivos no pinta nada", async () => {
    api.listRollbackPoints.mockResolvedValue({ points: [] });
    const { container } = render(<RollbackPointsPanel canManage />);
    await waitFor(() => expect(api.listRollbackPoints).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it("⭐ el snapshot de un parche fallido se VE, con lo que falta decidir", async () => {
    api.listRollbackPoints.mockResolvedValue({ points: [point()] });
    render(<RollbackPointsPanel canManage />);
    expect(await screen.findByText("MSIG-QBOOKS")).toBeInTheDocument();
    expect(screen.getByText("Needs your decision")).toBeInTheDocument();
    expect(screen.getByText("1 waiting for a decision")).toBeInTheDocument();
    expect(screen.getByText(/Kept 1 h past its date|Kept \d+ h past its date/)).toBeInTheDocument();
  });

  it("⭐ liberar pide el porqué y lo manda con la nota", async () => {
    const user = userEvent.setup({ delay: null });
    const notify = vi.fn();
    api.listRollbackPoints.mockResolvedValue({ points: [point()] });
    api.releaseRollbackPoint.mockResolvedValue({ released: true });
    render(<RollbackPointsPanel canManage notify={notify} />);
    await user.click(await screen.findByRole("button", { name: "Release" }));
    // Un parche fallido abre con «Failure accepted» ya elegido, no «Validated».
    expect(screen.getByRole("radio", { name: /Failure accepted/ })).toBeChecked();
    await user.type(screen.getByLabelText(/Note/), "Reinstalado a mano");
    await user.click(screen.getByRole("button", { name: "Release snapshot" }));
    await waitFor(() =>
      expect(api.releaseRollbackPoint).toHaveBeenCalledWith(12, { reason: "accepted_failure", note: "Reinstalado a mano" })
    );
    expect(notify).toHaveBeenCalledWith("success", expect.stringMatching(/Released the rollback point for MSIG-QBOOKS/));
  });

  it("⭐ un «no» del backend se enseña DENTRO del diálogo, que sigue abierto", async () => {
    const user = userEvent.setup({ delay: null });
    api.listRollbackPoints.mockResolvedValue({ points: [point({ state: "auto_release", keepReason: "not_due", deadline: iso(10) })] });
    api.releaseRollbackPoint.mockRejectedValue({ body: { message: "The patch this snapshot protects is still running." } });
    render(<RollbackPointsPanel canManage notify={vi.fn()} />);
    await user.click(await screen.findByRole("button", { name: "Release" }));
    await user.click(screen.getByRole("button", { name: "Release snapshot" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/still running/);
    expect(screen.getByRole("button", { name: "Release snapshot" })).toBeInTheDocument();
  });

  it("⭐ ampliar ofrece sólo lo que cabe en el tope y manda un instante con zona", async () => {
    const user = userEvent.setup({ delay: null });
    api.listRollbackPoints.mockResolvedValue({ points: [point({ state: "auto_release", keepReason: "not_due", deadline: iso(10) })] });
    api.extendRollbackPoint.mockResolvedValue({ until: iso(22), capped: false });
    render(<RollbackPointsPanel canManage notify={vi.fn()} />);
    await user.click(await screen.findByRole("button", { name: "Extend" }));
    const dialog = screen.getByRole("dialog");
    // Tope a 22 h: +24 y +48 se recortan al tope y quedan en UNA opción.
    expect(within(dialog).getAllByRole("radio")).toHaveLength(1);
    await user.click(within(dialog).getByRole("button", { name: "Keep it longer" }));
    await waitFor(() => expect(api.extendRollbackPoint).toHaveBeenCalled());
    const [, untilIso] = api.extendRollbackPoint.mock.calls[0];
    expect(untilIso).toMatch(/Z$/);
  });

  it("revertir avisa de cuánto trabajo se pierde", async () => {
    const user = userEvent.setup({ delay: null });
    api.listRollbackPoints.mockResolvedValue({ points: [point()] });
    render(<RollbackPointsPanel canManage />);
    await user.click(await screen.findByRole("button", { name: "Revert" }));
    expect(screen.getByText(/discards everything written to this server in the last 2 days/)).toBeInTheDocument();
  });

  it("sin permiso de gestión, se ve pero no se actúa", async () => {
    api.listRollbackPoints.mockResolvedValue({ points: [point()] });
    render(<RollbackPointsPanel canManage={false} />);
    expect(await screen.findByText("MSIG-QBOOKS")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Release" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Revert" })).toBeNull();
  });
});
