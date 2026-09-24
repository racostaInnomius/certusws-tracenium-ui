// src/pages/Assessments.test.jsx
//
// ADR-0022 — la página de Assessment Suite contra la API simulada (MSW):
//   · las `detected` van en su bloque, con «Activate», y no cuentan;
//   · activar abre el selector de DC del dominio y manda primario, secundario
//     y agenda;
//   · el detalle ordena los hallazgos por criticidad, explica un not_assessed
//     por privilegios y enseña la cobertura;
//   · con la última corrida `missed` el score anterior sigue con su fecha y el
//     fallo se dice;
//   · «Run now» sin colector online dice que quedó `missed`;
//   · nunca aparecen las siglas.

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { server, http, HttpResponse } from "../test/msw/server";
import { clearCachedFetch } from "../hooks/useCachedFetch";
import { ConfirmProvider } from "../components/common/ConfirmDialog";

vi.mock("../auth/AuthContext", () => ({
  useAuthContext: () => ({
    auth: { tenantId: 111, tenantMember: { role: "ADMIN", isActive: true, tenantId: 111 } },
    loading: false,
    refreshAuth: vi.fn(),
  }),
  AuthProvider: ({ children }) => children,
}));

import Assessments from "./Assessments";

afterEach(() => {
  cleanup();
  clearCachedFetch();
  server.resetHandlers();
  window.history.replaceState({}, "", "/");
});

const LIST = {
  instances: [
    {
      id: 7,
      kind: "ad_domain",
      externalKey: "mountainside-investment.com",
      displayName: "mountainside-investment.com",
      status: "active",
      collectorDeviceId: "dc1",
      collectorHostname: "MSIG-TSPDC",
      schedule: { frequency: "weekly", window: { days: ["sun"], startHour: 2 } },
      lastRun: { runId: "r2", status: "missed", trigger: "scheduled", startedAt: "2026-09-13T02:00:00Z", errorText: "collector_unavailable: primary dc1 offline" },
      lastScore: { runId: "r1", score: 58, scoredAt: "2026-09-06T02:05:00Z" },
      coverage: { assessable: 29, total: 30 },
      openFindings: 10,
    },
  ],
  detected: [{ id: 9, kind: "ad_domain", externalKey: "lab.local", displayName: "lab.local", status: "detected", lastDetectedAt: "2026-09-13T10:00:00Z" }],
  license: { activeInstances: 1 },
};

const DETAIL = {
  instance: { ...LIST.instances[0], targetScore: null, scoreAdjusted: 71 },
  lastScore: LIST.instances[0].lastScore,
  coverage: { assessable: 29, total: 30 },
  projections: [
    { severities: ["critical"], fixes: 1, score: 64 },
    { severities: ["critical", "high"], fixes: 2, score: 88 },
  ],
  findings: [
    { controlId: "ASP-AD-CFG-007", title: "Fine-grained password policies allow passwords shorter than 14 characters", section: "Domain configuration", status: "not_assessed", severity: "medium", requires: "privileged", reason: "requires_privileged_read:0x8007200A", affectedCount: null, remediation: { summary: "Raise it", steps: ["Do it"], risk: "Some" }, references: [] },
    { controlId: "ASP-AD-ACC-001", title: "Enabled user accounts have a password that never expires", section: "Accounts", status: "fail", severity: "medium", affectedCount: 38, evidence: { count: 38, sample: ["CN=svc,DC=m"] }, exception: { reason: "Cuentas de servicio con rotación por bóveda", author: "admin", expiresAt: "2026-12-01T00:00:00Z", active: true }, remediation: { summary: "Fix", steps: ["Step"], risk: "Risk" }, references: [] },
    { controlId: "ASP-AD-KRB-001", title: "The krbtgt account password has not been reset in the last 180 days", section: "Kerberos", status: "fail", severity: "critical", affectedCount: null, remediation: { summary: "Reset twice", steps: ["Reset"], risk: "Tickets" }, references: [{ source: "MITRE ATT&CK", id: "T1558.001", title: "Golden Ticket", url: "https://attack.mitre.org/techniques/T1558/001/" }] },
    { controlId: "ASP-AD-PRV-006", title: "Non-default principals hold replication rights on the domain (DCSync)", section: "Privileged access", status: "not_assessed", severity: "critical", requires: "member", reason: "collector_error:0x80131501", affectedCount: null, evidence: { collectorError: { hresult: "0x80131501", type: "RuntimeException", message: "You cannot call a method on a null-valued expression." } }, references: [] },
    { controlId: "ASP-AD-KRB-003", title: "Enabled accounts do not require Kerberos pre-authentication", section: "Kerberos", status: "pass", severity: "high", affectedCount: 0, references: [] },
  ],
  history: [
    { runId: "r0", scoredAt: "2026-08-30T02:05:00Z", score: 51, bySeverity: {} },
    { runId: "r1", scoredAt: "2026-09-06T02:05:00Z", score: 58, bySeverity: {} },
  ],
  runs: [
    { runId: "r2", status: "missed", trigger: "scheduled", startedAt: "2026-09-13T02:00:00Z", completedAt: "2026-09-13T02:00:00Z", score: null, errorText: "collector_unavailable: primary dc1 offline" },
    { runId: "r1", status: "complete", trigger: "scheduled", startedAt: "2026-09-06T02:00:00Z", completedAt: "2026-09-06T02:05:00Z", score: 58, summary: { coverage: { assessable: 29, total: 30 } } },
  ],
};

