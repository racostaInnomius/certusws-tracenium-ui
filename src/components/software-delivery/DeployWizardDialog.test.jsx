// src/components/software-delivery/DeployWizardDialog.test.jsx
//
// Sprint 2 — two-step deploy wizard.
//
// The wizard loads asset groups over the network (listAssetGroups), so
// MSW intercepts /api/v1/asset-groups. Deploy itself is delegated to the
// parent via onConfirm, so we assert the body the wizard builds and the
// success/error notification path.
//
// Focus:
//   * XOR groupId / deviceIds (asset_group mode vs device_list mode)
//   * device-id textarea parsing (comma / semicolon / newline / space)
//   * platform-mismatch warning text on the Target step
//   * deploy → onConfirm resolves → parent closes; onConfirm rejects →
//     inline error notification via notify()

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import DeployWizardDialog from "./DeployWizardDialog";
import { respond } from "../../test/msw/server";

/**
 * Reveal the paste box.
 *
 * Pasting device IDs used to be the ONLY way to target loose machines, so it
 * was the default view. It is now the secondary tab behind the device picker —
 * these tests still describe real behaviour (parsing, the XOR payload), they
 * just have to open that tab first.
 */
async function openPasteTab(user) {
  // findByRole, not queryByRole: the tab renders with the target step and a
  // silent miss here would leave the wizard on the picker, making these tests
  // fail for a reason that has nothing to do with what they assert.
  await user.click(await screen.findByRole("button", { name: /paste ids/i }));
}

afterEach(cleanup);

const setupUser = () => userEvent.setup({ delay: null });

const PKG = {
  id: "p1",
  name: "7zip",
  version: "23.01",
  platform: "windows",
  arch: "x64",
  format: "msi",
  sha256: "a".repeat(64),
  sizeBytes: 1_500_000,
  requiresReboot: false,
  detectionRule: { type: "registry_uninstall" },
};

const GROUPS = [
  { id: 10, name: "Lab Windows", kind: "static", memberCount: 12 },
  { id: 20, name: "Dynamic All", kind: "dynamic", memberCount: 300 },
];

function renderWizard({ groups = GROUPS, onConfirm = vi.fn() } = {}) {
  respond("get", "/api/v1/asset-groups", { ok: true, items: groups });
  const notify = vi.fn();
  render(
    <DeployWizardDialog
      open
      pkg={PKG}
      onClose={vi.fn()}
      onConfirm={onConfirm}
      notify={notify}
    />
  );
  return { onConfirm, notify };
}

describe("DeployWizardDialog — target step (XOR groupId / deviceIds)", () => {
  it("asset_group mode: Next stays disabled until a group is picked", async () => {
    const user = setupUser();
    renderWizard();

    // Wait for the async group load to finish (options become available).
    const next = screen.getByRole("button", { name: /^Next$/i });
    expect(next).toBeDisabled();

    await user.click(await screen.findByRole("combobox", { name: /Asset group/i }));
    await user.click(await screen.findByRole("option", { name: /Lab Windows/i }));

    expect(screen.getByRole("button", { name: /^Next$/i })).toBeEnabled();
  });

  it("device_list mode: Next enables only once at least one id is parsed", async () => {
    const user = setupUser();
    renderWizard();

    await user.click(screen.getByRole("radio", { name: /Manual device list/i }));
    const next = screen.getByRole("button", { name: /^Next$/i });
    expect(next).toBeDisabled();

    await openPasteTab(user);
    await user.type(screen.getByRole("textbox", { name: /Device IDs/i }), "agent-001");
    expect(screen.getByRole("button", { name: /^Next$/i })).toBeEnabled();
  });

  it("builds { assetGroupId } (number) when firing in asset_group mode", async () => {
    const user = setupUser();
    const onConfirm = vi.fn().mockResolvedValue({});
    renderWizard({ onConfirm });

    await user.click(await screen.findByRole("combobox", { name: /Asset group/i }));
    await user.click(await screen.findByRole("option", { name: /Lab Windows/i }));
    await user.click(screen.getByRole("button", { name: /^Next$/i }));
    await user.click(screen.getByRole("button", { name: /^Install$/i }));

    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1));
    expect(onConfirm.mock.calls[0][0]).toEqual({ mode: "install", assetGroupId: 10 });
  });

  it("builds { deviceIds } (no groupId) when firing in device_list mode", async () => {
    const user = setupUser();
    const onConfirm = vi.fn().mockResolvedValue({});
    renderWizard({ onConfirm });

    await user.click(screen.getByRole("radio", { name: /Manual device list/i }));
    await openPasteTab(user);
    await user.type(
      screen.getByRole("textbox", { name: /Device IDs/i }),
      "agent-001, agent-002"
    );
    await user.click(screen.getByRole("button", { name: /^Next$/i }));
    await user.click(screen.getByRole("button", { name: /^Install$/i }));

    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1));
    const body = onConfirm.mock.calls[0][0];
    expect(body.mode).toBe("install");
    expect(body.deviceIds).toEqual(["agent-001", "agent-002"]);
    expect(body).not.toHaveProperty("assetGroupId"); // XOR — never both
  });
});

