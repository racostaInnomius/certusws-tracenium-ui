import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { AiIntelligenceSection, SoftwareDeliverySection } from "./AiSdpSections";

afterEach(cleanup);

describe("AiIntelligenceSection", () => {
  it("hides the quota fields until AI is enabled", () => {
    render(<AiIntelligenceSection form={{ ai: { enabled: false } }} onChange={() => {}} />);
    expect(screen.queryByLabelText("Max AI calls / day")).not.toBeInTheDocument();
  });

  it("toggling the entitlement emits ai.enabled", () => {
    const onChange = vi.fn();
    render(<AiIntelligenceSection form={{ ai: {} }} onChange={onChange} />);
    fireEvent.click(screen.getByRole("switch"));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0].ai.enabled).toBe(true);
  });

  it("shows the quota fields and coerces them to numbers when enabled", () => {
    const onChange = vi.fn();
    render(<AiIntelligenceSection form={{ ai: { enabled: true } }} onChange={onChange} />);
    const calls = screen.getByLabelText("Max AI calls / day");
    expect(calls).toBeInTheDocument();
    fireEvent.change(calls, { target: { value: "100" } });
    expect(onChange.mock.calls[0][0].ai.maxCallsPerDay).toBe(100);

    fireEvent.change(screen.getByLabelText("Max AI tokens / day"), { target: { value: "5000" } });
    expect(onChange.mock.calls[1][0].ai.maxTokensPerDay).toBe(5000);
  });

  it("blank quota field emits '' (unlimited sentinel)", () => {
    const onChange = vi.fn();
    render(<AiIntelligenceSection form={{ ai: { enabled: true, maxCallsPerDay: 100 } }} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText("Max AI calls / day"), { target: { value: "" } });
    expect(onChange.mock.calls[0][0].ai.maxCallsPerDay).toBe("");
  });
});

describe("SoftwareDeliverySection", () => {
  it("emits a numeric bandwidth cap and '' when blank", () => {
    const onChange = vi.fn();
    render(<SoftwareDeliverySection form={{ sdp: {} }} onChange={onChange} />);
    const field = screen.getByLabelText("Download limit (KB/s)");
    fireEvent.change(field, { target: { value: "512" } });
    expect(onChange.mock.calls[0][0].sdp.bandwidthLimitKbps).toBe(512);

    cleanup();
    const onChange2 = vi.fn();
    render(<SoftwareDeliverySection form={{ sdp: { bandwidthLimitKbps: 512 } }} onChange={onChange2} />);
    fireEvent.change(screen.getByLabelText("Download limit (KB/s)"), { target: { value: "" } });
    expect(onChange2.mock.calls[0][0].sdp.bandwidthLimitKbps).toBe("");
  });

  it("disables the field when readOnly", () => {
    render(<SoftwareDeliverySection form={{ sdp: {} }} onChange={() => {}} readOnly />);
    expect(screen.getByLabelText("Download limit (KB/s)")).toBeDisabled();
  });
});
