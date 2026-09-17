import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import FindingCard from "./FindingCard";

afterEach(cleanup);

const baseFinding = {
  id: "f-1",
  title: "SSH root login is permitted",
  severity: "high",
  status: "fail",
  remediationStatus: "open",
  description: "PermitRootLogin should be 'no'.",
  remediationSummary: "Set PermitRootLogin no in sshd_config.",
  evidence: "PermitRootLogin yes",
  checkId: "ssh-root-login",
  firstSeenAtUtc: "2026-05-01T00:00:00.000Z",
  acknowledgedAt: null,
  acknowledgedBy: null,
  acknowledgedUntil: null,
  acknowledgementExpired: false,
  frameworks: [
    { framework: "cis_v8", control_id: "5.2.4", control_level: "L1", control_title: "Ensure SSH root login is disabled" },
    { framework: "stig_w11", control_id: "V-253000", control_level: "CAT I" },
  ],
};

const noop = () => {};

function renderCard(overrides = {}) {
  return render(
    <FindingCard
      finding={{ ...baseFinding, ...overrides }}
      onRequestException={noop}
      onRevoke={noop}
      onChangeStatus={noop}
      onShowHistory={noop}
      pendingAction={null}
    />
  );
}

// `${ROLE.criticalSoft}88` daba "rgba(…)88": CSS inválido, y la tarjeta de un
// fail reconocido salía en blanco en vez de en rojo suave.
describe("FindingCard background", () => {
  const rgba = (el) => (getComputedStyle(el).backgroundColor.match(/[\d.]+/g) || []).map(Number);

  it("an acknowledged fail keeps a soft red tint, lighter than a new fail", () => {
    const { container: acked } = renderCard({ acknowledgedAt: "2026-09-01T00:00:00Z", acknowledgedBy: "ops" });
    const [r, g, b, a] = rgba(acked.querySelector(".MuiPaper-root"));
    expect([r, g, b]).toEqual([227, 125, 120]);
    cleanup();
    const { container: open } = renderCard();
    const [, , , aOpen] = rgba(open.querySelector(".MuiPaper-root"));
    expect(a).toBeGreaterThan(0.05);
    expect(a).toBeLessThan(aOpen);
  });
});

describe("FindingCard (render smoke)", () => {
  it("renders the title, severity and status without crashing", () => {
    renderCard();
    expect(screen.getByText("SSH root login is permitted")).toBeInTheDocument();
    expect(screen.getByText("High")).toBeInTheDocument(); // SeverityChip
    expect(screen.getByText("Fail")).toBeInTheDocument(); // StatusChip
  });

  it("renders a framework chip per mapping, with CIS/STIG control levels", () => {
    renderCard();
    expect(screen.getByText("CIS 5.2.4 · L1")).toBeInTheDocument();
    expect(screen.getByText("STIG V-253000 · CAT I")).toBeInTheDocument();
  });

  it("shows the remediation status", () => {
    renderCard({ remediationStatus: "in_progress" });
    expect(screen.getByText("In progress")).toBeInTheDocument();
  });

  it("hides the selection checkbox when onToggleSelected is null", () => {
    const { container } = renderCard();
    expect(container.querySelector('input[type="checkbox"]')).toBeNull();
  });

  it("shows the selection checkbox when a toggle handler is provided", () => {
    render(
      <FindingCard
        finding={baseFinding}
        onRequestException={noop}
        onRevoke={noop}
        onChangeStatus={noop}
        onShowHistory={noop}
        pendingAction={null}
        onToggleSelected={vi.fn()}
      />
    );
    expect(document.querySelector('input[type="checkbox"]')).not.toBeNull();
  });
});

