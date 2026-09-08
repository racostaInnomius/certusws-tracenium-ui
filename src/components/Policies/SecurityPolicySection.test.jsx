import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, within, cleanup } from "@testing-library/react";
import SecurityPolicySection from "./SecurityPolicySection";
import { SECURITY_CAPABILITIES } from "./policyTransforms";

const emptyForm = { security: { defaultMode: "report-only", capabilities: {} } };

afterEach(cleanup);

describe("SecurityPolicySection", () => {
  it("renders one card per capability with its label", () => {
    render(<SecurityPolicySection form={emptyForm} onChange={() => {}} />);
    for (const cap of SECURITY_CAPABILITIES) {
      expect(screen.getByText(cap.label)).toBeInTheDocument();
    }
  });

  it("marks non-enforcer capabilities with 'auto coming soon'", () => {
    render(<SecurityPolicySection form={emptyForm} onChange={() => {}} />);
    // Las de detección solamente NO prometen un auto que no va a llegar.
    const placeholders = SECURITY_CAPABILITIES.filter((c) => !c.enforcer && !c.detectOnly);
    // Each placeholder capability shows the chip.
    expect(screen.getAllByText("auto coming soon").length).toBe(placeholders.length);
  });

  it("BitLocker, SIP y FileVault son 'detection only': sin chip de 'coming soon' y sin opción auto", () => {
    render(<SecurityPolicySection form={emptyForm} onChange={() => {}} />);
    const detectOnly = SECURITY_CAPABILITIES.filter((c) => c.detectOnly).map((c) => c.key);
    expect(detectOnly).toEqual(expect.arrayContaining(["bitlocker", "sip", "filevault"]));
    expect(screen.getAllByText("detection only").length).toBe(detectOnly.length);
    // El selector de modo de BitLocker no ofrece "auto" ni deshabilitado.
    const idx = SECURITY_CAPABILITIES.findIndex((c) => c.key === "bitlocker");
    const modeSelect = screen.getAllByRole("combobox", { name: /Mode/ })[idx];
    fireEvent.mouseDown(modeSelect);
    const listbox = screen.getByRole("listbox");
    expect(within(listbox).queryByText(/Auto/)).toBeNull();
    expect(within(listbox).getByText(/Report only/)).toBeInTheDocument();
  });

  it("emits a mode change that patches the right capability", () => {
    const onChange = vi.fn();
    render(<SecurityPolicySection form={emptyForm} onChange={onChange} />);

    // Cards render in SECURITY_CAPABILITIES order → the first Mode combobox is
    // firewall's. Open it and pick "Report only".
    const modeSelects = screen.getAllByRole("combobox");
    fireEvent.mouseDown(modeSelects[0]);
    const listbox = screen.getByRole("listbox");
    fireEvent.click(within(listbox).getByText("Report only"));

    expect(onChange).toHaveBeenCalledTimes(1);
    const next = onChange.mock.calls[0][0];
    expect(next.security.capabilities.firewall.mode).toBe("report-only");
  });

  it("renders a boolean capability field as a switch and toggles its value", () => {
    const onChange = vi.fn();
    // firewall has a boolean field `required` (default true).
    const { container } = render(<SecurityPolicySection form={emptyForm} onChange={onChange} />);
    const checkboxes = container.querySelectorAll('input[type="checkbox"]');
    expect(checkboxes.length).toBeGreaterThan(0);
    fireEvent.click(checkboxes[0]);
    expect(onChange).toHaveBeenCalled();
    // The patch writes into security.capabilities.<key>.values
    const next = onChange.mock.calls[0][0];
    const caps = next.security.capabilities;
    const touched = Object.values(caps).find((c) => Object.keys(c.values || {}).length > 0);
    expect(touched).toBeTruthy();
  });

  it("disables inputs when readOnly", () => {
    render(<SecurityPolicySection form={emptyForm} onChange={() => {}} readOnly />);
    const selects = screen.getAllByLabelText("Mode");
    expect(selects[0]).toHaveAttribute("aria-disabled", "true");
  });
});
