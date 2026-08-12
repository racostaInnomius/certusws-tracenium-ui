// src/components/patch-management/MaintenanceWindowDialog.test.jsx

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import MaintenanceWindowDialog from "./MaintenanceWindowDialog";
import { minutesToHHMM, hhmmToMinutes, durationFromTimes } from "./maintenanceWindowTime";

afterEach(cleanup);

describe("time helpers", () => {
  it("converts between minutes and HH:MM", () => {
    expect(minutesToHHMM(120)).toBe("02:00");
    expect(minutesToHHMM(1439)).toBe("23:59");
    expect(hhmmToMinutes("04:30")).toBe(270);
    expect(hhmmToMinutes("bad")).toBeNull();
  });

  it("computes duration, wrapping past midnight", () => {
    expect(durationFromTimes(120, 240)).toBe(120); // 02:00→04:00
    expect(durationFromTimes(1380, 60)).toBe(120); // 23:00→01:00 (crosses midnight)
    expect(durationFromTimes(120, 120)).toBeNull(); // equal → invalid
  });
});

function renderDialog(props = {}) {
  const onSubmit = vi.fn();
  render(<MaintenanceWindowDialog open mode="create" window={null} submitting={false} onClose={() => {}} onSubmit={onSubmit} {...props} />);
  return { onSubmit };
}

describe("MaintenanceWindowDialog", () => {
  it("submits days + times converted to the backend payload shape", async () => {
    const user = userEvent.setup({ delay: null });
    const { onSubmit } = renderDialog();

    await user.type(screen.getByRole("textbox", { name: /^Name/ }), "Overnight");
    // Defaults: days Mon–Fri, 02:00–04:00. Submit as-is.
    await user.click(screen.getByRole("button", { name: /Create/i }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0][0]).toMatchObject({
      name: "Overnight",
      daysOfWeek: [1, 2, 3, 4, 5],
      startMinute: 120,
      durationMinutes: 120,
      enabled: true,
    });
  });

  it("rejects when no day is selected", async () => {
    const user = userEvent.setup({ delay: null });
    const { onSubmit } = renderDialog({ window: { name: "X", daysOfWeek: [], startMinute: 120, durationMinutes: 120, timezone: "UTC", enabled: true }, mode: "edit" });
    await user.click(screen.getByRole("button", { name: /Save changes/i }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText(/at least one day/i)).toBeInTheDocument();
  });

  it("rejects when start and end times are equal", async () => {
    const user = userEvent.setup({ delay: null });
    const { onSubmit } = renderDialog();
    await user.type(screen.getByRole("textbox", { name: /^Name/ }), "X"); // name validates first
    fireEvent.change(screen.getByLabelText(/^End/), { target: { value: "02:00" } }); // == default start
    await user.click(screen.getByRole("button", { name: /Create/i }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText(/must differ/i)).toBeInTheDocument();
  });
});
