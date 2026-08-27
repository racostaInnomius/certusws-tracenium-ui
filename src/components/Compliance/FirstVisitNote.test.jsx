// La nota de bienvenida: tres frases, una vez.
//
// Lo que se fija es sobre todo el comportamiento ante un localStorage que NO
// responde — modo privado, cookies bloqueadas, políticas de empresa. Una nota
// informativa nunca debe poder tumbar la página, y ante la duda se enseña:
// molestar una vez de más es mejor que romper.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import FirstVisitNote from "./FirstVisitNote";

const KEY = "tnm:scp:welcome-dismissed";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  window.localStorage.clear();
});

beforeEach(() => window.localStorage.clear());

describe("FirstVisitNote", () => {
  it("la primera vez se ve, y dice por dónde empezar", async () => {
    render(<FirstVisitNote />);
    expect(screen.getByText("New here?")).toBeInTheDocument();
    // La frase que la página nunca decía: qué se está comparando.
    expect(screen.getByText(/compares how your devices are actually configured/)).toBeInTheDocument();
    expect(screen.getByText("What to fix first")).toBeInTheDocument();
  });

  it("al descartarla desaparece y no vuelve", () => {
    const { unmount } = render(<FirstVisitNote />);
    fireEvent.click(screen.getByLabelText("Dismiss this note"));
    expect(screen.queryByText("New here?")).not.toBeInTheDocument();
    expect(window.localStorage.getItem(KEY)).toBe("1");

    unmount();
    render(<FirstVisitNote />);
    expect(screen.queryByText("New here?")).not.toBeInTheDocument();
  });

  it("si localStorage no se puede LEER, se enseña igual", () => {
    // Ante la duda se muestra: la alternativa es esconderle a un recién
    // llegado justo la explicación que necesita.
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });
    render(<FirstVisitNote />);
    expect(screen.getByText("New here?")).toBeInTheDocument();
  });

  it("si localStorage no se puede ESCRIBIR, se cierra igual en esta sesión", () => {
    // No se propaga el fallo: cerrar una nota no puede reventar la página.
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });
    render(<FirstVisitNote />);
    expect(() => fireEvent.click(screen.getByLabelText("Dismiss this note"))).not.toThrow();
    expect(screen.queryByText("New here?")).not.toBeInTheDocument();
  });
});
