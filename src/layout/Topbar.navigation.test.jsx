// src/layout/Topbar.navigation.test.jsx
//
// La campana abre Alerts sin arrastrar los filtros de la página en la que se
// estaba (mismo defecto que el menú; ver AppShell.navigation.test.jsx).

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

vi.mock("../api/alerts", () => ({
  ALERTS_SEEN_EVENT: "alerts:seen",
  getAlertsUnreadCount: vi.fn(async () => ({ count: 0 })),
}));
vi.mock("../auth/logout", () => ({ performLogout: vi.fn() }));
vi.mock("../msp/MspContext", () => ({
  useMsp: () => ({ hasPortfolio: false, activeTenant: null, loading: false }),
}));

import Topbar from "./Topbar";

afterEach(() => {
  cleanup();
  window.history.replaceState({}, "", "/");
});

describe("Topbar — campana", () => {
  it("⭐ abre Alerts con URL limpia (sin el status de Jobs)", () => {
    window.history.replaceState({}, "", "/?page=jobs&status=failed&since=7d&alertsAutoRefresh=300");
    render(<Topbar onMenuClick={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Alerts" }));

    const params = new URLSearchParams(window.location.search);
    expect(params.get("page")).toBe("alerts");
    expect(params.has("status")).toBe(false);
    expect(params.has("since")).toBe(false);
    expect(params.get("alertsAutoRefresh")).toBe("300");
  });
});
