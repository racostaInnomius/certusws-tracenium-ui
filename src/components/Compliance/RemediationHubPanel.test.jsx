// src/components/Compliance/RemediationHubPanel.test.jsx
//
// La pestaña "Fix". Lo que se fija aquí es lo que hace que alguien pulse
// sabiendo qué va a pasar:
//
//   · un botón muerto siempre viene con su motivo escrito (sin PMP no hay
//     brazo ejecutor; sin handler es trabajo manual);
//   · un conteo aproximado se marca con «≥» en vez de pasar por exacto;
//   · un fix que nunca se ha ejercido en esta instalación lo dice, porque
//     ofrecerlo callando es vender una promesa que nadie ha comprobado;
//   · "Simulate" manda `dry_run` y "Apply" manda `apply` — invertirlos es
//     tocar doce equipos creyendo que estabas probando.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup, within } from "@testing-library/react";

vi.mock("../../api/compliance", () => ({ getRemediationHub: vi.fn() }));
vi.mock("../../api/patchManagement", () => ({ remediate: vi.fn() }));
// El drawer se prueba aparte; aquí sólo importa QUÉ se le pasa.
const drawerProps = { current: null };
vi.mock("../patch-management/FindingDetailDrawer", () => ({
  default: (props) => {
    drawerProps.current = props;
    return props.open ? <div data-testid="fix-drawer" /> : null;
  },
}))

import { getRemediationHub } from "../../api/compliance";
import { remediate } from "../../api/patchManagement";
import RemediationHubPanel, { blockedReasonText, criticalDevicesLabel, devicesLabel } from "./RemediationHubPanel";

const action = (over = {}) => ({
  key: "windows.firewall.profiles_enabled",
  kind: "agent",
  handlerId: "windows.firewall.profiles_enabled",
  generic: false,
  title: "firewall (3 checks)",
  checkIds: ["a", "b", "c"],
  findings: 36,
  devices: 12,
  devicesExact: true,
  severity: "critical",
  categories: ["firewall"],
  firstDetectedUtc: "2026-08-01T00:00:00.000Z",
  remediationSummary: "Enable the three firewall profiles",
  platforms: ["windows"],
  support: "remediable",
  verifiedAt: "2026-08-14T00:00:00.000Z",
  verifiedVia: "campaign",
  canApply: true,
  applyBlockedReason: null,
  ...over,
});

const hub = (actions, over = {}) => ({
  actions,
  pmpEntitled: true,
  totals: {
    actions: actions.length,
    applicable: actions.filter((a) => a.canApply).length,
    manual: actions.filter((a) => a.kind === "manual").length,
    findings: actions.reduce((n, a) => n + a.findings, 0),
    findingsFixableNow: actions.filter((a) => a.canApply).reduce((n, a) => n + a.findings, 0),
    neverVerified: 0,
  },
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  getRemediationHub.mockResolvedValue(hub([action()]));
  remediate.mockResolvedValue({ ok: true, remediationId: "rm-1" });
});
afterEach(cleanup);

describe("helpers", () => {
  it("un conteo no exacto se marca, no se disfraza", () => {
    expect(devicesLabel({ devices: 12, devicesExact: true })).toBe("12 devices");
    expect(devicesLabel({ devices: 12, devicesExact: false })).toBe("≥ 12 devices");
    expect(devicesLabel({ devices: 1, devicesExact: true })).toBe("1 device");
  });

  it("cada bloqueo tiene texto; lo desconocido no inventa uno", () => {
    expect(blockedReasonText("pmp_not_entitled")).toMatch(/Patch Management/);
    expect(blockedReasonText("no_handler")).toMatch(/by hand/i);
    expect(blockedReasonText(null)).toBeNull();
  });
});

describe("la fila dice qué cierra", () => {
  it("enseña hallazgos y equipos distintos, y agrupa los checks", async () => {
    render(<RemediationHubPanel canManage />);

    expect(await screen.findByText("firewall (3 checks)")).toBeInTheDocument();
    expect(screen.getByText("36 findings")).toBeInTheDocument();
    expect(screen.getByText("12 devices")).toBeInTheDocument();
    expect(screen.getByText("3 checks")).toBeInTheDocument();
  });

  it("marca el fix que nunca se ha ejercido en esta instalación", async () => {
    getRemediationHub.mockResolvedValue(hub([action({ verifiedAt: null })]));
    render(<RemediationHubPanel canManage />);
    expect(await screen.findByText(/never exercised here/i)).toBeInTheDocument();
  });

  it("un fix ya ejercido no lleva ese aviso", async () => {
    render(<RemediationHubPanel canManage />);
    await screen.findByText("firewall (3 checks)");
    expect(screen.queryByText(/never exercised here/i)).not.toBeInTheDocument();
  });
});

