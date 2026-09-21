// src/components/patch-management/CriticalDevicesNote.test.jsx
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import CriticalDevicesNote, { criticalDevicesText } from "./CriticalDevicesNote";

afterEach(cleanup);

describe("equipos críticos de un CVE", () => {
  it("null (no se supo) y 0 no pintan nada", () => {
    expect(criticalDevicesText(null)).toBeNull();
    expect(criticalDevicesText(undefined)).toBeNull();
    expect(criticalDevicesText(0)).toBeNull();
    const { container } = render(<CriticalDevicesNote count={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("con alguno lo dice", () => {
    render(<CriticalDevicesNote count={2} />);
    expect(screen.getByText("2 critical")).toBeInTheDocument();
  });
});
