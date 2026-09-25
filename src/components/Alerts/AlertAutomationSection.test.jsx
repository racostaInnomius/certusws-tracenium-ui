// src/components/Alerts/AlertAutomationSection.test.jsx
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";

vi.mock("../../api/playbooks", () => ({ listPlaybookRunsForAlert: vi.fn() }));
import { listPlaybookRunsForAlert } from "../../api/playbooks";
import AlertAutomationSection from "./AlertAutomationSection";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("AlertAutomationSection", () => {
  it("⭐ dice que un playbook ya atendió esta alerta, y qué hizo", async () => {
    listPlaybookRunsForAlert.mockResolvedValue({
      ok: true,
      runs: [{ playbookId: "p1", name: "Fix the check that just failed", mode: "armed", decision: "executed", skipReason: null, actions: [{ kind: "remediate", status: "done", detail: "apply win.edge.smartscreen" }], createdAt: new Date().toISOString() }],
    });
    render(<AlertAutomationSection sourceEventId="compliance:pc-1:win.edge" />);
    const box = await screen.findByTestId("alert-automation");
    expect(box).toHaveTextContent("Fix the check that just failed");
    expect(box).toHaveTextContent("Acted");
    expect(box).toHaveTextContent("Remediate the check: done — apply win.edge.smartscreen");
  });

  it("⚠️ sin corridas (o sin permiso, o sin desplegar) no ocupa sitio", async () => {
    listPlaybookRunsForAlert.mockResolvedValue({ ok: true, runs: [] });
    const { container } = render(<AlertAutomationSection sourceEventId="x" />);
    await waitFor(() => expect(listPlaybookRunsForAlert).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
    cleanup();
    listPlaybookRunsForAlert.mockRejectedValue({ status: 403 });
    const second = render(<AlertAutomationSection sourceEventId="x" />);
    await waitFor(() => expect(listPlaybookRunsForAlert).toHaveBeenCalledTimes(2));
    expect(second.container).toBeEmptyDOMElement();
  });
});