describe("DeployWizardDialog — mode selection", () => {
  it("fires an uninstall body when uninstall mode is picked (removable rule)", async () => {
    const user = setupUser();
    const onConfirm = vi.fn().mockResolvedValue({});
    renderWizard({ onConfirm }); // PKG has a registry_uninstall rule → uninstallable

    await user.click(screen.getByRole("combobox", { name: /Mode/i }));
    await user.click(await screen.findByRole("option", { name: /^Uninstall/i }));

    await user.click(await screen.findByRole("combobox", { name: /Asset group/i }));
    await user.click(await screen.findByRole("option", { name: /Lab Windows/i }));
    await user.click(screen.getByRole("button", { name: /^Next$/i }));
    // Fire button now reads "Uninstall".
    await user.click(screen.getByRole("button", { name: /^Uninstall$/i }));

    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1));
    expect(onConfirm.mock.calls[0][0]).toEqual({ mode: "uninstall", assetGroupId: 10 });
  });

  it("disables the uninstall option when the package has no removable identity", async () => {
    const user = setupUser();
    respond("get", "/api/v1/asset-groups", { ok: true, items: GROUPS });
    render(
      <DeployWizardDialog
        open
        pkg={{ ...PKG, detectionRule: { type: "file_exists", path: "C:/x" }, silentUninstallArgs: null }}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
        notify={vi.fn()}
      />
    );

    await user.click(screen.getByRole("combobox", { name: /Mode/i }));
    const uninstallOption = await screen.findByRole("option", { name: /Uninstall/i });
    expect(uninstallOption).toHaveAttribute("aria-disabled", "true");
  });
});

describe("DeployWizardDialog — device-id textarea parsing", () => {
  // The wizard splits on /[\s,;\n]+/. Verify all separators collapse and
  // blanks are dropped, by reading the count in the helper text.
  it("splits on comma / semicolon / newline / whitespace and dedups blanks", async () => {
    const user = setupUser();
    renderWizard();

    await user.click(screen.getByRole("radio", { name: /Manual device list/i }));
    await openPasteTab(user);
    const ta = screen.getByRole("textbox", { name: /Device IDs/i });
    // Mixed separators + leading/trailing/double blanks.
    await user.type(ta, "  a1, a2;a3{Enter}a4   a5 , ");

    // Helper text reports the parsed count.
    expect(await screen.findByText(/5 device\(s\)/i)).toBeInTheDocument();
  });

  it("renders parsed device chips on the Review step", async () => {
    const user = setupUser();
    renderWizard();

    await user.click(screen.getByRole("radio", { name: /Manual device list/i }));
    await openPasteTab(user);
    await user.type(
      screen.getByRole("textbox", { name: /Device IDs/i }),
      "agent-001;agent-002"
    );
    await user.click(screen.getByRole("button", { name: /^Next$/i }));

    expect(screen.getByText("agent-001")).toBeInTheDocument();
    expect(screen.getByText("agent-002")).toBeInTheDocument();
    expect(screen.getByText(/Device list \(2\)/i)).toBeInTheDocument();
  });
});

describe("DeployWizardDialog — platform-mismatch warning", () => {
  it("shows the platform_mismatch note when an asset group is selected", async () => {
    const user = setupUser();
    renderWizard();

    await user.click(await screen.findByRole("combobox", { name: /Asset group/i }));
    await user.click(await screen.findByRole("option", { name: /Lab Windows/i }));

    // The info alert references the package platform/arch and the
    // per-device rejection reason.
    expect(
      screen.getByText(/platform_mismatch/i)
    ).toBeInTheDocument();
    expect(screen.getByText(/windows\/x64/i)).toBeInTheDocument();
  });
});