function mount(overrides = {}) {
  const calls = [];
  server.use(
    http.get(/.*\/api\/v1\/asp\/instances$/, () => HttpResponse.json(overrides.list ?? LIST)),
    http.get(/.*\/api\/v1\/asp\/instances\/7$/, () => HttpResponse.json(overrides.detail ?? DETAIL)),
    http.put(/.*\/api\/v1\/asp\/instances\/7\/target$/, async ({ request }) => {
      calls.push({ path: "target", body: await request.json() });
      return HttpResponse.json({ instance: { ...DETAIL.instance, targetScore: 90 } });
    }),
    http.get(/.*\/api\/v1\/asp\/instances\/9\/collector-candidates$/, () =>
      HttpResponse.json({ candidates: [
        { deviceId: "dc-a", domain: "lab.local", hostname: "LAB-DC01", online: true },
        { deviceId: "dc-b", domain: "lab.local", hostname: "LAB-DC02", online: false },
      ] })
    ),
    http.post(/.*\/api\/v1\/asp\/instances\/9\/activate$/, async ({ request }) => {
      calls.push({ path: "activate", body: await request.json() });
      return HttpResponse.json({ instance: { ...LIST.detected[0], status: "active" }, firstRun: { runId: "r9", status: "running" } });
    }),
    http.post(/.*\/api\/v1\/asp\/instances\/7\/run$/, () =>
      HttpResponse.json({ error: "ASP_COLLECTOR_UNAVAILABLE", message: "collector_unavailable: primary dc1 offline", run: { status: "missed" } }, { status: 409 })
    ),
    ...(overrides.handlers ?? [])
  );
  window.history.replaceState({}, "", "/?page=assessments");
  render(
    <ConfirmProvider>
      <Assessments onNavigate={vi.fn()} />
    </ConfirmProvider>
  );
  return calls;
}

describe("Assessment Suite — lista", () => {
  it("las detectadas van aparte, con Activate, y la licencia cuenta sólo las activas", async () => {
    mount();
    const detected = await screen.findByRole("table", { name: "Detected domains" });
    expect(within(detected).getByText("lab.local")).toBeTruthy();
    expect(within(detected).getByRole("button", { name: "Activate" })).toBeTruthy();
    expect(screen.getByText(/1 active · licensed per active instance/)).toBeTruthy();
    const instances = screen.getByRole("table", { name: "Service instances" });
    expect(within(instances).getByText("mountainside-investment.com")).toBeTruthy();
    expect(within(instances).queryByText("lab.local")).toBeNull();
  });

  it("⭐ con la última corrida missed, el score anterior sigue en pantalla con su fecha", async () => {
    mount();
    const instances = await screen.findByRole("table", { name: "Service instances" });
    expect(within(instances).getByText("58")).toBeTruthy();
    expect(within(instances).getByText("Missed")).toBeTruthy();
    expect(within(instances).getByText("29 of 30 assessable from this collector")).toBeTruthy();
  });

  it("nunca enseña las siglas", async () => {
    mount();
    await screen.findByRole("table", { name: "Service instances" });
    expect(document.body.textContent).not.toMatch(/\bASP\b/);
  });

  it("⭐ activar ofrece los DC del dominio y manda primario, secundario y agenda", async () => {
    const user = userEvent.setup();
    const calls = mount({ handlers: [http.get(/.*\/api\/v1\/asp\/instances\/9$/, () => HttpResponse.json({ ...DETAIL, instance: { ...LIST.detected[0], status: "active" }, findings: [], history: [], runs: [] }))] });
    await user.click(await screen.findByRole("button", { name: "Activate" }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByLabelText("Primary domain controller"));
    await user.click(await screen.findByRole("option", { name: "LAB-DC01" }));
    await user.click(within(dialog).getByLabelText("Secondary domain controller (optional)"));
    await user.click(await screen.findByRole("option", { name: "LAB-DC02 · offline" }));
    await user.click(within(dialog).getByRole("button", { name: "Activate" }));
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0].body).toEqual({
      primaryDeviceId: "dc-a",
      secondaryDeviceId: "dc-b",
      schedule: { frequency: "weekly", window: { days: ["sun"], startHour: 2 } },
    });
  });
});

