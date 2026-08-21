// src/components/agent-releases/UnattendedInstallDialog.test.jsx
//
// Renderiza el diálogo de verdad. En este repo el build NO valida
// identificadores JSX —un <Componente> sin importar compila y pasa lint— así
// que sólo un render caza el ReferenceError. Escribiendo esta función ya pasó:
// Tooltip e IconButton se usaron en AgentReleases sin importarlos.

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import UnattendedInstallDialog from "./UnattendedInstallDialog";

afterEach(cleanup);

const win = { platform: "windows", arch: "x64", format: "msi", version: "1.1.47" };
const mac = { platform: "macos", arch: "arm64", format: "pkg", version: "1.1.47" };

describe("UnattendedInstallDialog", () => {
  it("muestra el comando de Windows con el binario de esa fila", () => {
    render(<UnattendedInstallDialog open row={win} onClose={vi.fn()} />);
    expect(screen.getByText(/Tracenium-Agent-1\.1\.47-x64\.msi/)).toBeTruthy();
  });

  it("muestra los dos pasos de macOS, token primero", () => {
    render(<UnattendedInstallDialog open row={mac} onClose={vi.fn()} />);
    const text = screen.getByText(/tracenium-enrollment\.token/).textContent;
    expect(text.indexOf("tracenium-enrollment.token"))
      .toBeLessThan(text.indexOf("installer -pkg"));
  });

  // El token real nunca se pinta: acabaría en capturas y tickets.
  it("pide sustituir el marcador en vez de traer una credencial", () => {
    render(<UnattendedInstallDialog open row={win} onClose={vi.fn()} />);
    expect(screen.getByRole("alert").textContent).toMatch(/Enrollment tokens/);
    // El marcador aparece tanto en el comando como en el aviso; lo que importa
    // es que este EN EL COMANDO, que es lo que se copia.
    expect(screen.getByText(/msiexec/).textContent).toContain("<TOKEN>");
  });

  it("avisa en vez de inventar un comando para un formato desconocido", () => {
    render(<UnattendedInstallDialog open row={{ ...win, format: "exe" }} onClose={vi.fn()} />);
    expect(screen.getByRole("alert").textContent).toMatch(/No hay comando desatendido/);
    expect(screen.getByRole("button", { name: /copiar/i })).toBeDisabled();
  });
});
