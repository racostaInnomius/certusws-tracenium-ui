// src/pages/DeviceManagement.mdm.test.jsx
//
// Las pestañas nuevas de MDM / MAM (28-sep-2026): Overview, Devices y
// Enrollment contra `/api/v1/mdm/*`. Lo que importa: que el alta mande lo
// que el servidor espera, que el estado salga del servidor y no de la
// página, y que sin la capacidad `enrollment` no se llame a la API.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { server, http, HttpResponse } from "../test/msw/server";
import { ConfirmProvider } from "../components/common/ConfirmDialog";

let capabilities;
vi.mock("../api/roles", () => ({
  getMyCapabilities: () => Promise.resolve(capabilities),
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

const FUTURE = new Date(Date.now() + 86_400_000).toISOString();
const MAC = {
  udid: "36F3B382-4B4B-5025-89CC-115DD69E4F67",
  serialNumber: "CWY6T7FN0F",
  deviceName: "JPR-MacBookPro",
  productName: "Mac15,7",
  model: "Mac15,7",
  osVersion: "27.0",
  buildVersion: "26A428",
  enrollmentState: "enrolled",
  pushReady: true,
  enrolledAt: new Date().toISOString(),
  lastSeenAt: new Date().toISOString(),
  ownership: "byod",
};

let state;
beforeEach(() => {
  capabilities = { role: "ADMIN", permissions: ["device_management", "enrollment"] };
  state = {
    status: { enrollment: { available: true, missing: [] }, commands: { deliverable: false, reason: "no_push_certificate" } },
    devices: [MAC],
    enrollments: [
      { token: "tok-old", clientIdentifier: "CWY6T7FN0F", mode: "byod", expiresAt: FUTURE, downloadCount: 2,
        createdAt: new Date().toISOString(), url: "https://mdm.example.com/enroll/tok-old",
        device: { udid: MAC.udid, state: "enrolled" } },
    ],
    posts: [],
    deletes: [],
    mdmCalls: 0,
  };
});
afterEach(() => {
  cleanup();
  server.resetHandlers();
});

/** El formulario se habilita cuando llega el estado del servicio. */
async function serialField() {
  const field = await screen.findByLabelText(/serial number/i);
  await waitFor(() => expect(field).not.toBeDisabled());
  return field;
}

function mount(search = "") {
  server.use(
    http.get(/\/api\/v1\/mdm\/status$/, () => { state.mdmCalls += 1; return HttpResponse.json(state.status); }),
    http.get(/\/api\/v1\/mdm\/devices$/, () => { state.mdmCalls += 1; return HttpResponse.json({ devices: state.devices }); }),
    http.get(/\/api\/v1\/mdm\/enrollments/, () => { state.mdmCalls += 1; return HttpResponse.json({ enrollments: state.enrollments }); }),
    http.post(/\/api\/v1\/mdm\/enrollments$/, async ({ request }) => {
      const body = await request.json();
      state.posts.push(body);
      const created = {
        token: "tok-new", url: "https://mdm.example.com/enroll/tok-new", clientIdentifier: body.clientIdentifier,
        mode: body.mode, expiresAt: FUTURE,
      };
      state.enrollments = [{ ...created, downloadCount: 0, createdAt: new Date().toISOString(), device: null }, ...state.enrollments];
      return HttpResponse.json(created, { status: 201 });
    }),
    http.delete(/\/api\/v1\/mdm\/enrollments\/[^/]+$/, ({ request }) => {
      state.deletes.push(new URL(request.url).pathname.split("/").pop());
      return HttpResponse.json({ revoked: true });
    }),
    http.all(/.*\/api\/.*/, () =>
      HttpResponse.json({ ok: true, items: [], groups: [], policy: { policy_version: 1, policy_hash: "h", policy_json: {} } })
    )
  );
  window.history.replaceState({}, "", `/?page=device-management${search}`);
  render(<ConfirmProvider><DeviceManagement onNavigate={vi.fn()} /></ConfirmProvider>);
}

describe("MDM / MAM — Overview", () => {
  it("dice lo que funciona hoy: se enrola, los comandos no se entregan", async () => {
    mount();
    expect(await screen.findByText("Available")).toBeTruthy();
    expect(screen.getByText("Not delivered yet")).toBeTruthy();
    expect(screen.getByText(/can't wake them to deliver commands/i)).toBeTruthy();
  });

  it("sin configuración de alta, dice qué falta", async () => {
    state.status = { enrollment: { available: false, missing: ["apns_topic"] }, commands: { deliverable: false } };
    mount();
    expect(await screen.findByText("Not set up")).toBeTruthy();
    expect(screen.getByText(/still needs the Apple push topic/i)).toBeTruthy();
  });
});

describe("MDM / MAM — Devices", () => {
  it("el Mac enrolado sale con su canal y su estado, y el cajón enseña su UDID", async () => {
    mount("&mdmTab=devices");
    const row = (await screen.findByText("JPR-MacBookPro")).closest("tr");
    expect(within(row).getByText("MDM · Personal")).toBeTruthy();
    expect(within(row).getByText("Enrolled")).toBeTruthy();

    await userEvent.click(row);
    const detail = await screen.findByLabelText("Device detail");
    expect(within(detail).getByText(MAC.udid)).toBeTruthy();
    expect(within(detail).getByText(/27\.0 \(26A428\)/)).toBeTruthy();
  });
});

describe("MDM / MAM — Enrollment", () => {
  it("❗ el alta manda serie, propiedad y caducidad — y enseña el enlace", async () => {
    const user = userEvent.setup();
    mount("&mdmTab=enrollment");

    await user.type(await serialField(), "C02XK1ABJG5H");
    await user.click(screen.getByRole("button", { name: /personal \(byod\)/i }));
    await user.click(screen.getByLabelText(/link expires in/i));
    await user.click(await screen.findByRole("option", { name: "7 days" }));
    await user.click(screen.getByRole("button", { name: /create enrollment link/i }));

    await waitFor(() => expect(state.posts).toHaveLength(1));
    expect(state.posts[0]).toEqual({ clientIdentifier: "C02XK1ABJG5H", mode: "byod", expiresInHours: 168 });
    expect(await screen.findByDisplayValue("https://mdm.example.com/enroll/tok-new")).toBeTruthy();
    // La lista se vuelve a pedir y trae el alta nueva.
    expect(await screen.findByText("Not opened yet")).toBeTruthy();
  });

  it("❗ un número de serie inválido no llega al servidor", async () => {
    const user = userEvent.setup();
    mount("&mdmTab=enrollment");
    const field = await serialField();
    await user.type(field, "con espacios");
    expect(field).toHaveValue("con espacios");
    await user.click(screen.getByRole("button", { name: /create enrollment link/i }));
    expect(await screen.findByText(/letters, digits, dots, dashes and underscores only/i)).toBeTruthy();
    expect(state.posts).toHaveLength(0);
  });

  it("revocar pregunta antes y llama al servidor con el token", async () => {
    const user = userEvent.setup();
    mount("&mdmTab=enrollment");
    await user.click(await screen.findByRole("button", { name: /revoke link for CWY6T7FN0F/i }));
    expect(await screen.findByText(/a device that already enrolled stays enrolled/i)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: /^revoke link$/i }));
    await waitFor(() => expect(state.deletes).toEqual(["tok-old"]));
  });

  it("❗ sin configuración de alta, el formulario no se puede enviar", async () => {
    state.status = { enrollment: { available: false, missing: ["enrollment_url"] }, commands: { deliverable: false } };
    mount("&mdmTab=enrollment");
    expect(await screen.findByText(/still needs the enrollment address/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: /create enrollment link/i })).toBeDisabled();
  });

  it("avisa de que lo enrolado hoy tendrá que re-enrolarse con el certificado", async () => {
    mount("&mdmTab=enrollment");
    expect(await screen.findByText(/will need to enroll again then/i)).toBeTruthy();
  });
});

describe("MDM / MAM — sin la capacidad Enrollment", () => {
  it("❗ no llama a la API de MDM ni ofrece dar de alta", async () => {
    capabilities = { role: "Mobile Operator", permissions: ["device_management"] };
    mount("&mdmTab=enrollment");
    expect(await screen.findByText(/needs the enrollment capability/i)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /enroll a device/i })).toBeNull();
    expect(state.mdmCalls).toBe(0);
  });
});
