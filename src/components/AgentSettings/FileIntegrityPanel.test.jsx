// src/components/AgentSettings/FileIntegrityPanel.test.jsx
//
// ADR-0027 F4 — el editor de conjuntos vigilados. Edita el formulario; no
// guarda por su cuenta.

import * as React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import FileIntegrityPanel from "./FileIntegrityPanel";

afterEach(cleanup);

/** El panel con estado, como lo usa Agent Settings: cada cambio es un formulario nuevo. */
function Harness({ initial = null, onForm = () => {} }) {
  const [form, setForm] = React.useState({ compliance: { intervalSeconds: 28800, fileIntegrity: initial } });
  return (
    <FileIntegrityPanel
      form={form}
      onChange={(f) => {
        setForm(f);
        onForm(f);
      }}
    />
  );
}

describe("FileIntegrityPanel", () => {
  it("⭐ dice lo que NO es, sin que nadie pregunte: ni contenido, ni tiempo real, ni bloqueo", () => {
    render(<Harness />);
    expect(screen.getByText(/never its content/)).toBeInTheDocument();
    expect(screen.getByText(/not real time, and it does not block or restore/)).toBeInTheDocument();
    expect(screen.getByText(/Nothing is watched/)).toBeInTheDocument();
  });

  it("⭐ añadir un conjunto sugerido lo enciende y conserva el intervalo del formulario", () => {
    const onForm = vi.fn();
    render(<Harness onForm={onForm} />);
    fireEvent.click(screen.getByRole("button", { name: "Add a suggested set" }));
    fireEvent.click(screen.getByText("Hosts file"));
    const last = onForm.mock.calls.at(-1)[0];
    // El resto del bloque `compliance` sigue ahí: el panel no lo reconstruye.
    expect(last.compliance.intervalSeconds).toBe(28800);
    expect(last.compliance.fileIntegrity).toMatchObject({
      enabled: true,
      sets: [{ id: "windows-hosts", platform: "windows", purpose: "system", path: "C:\\Windows\\System32\\drivers\\etc" }],
    });
    expect(screen.getByDisplayValue("Hosts file")).toBeInTheDocument();
  });

  it("⚠️ una ruta imposible se marca en su campo, con el motivo", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Declare your own" }));
    const row = within(screen.getByTestId("fim-set-0"));
    fireEvent.change(row.getByLabelText("Folder or file"), { target: { value: "C:\\*" } });
    expect(row.getByText(/No wildcards/)).toBeInTheDocument();
    fireEvent.change(row.getByLabelText("Folder or file"), { target: { value: "C:\\App\\conf" } });
    expect(row.queryByText(/No wildcards/)).not.toBeInTheDocument();
  });

  it("⭐ sin un conjunto de registros de auditoría avisa de que PCI 10.3.4 queda sin evidencia", () => {
    render(<Harness initial={{ enabled: true, sets: [{ id: "hosts", label: "Hosts", platform: "windows", purpose: "system", path: "C:\\etc", recursive: false, maxDepth: 4 }] }} />);
    expect(screen.getByText(/No set is marked “Audit logs”/)).toBeInTheDocument();
    const row = within(screen.getByTestId("fim-set-0"));
    fireEvent.mouseDown(row.getByLabelText("Purpose"));
    fireEvent.click(screen.getByRole("option", { name: "Audit logs" }));
    expect(screen.queryByText(/No set is marked “Audit logs”/)).not.toBeInTheDocument();
  });

  it("el nombre da el id, sin repetir; quitar el último conjunto lo apaga", () => {
    const onForm = vi.fn();
    render(<Harness onForm={onForm} />);
    fireEvent.click(screen.getByRole("button", { name: "Declare your own" }));
    fireEvent.change(within(screen.getByTestId("fim-set-0")).getByLabelText("Name"), { target: { value: "Registros de auditoría" } });
    expect(onForm.mock.calls.at(-1)[0].compliance.fileIntegrity.sets[0].id).toBe("registros-de-auditoria");

    fireEvent.click(screen.getByRole("button", { name: "Remove Registros de auditoría" }));
    expect(onForm.mock.calls.at(-1)[0].compliance.fileIntegrity).toMatchObject({ enabled: false, sets: [] });
  });

  it("en sólo lectura no hay botones de añadir ni campos editables", () => {
    render(
      <FileIntegrityPanel
        readOnly
        onChange={() => {}}
        form={{ compliance: { fileIntegrity: { enabled: true, sets: [{ id: "h", label: "Hosts", platform: "windows", purpose: "system", path: "C:\\etc", recursive: false, maxDepth: 4 }] } } }}
      />
    );
    expect(screen.queryByRole("button", { name: "Add a suggested set" })).not.toBeInTheDocument();
    expect(screen.getByDisplayValue("C:\\etc")).toBeDisabled();
  });
});

describe("FileIntegrityPanel en ámbito de equipo", () => {
  const tenantFim = { enabled: true, sets: [{ id: "hosts", label: "Hosts", platform: "windows", purpose: "system", path: "C:\\etc", recursive: false, maxDepth: 4 }] };
  const compareForm = { compliance: { fileIntegrity: tenantFim } };

  it("⭐ dice si el equipo sigue la lista del tenant o tiene la suya, y que la suya SUSTITUYE, no suma", () => {
    render(<FileIntegrityPanel scope="device" compareForm={compareForm} form={{ compliance: { fileIntegrity: tenantFim } }} onChange={() => {}} />);
    expect(screen.getByText(/follows the organization's sets/)).toBeInTheDocument();
    cleanup();

    const own = { enabled: true, sets: [{ id: "srv-logs", label: "Server logs", platform: "windows", purpose: "audit_logs", path: "D:\\Logs", recursive: false, maxDepth: 4 }] };
    const onChange = vi.fn();
    render(<FileIntegrityPanel scope="device" compareForm={compareForm} form={{ compliance: { fileIntegrity: own } }} onChange={onChange} />);
    expect(screen.getByText(/replace the organization's list for this device; they are not added/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Use the organization's sets" }));
    expect(onChange.mock.calls[0][0].compliance.fileIntegrity).toEqual(tenantFim);
  });
});
