// src/components/patch-management/MaintenanceWindowsPanel.test.jsx
//
// 🔴 Auditoría PMP 1-oct-2026. Las ventanas son de todo el tenant y SIN
// ninguna activa no hay restricción: todo lo retenido sale en el siguiente
// barrido, a la hora que sea. Borrar la última era un clic, sin pregunta.

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { server, http, HttpResponse } from "../../test/msw/server";
import { ConfirmProvider } from "../common/ConfirmDialog";
import { clearApiCache } from "../../api/http";
import MaintenanceWindowsPanel from "./MaintenanceWindowsPanel";

afterEach(() => {
  cleanup();
  server.resetHandlers();
  clearApiCache();
});

const WEEKDAYS = { id: 1, name: "Weekdays", daysOfWeek: [1, 2, 3, 4, 5], startMinute: 1320, durationMinutes: 420, timezone: "America/Chicago", enabled: true };
const WEEKEND = { ...WEEKDAYS, id: 2, name: "Weekend", daysOfWeek: [0, 6] };

function mount(items) {
  const deletes = [];
  server.use(
    http.all(/.*\/maintenance-windows.*/, ({ request }) => {
      if (request.method === "DELETE") {
        deletes.push(new URL(request.url).pathname);
        return HttpResponse.json({ ok: true });
      }
      return HttpResponse.json({ ok: true, items });
    })
  );
  render(
    <ConfirmProvider>
      <MaintenanceWindowsPanel canManage notify={vi.fn()} />
    </ConfirmProvider>
  );
  return deletes;
}

/** El botón de borrar de la fila de una ventana. */
async function deleteButtonOf(name) {
  const cell = await screen.findByText(name);
  const row = cell.closest("tr");
  const buttons = within(row).getAllByRole("button");
  return buttons[buttons.length - 1];
}

describe("MaintenanceWindowsPanel — borrar ventanas", () => {
  it("🔴 borrar la ÚLTIMA activa avisa de que se quita la restricción; cancelar no borra", async () => {
    const user = userEvent.setup();
    const deletes = mount([WEEKDAYS]);

    await user.click(await deleteButtonOf("Weekdays"));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Remove the last active maintenance window?")).toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: /Cancel/ }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(deletes).toEqual([]);
  });

  it("con otra activa, pregunta lo normal y al confirmar borra", async () => {
    const user = userEvent.setup();
    const deletes = mount([WEEKDAYS, WEEKEND]);

    await user.click(await deleteButtonOf("Weekend"));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/Delete the window “Weekend”\?/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Delete window" }));
    await waitFor(() => expect(deletes).toEqual([expect.stringMatching(/maintenance-windows\/2$/)]));
  });
});
