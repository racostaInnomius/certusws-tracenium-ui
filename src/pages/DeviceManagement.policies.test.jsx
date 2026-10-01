// src/pages/DeviceManagement.policies.test.jsx
//
// La pestaña Policies de MDM / MAM tras el rediseño (1-oct-2026): una tarjeta
// por política con lo que tiene puesto y a quién llega, el editor de la
// elegida y la barra de guardado. Lo que importa: que cada guardado mande SU
// dominio y nada más, que guardar una política no borre lo editado en otra,
// y que la pantalla no deje creer que llega al Mac algo que no llega.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { server, http, HttpResponse } from "../test/msw/server";
import { ConfirmProvider } from "../components/common/ConfirmDialog";

vi.mock("../api/roles", () => ({
  getMyCapabilities: () => Promise.resolve({ role: "ADMIN", permissions: ["device_management", "enrollment"] }),
}));
vi.mock("../auth/AuthContext", () => ({
  useAuthContext: () => ({
    auth: { tenantId: 1, tenantMember: { role: "ADMIN", isActive: true, tenantId: 1 } },
    loading: false,
    refreshAuth: vi.fn(),
  }),
  AuthProvider: ({ children }) => children,
}));
vi.mock("../msp/MspContext", () => ({
  useMspOptional: () => ({ activeTenant: null }),
}));

import DeviceManagement from "./DeviceManagement";

const setting = (key, label, spec, delivery = { by: "profile" }, extra = {}) => ({
  key,
  platforms: [key.split(".")[0]],
  spec,
  requiresSupervision: false,
  channels: ["mdm-profile"],
  label,
  delivery,
  ...extra,
});
const CATALOG = {
  ok: true,
  platforms: ["macos", "ios"],
  settings: [
    setting("macos.screen.idleTimeoutSeconds", "Idle time before the screen saver", { kind: "integer", min: 60, max: 3600 }),
    setting("macos.safari.showFullURL", "Safari: show the full website address", { kind: "boolean" }),
    setting("macos.menuBar.showWiFi", "Show Wi-Fi in the menu bar", { kind: "boolean" }, { by: "profile", values: [true] }),
    setting("macos.apps.requireAdminToInstall", "Require an administrator password to install apps", { kind: "boolean" }, null),
    // Por DDM (1-oct): enumerado de Apple con etiquetas, y la mínima con su fecha.
    setting("macos.softwareUpdate.automaticDownload", "Download updates automatically",
      { kind: "enum", values: ["Allowed", "AlwaysOn", "AlwaysOff"], labels: { Allowed: "User decides", AlwaysOn: "Always on", AlwaysOff: "Always off" } }, { by: "ddm" }),
    setting("macos.softwareUpdate.enforcedMinimumVersion", "Minimum required macOS version",
      { kind: "string", maxLength: 12, pattern: "^\\d{1,3}(\\.\\d{1,3}){1,2}$", patternHint: "A version like 27.0.1" }, { by: "ddm" },
      { requires: "macos.softwareUpdate.enforcedMinimumDeadline" }),
    setting("macos.softwareUpdate.enforcedMinimumDeadline", "Deadline for the minimum version", { kind: "localDateTime" }, { by: "ddm" },
      { requires: "macos.softwareUpdate.enforcedMinimumVersion" }),
    setting("ios.passcode.required", "Require a passcode", { kind: "boolean" }, null),
  ],
};

const MAC = {
  udid: "36F3B382-4B4B-5025-89CC-115DD69E4F67",
  deviceName: "JPR-MacBookPro",
  productName: "Mac15,7",
  enrollmentState: "enrolled",
  enrolledAt: new Date().toISOString(),
  lastSeenAt: new Date().toISOString(),
};

let state;
beforeEach(() => {
  state = {
    version: 7,
    policy: { macos: { safari: { showFullURL: true } }, mam: { requireUserAuth: true } },
    patches: [],
  };
});
afterEach(() => {
  cleanup();
  server.resetHandlers();
});

function mount(search = "") {
  server.use(
    http.get(/\/api\/v1\/policies\/mdm\/catalog/, () => HttpResponse.json(CATALOG)),
    http.get(/\/api\/v1\/policies\/tenants\/[^/]+\/policy$/, () =>
      HttpResponse.json({ ok: true, policy: { policy_version: state.version, policy_hash: "sha256:abc", policy_json: state.policy } })
    ),
    http.patch(/\/policy\/domains\/[^/]+$/, async ({ request }) => {
      const domain = new URL(request.url).pathname.split("/").pop();
      const body = await request.json();
      state.patches.push({ domain, body });
      const owned = domain === "device-management" ? ["mam", "managedApp"] : [domain.replace("mdm-", "")];
      const next = { ...state.policy };
      for (const k of owned) delete next[k];
      state.policy = { ...next, ...body };
      state.version += 1;
      return HttpResponse.json({ ok: true });
    }),
    http.get(/\/api\/v1\/mdm\/status$/, () => HttpResponse.json({ enrollment: { available: true, missing: [] }, commands: { deliverable: false } })),
    http.get(/\/api\/v1\/mdm\/devices$/, () => HttpResponse.json({ devices: [MAC] })),
    http.get(/\/api\/v1\/mdm\/enrollments/, () => HttpResponse.json({ enrollments: [] })),
    http.all(/.*\/api\/.*/, () => HttpResponse.json({ ok: true, items: [] }))
  );
  window.history.replaceState({}, "", `/?page=device-management&mdmTab=policies${search}`);
  render(
    <ConfirmProvider>
      <DeviceManagement onNavigate={vi.fn()} />
    </ConfirmProvider>
  );
}

