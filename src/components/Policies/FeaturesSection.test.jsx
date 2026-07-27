import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import FeaturesSection from "./FeaturesSection";

afterEach(cleanup);

const rcpCatalog = [{ key: "rcp", impliesModule: "remoteControl" }];
const rcpEnabledForm = { plugins: { rcp: true }, features: {} };
const noRcpForm = { plugins: { rcp: false }, features: {} };

describe("FeaturesSection", () => {
  it("renders the self-update toggle, checked by default (unset)", () => {
    render(<FeaturesSection form={{ plugins: {}, features: {} }} onChange={() => {}} catalog={[]} />);
    expect(screen.getByRole("switch", { name: /Self-update/i })).toBeChecked();
  });

  it("toggling self-update off emits features.selfUpdate=false", () => {
    const onChange = vi.fn();
    render(<FeaturesSection form={{ plugins: {}, features: {} }} onChange={onChange} catalog={[]} />);
    fireEvent.click(screen.getByRole("switch", { name: /Self-update/i }));
    expect(onChange.mock.calls[0][0].features.selfUpdate).toBe(false);
  });

  it("hides the RCP sub-section when no remoteControl plugin is enabled", () => {
    render(<FeaturesSection form={noRcpForm} onChange={() => {}} catalog={rcpCatalog} />);
    expect(screen.queryByText("Remote Control (RCP)")).not.toBeInTheDocument();
  });

  it("shows the four RCP gates when the rcp plugin is enabled", () => {
    render(<FeaturesSection form={rcpEnabledForm} onChange={() => {}} catalog={rcpCatalog} />);
    expect(screen.getByText("Remote Control (RCP)")).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: /Remote shell/i })).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: /Remote file transfer/i })).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: /Remote screen share/i })).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: /Require user consent/i })).toBeInTheDocument();
  });

  it("toggling a RCP gate emits the matching feature flag", () => {
    const onChange = vi.fn();
    render(<FeaturesSection form={rcpEnabledForm} onChange={onChange} catalog={rcpCatalog} />);
    fireEvent.click(screen.getByRole("switch", { name: /Remote shell/i }));
    expect(onChange.mock.calls[0][0].features.remoteShell).toBe(true);
  });

  it("disables switches when readOnly", () => {
    render(<FeaturesSection form={rcpEnabledForm} onChange={() => {}} catalog={rcpCatalog} readOnly />);
    expect(screen.getByRole("switch", { name: /Self-update/i })).toBeDisabled();
    expect(screen.getByRole("switch", { name: /Remote shell/i })).toBeDisabled();
  });
});
