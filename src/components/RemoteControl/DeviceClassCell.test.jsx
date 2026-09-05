// src/components/RemoteControl/DeviceClassCell.test.jsx
//
// ⚠️ La clase de un equipo es gobierno, no una etiqueta.
//
// De ella cuelgan dos cosas: si entrar exige el vistobueno de otra persona
// (`access_policy` decide por clase) y si se le pregunta al usuario del
// equipo antes de mirarle la pantalla (solo en `endpoint`). Marcar un
// servidor como equipo de usuario quita lo primero y pone un aviso que en
// un servidor no va a contestar nadie.
//
// Los dos fallos que se persiguen aquí no rompen nada visible:
//
//   1. Pintar "sin clasificar" como si fuera "equipo de usuario". El gate
//      trata lo desconocido como SERVIDOR —ante la duda se gobierna, no se
//      exime—, así que esa celda diría lo contrario de lo que va a pasar.
//   2. Dejar que baje la guardia sin decir lo que implica. Es exactamente
//      el cambio que haría alguien diez minutos antes de entrar en un
//      controlador de dominio.

import * as React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import DeviceClassCell, { describeClassChange } from "./DeviceClassCell";

afterEach(() => cleanup());

describe("lo que dice la celda", () => {
  it("un servidor se lee como servidor", () => {
    render(<DeviceClassCell value="server" />);
    expect(screen.getByText("Server")).toBeInTheDocument();
  });

  it("⚠️ sin clasificar NO se disfraza de equipo de usuario", () => {
    render(<DeviceClassCell value={null} />);
    expect(screen.getByText("Unclassified")).toBeInTheDocument();
    expect(screen.queryByText("Endpoint")).not.toBeInTheDocument();
  });

  it("un valor que no es de las dos clases cae en sin clasificar", () => {
    render(<DeviceClassCell value="vm" />);
    expect(screen.getByText("Unclassified")).toBeInTheDocument();
  });

  it("sin `onChange` es de solo lectura: no hay desplegable que tocar", () => {
    render(<DeviceClassCell value="server" />);
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });
});

describe("⚠️ bajar la guardia se confirma; subirla no", () => {
  it("pasar a endpoint pide confirmación y dice QUÉ cambia", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<DeviceClassCell value="server" onChange={onChange} />);

    await user.click(screen.getByRole("combobox"));
    await user.click(within(screen.getByRole("listbox")).getByText("Endpoint"));

    // Todavía no ha cambiado nada.
    expect(onChange).not.toHaveBeenCalled();
    // Y la frase nombra las dos consecuencias, no dice "¿seguro?".
    expect(screen.getByText(/no longer need another admin's approval/i)).toBeInTheDocument();
    expect(screen.getByText(/asked for consent/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /change it/i }));
    expect(onChange).toHaveBeenCalledWith("endpoint");
  });

  it("cancelar no cambia nada", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<DeviceClassCell value="server" onChange={onChange} />);

    await user.click(screen.getByRole("combobox"));
    await user.click(within(screen.getByRole("listbox")).getByText("Endpoint"));
    await user.click(screen.getByRole("button", { name: /cancel/i }));

    expect(onChange).not.toHaveBeenCalled();
  });

  it("pasar a servidor NO pide confirmación: subir la guardia no necesita ceremonia", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<DeviceClassCell value="endpoint" onChange={onChange} />);

    await user.click(screen.getByRole("combobox"));
    await user.click(within(screen.getByRole("listbox")).getByText("Server"));

    await waitFor(() => expect(onChange).toHaveBeenCalledWith("server"));
  });

  it("⚠️ un equipo SIN clasificar también confirma al pasar a endpoint", async () => {
    // Hoy se le gobierna como servidor, así que el cambio baja la guardia
    // igual aunque la celda esté vacía.
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<DeviceClassCell value={null} onChange={onChange} />);

    await user.click(screen.getByRole("combobox"));
    await user.click(within(screen.getByRole("listbox")).getByText("Endpoint"));

    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /change it/i })).toBeInTheDocument();
  });

  it("nadie manda un equipo a 'sin clasificar'", async () => {
    // Es un estado real —nadie lo ha mirado— pero no un destino: volver ahí
    // a mano solo serviría para dejar de saber lo que ya se sabía.
    const user = userEvent.setup();
    render(<DeviceClassCell value="server" onChange={vi.fn()} />);
    await user.click(screen.getByRole("combobox"));

    const opcion = within(screen.getByRole("listbox")).getByText("Unclassified");
    expect(opcion.closest('[role="option"]')).toHaveAttribute("aria-disabled", "true");
  });
});

describe("la frase del aviso", () => {
  it("dice que queda registrado y con nombre", () => {
    // El backend lo deja en `security_events` con el valor anterior y el
    // nuevo. Que la persona lo sepa ANTES es la mitad del control.
    expect(describeClassChange("server", "endpoint").body).toMatch(/recorded with your name/i);
    expect(describeClassChange("endpoint", "server").body).toMatch(/recorded with your name/i);
  });

  it("solo el paso a endpoint necesita confirmación", () => {
    expect(describeClassChange("server", "endpoint").needsConfirm).toBe(true);
    expect(describeClassChange(null, "endpoint").needsConfirm).toBe(true);
    expect(describeClassChange("endpoint", "server").needsConfirm).toBe(false);
    expect(describeClassChange(null, "server").needsConfirm).toBe(false);
  });
});
