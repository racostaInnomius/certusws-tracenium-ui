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

  it("loading=true → button reads 'Refreshing…' and is disabled", () => {
    render(
      <RefreshControl
        refreshSeconds="60"
        onRefreshSecondsChange={() => {}}
        onRefresh={() => {}}
        loading
      />
    );
    const btn = screen.getByRole("button", { name: /Refreshing/i });
    expect(btn).toBeDisabled();
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
});