describe("DeployWizardDialog — deploy result surfacing", () => {
  it("error path: onConfirm rejects → notify('error', message), stays on wizard", async () => {
    const user = setupUser();
    const err = Object.assign(new Error("boom"), {
      body: { message: "Per-device cap exceeded" },
    });
    const onConfirm = vi.fn().mockRejectedValue(err);
    const { notify } = renderWizard({ onConfirm });

    await user.click(await screen.findByRole("combobox", { name: /Asset group/i }));
    await user.click(await screen.findByRole("option", { name: /Lab Windows/i }));
    await user.click(screen.getByRole("button", { name: /^Next$/i }));
    await user.click(screen.getByRole("button", { name: /^Install$/i }));

    await waitFor(() =>
      expect(notify).toHaveBeenCalledWith("error", "Per-device cap exceeded")
    );
    // Fire button re-enables so operator can retry (submitting reset).
    expect(screen.getByRole("button", { name: /^Install$/i })).toBeEnabled();
  });

  it("group-load failure notifies error and leaves an empty catalog", async () => {
    // 500 on the asset-groups load → catch → notify('error', ...).
    respond("get", "/api/v1/asset-groups", { ok: false, message: "db down" }, { status: 500 });
    const notify = vi.fn();
    render(
      <DeployWizardDialog
        open
        pkg={PKG}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
        notify={notify}
      />
    );

    await waitFor(() => expect(notify).toHaveBeenCalledWith("error", expect.any(String)));
    // Helper text tells the operator no groups are available.
    expect(
      screen.getByText(/No asset groups available/i)
    ).toBeInTheDocument();
  });
});

describe("DeployWizardDialog — esperar a la ventana de mantenimiento", () => {
  // ⚠️ Las ventanas son de Patch Management. SDP las heredaba SIEMPRE y sin
  // enseñarlo: un envío de las 17:12 salía a las 22:00, mientras el mismo
  // paquete pedido por el usuario desde su bandeja salía al instante. Ahora es
  // una elección por envío, y por defecto NO se espera.
  async function fireWithGroup(user) {
    await user.click(await screen.findByRole("combobox", { name: /Asset group/i }));
    await user.click(await screen.findByRole("option", { name: /Lab Windows/i }));
    await user.click(screen.getByRole("button", { name: /^Next$/i }));
    await user.click(screen.getByRole("button", { name: /^Install$/i }));
  }

  it("⭐ por defecto NO manda waitForMaintenanceWindow: el envío sale ya", async () => {
    const user = setupUser();
    const onConfirm = vi.fn().mockResolvedValue({});
    renderWizard({ onConfirm });

    await fireWithGroup(user);

    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1));
    expect(onConfirm.mock.calls[0][0]).not.toHaveProperty("waitForMaintenanceWindow");
  });

  it("marcando la casilla, el cuerpo lo pide", async () => {
    const user = setupUser();
    const onConfirm = vi.fn().mockResolvedValue({});
    renderWizard({ onConfirm });

    await user.click(screen.getByRole("checkbox", { name: /wait for the maintenance window/i }));
    await fireWithGroup(user);

    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1));
    expect(onConfirm.mock.calls[0][0]).toMatchObject({ waitForMaintenanceWindow: true });
  });

  it("la revisión dice cuándo sale, en los dos casos", async () => {
    const user = setupUser();
    renderWizard();

    await user.click(await screen.findByRole("combobox", { name: /Asset group/i }));
    await user.click(await screen.findByRole("option", { name: /Lab Windows/i }));
    await user.click(screen.getByRole("button", { name: /^Next$/i }));
    expect(screen.getByText(/dispatches now/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^Back$/i }));
    await user.click(screen.getByRole("checkbox", { name: /wait for the maintenance window/i }));
    await user.click(screen.getByRole("button", { name: /^Next$/i }));
    expect(screen.getByText(/held until the tenant's next maintenance window/i)).toBeInTheDocument();
  });
});

