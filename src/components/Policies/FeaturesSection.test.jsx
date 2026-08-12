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

  // ── Consent gate ────────────────────────────────────────────────
  //
  // The whole consent chain exists (policy flag, backend gate, agent
  // plumbing) except the native prompt itself, so enabling it today just
  // makes the backend refuse every session. The control therefore has to be
  // one-way: never switchable ON, always switchable OFF.
  describe("Require user consent (not yet implementable)", () => {
    const withConsent = (on) => ({
      plugins: { rcp: true },
      features: { remoteRequireConsent: on },
    });

    it("cannot be switched on", () => {
      render(<FeaturesSection form={withConsent(false)} onChange={() => {}} catalog={rcpCatalog} />);
      expect(screen.getByRole("switch", { name: /Require user consent/i })).toBeDisabled();
    });

    it("is labelled as unavailable", () => {
      render(<FeaturesSection form={withConsent(false)} onChange={() => {}} catalog={rcpCatalog} />);
      expect(screen.getByText("Not available yet")).toBeInTheDocument();
    });

    it("stays switchable when already on, so it can be undone", () => {
      const onChange = vi.fn();
      render(<FeaturesSection form={withConsent(true)} onChange={onChange} catalog={rcpCatalog} />);
      const sw = screen.getByRole("switch", { name: /Require user consent/i });
      expect(sw).toBeEnabled();
      fireEvent.click(sw);
      expect(onChange.mock.calls[0][0].features.remoteRequireConsent).toBe(false);
    });

    it("warns that sessions are being blocked while it is on", () => {
      render(<FeaturesSection form={withConsent(true)} onChange={() => {}} catalog={rcpCatalog} />);
      expect(screen.getByText(/Remote control is currently blocked/i)).toBeInTheDocument();
    });

    it("shows no warning while it is off", () => {
      render(<FeaturesSection form={withConsent(false)} onChange={() => {}} catalog={rcpCatalog} />);
      expect(screen.queryByText(/Remote control is currently blocked/i)).not.toBeInTheDocument();
    });

    it("readOnly still wins over the on-state exception", () => {
      render(<FeaturesSection form={withConsent(true)} onChange={() => {}} catalog={rcpCatalog} readOnly />);
      expect(screen.getByRole("switch", { name: /Require user consent/i })).toBeDisabled();
    });
  });

  it("disables switches when readOnly", () => {
    render(<FeaturesSection form={rcpEnabledForm} onChange={() => {}} catalog={rcpCatalog} readOnly />);
    expect(screen.getByRole("switch", { name: /Self-update/i })).toBeDisabled();
    expect(screen.getByRole("switch", { name: /Remote shell/i })).toBeDisabled();
  });
});
