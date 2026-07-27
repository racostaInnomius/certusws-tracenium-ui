import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import IntervalScheduleCard from "./IntervalScheduleCard";

afterEach(cleanup);

const base = {
  formKey: "inventory",
  title: "Inventory schedule (AMP)",
  label: "Asset collection interval (seconds)",
  min: 60,
  max: 86400,
  step: 60,
  helperText: "Blank = use backend default.",
};

describe("IntervalScheduleCard", () => {
  it("renders the title, label and current value", () => {
    render(<IntervalScheduleCard {...base} form={{ inventory: { intervalSeconds: 120 } }} onChange={() => {}} />);
    expect(screen.getByText("Inventory schedule (AMP)")).toBeInTheDocument();
    expect(screen.getByDisplayValue("120")).toBeInTheDocument();
    expect(screen.getByText("Blank = use backend default.")).toBeInTheDocument();
  });

  it("shows blank (not 0) when the interval is null/unset", () => {
    render(<IntervalScheduleCard {...base} form={{ inventory: { intervalSeconds: null } }} onChange={() => {}} />);
    expect(screen.getByLabelText(base.label)).toHaveValue(null);
  });

  it("emits a numeric interval under the right formKey", () => {
    const onChange = vi.fn();
    render(<IntervalScheduleCard {...base} form={{ inventory: {} }} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText(base.label), { target: { value: "300" } });
    expect(onChange).toHaveBeenCalledWith({ inventory: { intervalSeconds: 300 } });
  });

  it("emits null when cleared so the block is omitted", () => {
    const onChange = vi.fn();
    render(<IntervalScheduleCard {...base} form={{ inventory: { intervalSeconds: 300 } }} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText(base.label), { target: { value: "" } });
    expect(onChange).toHaveBeenCalledWith({ inventory: { intervalSeconds: null } });
  });

  it("flags an out-of-range value with the bounds message", () => {
    render(<IntervalScheduleCard {...base} form={{ inventory: { intervalSeconds: 5 } }} onChange={() => {}} />);
    expect(screen.getByText("Must be between 60 and 86400 seconds")).toBeInTheDocument();
  });

  it("preserves other keys on the form slice when patching", () => {
    const onChange = vi.fn();
    render(
      <IntervalScheduleCard
        {...base}
        formKey="compliance"
        form={{ compliance: { intervalSeconds: 600, extra: true }, other: 1 }}
        onChange={onChange}
      />
    );
    fireEvent.change(screen.getByLabelText(base.label), { target: { value: "900" } });
    expect(onChange).toHaveBeenCalledWith({
      compliance: { intervalSeconds: 900, extra: true },
      other: 1,
    });
  });

  it("disables the field when readOnly", () => {
    render(<IntervalScheduleCard {...base} form={{ inventory: {} }} onChange={() => {}} readOnly />);
    expect(screen.getByLabelText(base.label)).toBeDisabled();
  });
});
