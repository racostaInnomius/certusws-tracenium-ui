import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, within, cleanup } from "@testing-library/react";
import ManagedAppSection from "./ManagedAppSection";
import { MAM_BOOL_FIELDS } from "./policyTransforms";

afterEach(cleanup);

const baseForm = { managedApp: {} };

describe("ManagedAppSection", () => {
  it("renders a tri-state select per boolean field plus the two scalar fields", () => {
    render(<ManagedAppSection form={baseForm} onChange={() => {}} />);
    for (const f of MAM_BOOL_FIELDS) {
      expect(screen.getByLabelText(f.label)).toBeInTheDocument();
    }
    expect(screen.getByLabelText("Idle timeout (s)")).toBeInTheDocument();
    expect(screen.getByLabelText("Minimum app version")).toBeInTheDocument();
  });

  it("reflects a stored boolean as On/Off and unset as Unset", () => {
    const form = { managedApp: { [MAM_BOOL_FIELDS[0].key]: true } };
    render(<ManagedAppSection form={form} onChange={() => {}} />);
    // The first field's select shows its onLabel (value === true → "on").
    expect(screen.getByText(MAM_BOOL_FIELDS[0].onLabel)).toBeInTheDocument();
  });

  it("emits a boolean patch when a tri-state select changes to On", () => {
    const onChange = vi.fn();
    render(<ManagedAppSection form={baseForm} onChange={onChange} />);
    const firstSelect = screen.getAllByRole("combobox")[0];
    fireEvent.mouseDown(firstSelect);
    const listbox = screen.getByRole("listbox");
    fireEvent.click(within(listbox).getByText(MAM_BOOL_FIELDS[0].onLabel));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0].managedApp[MAM_BOOL_FIELDS[0].key]).toBe(true);
  });

  it("coerces the idle timeout to a number and passes minimum version through", () => {
    const onChange = vi.fn();
    render(<ManagedAppSection form={baseForm} onChange={onChange} />);

    fireEvent.change(screen.getByLabelText("Idle timeout (s)"), { target: { value: "300" } });
    expect(onChange.mock.calls[0][0].managedApp.idleTimeoutSeconds).toBe(300);

    fireEvent.change(screen.getByLabelText("Minimum app version"), { target: { value: "1.4.0" } });
    expect(onChange.mock.calls[1][0].managedApp.minimumAppVersion).toBe("1.4.0");
  });

  it("disables all controls when readOnly", () => {
    render(<ManagedAppSection form={baseForm} onChange={() => {}} readOnly />);
    expect(screen.getByLabelText("Idle timeout (s)")).toBeDisabled();
    expect(screen.getByLabelText("Minimum app version")).toBeDisabled();
  });
});