const cards = () => within(screen.getByRole("tablist", { name: "Policies" }));
const card = (name) => cards().getAllByRole("tab").find((t) => t.textContent.startsWith(name));
const toggle = (label) => screen.getByRole("group", { name: label });

/** Espera a que el editor de macOS esté cargado y habilitado. */
async function macosReady() {
  const group = await screen.findByRole("group", { name: "Show the full website address" });
  await waitFor(() => expect(within(group).getByRole("button", { name: "Off" })).not.toBeDisabled());
  return group;
}

describe("Policies — tarjetas", () => {
  it("⭐ una por política: cuánto tiene puesto y a quién llega; macOS abierta por defecto", async () => {
    mount();
    await macosReady();
    expect(card("macOS")).toHaveAttribute("aria-selected", "true");
    expect(card("macOS").textContent).toMatch(/1 of 7 set/);
    await waitFor(() => expect(card("macOS").textContent).toMatch(/Reaches 1 Mac enrolled in MDM/));
    expect(card("iPhone & iPad").textContent).toMatch(/Nothing set.*Not sent yet/);
    expect(card("Tracenium app").textContent).toMatch(/1 of 8 set.*Applied by the app/);
  });

  it("cambiar de tarjeta cambia el editor y la URL", async () => {
    const user = userEvent.setup();
    mount();
    await macosReady();
    await user.click(card("iPhone & iPad"));
    expect(await screen.findByText(/doesn.t send settings to iPhones and iPads yet/)).toBeTruthy();
    expect(screen.getByRole("group", { name: "Require a passcode" })).toBeTruthy();
    expect(window.location.search).toMatch(/mdmPolicy=ios/);
  });
});

