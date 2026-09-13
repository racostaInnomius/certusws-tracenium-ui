// src/components/Overview/LatestAlerts.hostname.test.jsx

import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import LatestAlerts from "./LatestAlerts";

afterEach(cleanup);

const UUID = "3f2a9c1e-7b4d-4e8a-9c21-5d6e7f8a9b0c";

describe("LatestAlerts — hostname", () => {
  it("⭐ usa el `hostname` que trae el feed, sin índice del cliente", () => {
    // El índice se construía con los 5 hosts de /dashboard/hosts: sólo
    // resolvía esos cinco. El feed ya trae el hostname desde el servidor.
    render(
      <LatestAlerts
        result={{
          status: "fulfilled",
          value: {
            items: [
              {
                source: "agent",
                sourceEventId: "e1",
                severity: "high",
                deviceId: UUID,
                hostname: "W11-FINANCE-07",
                summary: `Device ${UUID} went offline`,
                occurredAt: "2026-09-11T10:00:00Z",
              },
            ],
          },
        }}
      />
    );

    expect(screen.getAllByText(/W11-FINANCE-07/).length).toBeGreaterThan(0);
    expect(screen.queryByText(new RegExp(UUID))).toBeNull();
  });
});
