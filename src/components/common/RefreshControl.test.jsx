// src/components/common/RefreshControl.test.jsx
//
// Sprint 2 — refresh control (presentational) + useAutoRefresh hook.
// No network. Covers the disabled-while-loading behavior, the cadence
// dropdown, and the button label swap.

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import RefreshControl, { REFRESH_OPTIONS } from "./RefreshControl";

afterEach(cleanup);

const setupUser = () => userEvent.setup({ delay: null });

describe("RefreshControl — presentational", () => {
  it("shows 'Refresh' and is enabled when not loading; fires onRefresh", async () => {
    const user = setupUser();
    const onRefresh = vi.fn();
    render(
      <RefreshControl
        refreshSeconds="60"
        onRefreshSecondsChange={() => {}}
        onRefresh={onRefresh}
        loading={false}
      />
    );

    const btn = screen.getByRole("button", { name: /Refresh/i });
    expect(btn).toBeEnabled();
    await user.click(btn);
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it("loading=true → el rótulo dice 'Refreshing…' pero el NOMBRE sigue siendo 'Refresh'", () => {
    render(
      <RefreshControl
        refreshSeconds="60"
        onRefreshSecondsChange={() => {}}
        onRefresh={() => {}}
        loading
      />
    );
    // El nombre accesible es estable a propósito: si cambiara con el estado,
    // quien navega con lector de pantalla pierde de vista el botón justo
    // mientras espera, y cualquier referencia a él por su nombre deja de
    // encontrarlo a mitad de acción.
    const btn = screen.getByRole("button", { name: "Refresh" });
    expect(btn).toBeDisabled();
    expect(btn).toHaveTextContent(/Refreshing/i);
  });

  it("renders all cadence options and reports the chosen value", async () => {
    const user = setupUser();
    const onChange = vi.fn();
    render(
      <RefreshControl
        refreshSeconds="60"
        onRefreshSecondsChange={onChange}
        onRefresh={() => {}}
        loading={false}
      />
    );

    await user.click(screen.getByRole("combobox", { name: /Auto refresh/i }));
    const listbox = screen.getByRole("listbox");
    for (const opt of REFRESH_OPTIONS) {
      expect(within(listbox).getByRole("option", { name: opt.label })).toBeInTheDocument();
    }

    await user.click(within(listbox).getByRole("option", { name: "Every 5 min" }));
    expect(onChange).toHaveBeenCalledWith("300");
  });

  // ── Orden y altura de la fila (07-sep) ──────────────────────────
  //
  // El desplegable iba ANTES del botón, así que quedaba en medio de la fila de
  // acciones en vez de cerrarla; y medía 40 px contra los 36,5 del botón —
  // cuatro píxeles que en una fila alineada al centro se leen como un
  // descuido, en las once páginas que usan este control.
  it("el botón va primero y el desplegable cierra la fila", () => {
    const { container } = render(
      <RefreshControl refreshSeconds="60" onRefreshSecondsChange={() => {}} onRefresh={() => {}} />
    );

    const boton = screen.getByRole("button", { name: "Refresh" });
    const campo = screen.getByLabelText(/auto refresh/i).closest(".MuiFormControl-root");

    // `compareDocumentPosition` mide el orden REAL en el DOM, que es el que
    // decide la posición visual en un flex row — no el orden en que se
    // escribieron los props.
    expect(boton.compareDocumentPosition(campo) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(container).toBeTruthy();
  });

  it("los dos declaran la MISMA altura", () => {
    // jsdom no maqueta, así que no se puede medir en píxeles: se comprueba que
    // ambos la declaran, que es lo que impide que vuelvan a separarse cuando
    // MUI cambie sus defaults.
    render(
      <RefreshControl refreshSeconds="60" onRefreshSecondsChange={() => {}} onRefresh={() => {}} />
    );

    const boton = screen.getByRole("button", { name: "Refresh" });
    const input = screen.getByLabelText(/auto refresh/i).closest(".MuiInputBase-root");

    const alturaBoton = getComputedStyle(boton).height;
    const alturaCampo = getComputedStyle(input).height;
    expect(alturaBoton).toBe(alturaCampo);
    expect(alturaBoton).not.toBe("");
  });
});
