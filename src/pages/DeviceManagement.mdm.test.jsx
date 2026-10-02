// src/pages/DeviceManagement.mdm.test.jsx
//
// Las pestañas nuevas de MDM / MAM (28-sep-2026): Overview, Devices y
// Enrollment contra `/api/v1/mdm/*`. Lo que importa: que el alta mande lo
// que el servidor espera, que el estado salga del servidor y no de la
// página, y que sin la capacidad `enrollment` no se llame a la API.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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
const downloads = [];
vi.mock("../utils/browserState", async (importOriginal) => ({
  ...(await importOriginal()),
  downloadTextFile: (filename, content) => downloads.push({ filename, content }),
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
    wakes: [],
    actionPosts: [],
    cancels: [],
    removalPosts: [],
    removalDeletes: 0,
    actions: {
      platform: "macos", ownership: "corporate", supervised: true,
      actions: ["refresh_inventory", "installed_apps", "lock", "restart", "erase"].map((action) => ({ action, available: true, reason: null })),
      commands: [], information: null, apps: null,
    },
    wakeReply: { requested: true, canDeliver: true, blocker: null },
    mdmCalls: 0,
    setup: {
      pushCertificate: { configured: false, state: "missing", pendingRequestAt: null, appleAccount: null },
      requests: { available: true, vendorCertificate: "ok", keyStorage: true },
      portalUrl: "https://identity.apple.com/pushcert/",
      devices: { enrolled: 1, onOtherTopic: 1 },
    },
    requests: 0,
    puts: [],
    putReplies: [],
    osUpdate: {
      scheduled: null,
      device: { osVersion: "27.0", buildVersion: "26A428", installState: "none", pendingVersion: null, failureReason: null, reportedAt: new Date().toISOString() },
    },
    osPuts: [],
    osDeletes: 0,
    orgProfile: { delivery: null },
    orgResends: 0,
    ddm: { reportedAt: null, declarations: [], inventory: null },
  };
  downloads.length = 0;
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

/** `extra`: handlers que van delante del comodín de `/api/` del final. */
function mount(search = "", extra = []) {
  server.use(
    ...extra,
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
    http.get(/\/api\/v1\/mdm\/push-certificate$/, () => HttpResponse.json(state.setup)),
    http.get(/\/api\/v1\/mdm\/devices\/[^/]+\/os-update$/, () => HttpResponse.json(state.osUpdate)),
    http.get(/\/api\/v1\/mdm\/devices\/[^/]+\/organization-profile$/, () => HttpResponse.json(state.orgProfile)),
    http.get(/\/api\/v1\/mdm\/devices\/[^/]+\/ddm$/, () => HttpResponse.json(state.ddm)),
    http.get(/\/api\/v1\/mdm\/devices\/[^/]+\/actions$/, () => HttpResponse.json(state.actions)),
    http.post(/\/api\/v1\/mdm\/devices\/[^/]+\/actions\/[^/]+$/, async ({ request }) => {
      const action = new URL(request.url).pathname.split("/").pop();
      state.actionPosts.push({ action, body: await request.json() });
      state.actions = { ...state.actions, commands: [{ commandUuid: `cmd-${state.actionPosts.length}`, requestType: "DeviceLock", status: "pending", issuedBy: "admin-1", issuedAt: new Date().toISOString() }, ...state.actions.commands] };
      return HttpResponse.json({ requested: true, commandUuid: `cmd-${state.actionPosts.length}`, requestType: "DeviceLock" });
    }),
    http.delete(/\/api\/v1\/mdm\/devices\/[^/]+\/commands\/[^/]+$/, ({ request }) => {
      const uuid = new URL(request.url).pathname.split("/").pop();
      state.cancels.push(uuid);
      state.actions = { ...state.actions, commands: state.actions.commands.map((c) => (c.commandUuid === uuid ? { ...c, status: "expired" } : c)) };
      return HttpResponse.json({ cancelled: true, requestType: "DeviceLock" });
    }),
    http.post(/\/api\/v1\/mdm\/devices\/[^/]+\/removal$/, async ({ request }) => {
      const body = await request.json();
      state.removalPosts.push(body);
      state.actions = {
        ...state.actions,
        actions: state.actions.actions.map((a) => ({ ...a, available: false, reason: "removal_pending" })),
        removal: { state: "waiting", requestedAt: new Date().toISOString(), requestedBy: "admin-1", reason: body.reason, error: null, canCancel: true, canRetry: false },
      };
      state.devices = state.devices.map((d) => ({ ...d, removal: { requestedAt: new Date().toISOString(), requestedBy: "admin-1", reason: body.reason } }));
      return HttpResponse.json({ requested: true, commandUuid: "cmd-pl" });
    }),
    http.delete(/\/api\/v1\/mdm\/devices\/[^/]+\/removal$/, () => {
      state.removalDeletes += 1;
      state.actions = { ...state.actions, removal: null };
      state.devices = state.devices.map((d) => ({ ...d, removal: null }));
      return HttpResponse.json({ cancelled: true });
    }),
    http.post(/\/api\/v1\/mdm\/devices\/[^/]+\/wake$/, ({ request }) => {
      state.wakes.push(new URL(request.url).pathname);
      return HttpResponse.json(state.wakeReply);
    }),
    http.post(/\/api\/v1\/mdm\/devices\/[^/]+\/organization-profile\/resend$/, () => {
      state.orgResends += 1;
      state.orgProfile = { delivery: null };
      return HttpResponse.json({ resent: true });
    }),
    http.put(/\/api\/v1\/mdm\/devices\/[^/]+\/os-update$/, async ({ request }) => {
      const body = await request.json();
      state.osPuts.push({ path: new URL(request.url).pathname, body });
      state.osUpdate = { ...state.osUpdate, scheduled: { ...body, requestedAt: new Date().toISOString() } };
      return HttpResponse.json({ ...state.osUpdate, commandUuid: "cmd-1" });
    }),
    http.delete(/\/api\/v1\/mdm\/devices\/[^/]+\/os-update$/, () => {
      state.osDeletes += 1;
      state.osUpdate = { ...state.osUpdate, scheduled: null };
      return HttpResponse.json({ cancelled: true });
    }),
    http.post(/\/api\/v1\/mdm\/push-certificate\/request$/, () => {
      state.requests += 1;
      return HttpResponse.json(
        { filename: "Tracenium-PushCertificateRequest-2026-09-28.plist", content: "UExJU1Q=", requestedAt: new Date().toISOString() },
        { status: 201 }
      );
    }),
    http.put(/\/api\/v1\/mdm\/push-certificate$/, async ({ request }) => {
      state.puts.push(await request.json());
      const reply = state.putReplies.shift();
      if (reply) return HttpResponse.json(reply.body, { status: reply.status });
      return HttpResponse.json({ ...state.setup, topicChanged: false });
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
  it("❗ dice lo que funciona hoy: los comandos llegan; sin push, en la conexión automática (~4 h)", async () => {
    mount();
    expect(await screen.findByText("Available")).toBeTruthy();
    expect(screen.getByText("On check-in, ~4 h")).toBeTruthy();
    expect(screen.getByText(/automatic check-in, about every 4 hours/i)).toBeTruthy();
    expect(screen.queryByText(/can't wake them to deliver commands/i)).toBeNull();
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

// 1-oct-2026: el primer iPhone del app en T1 sincronizaba bien y el Overview
// decía «App (MAM) devices 0». La página cuenta los clientes del app con la
// `platform` de `/orchestrator/known-devices`, y el servidor la devolvía en
// null para los móviles. Estas filas son las que devuelve ahora.
const IPHONE_APP = {
  deviceId: "24b02f7d-3815-410a-807d-ae941447b0b7",
  hostname: "iPhone",
  connected: false,
  enrollmentStatus: "active",
  agentVersion: "1.0.0",
  platform: "ios",
  arch: null,
  // Lo apunta el plano de dispositivo; antes era null para siempre.
  lastSeenAt: new Date(Date.now() - 5 * 60_000).toISOString(),
};
const WINDOWS_PC = {
  deviceId: "pc-1",
  hostname: "TNS-PC-01",
  connected: true,
  enrollmentStatus: "active",
  platform: "windows",
  lastSeenAt: new Date().toISOString(),
};
const knownDevices = (items) =>
  http.get(/\/api\/v1\/orchestrator\/known-devices/, () =>
    HttpResponse.json({ ok: true, items, total: items.length, page: 1, pageSize: 100 })
  );

describe("MDM / MAM — clientes del app (known-devices)", () => {
  it("⭐ el iPhone del app cuenta en «App (MAM) devices»; un PC no, ni una fila sin plataforma", async () => {
    // La fila sin plataforma es la forma de la respuesta de antes del arreglo:
    // la página cuenta por `platform` y nada más. Si la contara, saldría 2.
    const sinPlataforma = { ...IPHONE_APP, deviceId: "otro-movil", hostname: "Otro", platform: null };
    mount("", [knownDevices([IPHONE_APP, WINDOWS_PC, sinPlataforma])]);
    // El título y la cifra son hermanos dentro de la tarjeta.
    const card = (await screen.findByText("App (MAM) devices")).parentElement;
    await waitFor(() => expect(within(card).getByText("1")).toBeTruthy());
  });

  it("en Devices sale con su canal y su último contacto, no «—»", async () => {
    mount("&mdmTab=devices", [knownDevices([IPHONE_APP, WINDOWS_PC])]);
    const row = (await screen.findByText("iPhone")).closest("tr");
    expect(within(row).getByText("App (MAM)")).toBeTruthy();
    expect(within(row).getByText("Reporting")).toBeTruthy();
    expect(within(row).getByText("5m ago")).toBeTruthy();
    expect(screen.queryByText("TNS-PC-01")).toBeNull();
  });
});

describe("MDM / MAM — Bootstrap token", () => {
  it("el cajón de un Mac dice si su Bootstrap Token está custodiado", async () => {
    state.devices = [{ ...MAC, bootstrapTokenEscrowedAt: "2026-09-30T20:00:00.000Z" }];
    mount("&mdmTab=devices");
    await userEvent.click((await screen.findByText("JPR-MacBookPro")).closest("tr"));
    const detail = await screen.findByLabelText("Device detail");
    expect(within(detail).getByText(/^Escrowed /)).toBeTruthy();
  });

  it("sin token, lo dice", async () => {
    state.devices = [{ ...MAC, bootstrapTokenEscrowedAt: null }];
    mount("&mdmTab=devices");
    await userEvent.click((await screen.findByText("JPR-MacBookPro")).closest("tr"));
    expect(within(await screen.findByLabelText("Device detail")).getByText("Not escrowed")).toBeTruthy();
  });
});

describe("MDM / MAM — Enrollment", () => {
  it("⭐ «Any device, one use» (ADMIN): el alta va sin número de serie", async () => {
    const user = userEvent.setup();
    mount("&mdmTab=enrollment");
    await serialField();
    await user.click(screen.getByLabelText(/any device, one use/i));
    expect(screen.getByLabelText(/serial number/i)).toBeDisabled();
    await user.click(screen.getByRole("button", { name: /create enrollment link/i }));
    await waitFor(() => expect(state.posts).toHaveLength(1));
    expect(state.posts[0]).toMatchObject({ anyDevice: true });
    expect(state.posts[0].clientIdentifier).toBeUndefined();
  });

  it("la lista dice a qué equipo quedó atado un enlace «Any device»", async () => {
    state.enrollments = [{
      ...state.enrollments[0], token: "tok-any", clientIdentifier: "any-xyz", anyDevice: true,
      boundTo: { serial: "DMPXYZ123", udid: "00008112-IPAD", at: new Date().toISOString() },
    }];
    mount("&mdmTab=enrollment");
    expect(await screen.findByText("Any device · DMPXYZ123")).toBeTruthy();
  });

  it("❗ sin ADMIN/OWNER no se ofrece «Any device»", async () => {
    capabilities = { role: "Mobile Operator", permissions: ["device_management", "enrollment"] };
    mount("&mdmTab=enrollment");
    await serialField();
    expect(screen.queryByLabelText(/any device, one use/i)).toBeNull();
  });

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
    expect(await screen.findByText(/after enrolling again, because push is tied to the certificate/i)).toBeTruthy();
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

const PEM = "-----BEGIN CERTIFICATE-----\nMIIBfakecertificate\n-----END CERTIFICATE-----\n";
const pemFile = () => new File([PEM], "MDM_ Certus ITM LLC_Certificate.pem", { type: "application/x-pem-file" });

describe("MDM / MAM — Apple setup", () => {
  it("❗ descarga la solicitud firmada tal como la devuelve el servidor", async () => {
    const user = userEvent.setup();
    mount("&mdmTab=apple-setup");
    expect(await screen.findByText("Not set up")).toBeTruthy();
    expect(screen.getByText(/1 enrolled device will need to enroll again/i)).toBeTruthy();

    const download = await screen.findByRole("button", { name: /download request/i });
    await waitFor(() => expect(download).not.toBeDisabled());
    await user.click(download);
    await waitFor(() => expect(downloads).toHaveLength(1));
    expect(downloads[0]).toEqual({ filename: "Tracenium-PushCertificateRequest-2026-09-28.plist", content: "UExJU1Q=" });
    expect(screen.getByRole("link", { name: /open apple push certificates portal/i }).getAttribute("href")).toBe(
      "https://identity.apple.com/pushcert/"
    );
  });

  it("❗ sin certificado de proveedor, no se puede descargar y dice por qué", async () => {
    state.setup.requests = { available: false, vendorCertificate: "not_configured", keyStorage: true };
    mount("&mdmTab=apple-setup");
    expect(await screen.findByText(/waiting for Apple to issue its MDM vendor certificate/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: /download request/i })).toBeDisabled();
  });

  it("❗ instala el .pem con la Apple Account", async () => {
    const user = userEvent.setup();
    mount("&mdmTab=apple-setup");
    await screen.findByText("Not set up");
    await user.upload(screen.getByTestId("push-certificate-file"), pemFile());
    expect(await screen.findByText("MDM_ Certus ITM LLC_Certificate.pem")).toBeTruthy();
    await user.type(screen.getByLabelText(/apple account/i), "it@certusitm.com");
    await user.click(screen.getByRole("button", { name: /install certificate/i }));

    await waitFor(() => expect(state.puts).toHaveLength(1));
    expect(state.puts[0]).toEqual({ certificate: PEM, appleAccount: "it@certusitm.com" });
  });

  it("❗ si cambia el Topic, pregunta antes y sólo entonces confirma", async () => {
    const user = userEvent.setup();
    state.setup.pushCertificate = {
      configured: true, state: "valid", topic: "com.apple.mgmt.External.aaaa", appleAccount: "it@certusitm.com",
      notAfter: "2027-09-28T00:00:00Z", uploadedAt: "2026-09-28T00:00:00Z", pendingRequestAt: null,
    };
    state.putReplies.push({
      status: 409,
      body: { error: "topic_changed", message: "different topic", currentTopic: "com.apple.mgmt.External.aaaa",
        newTopic: "com.apple.mgmt.External.bbbb", currentAppleAccount: "it@certusitm.com" },
    });
    mount("&mdmTab=apple-setup");
    expect(await screen.findByText("com.apple.mgmt.External.aaaa")).toBeTruthy();
    // La cuenta con la que se creó viene puesta: renovar con otra cambia el Topic.
    expect(screen.getByLabelText(/apple account/i)).toHaveValue("it@certusitm.com");

    await user.upload(screen.getByTestId("push-certificate-file"), pemFile());
    await user.clear(screen.getByLabelText(/apple account/i));
    await user.type(screen.getByLabelText(/apple account/i), "otra@certusitm.com");
    await user.click(screen.getByRole("button", { name: /install certificate/i }));

    expect(await screen.findByText(/every mac, iphone and ipad will have to enroll again/i)).toBeTruthy();
    expect(state.puts).toHaveLength(1);
    await user.click(screen.getByRole("button", { name: /replace and re-enroll/i }));
    await waitFor(() => expect(state.puts).toHaveLength(2));
    expect(state.puts[1]).toMatchObject({ appleAccount: "otra@certusitm.com", confirmTopicChange: true });
  });

  it("❗ quien no es ADMIN/OWNER lo ve, pero no puede cambiarlo", async () => {
    capabilities = { role: "Mobile Operator", permissions: ["device_management", "enrollment"] };
    mount("&mdmTab=apple-setup");
    expect(await screen.findByText(/only tenant admins and owners/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: /download request/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /choose \.pem file/i })).toBeDisabled();
  });

  it("❗ sin la capacidad Enrollment la pestaña no existe", async () => {
    capabilities = { role: "Mobile Operator", permissions: ["device_management"] };
    mount("&mdmTab=apple-setup");
    expect(await screen.findByRole("tab", { name: /overview/i })).toBeTruthy();
    expect(screen.queryByRole("tab", { name: /apple setup/i })).toBeNull();
  });

  it("Overview enseña el certificado y, con él instalado, no culpa al certificado", async () => {
    state.status = {
      enrollment: { available: true, missing: [], topicSource: "organization" },
      pushCertificate: { configured: true, state: "expiring", daysLeft: 12 },
      commands: { deliverable: false, reason: "sender_not_available" },
    };
    mount();
    expect(await screen.findByText("Expires in 12 days")).toBeTruthy();
    expect(screen.getByText(/the apple push certificate is installed/i)).toBeTruthy();
    expect(screen.queryByText(/until the Apple push certificate is set up/i)).toBeNull();
  });

  it("❗ un equipo con otro Topic sale como «Re-enroll needed»", async () => {
    state.devices = [{ ...MAC, needsReEnrollment: true }];
    mount("&mdmTab=devices");
    const row = (await screen.findByText("JPR-MacBookPro")).closest("tr");
    expect(within(row).getByText("Re-enroll needed")).toBeTruthy();
  });
});

describe("MDM / MAM — forzar una actualización del sistema (DDM)", () => {
  async function openMac() {
    mount("&mdmTab=devices");
    await userEvent.click((await screen.findByText("JPR-MacBookPro")).closest("tr"));
    return screen.findByLabelText("OS update");
  }
  const MAC_27 = { version: "27.0.1", build: "26A434", label: "macOS 27.0.1-26A434", title: "macOS 27.0.1" };
  const TAHOE = { version: "26.7.1", build: "25G241", label: "macOS Tahoe 26.7.1-25G241", title: "macOS Tahoe 26.7.1" };
  const linked = (updates) => ({ status: "linked", agentId: "mac-1", scannedAt: new Date().toISOString(), updates });
  async function pickDateTime(panel) {
    const due = new Date(Date.now() + 2 * 86_400_000);
    const day = `${due.getFullYear()}-${String(due.getMonth() + 1).padStart(2, "0")}-${String(due.getDate()).padStart(2, "0")}`;
    fireEvent.change(within(panel).getByLabelText("Install by"), { target: { value: day } });
    fireEvent.change(within(panel).getByLabelText("Device time"), { target: { value: "21:00" } });
    return day;
  }

  it("❗ «sin fallos» del Mac ({}) no sale como «{}» en rojo (30-sep, JPR-MacBookPro en prepared)", async () => {
    state.osUpdate.device = { ...state.osUpdate.device, installState: "prepared", failureReason: {} };
    const panel = await openMac();
    expect(await within(panel).findByText("Ready to install")).toBeTruthy();
    expect(within(panel).queryByText("{}")).toBeNull();
  });

  it("⭐ cumplida: el Mac ya informa esa versión → «is installed», sin «Cancel update» ni «different update»", async () => {
    state.osUpdate.scheduled = {
      targetOSVersion: "27.0.1", targetBuildVersion: "26A434", targetLocalDateTime: "2026-09-30T21:00:00", status: "installed",
    };
    state.osUpdate.device = { ...state.osUpdate.device, osVersion: "27.0.1", buildVersion: "26A434", installState: "none" };
    const panel = await openMac();
    expect(await within(panel).findByText(/is installed — the forced update is done/)).toBeTruthy();
    expect(within(panel).queryByRole("button", { name: "Cancel update" })).toBeNull();
    expect(within(panel).queryByText(/is forced by/)).toBeNull();
    expect(within(panel).queryByText("Schedule a different update:")).toBeNull();
  });

  it("❗ el cajón no dice que no se le pueden mandar comandos: llegan en su conexión automática", async () => {
    mount("&mdmTab=devices");
    await userEvent.click((await screen.findByText("JPR-MacBookPro")).closest("tr"));
    expect(await screen.findByText(/it picks commands up on its automatic check-in, about every 4 hours\. With the Apple push certificate set up, Tracenium wakes it/i)).toBeTruthy();
    expect(screen.queryByText(/once the Apple push certificate is set up/i)).toBeNull();
  });

  it("⭐ la versión sale del escaneo del agente: una sola candidata va elegida y se manda tal cual", async () => {
    const user = userEvent.setup();
    state.osUpdate.detected = linked([MAC_27]);
    const panel = await openMac();
    expect(await within(panel).findByText("macOS 27.0.1 (26A434)")).toBeTruthy();
    expect(within(panel).getByText(/from the tracenium agent's scan of this mac/i)).toBeTruthy();
    expect(within(panel).queryByLabelText("Version")).toBeNull();
    const day = await pickDateTime(panel);
    await user.click(within(panel).getByRole("button", { name: "Schedule update" }));
    await user.click(await screen.findByRole("button", { name: "Schedule update", hidden: false }));
    await waitFor(() => expect(state.osPuts).toHaveLength(1));
    expect(state.osPuts[0].body).toEqual({ targetOSVersion: "27.0.1", targetBuildVersion: "26A434", targetLocalDateTime: `${day}T21:00:00` });
  });

  it("❗ con varias candidatas (26.7.1 o 27.0.1) no se elige por el operador", async () => {
    const user = userEvent.setup();
    state.osUpdate.detected = linked([MAC_27, TAHOE]);
    const panel = await openMac();
    await within(panel).findByLabelText("Update");
    await pickDateTime(panel);
    await user.click(within(panel).getByRole("button", { name: "Schedule update" }));
    expect(await within(panel).findByText("Choose the update to force.")).toBeTruthy();
    expect(state.osPuts).toHaveLength(0);

    await user.click(within(panel).getByLabelText("Update"));
    await user.click(await screen.findByRole("option", { name: "macOS Tahoe 26.7.1 (25G241)" }));
    await user.click(within(panel).getByRole("button", { name: "Schedule update" }));
    await user.click(await screen.findByRole("button", { name: "Schedule update", hidden: false }));
    await waitFor(() => expect(state.osPuts).toHaveLength(1));
    expect(state.osPuts[0].body).toMatchObject({ targetOSVersion: "26.7.1", targetBuildVersion: "25G241" });
  });

  it("escribirla a mano sigue ahí, con el aviso de que ningún escaneo la confirma", async () => {
    const user = userEvent.setup();
    state.osUpdate.detected = linked([MAC_27]);
    const panel = await openMac();
    await user.click(await within(panel).findByRole("button", { name: "Enter a version manually" }));
    expect(within(panel).getByLabelText("Version")).toBeTruthy();
    expect(within(panel).getByText(/not confirmed by a scan of this mac/i)).toBeTruthy();
    await user.click(within(panel).getByRole("button", { name: "Pick a detected update" }));
    expect(within(panel).queryByLabelText("Version")).toBeNull();
  });

  it("un Mac sin agente: a mano, y dice por qué", async () => {
    state.osUpdate.detected = { status: "no_agent" };
    const panel = await openMac();
    expect(await within(panel).findByText(/no tracenium agent reports this mac's serial number/i)).toBeTruthy();
    expect(within(panel).getByLabelText("Version")).toBeTruthy();
    expect(within(panel).queryByRole("button", { name: "Enter a version manually" })).toBeNull();
  });

  it("enseña lo que informa el Mac: versión y estado de la instalación", async () => {
    state.osUpdate.device = { ...state.osUpdate.device, installState: "downloading", pendingVersion: { "os-version": "27.0.1" } };
    const panel = await openMac();
    expect(await within(panel).findByText("Downloading")).toBeTruthy();
    expect(within(panel).getByText("27.0.1")).toBeTruthy();
  });

  it("❗ programar manda la hora TAL CUAL (hora del Mac, no del navegador), tras confirmar", async () => {
    const user = userEvent.setup();
    const panel = await openMac();
    await user.type(within(panel).getByLabelText("Version"), "27.0.1");
    await user.type(within(panel).getByLabelText("Build (optional)"), "26A434");
    const due = new Date(Date.now() + 2 * 86_400_000);
    const day = `${due.getFullYear()}-${String(due.getMonth() + 1).padStart(2, "0")}-${String(due.getDate()).padStart(2, "0")}`;
    fireEvent.change(within(panel).getByLabelText("Install by"), { target: { value: day } });
    fireEvent.change(within(panel).getByLabelText("Device time"), { target: { value: "18:00" } });
    await user.click(within(panel).getByRole("button", { name: "Schedule update" }));

    expect(await screen.findByText(/installs it and restarts on its own/)).toBeTruthy();
    expect(state.osPuts).toHaveLength(0);
    await user.click(screen.getByRole("button", { name: "Schedule update", hidden: false }));
    await waitFor(() => expect(state.osPuts).toHaveLength(1));
    expect(state.osPuts[0].path).toMatch(/\/devices\/36F3B382-4B4B-5025-89CC-115DD69E4F67\/os-update$/);
    expect(state.osPuts[0].body).toEqual({ targetOSVersion: "27.0.1", targetBuildVersion: "26A434", targetLocalDateTime: `${day}T18:00:00` });
    expect(await within(panel).findByText(/is forced by/)).toBeTruthy();
  });

  it("una versión mal escrita no llega al servidor", async () => {
    const user = userEvent.setup();
    const panel = await openMac();
    await user.type(within(panel).getByLabelText("Version"), "27");
    await user.click(within(panel).getByRole("button", { name: "Schedule update" }));
    expect(await within(panel).findByText(/for example 27\.0\.1/)).toBeTruthy();
    expect(state.osPuts).toHaveLength(0);
  });

  it("cancelar pide confirmación y llama al servidor", async () => {
    const user = userEvent.setup();
    state.osUpdate.scheduled = { targetOSVersion: "27.0.1", targetBuildVersion: null, targetLocalDateTime: "2026-10-02T18:00:00" };
    const panel = await openMac();
    await user.click(await within(panel).findByRole("button", { name: "Cancel update" }));
    await user.click(await screen.findByRole("button", { name: /^cancel update$/i, hidden: false }));
    await waitFor(() => expect(state.osDeletes).toBe(1));
  });

  it("❗ sin ADMIN/OWNER se ve el estado, pero no se puede programar", async () => {
    capabilities = { role: "Mobile Operator", permissions: ["device_management", "enrollment"] };
    const panel = await openMac();
    expect(await within(panel).findByText(/only tenant admins and owners can force/i)).toBeTruthy();
    expect(within(panel).queryByRole("button", { name: "Schedule update" })).toBeNull();
  });
});

describe("MDM / MAM — el perfil de la organización en el Mac (1-oct)", () => {
  async function openMac() {
    mount("&mdmTab=devices");
    await userEvent.click((await screen.findByText("JPR-MacBookPro")).closest("tr"));
    return screen.findByLabelText("Organization profile");
  }

  it("⭐ el cajón dice que el Mac lo tiene instalado, con cuántos ajustes", async () => {
    state.orgProfile = { delivery: { requestType: "InstallProfile", status: "installed", settingsCount: 6, enqueuedAt: new Date().toISOString(), completedAt: new Date().toISOString() } };
    const panel = await openMac();
    expect(await within(panel).findByText("Installed")).toBeTruthy();
    expect(within(panel).getByText(/^6 settings, installed/)).toBeTruthy();
  });

  it("«Resend» lo vuelve a mandar (ADMIN/OWNER)", async () => {
    const user = userEvent.setup();
    state.orgProfile = { delivery: { requestType: "InstallProfile", status: "error", settingsCount: 6, errorChain: [{ LocalizedDescription: "Profile installation failed." }] } };
    const panel = await openMac();
    expect(await within(panel).findByText(/rejected the profile: Profile installation failed/)).toBeTruthy();
    await user.click(within(panel).getByRole("button", { name: "Resend" }));
    await waitFor(() => expect(state.orgResends).toBe(1));
    expect(await within(panel).findByText("Not sent yet")).toBeTruthy();
  });

  it("sin ADMIN/OWNER se ve el estado, sin «Resend»", async () => {
    capabilities = { role: "Mobile Operator", permissions: ["device_management", "enrollment"] };
    state.orgProfile = { delivery: { requestType: "InstallProfile", status: "pending", settingsCount: 6, enqueuedAt: new Date().toISOString() } };
    const panel = await openMac();
    expect(await within(panel).findByText("Waiting for the Mac")).toBeTruthy();
    expect(within(panel).queryByRole("button", { name: "Resend" })).toBeNull();
  });
});


// ── DDM del Mac (1-oct-2026): inventario sin agente y estado de cada declaración ──

describe("MDM / MAM — DDM del Mac (1-oct)", () => {
  async function openMac() {
    mount("&mdmTab=devices");
    await userEvent.click((await screen.findByText("JPR-MacBookPro")).closest("tr"));
    return screen.findByLabelText("Device status");
  }

  it("⭐ el cajón enseña lo que informa el Mac y qué hizo con cada declaración", async () => {
    state.ddm = {
      reportedAt: new Date().toISOString(),
      inventory: {
        marketingName: "MacBook Pro (14-inch, Nov 2023)", modelIdentifier: "Mac15,7", osVersion: "27.0.1", buildVersion: "26A434",
        backgroundSecurityImprovement: "a", fileVault: true, batteryHealth: "service-recommended", lockdownMode: false,
        enrollmentType: "supervised", betaProgram: null, certificates: [{ subject: "JPR-MacBookPro", isIdentity: true }], packages: [], managedApps: [],
      },
      declarations: [
        { identifier: "com.tracenium.status-subscriptions", kind: "configuration", purpose: "status_reporting", state: "applied", reasons: [] },
        { identifier: "com.tracenium.softwareupdate.settings", kind: "configuration", purpose: "software_update_settings", state: "invalid",
          reasons: [{ code: "Error.InvalidPayload", description: "The Beta key isn't supported." }] },
        { identifier: "com.tracenium.activation.default", kind: "activation", purpose: "activation", state: "applied", reasons: [] },
      ],
    };
    const panel = await openMac();
    expect(await within(panel).findByText("MacBook Pro (14-inch, Nov 2023)")).toBeTruthy();
    expect(within(panel).getByText("27.0.1 (a) · 26A434")).toBeTruthy();
    expect(within(panel).getByText("Service recommended")).toBeTruthy();
    expect(within(panel).getByText("Supervised")).toBeTruthy();
    expect(within(panel).getByText("JPR-MacBookPro · identity")).toBeTruthy();
    const decls = within(panel).getByLabelText("Declarations");
    expect(within(decls).getByText("Status reporting")).toBeTruthy();
    expect(within(decls).getByText("Applied")).toBeTruthy();
    expect(within(decls).getByText("Rejected by the Mac")).toBeTruthy();
    expect(within(decls).getByText("The Beta key isn't supported")).toBeTruthy();
    // La activación es fontanería: no se enseña si va bien.
    expect(within(decls).queryByText("Activation")).toBeNull();
  });

  it("sin informe todavía lo dice, sin inventar valores", async () => {
    const panel = await openMac();
    expect(await within(panel).findByText("The Mac reports its status after its next check-in.")).toBeTruthy();
  });

  it("❗ la versión mínima de la política se ve en el Mac, pero no se cancela desde aquí", async () => {
    state.osUpdate = {
      ...state.osUpdate,
      scheduled: { targetOSVersion: "27.0.1", targetBuildVersion: null, targetLocalDateTime: "2026-10-15T21:00:00", requestedAt: new Date().toISOString(), status: "pending", source: "policy" },
    };
    mount("&mdmTab=devices");
    await userEvent.click((await screen.findByText("JPR-MacBookPro")).closest("tr"));
    const panel = await screen.findByLabelText("OS update");
    expect(await within(panel).findByText(/is the macOS policy's minimum, required by/)).toBeTruthy();
    expect(within(panel).getByText(/Change it in Policies › macOS › Software updates/)).toBeTruthy();
    expect(within(panel).queryByRole("button", { name: "Cancel update" })).toBeNull();
  });
});

describe("MDM / MAM — Apple push (aviso de MDM, 2-oct-2026)", () => {
  const PUSHABLE = { ...MAC, topic: "com.apple.mgmt.External.x", push: { requestedAt: null, sentAt: new Date(Date.now() - 5 * 60_000).toISOString(), error: null, failures: 0 } };
  async function openDrawer() {
    mount("&mdmTab=devices");
    await userEvent.click((await screen.findByText("JPR-MacBookPro")).closest("tr"));
    return screen.findByLabelText("Device detail");
  }

  it("⭐ con el certificado y el emisor funcionando: «Within seconds», y el cajón dice cuándo lo despertó", async () => {
    state.status = { ...state.status, pushCertificate: { configured: true, state: "valid", daysLeft: 300 }, commands: { deliverable: true, reason: null } };
    state.devices = [PUSHABLE];
    mount();
    expect(await screen.findByText("Within seconds")).toBeTruthy();
    expect(screen.getByText(/Tracenium wakes Macs, iPhones and iPads through Apple push/i)).toBeTruthy();
    cleanup();
    const drawer = await openDrawer();
    expect(within(drawer).getByText(/Tracenium wakes it through Apple push: commands arrive within seconds\. Last woken 5m ago\./)).toBeTruthy();
  });

  it("❗ «Ask to check in» pide el aviso y dice si saldrá; sin certificado, lo avisa", async () => {
    state.devices = [PUSHABLE];
    const drawer = await openDrawer();
    await userEvent.click(within(drawer).getByRole("button", { name: "Ask to check in" }));
    expect(await screen.findByText(/Asked JPR-MacBookPro to check in\. It should connect within a minute\./)).toBeTruthy();
    expect(state.wakes).toEqual([`/api/v1/mdm/devices/${MAC.udid}/wake`]);

    state.wakeReply = { requested: true, canDeliver: false, blocker: "certificate_missing" };
    await userEvent.click(within(drawer).getByRole("button", { name: "Ask to check in" }));
    expect(await screen.findByText(/There's no Apple push certificate yet, so Tracenium can't wake JPR-MacBookPro/)).toBeTruthy();
  });

  it("sin permiso de configurar, no hay botón", async () => {
    capabilities = { role: "Mobile Operator", permissions: ["device_management", "enrollment"] };
    state.devices = [PUSHABLE];
    const drawer = await openDrawer();
    expect(within(drawer).queryByRole("button", { name: "Ask to check in" })).toBeNull();
  });

  it("❗ Apple dio el token por muerto: el cajón lo dice en rojo", async () => {
    state.status = { ...state.status, pushCertificate: { configured: true, state: "valid", daysLeft: 300 }, commands: { deliverable: true, reason: null } };
    state.devices = [{ ...PUSHABLE, push: { ...PUSHABLE.push, error: "Unregistered" } }];
    const drawer = await openDrawer();
    expect(within(drawer).getByText(/Apple says this device's push registration is no longer valid/)).toBeTruthy();
  });

  it("❗ certificado caducado: «Not waking devices» y se renueva desde Overview", async () => {
    state.status = { ...state.status, pushCertificate: { configured: true, state: "expired", daysLeft: -2 }, commands: { deliverable: false, reason: "push_certificate_expired" } };
    mount();
    expect(await screen.findByText("Not waking devices")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Renew in Apple setup" })).toBeTruthy();
  });
});

describe("MDM / MAM — un iPhone en el cajón (2-oct-2026)", () => {
  const IPHONE = {
    ...MAC, udid: "00008130-000425C2228B803A", serialNumber: "DF9LT4J97R", deviceName: "iPhone de Javier",
    productName: "iPhone16,1", model: "iPhone16,1", osVersion: "27.0", buildVersion: "24A100",
  };

  it("⭐ su código (cumple o no), la declaración del código y su perfil; sin el panel de actualización del Mac", async () => {
    state.devices = [IPHONE];
    state.ddm = {
      reportedAt: new Date().toISOString(),
      inventory: { marketingName: "iPhone 15 Pro", osVersion: "27.0", passcodePresent: true, passcodeCompliant: false, certificates: [], packages: [], managedApps: [] },
      declarations: [{ identifier: "com.tracenium.passcode.settings", kind: "configuration", purpose: "passcode_settings", state: "applied", reasons: [] }],
    };
    state.orgProfile = { delivery: { requestType: "InstallProfile", status: "pending", settingsCount: 3, enqueuedAt: new Date().toISOString(), completedAt: null } };
    mount("&mdmTab=devices");
    await userEvent.click((await screen.findByText("iPhone de Javier")).closest("tr"));
    const status = await screen.findByLabelText("Device status");
    expect(await within(status).findByText("Doesn't comply with the policy")).toBeTruthy();
    expect(within(status).getByText("Passcode requirements")).toBeTruthy();
    expect(within(status).getByText(/reported by the device/)).toBeTruthy();
    expect(within(status).getByText("iOS")).toBeTruthy();
    expect(within(status).queryByText("macOS")).toBeNull();
    const profile = await screen.findByLabelText("Organization profile");
    expect(await within(profile).findByText(/The device installs it on its next check-in/)).toBeTruthy();
    expect(screen.queryByLabelText("OS update")).toBeNull();
  });
});

describe("MDM / MAM — acciones sobre el equipo (2-oct-2026)", () => {
  async function openMacActions() {
    mount("&mdmTab=devices");
    await userEvent.click((await screen.findByText("JPR-MacBookPro")).closest("tr"));
    return screen.findByLabelText("Device actions");
  }

  it("⭐ bloquear un Mac pide un PIN de 6 dígitos y lo manda; queda en el historial y se puede cancelar", async () => {
    const user = userEvent.setup();
    const panel = await openMacActions();
    await user.click(await within(panel).findByRole("button", { name: "Lock…" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/Tracenium doesn't keep it/)).toBeTruthy();
    const send = within(dialog).getByRole("button", { name: "Lock device" });
    expect(send).toBeDisabled();
    await user.type(within(dialog).getByLabelText("PIN"), "135790");
    await user.type(within(dialog).getByLabelText("Message on the Lock Screen (optional)"), "Llama a TI");
    expect(send).toBeEnabled();
    await user.click(send);
    await waitFor(() => expect(state.actionPosts).toEqual([{ action: "lock", body: { pin: "135790", message: "Llama a TI" } }]));
    expect(await screen.findByText(/Lock sent to JPR-MacBookPro/)).toBeTruthy();

    const history = await screen.findByLabelText("Recent actions");
    expect(within(history).getByText("Waiting for the device")).toBeTruthy();
    await user.click(await within(history).findByRole("button", { name: "Cancel" }));
    await user.click(await screen.findByRole("button", { name: "Cancel it" }));
    await waitFor(() => expect(state.cancels).toEqual(["cmd-1"]));
  });

  it("❗ borrar exige escribir el número de serie y un motivo", async () => {
    const user = userEvent.setup();
    const panel = await openMacActions();
    await user.click(await within(panel).findByRole("button", { name: "Erase…" }));
    const dialog = await screen.findByRole("dialog");
    const erase = within(dialog).getByRole("button", { name: "Erase device" });
    await user.type(within(dialog).getByLabelText("Serial number confirmation"), "OTRO");
    await user.type(within(dialog).getByLabelText(/Why \(goes in the audit log\)/), "Robado");
    await user.type(within(dialog).getByLabelText("PIN"), "246810");
    expect(erase).toBeDisabled();
    await user.clear(within(dialog).getByLabelText("Serial number confirmation"));
    await user.type(within(dialog).getByLabelText("Serial number confirmation"), "cwy6t7fn0f");
    expect(erase).toBeEnabled();
    await user.click(erase);
    await waitFor(() => expect(state.actionPosts).toEqual([{ action: "erase", body: { confirmSerial: "cwy6t7fn0f", reason: "Robado", pin: "246810" } }]));
  });

  it("❗ un equipo personal: sólo mirar, y dice por qué", async () => {
    state.actions = {
      ...state.actions,
      ownership: "byod",
      actions: [
        { action: "refresh_inventory", available: true, reason: null },
        { action: "installed_apps", available: true, reason: null },
        ...["lock", "restart", "erase"].map((action) => ({ action, available: false, reason: "personal_device" })),
      ],
      information: { at: new Date().toISOString(), values: { DeviceCapacity: 994.66, AvailableDeviceCapacity: 512.4, IsSupervised: true } },
    };
    const panel = await openMacActions();
    expect(await within(panel).findByText(/enrolled as personal/)).toBeTruthy();
    expect(within(panel).getByRole("button", { name: "Lock…" })).toBeDisabled();
    expect(within(panel).getByRole("button", { name: "Erase…" })).toBeDisabled();
    expect(within(panel).getByRole("button", { name: "Refresh inventory" })).toBeEnabled();
    expect(within(panel).getByText("512 GB free of 995 GB")).toBeTruthy();
  });

  it("sin ser ADMIN/OWNER: el historial sí, los botones no", async () => {
    capabilities = { role: "Mobile Operator", permissions: ["device_management", "enrollment"] };
    const panel = await openMacActions();
    expect(await within(panel).findByText(/Only tenant admins and owners/)).toBeTruthy();
    expect(within(panel).queryByRole("button", { name: "Lock…" })).toBeNull();
    expect(within(panel).queryByRole("button", { name: "Remove from management…" })).toBeNull();
  });

  it("❗ un equipo personal perdido: el cajón dice que su dueño lo bloquee con Buscar, y ofrece sacarlo de la gestión", async () => {
    state.actions = {
      ...state.actions,
      ownership: "byod",
      actions: state.actions.actions.map((a) => (["lock", "restart", "erase"].includes(a.action) ? { ...a, available: false, reason: "personal_device" } : a)),
    };
    const panel = await openMacActions();
    expect(await within(panel).findByText(/Find My \(icloud\.com\/find\)/)).toBeTruthy();
    expect(within(panel).getByRole("button", { name: "Remove from management…" })).toBeEnabled();
  });

  it("⭐ un Mac con agente: sin segunda lista de apps — el enlace lleva a su ficha", async () => {
    state.actions = {
      ...state.actions,
      agent: { agentId: "agent-9" },
      actions: state.actions.actions.map((a) => (a.action === "installed_apps" ? { ...a, available: false, reason: "agent_inventory" } : a)),
      information: { at: new Date().toISOString(), values: { IsSupervised: true, IsActivationLockEnabled: false } },
    };
    const panel = await openMacActions();
    const link = await within(panel).findByRole("link", { name: "Software (Tracenium agent)" });
    expect(link.getAttribute("href")).toMatch(/[?&]device=agent-9/);
    expect(within(panel).queryByRole("button", { name: "List installed apps" })).toBeNull();
    expect(within(panel).getByText(/Hardware and software come from the Tracenium agent/)).toBeTruthy();
    expect(within(panel).getByText("Activation Lock")).toBeTruthy();
  });
});

describe("MDM / MAM — Remove from management (2-oct-2026)", () => {
  async function openMacActions() {
    mount("&mdmTab=devices");
    await userEvent.click((await screen.findByText("JPR-MacBookPro")).closest("tr"));
    return screen.findByLabelText("Device actions");
  }

  it("⭐ explica qué se va y qué se queda, pide el motivo, y se puede deshacer mientras no llegue", async () => {
    const user = userEvent.setup();
    const panel = await openMacActions();
    await user.click(await within(panel).findByRole("button", { name: "Remove from management…" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/the Tracenium agent — uninstall it separately/)).toBeTruthy();
    expect(within(dialog).getByText(/waits up to 30 days/)).toBeTruthy();
    const go = within(dialog).getByRole("button", { name: "Remove from management" });
    expect(go).toBeDisabled();
    await user.type(within(dialog).getByLabelText(/Why \(goes in the audit log\)/), "Deja la empresa");
    await user.click(go);
    await waitFor(() => expect(state.removalPosts).toEqual([{ reason: "Deja la empresa" }]));
    expect(await screen.findByText(/leaves management the next time it connects/)).toBeTruthy();

    const banner = await within(panel).findByRole("status", { name: "Removal from management" });
    expect(within(banner).getByText("Removal requested")).toBeTruthy();
    expect(within(banner).getByText(/“Deja la empresa”/)).toBeTruthy();
    // La lista (y el cajón abierto) lo dicen sin esperar al refresco automático.
    const detail = screen.getByLabelText("Device detail");
    expect(await within(detail).findByText("Leaving management")).toBeTruthy();
    // Las acciones quedan quietas, sin repetir el motivo de cada una.
    expect(within(panel).getByRole("button", { name: "Lock…" })).toBeDisabled();
    expect(within(panel).queryByRole("button", { name: "Remove from management…" })).toBeNull();

    await user.click(within(banner).getByRole("button", { name: "Keep it managed" }));
    await user.click(await screen.findByRole("button", { name: "Keep it managed" }));
    await waitFor(() => expect(state.removalDeletes).toBe(1));
    expect(await within(panel).findByRole("button", { name: "Remove from management…" })).toBeTruthy();
    await waitFor(() => expect(within(detail).queryByText("Leaving management")).toBeNull());
  });

  it("❗ si el equipo se negó: el motivo de Apple y «Try again» con el mismo motivo", async () => {
    const user = userEvent.setup();
    state.actions = {
      ...state.actions,
      removal: {
        state: "refused", requestedAt: new Date().toISOString(), requestedBy: "admin-1", reason: "Devuelto",
        error: "The MDM payload can't be removed.", canCancel: true, canRetry: true,
      },
    };
    const panel = await openMacActions();
    const banner = await within(panel).findByRole("status", { name: "Removal from management" });
    expect(within(banner).getByText("The device refused the removal")).toBeTruthy();
    expect(within(banner).getByText("The MDM payload can't be removed.")).toBeTruthy();
    await user.click(within(banner).getByRole("button", { name: "Try again…" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByLabelText(/Why \(goes in the audit log\)/)).toHaveValue("Devuelto");
    await user.click(within(dialog).getByRole("button", { name: "Remove from management" }));
    await waitFor(() => expect(state.removalPosts).toEqual([{ reason: "Devuelto" }]));
  });
});