describe("FindingCard (readOnly / RBAC)", () => {
  function renderReadOnly(overrides = {}) {
    return render(
      <FindingCard
        finding={{ ...baseFinding, ...overrides }}
        onRequestException={noop}
        onRevoke={noop}
        onChangeStatus={noop}
        onShowHistory={noop}
        pendingAction={null}
        readOnly
      />
    );
  }

  it("hides Request exception and Change status for read-only members", () => {
    renderReadOnly();
    expect(screen.queryByText(/Request exception/)).toBeNull();
    expect(screen.queryByText("Change status")).toBeNull();
  });

  it("hides Revoke ack even when the finding is acknowledged", () => {
    renderReadOnly({ acknowledgedAt: "2026-08-01T00:00:00Z" });
    expect(screen.queryByText("Revoke ack")).toBeNull();
  });

  it("keeps the read-only History action visible", () => {
    renderReadOnly();
    expect(screen.getByText("History")).toBeInTheDocument();
  });

  it("still renders mutations when readOnly is false (default)", () => {
    renderCard();
    expect(screen.getByText("Request exception")).toBeInTheDocument();
    expect(screen.getByText("History")).toBeInTheDocument();
  });

});

describe("FindingCard (P1-7 — exceptions are requested)", () => {
  it("Request exception calls back with the finding; a passing check offers none", () => {
    const onRequestException = vi.fn();
    const { unmount } = render(
      <FindingCard finding={baseFinding} onRequestException={onRequestException} onRevoke={noop} onChangeStatus={noop} onShowHistory={noop} pendingAction={null} />
    );
    fireEvent.click(screen.getByText("Request exception"));
    expect(onRequestException).toHaveBeenCalledWith(expect.objectContaining({ id: "f-1" }));
    unmount();
    renderCard({ status: "pass" });
    expect(screen.queryByText(/Request exception/)).toBeNull();
  });

  it("Change status no longer offers accept risk or won't fix", () => {
    renderCard();
    fireEvent.click(screen.getByText("Change status"));
    expect(screen.queryByText(/Mark risk accepted/i)).toBeNull();
    expect(screen.queryByText(/Mark won.t fix/i)).toBeNull();
    expect(screen.getByText(/Mark remediated/i)).toBeInTheDocument();
  });

  it("an expired exception offers a new request", () => {
    renderCard({ acknowledgementExpired: true, acknowledgedUntil: "2026-08-01T00:00:00Z" });
    expect(screen.getByText("Request new exception")).toBeInTheDocument();
  });
});