describe("DeployWizardDialog — programar el envío para más tarde", () => {
  // La hora se escribe en hora de pared local y viaja como instante: ver
  // `deploymentSchedule.test.js` para la conversión. Aquí se comprueba el
  // tramo que ninguna prueba pura cubre — que la elección LLEGUE al cuerpo.
  //
  // La hora sale de un desplegable en pasos de 15 minutos (BrandTimeField), así
  // que el instante se redondea hacia abajo a un paso para que la opción exista.
  const localValue = (hoursFromNow) => {
    const d = new Date(Date.now() + hoursFromNow * 3600_000);
    d.setMinutes(d.getMinutes() - (d.getMinutes() % 15), 0, 0);
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  /** Elige fecha y hora como lo hace el operador: el día en el campo de fecha, la hora en la lista. */
  async function pickSchedule(user, value) {
    const [date, time] = value.split("T");
    fireEvent.change(document.querySelector('input[type="date"]'), { target: { value: date } });
    await user.click(screen.getByRole("combobox", { name: /^Time/ }));
    await user.click(document.querySelector(`li[data-value="${time}"]`));
  }

  async function fireWithGroup(user) {
    await user.click(await screen.findByRole("combobox", { name: /Asset group/i }));
    await user.click(await screen.findByRole("option", { name: /Lab Windows/i }));
    await user.click(screen.getByRole("button", { name: /^Next$/i }));
    await user.click(screen.getByRole("button", { name: /^Install$/i }));
  }

  it("por defecto no hay selector: programar es la excepción", async () => {
    renderWizard();
    await screen.findByRole("combobox", { name: /Asset group/i });
    expect(screen.getByRole("radio", { name: /send now/i })).toBeChecked();
    expect(document.querySelector('input[type="date"]')).toBeNull();
    expect(screen.queryByRole("combobox", { name: /^Time/ })).toBeNull();
  });

  it("⭐ la hora elegida llega al cuerpo como un instante con zona", async () => {
    const user = setupUser();
    const onConfirm = vi.fn().mockResolvedValue({});
    renderWizard({ onConfirm });

    await user.click(await screen.findByRole("radio", { name: /schedule for a specific time/i }));
    const value = localValue(48);
    await pickSchedule(user, value);
    await fireWithGroup(user);

    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1));
    const body = onConfirm.mock.calls[0][0];
    expect(body.scheduledAt).toBe(new Date(value).toISOString());
    expect(body.scheduledAt).toMatch(/Z$/); // nunca la hora de pared a pelo
  });

  // ⚠️ El backend la rechaza, pero el operador se llevaría un 400 después de
  // recorrer el asistente entero. El botón no debe dejarle llegar ahí.
  it("⭐ una hora imposible no se puede disparar, y dice por qué", async () => {
    const user = setupUser();
    const onConfirm = vi.fn().mockResolvedValue({});
    renderWizard({ onConfirm });

    await user.click(await screen.findByRole("radio", { name: /schedule for a specific time/i }));
    await pickSchedule(user, localValue(-5));
    expect(screen.getByText(/already passed/i)).toBeInTheDocument();

    await user.click(await screen.findByRole("combobox", { name: /Asset group/i }));
    await user.click(await screen.findByRole("option", { name: /Lab Windows/i }));
    await user.click(screen.getByRole("button", { name: /^Next$/i }));
    expect(screen.getByRole("button", { name: /^Install$/i })).toBeDisabled();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("volviendo a «send now» no queda rastro de la hora", async () => {
    const user = setupUser();
    const onConfirm = vi.fn().mockResolvedValue({});
    renderWizard({ onConfirm });

    await user.click(await screen.findByRole("radio", { name: /schedule for a specific time/i }));
    await pickSchedule(user, localValue(24));
    await user.click(screen.getByRole("radio", { name: /send now/i }));
    await fireWithGroup(user);

    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1));
    expect(onConfirm.mock.calls[0][0]).not.toHaveProperty("scheduledAt");
  });

  it("la revisión avisa de que con hora Y ventana sale en la más tardía", async () => {
    const user = setupUser();
    renderWizard();

    await user.click(await screen.findByRole("radio", { name: /schedule for a specific time/i }));
    await pickSchedule(user, localValue(24));
    await user.click(screen.getByRole("checkbox", { name: /wait for the maintenance window/i }));
    await user.click(await screen.findByRole("combobox", { name: /Asset group/i }));
    await user.click(await screen.findByRole("option", { name: /Lab Windows/i }));
    await user.click(screen.getByRole("button", { name: /^Next$/i }));

    expect(screen.getByText(/window opens after that/i)).toBeInTheDocument();
  });

  // ── 21-sep: la hora deja de ser el `datetime-local` nativo ───────────────
  it("⭐ la hora es un desplegable de marca, no el selector nativo", async () => {
    const user = setupUser();
    renderWizard();
    await user.click(await screen.findByRole("radio", { name: /schedule for a specific time/i }));
    expect(document.querySelector('input[type="datetime-local"]')).toBeNull();
    expect(document.querySelector('input[type="time"]')).toBeNull();
    expect(screen.getByRole("combobox", { name: /^Time/ })).toBeInTheDocument();
  });

  it("con sólo el día, dice que falta la hora y no deja disparar", async () => {
    // Partir el campo en dos abre un estado nuevo —medio rellenado—, y el botón
    // no puede quedarse apagado sin decir por qué.
    const user = setupUser();
    const onConfirm = vi.fn().mockResolvedValue({});
    renderWizard({ onConfirm });
    await user.click(await screen.findByRole("radio", { name: /schedule for a specific time/i }));
    fireEvent.change(document.querySelector('input[type="date"]'), {
      target: { value: localValue(24).split("T")[0] },
    });
    expect(screen.getByText(/pick a date and time/i)).toBeInTheDocument();
    await user.click(await screen.findByRole("combobox", { name: /Asset group/i }));
    await user.click(await screen.findByRole("option", { name: /Lab Windows/i }));
    await user.click(screen.getByRole("button", { name: /^Next$/i }));
    expect(screen.getByRole("button", { name: /^Install$/i })).toBeDisabled();
  });
});