describe("Assessment Suite — detalle", () => {
  it("⭐ ordena por criticidad, explica el not_assessed por privilegios y avisa del missed", async () => {
    const user = userEvent.setup();
    mount();
    await user.click(await screen.findByText("mountainside-investment.com"));
    const findings = await screen.findByRole("table", { name: "Findings" });
    const titles = within(findings).getAllByText(/./, { selector: "p" }).map((n) => n.textContent);
    const krb = titles.findIndex((t) => t.includes("krbtgt"));
    const pwd = titles.findIndex((t) => t.includes("never expires"));
    const fgpp = titles.findIndex((t) => t.includes("Fine-grained"));
    const pass = titles.findIndex((t) => t.includes("pre-authentication"));
    expect(krb).toBeLessThan(pwd); // fail crítico antes que fail medio
    expect(pwd).toBeLessThan(fgpp); // fail antes que not_assessed
    expect(fgpp).toBeLessThan(pass); // pass al final

    expect(screen.getByText(/The last run .* was/)).toBeTruthy();
    expect(screen.getByText("Scored", { exact: false })).toBeTruthy();

    // Desplegar el FGPP explica por qué no se evaluó.
    const fgppRow = within(findings).getByText(/Fine-grained/).closest("tr");
    await user.click(within(fgppRow).getByRole("button", { name: "Show details" }));
    expect(await screen.findByText(/machine account cannot read this \(0x8007200A\)/)).toBeTruthy();

    // Un error del colector enseña el texto: 0x80131501 solo no dice qué falló.
    const dcsyncRow = within(findings).getByText(/DCSync/).closest("tr");
    await user.click(within(dcsyncRow).getByRole("button", { name: "Show details" }));
    expect(await screen.findByText(/RuntimeException: You cannot call a method on a null-valued expression\./)).toBeTruthy();
  });

  it("⭐ gauge: score, objetivo del tenant, variación, distancia y proyecciones", async () => {
    const user = userEvent.setup();
    mount();
    await user.click(await screen.findByText("mountainside-investment.com"));
    const gauge = await screen.findByRole("img", { name: "Score 58 of 100, target 85" });
    expect(within(gauge).getByText("Target 85")).toBeTruthy();
    expect(screen.getByText("Action required")).toBeTruthy();
    expect(screen.getByText("+7")).toBeTruthy();
    expect(screen.getByText("27 points to target")).toBeTruthy();
    expect(screen.getByText("Tenant On track threshold")).toBeTruthy();
    expect(screen.getByText("Fix the 1 critical finding")).toBeTruthy();
    expect(screen.getByText("Fix the 2 critical and high findings")).toBeTruthy();
    // Sólo la proyección que llega al objetivo lo dice.
    expect(screen.getAllByText(/reaches target/)).toHaveLength(1);
    // Hallazgos abiertos y cobertura viven en el mismo panel que el gauge.
    expect(screen.getByText("29 of 30")).toBeTruthy();
    expect(screen.getByText(/left out of the score, never counted as passing/)).toBeTruthy();
    expect(screen.getByText("Open findings")).toBeTruthy();
  });

  it("⭐ el score ajustado por excepciones se dice al lado del bruto, sin sustituirlo", async () => {
    const user = userEvent.setup();
    mount();
    await user.click(await screen.findByText("mountainside-investment.com"));
    // El gauge sigue siendo el BRUTO (58): es el hecho histórico y lo que compara la cartera MSP.
    expect(await screen.findByRole("img", { name: "Score 58 of 100, target 85" })).toBeTruthy();
    // Y al lado, lo que queda tras honrar lo aceptado.
    expect(screen.getByText("71 with 1 accepted exception")).toBeTruthy();
  });

  it("⭐ el diálogo de excepción enseña las anteriores, y la caducada no se lee como revocada", async () => {
    const user = userEvent.setup();
    mount({
      handlers: [
        http.get(/.*\/api\/v1\/asp\/instances\/7\/findings\/ASP-AD-ACC-001\/exceptions$/, () =>
          HttpResponse.json({
            controlId: "ASP-AD-ACC-001",
            exceptions: [
              { reason: "Cuentas de servicio con rotación por bóveda", author: "admin", createdAt: "2026-09-20T10:00:00Z", expiresAt: "2026-12-01T00:00:00Z", closedAt: null, closedBy: null, status: "active" },
              { reason: "Mientras dura la migración", author: "ana", createdAt: "2026-06-01T10:00:00Z", expiresAt: "2026-09-01T00:00:00Z", closedAt: null, closedBy: null, status: "expired" },
              { reason: "Primera valoración", author: "bruno", createdAt: "2026-03-01T10:00:00Z", expiresAt: "2026-09-01T00:00:00Z", closedAt: "2026-06-01T10:00:00Z", closedBy: "ana", status: "superseded" },
            ],
          })
        ),
      ],
    });
    await user.click(await screen.findByText("mountainside-investment.com"));
    await user.click(await screen.findByRole("button", { name: "Edit exception" }));
    const dialog = await screen.findByRole("dialog");

    expect(await within(dialog).findByText("Previously accepted")).toBeTruthy();
    // La que se cumplió y la que se sustituyó se distinguen.
    expect(within(dialog).getByText("Mientras dura la migración")).toBeTruthy();
    expect(within(dialog).getByText("Expired")).toBeTruthy();
    expect(within(dialog).getByText("ana · 2026-06-01 → 2026-09-01")).toBeTruthy();
    expect(within(dialog).getByText("bruno · 2026-03-01 → 2026-09-01 · replaced by ana on 2026-06-01")).toBeTruthy();
    // ⚠️ La VIGENTE no se repite abajo: ya está en el formulario de arriba.
    expect(within(dialog).queryByText("In force")).toBeNull();
    expect(within(dialog).getByLabelText("Reason").value).toBe("Cuentas de servicio con rotación por bóveda");
  });

  it("⭐ Set target guarda el objetivo de la instancia", async () => {
    const user = userEvent.setup();
    const calls = mount();
    await user.click(await screen.findByText("mountainside-investment.com"));
    await user.click(await screen.findByRole("button", { name: "Set target" }));
    const dialog = await screen.findByRole("dialog");
    const input = within(dialog).getByLabelText("Target");
    expect(input.value).toBe("85");
    await user.clear(input);
    await user.type(input, "90");
    await user.click(within(dialog).getByRole("button", { name: "Save target" }));
    await waitFor(() => expect(calls.find((c) => c.path === "target")).toBeTruthy());
    expect(calls.find((c) => c.path === "target").body).toEqual({ targetScore: 90 });
  });

  it("sin corrida completa el gauge no inventa un 0", async () => {
    const user = userEvent.setup();
    mount({ detail: { ...DETAIL, lastScore: null, history: [], projections: [] } });
    await user.click(await screen.findByText("mountainside-investment.com"));
    expect(await screen.findByRole("img", { name: "No score yet, target 85" })).toBeTruthy();
    expect(screen.getByText("No complete run yet")).toBeTruthy();
    expect(screen.queryByText("What would move it")).toBeNull();
  });

  it("⭐ Run now sin colector online dice que la corrida quedó missed", async () => {
    const user = userEvent.setup();
    mount();
    await user.click(await screen.findByText("mountainside-investment.com"));
    await user.click(await screen.findByRole("button", { name: "Run now" }));
    expect(await screen.findByText(/recorded as missed/)).toBeTruthy();
  });
});