describe("FindingCard (Sprint 4 — one-click fix)", () => {
  function renderWith(overrides, props = {}) {
    return render(
      <FindingCard
        finding={{ ...baseFinding, ...overrides }}
        onRequestException={noop}
        onRevoke={noop}
        onChangeStatus={noop}
        onShowHistory={noop}
        pendingAction={null}
        {...props}
      />
    );
  }

  it("shows Fix now only for a failing, agentRemediable finding with a handler", () => {
    const onRemediate = vi.fn();
    renderWith({ status: "fail", agentRemediable: true }, { onRemediate });
    expect(screen.getByText("Fix now")).toBeInTheDocument();
  });

  it("hides Fix now when the crosswalk says no handler exists", () => {
    renderWith({ status: "fail", agentRemediable: false }, { onRemediate: vi.fn() });
    expect(screen.queryByText("Fix now")).toBeNull();
  });

  it("hides Fix now on a passing finding, in read-only mode, and without a handler prop", () => {
    renderWith({ status: "pass", agentRemediable: true }, { onRemediate: vi.fn() });
    expect(screen.queryByText("Fix now")).toBeNull();
    renderWith({ status: "fail", agentRemediable: true }, { onRemediate: vi.fn(), readOnly: true });
    expect(screen.queryByText("Fix now")).toBeNull();
    renderWith({ status: "fail", agentRemediable: true });
    expect(screen.queryByText("Fix now")).toBeNull();
  });

  // ── Remediación genérica: guarda, "Show me how", artefactos, dominio ──
  it("sin fix automático por una guarda, lo DICE en vez de dejar un hueco", () => {
    renderWith({ status: "fail", agentRemediable: false, remediationPlan: { auto: false, guard: "LSA authentication settings can break logons and domain trust", artifact: "reg", gpoManaged: false } }, { onRemediate: vi.fn(), onExportFix: vi.fn() });
    expect(screen.queryByText("Fix now")).toBeNull();
    expect(screen.getByText(/Not automated: LSA authentication settings/)).toBeInTheDocument();
  });

  it("Professional (sin onExportFix): 'Show me how' abre los detalles con la remediación", () => {
    renderWith({ status: "fail", agentRemediable: false, remediationSummary: "Configure HKLM\\X via Group Policy (CIS 18.9.7)." }, { onRemediate: vi.fn() });
    expect(screen.queryByText("Fix now")).toBeNull();
    expect(screen.queryByText("Export .reg")).toBeNull();
    fireEvent.click(screen.getByText("Show me how"));
    expect(screen.getByText(/Configure HKLM/)).toBeInTheDocument();
    expect(screen.queryByText("Show me how")).toBeNull();
  });

  it("Enterprise: exporta el .reg y el script de GPO con el formato pedido", () => {
    const onExportFix = vi.fn();
    const finding = { status: "fail", agentRemediable: true, remediationPlan: { auto: true, guard: null, artifact: "reg", gpoManaged: true } };
    renderWith(finding, { onRemediate: vi.fn(), onExportFix });
    screen.getByText("Export .reg").click();
    expect(onExportFix).toHaveBeenCalledWith(expect.objectContaining({ checkId: baseFinding.checkId }), "reg");
    screen.getByText("GPO script").click();
    expect(onExportFix).toHaveBeenLastCalledWith(expect.anything(), "gpo");
  });

  it("secedit exporta .inf y no ofrece script de GPO", () => {
    renderWith({ status: "fail", agentRemediable: true, remediationPlan: { auto: true, guard: null, artifact: "inf", gpoManaged: false } }, { onRemediate: vi.fn(), onExportFix: vi.fn() });
    expect(screen.getByText("Export .inf")).toBeInTheDocument();
    expect(screen.queryByText("GPO script")).toBeNull();
  });

  it("en un equipo de dominio con clave bajo Policies avisa, y sólo entonces", () => {
    const plan = { auto: true, guard: null, artifact: "reg", gpoManaged: true };
    renderWith({ status: "fail", agentRemediable: true, remediationPlan: plan }, { onRemediate: vi.fn(), partOfDomain: true });
    expect(screen.getByText(/Domain-joined device: this key lives under Group Policy/)).toBeInTheDocument();
    cleanup();
    renderWith({ status: "fail", agentRemediable: true, remediationPlan: plan }, { onRemediate: vi.fn(), partOfDomain: false });
    expect(screen.queryByText(/Domain-joined device/)).toBeNull();
  });

  it("una directiva de usuario avisa de que sólo cubre a los perfiles con sesión", () => {
    const plan = { auto: true, guard: null, artifact: "reg", gpoManaged: true, userScope: true };
    renderWith({ status: "fail", agentRemediable: true, remediationPlan: plan }, { onRemediate: vi.fn() });
    expect(screen.getByText(/User policy: the fix applies to the user profiles signed in/)).toBeInTheDocument();
    cleanup();
    renderWith({ status: "fail", agentRemediable: true, remediationPlan: { ...plan, userScope: false } }, { onRemediate: vi.fn() });
    expect(screen.queryByText(/User policy:/)).toBeNull();
    cleanup();
    // En pass no hay nada que aplicar, luego nada que avisar.
    renderWith({ status: "pass", agentRemediable: true, remediationPlan: plan }, { onRemediate: vi.fn() });
    expect(screen.queryByText(/User policy:/)).toBeNull();
  });

  it("clicking Fix now hands the finding to the handler", () => {
    const onRemediate = vi.fn();
    renderWith({ status: "fail", agentRemediable: true }, { onRemediate });
    screen.getByText("Fix now").click();
    expect(onRemediate).toHaveBeenCalledTimes(1);
    expect(onRemediate.mock.calls[0][0].checkId).toBe(baseFinding.checkId);
  });
});

