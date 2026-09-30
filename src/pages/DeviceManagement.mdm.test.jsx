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
    http.get(/\/api\/v1\/mdm\/push-certificate$/, () => HttpResponse.json(state.setup)),
    http.get(/\/api\/v1\/mdm\/devices\/[^/]+\/os-update$/, () => HttpResponse.json(state.osUpdate)),
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
