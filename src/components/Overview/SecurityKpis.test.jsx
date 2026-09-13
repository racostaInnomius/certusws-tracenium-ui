// src/components/Overview/SecurityKpis.test.jsx

import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import SecurityKpis from "./SecurityKpis";

afterEach(cleanup);

const ok = (value) => ({ status: "fulfilled", value });
const all = () => true;

describe("SecurityKpis", () => {
  it("⭐ sin equipos reportando, cero hallazgos NO se pinta como 'todo bien'", () => {
    render(
      <SecurityKpis
        has={(k) => k === "scp"}
        results={{ complianceSummary: ok({ summary: { avgScore: null, devicesReporting: 0, openFindings: {} } }) }}
      />
    );

    expect(screen.queryByText("no open high-severity findings")).toBeNull();
    expect(screen.getByText("no device has reported yet")).toBeTruthy();
    // Ni el rótulo ni la cifra: un "0" grande también se lee como "cero
    // hallazgos". Compliance y Critical findings dicen "—" los dos.
    expect(screen.queryByText("0")).toBeNull();
    expect(screen.getAllByText("—")).toHaveLength(2);
  });

  it("con equipos reportando dice los hallazgos críticos + altos abiertos", () => {
    render(
      <SecurityKpis
        has={all}
        results={{ complianceSummary: ok({ summary: { avgScore: 78, devicesReporting: 8, openFindings: { critical: 1, high: 3 } } }) }}
      />
    );

    expect(screen.getByText("78%")).toBeTruthy();
    expect(screen.getByText("4")).toBeTruthy();
  });

  it("un 403 de Remote Control (USER) no pinta sus cards en vez de enseñar '—'", () => {
    render(
      <SecurityKpis
        has={all}
        results={{
          complianceSummary: ok({ summary: { devicesReporting: 1, openFindings: {} } }),
          rcpSummary: { status: "rejected", reason: Object.assign(new Error("forbidden"), { status: 403 }) },
        }}
      />
    );

    expect(screen.queryByText("Remote-ready")).toBeNull();
    expect(screen.getByText("Compliance")).toBeTruthy();
  });

  it("cada card se gatea por SU plugin: RCP sin SCP no enseña compliance", () => {
    render(
      <SecurityKpis
        has={(k) => k === "rcp"}
        results={{ rcpSummary: ok({ summary: { readyNow: 2, fleetTotal: 5, sessionsLast7d: 1 } }) }}
      />
    );

    expect(screen.queryByText("Compliance")).toBeNull();
    expect(screen.getByText("Remote-ready")).toBeTruthy();
  });
});