describe("FindingCard (Sprint 4 — CVE/KEV cross checks)", () => {
  const kevFinding = {
    ...baseFinding,
    checkId: "cross.vulnerability.no_kev",
    status: "fail",
    category: "patching",
  };
  function renderKev(props = {}) {
    return render(
      <FindingCard
        finding={kevFinding}
        onRequestException={noop}
        onRevoke={noop}
        onChangeStatus={noop}
        onShowHistory={noop}
        pendingAction={null}
        {...props}
      />
    );
  }

  it("names the KEVs from the device block and links to Vulnerabilities", () => {
    const onOpen = vi.fn();
    renderKev({
      onOpenVulnerabilities: onOpen,
      deviceVulnerability: { kev_ids: ["CVE-2026-0001", "CVE-2026-0002"], next_kev_due_date: "2026-09-01" },
    });
    const chip = screen.getByText("2 KEVs · due 2026-09-01");
    chip.click();
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it("falls back to a generic label when the device block is absent", () => {
    renderKev({ onOpenVulnerabilities: vi.fn() });
    expect(screen.getByText("View vulnerabilities")).toBeInTheDocument();
  });

  it("does not render the chip on non-vulnerability checks or passing ones", () => {
    render(
      <FindingCard finding={{ ...baseFinding, status: "fail" }} onRequestException={noop} onRevoke={noop}
        onChangeStatus={noop} onShowHistory={noop} pendingAction={null}
        deviceVulnerability={{ kev_ids: ["CVE-X"] }} onOpenVulnerabilities={vi.fn()} />
    );
    expect(screen.queryByText(/KEV/)).toBeNull();
    render(
      <FindingCard finding={{ ...kevFinding, status: "pass" }} onRequestException={noop} onRevoke={noop}
        onChangeStatus={noop} onShowHistory={noop} pendingAction={null}
        deviceVulnerability={{ kev_ids: ["CVE-X"] }} onOpenVulnerabilities={vi.fn()} />
    );
    expect(screen.queryByText(/KEV/)).toBeNull();
  });
});

describe("FindingCard (Sprint 4 — Explain)", () => {
  it("offers Explain only with canExplain on a failing finding with an id", () => {
    render(
      <FindingCard finding={{ ...baseFinding, status: "fail" }} onRequestException={noop} onRevoke={noop}
        onChangeStatus={noop} onShowHistory={noop} pendingAction={null} canExplain />
    );
    expect(screen.getByText("Explain")).toBeInTheDocument();
  });
  it("hides Explain without canExplain, and on passing findings", () => {
    renderCard({ status: "fail" });
    expect(screen.queryByText("Explain")).toBeNull();
    render(
      <FindingCard finding={{ ...baseFinding, status: "pass" }} onRequestException={noop} onRevoke={noop}
        onChangeStatus={noop} onShowHistory={noop} pendingAction={null} canExplain />
    );
    expect(screen.queryByText("Explain")).toBeNull();
  });
});

describe("FindingCard — browser extension risk (cross.browser_extensions.*)", () => {
  const block = {
    critical: [{ browser: "chrome", extension_id: "a".repeat(32), name: "Coupon Grabber", risk: "critical", install_source: "store", profiles: 1, reasons: [] },
      { browser: "edge", extension_id: "b".repeat(32), name: "Proxy Tool", risk: "critical", install_source: "store", profiles: 1, reasons: [] },
      { browser: "edge", extension_id: "c".repeat(32), name: "Third", risk: "critical", install_source: "store", profiles: 1, reasons: [] }],
    high: [], outside_store: [], approved_excluded_count: 1,
  };
  it("names the extensions from the device block and opens the control in Patch Management with the first one", () => {
    const onOpen = vi.fn();
    render(
      <FindingCard
        finding={{ ...baseFinding, checkId: "cross.browser_extensions.no_critical_risk", title: "No browser extension can read and change everything" }}
        onRequestException={noop} onRevoke={noop} onChangeStatus={noop} onShowHistory={noop} pendingAction={null}
        deviceBrowserExtensions={block}
        onOpenExtensionControl={onOpen}
      />
    );
    fireEvent.click(screen.getByText("3 extensions: Coupon Grabber, Proxy Tool…"));
    expect(onOpen).toHaveBeenCalledWith(block.critical[0]);
  });

  it("a passing extension check or another check shows no chip", () => {
    renderCard({ checkId: "cross.browser_extensions.store_only", status: "pass" });
    expect(screen.queryByText(/extensions?:|Review extensions/)).not.toBeInTheDocument();
  });
});
