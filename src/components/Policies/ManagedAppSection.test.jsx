import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, within, cleanup } from "@testing-library/react";
import ManagedAppSection from "./ManagedAppSection";
import { MAM_BOOL_FIELDS, readManagedAppFromPolicy } from "./policyTransforms";

afterEach(cleanup);

const EMPTY = readManagedAppFromPolicy({});

describe("ManagedAppSection", () => {
  it("una fila por booleano (tri-estado a la vista) y las dos escalares", () => {
    render(<ManagedAppSection value={EMPTY} onChange={() => {}} />);
    for (const f of MAM_BOOL_FIELDS) {
      const group = screen.getByRole("group", { name: f.label });
      expect(within(group).getAllByRole("button").map((b) => b.textContent)).toEqual(["Not set", f.onLabel, f.offLabel]);
    }
    expect(screen.getByLabelText("Idle timeout")).toBeInTheDocument();
    expect(screen.getByLabelText("Minimum app version")).toBeInTheDocument();
  });

  it("refleja el valor guardado: sin opinión = «Not set» elegido", () => {
    const first = MAM_BOOL_FIELDS[0];
    render(<ManagedAppSection value={{ ...EMPTY, [first.key]: true }} onChange={() => {}} />);
    const group = screen.getByRole("group", { name: first.label });
    expect(within(group).getByRole("button", { name: first.onLabel })).toHaveAttribute("aria-pressed", "true");
    const second = screen.getByRole("group", { name: MAM_BOOL_FIELDS[1].label });
    expect(within(second).getByRole("button", { name: "Not set" })).toHaveAttribute("aria-pressed", "true");
  });

  it("un clic pone el valor; «Not set» vuelve a null (sin opinión), no a false", () => {
    const first = MAM_BOOL_FIELDS[0];
    const onChange = vi.fn();
    const { rerender } = render(<ManagedAppSection value={EMPTY} onChange={onChange} />);
    fireEvent.click(within(screen.getByRole("group", { name: first.label })).getByRole("button", { name: first.onLabel }));
    expect(onChange.mock.calls[0][0][first.key]).toBe(true);

    rerender(<ManagedAppSection value={{ ...EMPTY, [first.key]: true }} onChange={onChange} />);
    fireEvent.click(within(screen.getByRole("group", { name: first.label })).getByRole("button", { name: "Not set" }));
    expect(onChange.mock.calls[1][0][first.key]).toBeNull();
  });

  it("pulsar el valor ya elegido no es un cambio", () => {
    const first = MAM_BOOL_FIELDS[0];
    const onChange = vi.fn();
    render(<ManagedAppSection value={EMPTY} onChange={onChange} />);
    fireEvent.click(within(screen.getByRole("group", { name: first.label })).getByRole("button", { name: "Not set" }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("el idle pasa a número; vaciarlo vuelve a «»; la versión mínima pasa tal cual", () => {
    const onChange = vi.fn();
    render(<ManagedAppSection value={{ ...EMPTY, idleTimeoutSeconds: 60 }} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText("Idle timeout"), { target: { value: "300" } });
    expect(onChange.mock.calls[0][0].idleTimeoutSeconds).toBe(300);
    fireEvent.change(screen.getByLabelText("Idle timeout"), { target: { value: "" } });
    expect(onChange.mock.calls[1][0].idleTimeoutSeconds).toBe("");
    fireEvent.change(screen.getByLabelText("Minimum app version"), { target: { value: "1.4.0" } });
    expect(onChange.mock.calls[2][0].minimumAppVersion).toBe("1.4.0");
  });

  it("❗ un idle fuera de rango se dice (antes se tiraba al guardar sin avisar)", () => {
    render(<ManagedAppSection value={{ ...EMPTY, idleTimeoutSeconds: 5 }} onChange={() => {}} />);
    expect(screen.getByText("Must be 15–86400")).toBeInTheDocument();
  });

  it("marca lo editado frente a lo cargado", () => {
    const first = MAM_BOOL_FIELDS[0];
    render(<ManagedAppSection value={{ ...EMPTY, [first.key]: false }} loaded={EMPTY} onChange={() => {}} />);
    expect(screen.getAllByText("Edited")).toHaveLength(1);
  });

  it("todo deshabilitado en sólo lectura", () => {
    render(<ManagedAppSection value={EMPTY} onChange={() => {}} readOnly />);
    expect(screen.getByLabelText("Idle timeout")).toBeDisabled();
    expect(screen.getByLabelText("Minimum app version")).toBeDisabled();
    expect(within(screen.getByRole("group", { name: MAM_BOOL_FIELDS[0].label })).getByRole("button", { name: "Not set" })).toBeDisabled();
  });
});
