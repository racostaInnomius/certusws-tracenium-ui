// src/components/common/RefreshControl.test.jsx
//
// Sprint 2 — refresh control (presentational) + useAutoRefresh hook.
// No network. Covers the disabled-while-loading behavior, the cadence
// dropdown, and the button label swap.

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import RefreshControl, { DEFAULT_REFRESH_SECONDS, REFRESH_OPTIONS } from "./RefreshControl";

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

  // ── El botón no cambia de tamaño (09-sep) ───────────────────────
  //
  // "Refresh" → "Refreshing…" son cinco caracteres más: el botón se ensanchaba
  // 36,6 px y volvía a encogerse en cada pulsación, empujando al desplegable
  // que tiene al lado. No parpadeaba el botón, parpadeaba media cabecera.
  //
  // Medido en el navegador con el tema real: quitar el icono corta el salto a
  // 12,6 px pero NO lo elimina, así que hacen falta las dos cosas.
  it("⭐ mide lo mismo refrescando que en reposo", () => {
    const { rerender } = render(
      <RefreshControl refreshSeconds="1200" onRefreshSecondsChange={() => {}} onRefresh={() => {}} loading={false} />
    );
    const reposo = getComputedStyle(screen.getByRole("button", { name: "Refresh" })).width;

    rerender(
      <RefreshControl refreshSeconds="1200" onRefreshSecondsChange={() => {}} onRefresh={() => {}} loading />
    );
    const refrescando = getComputedStyle(screen.getByRole("button", { name: "Refresh" })).width;

    expect(reposo).toBe(refrescando);
    // Y que sea un ancho de verdad, no dos cadenas vacías empatando: sin esto
    // el test pasaría en un jsdom que no resolviera la propiedad.
    expect(reposo).toMatch(/^\d+(\.\d+)?px$/);
  });

  it("el icono desaparece mientras refresca, y vuelve al terminar", () => {
    // Es la mitad barata de mantener el ancho —ahorra 24 px justo cuando el
    // rótulo crece 36— y de paso el botón deshabilitado deja de enseñar un
    // icono de "pulsa aquí".
    const { rerender } = render(
      <RefreshControl refreshSeconds="1200" onRefreshSecondsChange={() => {}} onRefresh={() => {}} loading />
    );
    expect(screen.getByRole("button", { name: "Refresh" }).querySelector(".MuiButton-startIcon")).toBeNull();

    rerender(
      <RefreshControl refreshSeconds="1200" onRefreshSecondsChange={() => {}} onRefresh={() => {}} loading={false} />
    );
    expect(screen.getByRole("button", { name: "Refresh" }).querySelector(".MuiButton-startIcon")).not.toBeNull();
  });

  // ── Las cadencias (09-sep) ──────────────────────────────────────
  //
  // Estaban en 30 s / 60 s / 2 min / 5 min. Con quince páginas usando esto, un
  // portal abierto en una pestaña olvidada golpeaba el backend dos veces por
  // minuto para siempre — y ninguno de estos datos cambia a esa velocidad: los
  // recoge un agente que reporta cada varios minutos.
  it("las cadencias son 1, 5, 10 y 20 minutos, y el defecto es 20", () => {
    expect(REFRESH_OPTIONS.filter((o) => o.value !== "0").map((o) => o.value))
      .toEqual(["60", "300", "600", "1200"]);
    expect(DEFAULT_REFRESH_SECONDS).toBe("1200");
  });

  it("⚠️ 'Off' sigue existiendo", () => {
    // No es una cadencia, pero es la única forma de parar el goteo — y hay dos
    // páginas (Crypto Discovery, Baselines embebido) que pasan "0" como su
    // defecto: sin esta entrada arrancarían con un valor que `useAutoRefresh`
    // rechaza y caerían al defecto general, encendiendo un refresco que esas
    // páginas apagan a propósito.
    expect(REFRESH_OPTIONS.some((o) => o.value === "0")).toBe(true);
  });

  it("una cadencia retirada guardada en la URL cae al defecto", () => {
    // `?assetsAutoRefresh=30` sigue vivo en enlaces y en pestañas abiertas. Un
    // enlace guardado no puede reponer un ritmo que se retiró a propósito.
    expect(REFRESH_OPTIONS.some((o) => o.value === "30")).toBe(false);
    expect(REFRESH_OPTIONS.some((o) => o.value === "120")).toBe(false);
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