describe("Policies — guardar", () => {
  it("⭐ la barra y la tarjeta cuentan el cambio; Save manda SÓLO el dominio mdm-macos", async () => {
    const user = userEvent.setup();
    mount();
    const group = await macosReady();
    await user.click(within(group).getByRole("button", { name: "Off" }));

    expect(screen.getByText("● 1 unsaved change")).toBeTruthy();
    expect(within(card("macOS")).getByText("1 unsaved")).toBeTruthy();
    expect(screen.getByText("Edited")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Save macOS settings" }));
    await waitFor(() => expect(state.patches).toHaveLength(1));
    expect(state.patches[0]).toEqual({ domain: "mdm-macos", body: { macos: { safari: { showFullURL: false } } } });
    expect(await screen.findByText("No unsaved changes")).toBeTruthy();
  });

  it("❗ guardar macOS no borra lo que estaba a medio editar en la app", async () => {
    const user = userEvent.setup();
    mount();
    await macosReady();

    await user.click(card("Tracenium app"));
    await user.click(within(toggle("Require app PIN")).getByRole("button", { name: "Require" }));
    expect(within(card("Tracenium app")).getByText("1 unsaved")).toBeTruthy();

    await user.click(card("macOS"));
    await user.click(within(await screen.findByRole("group", { name: "Show the full website address" })).getByRole("button", { name: "Off" }));
    await user.click(screen.getByRole("button", { name: "Save macOS settings" }));
    await waitFor(() => expect(state.patches).toHaveLength(1));
    await screen.findByText("No unsaved changes");

    // La app sigue con su cambio sin guardar, y sigue sin haberse mandado.
    expect(within(card("Tracenium app")).getByText("1 unsaved")).toBeTruthy();
    await user.click(card("Tracenium app"));
    expect(within(toggle("Require app PIN")).getByRole("button", { name: "Require" })).toHaveAttribute("aria-pressed", "true");
    expect(state.patches.map((p) => p.domain)).toEqual(["mdm-macos"]);
  });

  it("la app guarda por su dominio con la clave canónica `mam`", async () => {
    const user = userEvent.setup();
    mount("&mdmPolicy=app");
    const pin = await screen.findByRole("group", { name: "Require app PIN" });
    await waitFor(() => expect(within(pin).getByRole("button", { name: "Require" })).not.toBeDisabled());
    await user.click(within(pin).getByRole("button", { name: "Require" }));
    await user.click(screen.getByRole("button", { name: "Save app policy" }));
    await waitFor(() => expect(state.patches).toHaveLength(1));
    expect(state.patches[0]).toEqual({ domain: "device-management", body: { mam: { requireUserAuth: true, requireAppPIN: true } } });
  });

  it("❗ un valor fuera de rango no se puede guardar, y se dice cuál", async () => {
    const user = userEvent.setup();
    mount();
    await macosReady();
    await user.type(screen.getByLabelText("Idle time before the screen saver"), "30");
    expect(screen.getByText("Must be 60–3600")).toBeTruthy();
    expect(screen.getByText("Fix “Idle time before the screen saver” before saving")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Save macOS settings" })).toBeDisabled();
  });

  it("Discard devuelve la política a lo guardado", async () => {
    const user = userEvent.setup();
    mount();
    const group = await macosReady();
    await user.click(within(group).getByRole("button", { name: "Off" }));
    await user.click(screen.getByRole("button", { name: "Discard" }));
    expect(screen.getByText("No unsaved changes")).toBeTruthy();
    expect(within(group).getByRole("button", { name: "On" })).toHaveAttribute("aria-pressed", "true");
  });
});

describe("Policies — lo que no llega al Mac", () => {
  it("❗ un ajuste que el perfil no entrega lleva su chip; un «Off» que no se escribe no se puede elegir", async () => {
    mount();
    await macosReady();
    const row = screen.getByText("Require an administrator password to install apps").closest("[data-setting]");
    expect(within(row).getByText("Not sent to Macs")).toBeTruthy();
    const wifi = toggle("Show Wi-Fi in the menu bar");
    expect(within(wifi).getByRole("button", { name: "Off" })).toBeDisabled();
    expect(within(wifi).getByRole("button", { name: "On" })).not.toBeDisabled();
  });

  it("la tarjeta cuenta lo puesto que no se envía", async () => {
    const user = userEvent.setup();
    mount();
    await macosReady();
    await user.click(within(toggle("Require an administrator password to install apps")).getByRole("button", { name: "On" }));
    expect(card("macOS").textContent).toMatch(/2 of 7 set · 1 not sent/);
  });
});

describe("Policies — buscar y filtrar", () => {
  it("«Configured» deja sólo lo puesto; la búsqueda encuentra por nombre", async () => {
    const user = userEvent.setup();
    mount();
    await macosReady();
    await user.click(screen.getByRole("button", { name: "Configured 1" }));
    expect(screen.getAllByRole("group").map((g) => g.getAttribute("aria-labelledby"))).toHaveLength(2); // el filtro + el ajuste
    expect(screen.queryByRole("group", { name: "Show Wi-Fi in the menu bar" })).toBeNull();

    await user.click(screen.getByRole("button", { name: "All 7" }));
    await user.type(screen.getByLabelText("Find a setting"), "wi-fi");
    expect(screen.getByRole("group", { name: "Show Wi-Fi in the menu bar" })).toBeTruthy();
    expect(screen.queryByRole("group", { name: "Show the full website address" })).toBeNull();
  });

  it("sin resultados lo dice y ofrece limpiar la búsqueda", async () => {
    const user = userEvent.setup();
    mount();
    await macosReady();
    await user.type(screen.getByLabelText("Find a setting"), "bluetooth");
    expect(screen.getByText("No settings match “bluetooth”.")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Clear search" }));
    expect(screen.getByRole("group", { name: "Show Wi-Fi in the menu bar" })).toBeTruthy();
  });
});

describe("Policies — actualizaciones por DDM (1-oct)", () => {
  it("⭐ los valores de Apple con su nombre, segmentados; el canal se ve", async () => {
    const user = userEvent.setup();
    mount();
    await macosReady();
    const group = toggle("Download updates automatically");
    expect(within(group).getAllByRole("button").map((b) => b.textContent)).toEqual(["Not set", "User decides", "Always on", "Always off"]);
    const row = group.closest("[data-setting]");
    expect(within(row).getByText("Declaration")).toBeTruthy();
    await user.click(within(group).getByRole("button", { name: "Always on" }));
    await user.click(screen.getByRole("button", { name: "Save macOS settings" }));
    await waitFor(() => expect(state.patches).toHaveLength(1));
    expect(state.patches[0].body.macos.softwareUpdate).toEqual({ automaticDownload: "AlwaysOn" });
  });

  it("❗ la versión mínima sin su fecha límite no se guarda, y se dice cuál falta", async () => {
    const user = userEvent.setup();
    mount();
    await macosReady();
    await user.type(screen.getByLabelText("Minimum required macOS version"), "27.0.1");
    expect(screen.getByText("Needed with “Minimum required macOS version”")).toBeTruthy();
    expect(screen.getByText("Fix “Deadline for the minimum version” before saving")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Save macOS settings" })).toBeDisabled();

    // Con la fecha (el control da minutos; se guarda con segundos, como Apple).
    fireEvent.change(screen.getByLabelText("Deadline for the minimum version"), { target: { value: "2026-10-15T21:00" } });
    await user.click(screen.getByRole("button", { name: "Save macOS settings" }));
    await waitFor(() => expect(state.patches).toHaveLength(1));
    expect(state.patches[0].body.macos.softwareUpdate).toEqual({ enforcedMinimumVersion: "27.0.1", enforcedMinimumDeadline: "2026-10-15T21:00:00" });
  });

  it("una versión con forma rara se marca", async () => {
    const user = userEvent.setup();
    mount();
    await macosReady();
    await user.type(screen.getByLabelText("Minimum required macOS version"), "latest");
    expect(screen.getByText("A version like 27.0.1")).toBeTruthy();
  });
});
