// src/components/patch-management/FindingsPanel.profile.test.jsx
//
// macOS, sólo lo impone un perfil (1-oct): la columna Auto-fix lo llamaba
// «manual» («No auto-fix handler yet»), cuando va a la política macOS y los
// Macs del MDM de Tracenium lo reciben solos.

import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

const getFindings = vi.fn();
vi.mock("../../api/patchManagement", () => ({ getFindings: (...a) => getFindings(...a) }));
vi.mock("./FindingDetailDrawer", () => ({ default: () => null }));

import FindingsPanel from "./FindingsPanel";

const TOTALS = { totalFindings: 2, distinctChecks: 2, devicesAffected: 1, bySeverity: { medium: 2 }, agentRemediable: 0 };

afterEach(() => {
  cleanup();
  getFindings.mockReset();
});

describe("FindingsPanel — Auto-fix de lo que sólo arregla un perfil", () => {
  it("⭐ «profile», no «manual»; lo de verdad manual sigue «manual»", async () => {
    getFindings.mockResolvedValue({
      ok: true,
      truncated: false,
      totals: TOTALS,
      items: [
        { checkId: "macos.pref.ads", title: "Limit Ad Tracking", severity: "medium", devicesAffected: 1, agentRemediable: false, profileIntents: [{ key: "macos.privacy.allowPersonalizedAds", value: false }] },
        { checkId: "macos.mac.home_folders", title: "Home folders", severity: "medium", devicesAffected: 1, agentRemediable: false, profileIntents: null },
      ],
    });
    render(<FindingsPanel categoriesNotIn="patching" />);
    expect(await screen.findByText("Limit Ad Tracking")).toBeInTheDocument();
    expect(screen.getAllByText("profile")).toHaveLength(1);
    expect(screen.getAllByText("manual")).toHaveLength(1);
  });
});