describe("sin poder ejecutar, se explica por qué", () => {
  it("sin PMP: aviso arriba y motivo en la fila, botones apagados", async () => {
    getRemediationHub.mockResolvedValue(
      hub([action({ canApply: false, applyBlockedReason: "pmp_not_entitled" })], { pmpEntitled: false })
    );
    render(<RemediationHubPanel canManage />);

    expect(await screen.findByText(/does not include Patch Management/i)).toBeInTheDocument();
    expect(screen.getByText(/needs Patch Management, which is not in this tenant/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /simulate, then fix/i })).toBeDisabled();
  });

  it("acción manual: se ve, se explica, y no ofrece un botón que no hace nada", async () => {
    getRemediationHub.mockResolvedValue(
      hub([action({ kind: "manual", canApply: false, applyBlockedReason: "no_handler", handlerId: null, title: "SIP enabled", checkIds: ["macos.sip.enabled"] })])
    );
    render(<RemediationHubPanel canManage />);

    expect(await screen.findByText("SIP enabled")).toBeInTheDocument();
    expect(screen.getByText(/remediated by hand/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /simulate, then fix/i })).toBeDisabled();
  });

  it("quien sólo lee ve el hub completo, pero no lanza nada", async () => {
    render(<RemediationHubPanel canManage={false} />);
    await screen.findByText("firewall (3 checks)");
    expect(screen.getByRole("button", { name: /simulate, then fix/i })).toBeDisabled();
  });
});

describe("lanzar", () => {
  it("⭐ no llama a remediate directamente: abre el drawer (simular → aplicar)", async () => {
    render(<RemediationHubPanel canManage onToast={vi.fn()} />);
    fireEvent.click(await screen.findByRole("button", { name: /simulate, then fix/i }));
    expect(await screen.findByTestId("fix-drawer")).toBeInTheDocument();
    expect(remediate).not.toHaveBeenCalled();
  });

  it("⭐ el drawer recibe TODOS los checks de la acción (la unión de equipos)", async () => {
    render(<RemediationHubPanel canManage onToast={vi.fn()} />);
    fireEvent.click(await screen.findByRole("button", { name: /simulate, then fix/i }));
    await screen.findByTestId("fix-drawer");
    expect(drawerProps.current.checkIds).toEqual(["a", "b", "c"]);
    expect(drawerProps.current.finding).toMatchObject({ checkId: "a", agentRemediable: true });
    expect(drawerProps.current.canManage).toBe(true);
  });

  it("los avisos del drawer llegan al toast del hub con el orden de argumentos del hub", async () => {
    const onToast = vi.fn();
    render(<RemediationHubPanel canManage onToast={onToast} />);
    fireEvent.click(await screen.findByRole("button", { name: /simulate, then fix/i }));
    await screen.findByTestId("fix-drawer");
    drawerProps.current.notify("error", "PMP_PLUGIN_DISABLED");
    expect(onToast).toHaveBeenCalledWith("PMP_PLUGIN_DISABLED", "error");
  });
});

describe("estados vacíos y de error", () => {
  it("sin acciones lo dice en vez de enseñar una tabla vacía", async () => {
    getRemediationHub.mockResolvedValue(hub([]));
    render(<RemediationHubPanel canManage />);
    expect(await screen.findByText(/nothing open to act on/i)).toBeInTheDocument();
  });

  it("un error de carga se enseña", async () => {
    getRemediationHub.mockRejectedValue(new Error("boom"));
    render(<RemediationHubPanel canManage />);
    expect(await screen.findByText("boom")).toBeInTheDocument();
  });
});

describe("los equipos críticos", () => {
  it("null (no se pudo contar) y 0 no pintan nada", () => {
    expect(criticalDevicesLabel({ criticalDevices: null })).toBeNull();
    expect(criticalDevicesLabel({ criticalDevices: 0 })).toBeNull();
    expect(criticalDevicesLabel({})).toBeNull();
  });

  it("con alguno lo dice", () => {
    expect(criticalDevicesLabel({ criticalDevices: 3 })).toBe("3 critical");
  });
});
