import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import CryptoDiscoverySection from "./CryptoDiscoverySection";

afterEach(cleanup);

const baseForm = { cdp: { intervalSeconds: "", javaKeystorePaths: "" } };
const KEYSTORE_LABEL = "Application Java keystores (JKS / PKCS12)";
const INTERVAL_LABEL = "Scan interval (seconds)";

describe("CryptoDiscoverySection", () => {
  it("renders both controls, blank by default", () => {
    render(<CryptoDiscoverySection form={baseForm} onChange={() => {}} />);
    expect(screen.getByLabelText(INTERVAL_LABEL)).toHaveValue(null);
    expect(screen.getByLabelText(KEYSTORE_LABEL)).toHaveValue("");
  });

  it("writes the whole form back so sibling sub-forms survive", () => {
    const onChange = vi.fn();
    const form = { managedApp: { requireAppPIN: true }, cdp: {} };
    render(<CryptoDiscoverySection form={form} onChange={onChange} />);

    fireEvent.change(screen.getByLabelText(KEYSTORE_LABEL), {
      target: { value: "/opt/tomcat/conf/keystore.jks" },
    });

    expect(onChange).toHaveBeenCalledWith({
      managedApp: { requireAppPIN: true },
      cdp: { javaKeystorePaths: "/opt/tomcat/conf/keystore.jks" },
    });
  });

  it("counts configured paths so the operator can see the list took effect", () => {
    render(
      <CryptoDiscoverySection
        form={{ cdp: { javaKeystorePaths: "/a/one.jks\n\n/b/two.p12\n  \n" } }}
        onChange={() => {}}
      />
    );
    expect(screen.getByText(/2 configured/)).toBeInTheDocument();
  });

  it("flags relative paths — the agent silently drops them", () => {
    render(
      <CryptoDiscoverySection
        form={{ cdp: { javaKeystorePaths: "conf/keystore.jks" } }}
        onChange={() => {}}
      />
    );
    expect(screen.getByText(/Not absolute/)).toBeInTheDocument();
  });

  it("accepts both POSIX and Windows absolute paths without complaining", () => {
    render(
      <CryptoDiscoverySection
        form={{ cdp: { javaKeystorePaths: "/opt/a.jks\nC:\\App\\b.p12\nC:/App/c.jks" } }}
        onChange={() => {}}
      />
    );
    expect(screen.queryByText(/Not absolute/)).not.toBeInTheDocument();
    expect(screen.getByText(/3 configured/)).toBeInTheDocument();
  });

  it("warns past the 50-path cap", () => {
    const many = Array.from({ length: 51 }, (_, i) => `/opt/app${i}/ks.jks`).join("\n");
    render(
      <CryptoDiscoverySection form={{ cdp: { javaKeystorePaths: many } }} onChange={() => {}} />
    );
    expect(screen.getByText(/Too many paths \(51\)/)).toBeInTheDocument();
  });

  it("flags an out-of-range interval but not a valid or blank one", () => {
    const { rerender } = render(
      <CryptoDiscoverySection form={{ cdp: { intervalSeconds: 60 } }} onChange={() => {}} />
    );
    expect(screen.getByText(/Must be 900–86400/)).toBeInTheDocument();

    rerender(
      <CryptoDiscoverySection form={{ cdp: { intervalSeconds: 21600 } }} onChange={() => {}} />
    );
    expect(screen.queryByText(/Must be 900–86400/)).not.toBeInTheDocument();

    rerender(<CryptoDiscoverySection form={baseForm} onChange={() => {}} />);
    expect(screen.queryByText(/Must be 900–86400/)).not.toBeInTheDocument();
  });

  it("disables both controls in read-only mode", () => {
    render(<CryptoDiscoverySection form={baseForm} onChange={() => {}} readOnly />);
    expect(screen.getByLabelText(INTERVAL_LABEL)).toBeDisabled();
    expect(screen.getByLabelText(KEYSTORE_LABEL)).toBeDisabled();
  });

  it("survives a form with no cdp block at all", () => {
    expect(() => render(<CryptoDiscoverySection form={{}} onChange={() => {}} />)).not.toThrow();
  });

  // The listener probe. It existed in the agent from the day the collector
  // shipped and had no authoring surface anywhere, so it was off in every
  // tenant and the capabilities that read only from it — TLS chain
  // validation and certificate-to-process attribution — never had a row.
  describe("TLS listener probe", () => {
    const PROBE_LABEL = "Probe local TLS services";
    const PORTS_LABEL = "Limit to ports (optional)";

    it("is off by default and hides the port field until it is on", () => {
      render(<CryptoDiscoverySection form={baseForm} onChange={() => {}} />);
      expect(screen.getByLabelText(PROBE_LABEL)).not.toBeChecked();
      expect(screen.queryByLabelText(PORTS_LABEL)).not.toBeVisible();
    });

    it("reveals the port field once switched on", () => {
      const form = { cdp: { scanTlsListeners: true } };
      render(<CryptoDiscoverySection form={form} onChange={() => {}} />);
      expect(screen.getByLabelText(PROBE_LABEL)).toBeChecked();
      expect(screen.getByLabelText(PORTS_LABEL)).toBeVisible();
    });

    it("treats anything that is not a stored true as off", () => {
      // The agent tests `=== true`. A truthy string must not render as
      // enabled, or the UI would claim a state the endpoint does not have.
      render(<CryptoDiscoverySection form={{ cdp: { scanTlsListeners: "true" } }} onChange={() => {}} />);
      expect(screen.getByLabelText(PROBE_LABEL)).not.toBeChecked();
    });

    it("writes the whole form back when toggled", () => {
      const onChange = vi.fn();
      render(<CryptoDiscoverySection form={{ managedApp: { requireAppPIN: true }, cdp: {} }} onChange={onChange} />);
      fireEvent.click(screen.getByLabelText(PROBE_LABEL));
      expect(onChange).toHaveBeenCalledWith({
        managedApp: { requireAppPIN: true },
        cdp: { scanTlsListeners: true },
      });
    });

    it("names invalid ports rather than just flagging the field", () => {
      const form = { cdp: { scanTlsListeners: true, tlsListenerPorts: "443, https, 65536" } };
      render(<CryptoDiscoverySection form={form} onChange={() => {}} />);
      expect(screen.getByText(/Not valid ports: https, 65536/)).toBeInTheDocument();
    });

    it("counts the ports it accepted so a typo does not read as a narrower scan", () => {
      const form = { cdp: { scanTlsListeners: true, tlsListenerPorts: "443 8443, 9443" } };
      render(<CryptoDiscoverySection form={form} onChange={() => {}} />);
      expect(screen.getByText(/3 port\(s\)/)).toBeInTheDocument();
    });

    it("disables both probe controls in read-only mode", () => {
      const form = { cdp: { scanTlsListeners: true, tlsListenerPorts: "443" } };
      render(<CryptoDiscoverySection form={form} onChange={() => {}} readOnly />);
      expect(screen.getByLabelText(PROBE_LABEL)).toBeDisabled();
      expect(screen.getByLabelText(PORTS_LABEL)).toBeDisabled();
    });
  });
});
