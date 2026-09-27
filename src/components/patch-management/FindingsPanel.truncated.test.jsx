// src/components/patch-management/FindingsPanel.truncated.test.jsx
//
// 🔴 T1, 25-sep: Security configuration decía «Distinct checks: 1016» y la tabla
// enseñaba 200, sin una palabra. El backend sigue teniendo un tope; cuando
// corta, la tabla tiene que decirlo.

import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

const getFindings = vi.fn();
vi.mock("../../api/patchManagement", () => ({ getFindings: (...a) => getFindings(...a) }));
vi.mock("./FindingDetailDrawer", () => ({ default: () => null }));

import FindingsPanel from "./FindingsPanel";

const TOTALS = {
  totalFindings: 4520,
  distinctChecks: 1016,
  devicesAffected: 16,
  bySeverity: { critical: 0, high: 84, medium: 4520, low: 0, info: 0 },
  agentRemediable: 152,
};
const item = (i) => ({ checkId: `c.${i}`, title: `Check ${i}`, severity: "medium", devicesAffected: 1 });

afterEach(() => {
  cleanup();
  getFindings.mockReset();
});

describe("FindingsPanel — cuando el backend recorta", () => {
  it("🔴 dice cuántos enseña de cuántos", async () => {
    getFindings.mockResolvedValue({ ok: true, items: [item(1), item(2)], truncated: true, totals: TOTALS });
    render(<FindingsPanel categoriesNotIn="patching" />);
    expect(await screen.findByText(/Showing the 2 most severe of 1016 checks/)).toBeInTheDocument();
  });

  it("sin recorte no dice nada", async () => {
    getFindings.mockResolvedValue({ ok: true, items: [item(1)], truncated: false, totals: { ...TOTALS, distinctChecks: 1 } });
    render(<FindingsPanel categoriesNotIn="patching" />);
    expect(await screen.findByText("Check 1")).toBeInTheDocument();
    expect(screen.queryByText(/most severe of/)).toBeNull();
  });
});
