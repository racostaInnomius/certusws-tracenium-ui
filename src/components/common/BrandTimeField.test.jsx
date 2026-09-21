// src/components/common/BrandTimeField.test.jsx

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import BrandTimeField from "./BrandTimeField";

afterEach(cleanup);

describe("BrandTimeField", () => {
  it("mismo contrato que el input nativo: recibe y devuelve «HH:MM» en 24 h", async () => {
    const user = userEvent.setup({ delay: null });
    const onChange = vi.fn();
    render(<BrandTimeField label="Start" value="02:00" onChange={onChange} locale="en-US" />);
    expect(screen.getByRole("combobox", { name: /^Start/ })).toHaveTextContent("02:00 AM");
    await user.click(screen.getByRole("combobox", { name: /^Start/ }));
    await user.click(screen.getByRole("option", { name: "10:00 PM" }));
    expect(onChange).toHaveBeenCalledWith("22:00");
  });

  it("⭐ la opción elegida se marca con la marca, no con el azul por defecto", async () => {
    const user = userEvent.setup({ delay: null });
    render(<BrandTimeField label="Start" value="02:00" onChange={() => {}} locale="en-US" />);
    await user.click(screen.getByRole("combobox", { name: /^Start/ }));
    const elegida = screen.getByRole("option", { name: "02:00 AM" });
    expect(elegida).toHaveAttribute("aria-selected", "true");
    // #3E7878 = BRAND.tealText, sobre BRAND.tealSoftStrong. El fondo es lo que
    // fallaba en el navegador: con Mui-selected + Mui-focusVisible, la regla de
    // MUI ganaba y salía el azul por defecto.
    expect(getComputedStyle(elegida).color).toBe("rgb(62, 120, 120)");
    expect(getComputedStyle(elegida).backgroundColor).toBe("rgba(90, 159, 159, 0.22)");
  });

  it("no pinta ningún `<input type=\"time\">`", () => {
    render(<BrandTimeField label="End" value="04:00" onChange={() => {}} />);
    expect(document.querySelector('input[type="time"]')).toBeNull();
  });
});
