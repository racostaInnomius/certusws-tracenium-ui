// src/components/RemoteControl/rcpMethods.test.js
//
// The fixtures have the EXACT shape fetchConnectableDevices() returns on the
// backend — deviceId/hostname/platform/agentVersion/online/rcpEnabled/
// capabilities and nothing else. Inventing fields here would give green
// tests over data that never arrives.

import { describe, it, expect } from "vitest";
import {
  RCP_METHODS,
  methodFor,
  hasAnyRcp,
  blockedReason,
  canStart,
  availableMethods,
  summarizeFleet,
  countsByMethod,
  matchesSearch,
  filterDevices,
  countWithoutRcp,
  platformLabel,
  fleetNumbers
} from "./rcpMethods";

function device(over = {}) {
  return {
    deviceId: "11111111-2222-3333-4444-555555555555",
    hostname: "SRV-DC01",
    platform: "windows",
    agentVersion: "1.1.57",
    online: true,
    rcpEnabled: true,
    capabilities: ["rcp", "rcp.shell", "rcp.file"],
    ...over
  };
}

describe("catalog", () => {
  it("exposes the three methods with their capability", () => {
    expect(RCP_METHODS.map((m) => m.type)).toEqual(["shell", "file", "screen"]);
    expect(RCP_METHODS.map((m) => m.capability)).toEqual([
      "rcp.shell",
      "rcp.file",
      "rcp.screen"
    ]);
  });

  it("methodFor returns null for an unknown type", () => {
    expect(methodFor("vnc")).toBeNull();
    expect(methodFor(undefined)).toBeNull();
  });
});

describe("platformLabel", () => {
  it("uses the vendor's own spelling", () => {
    expect(platformLabel("macos")).toBe("macOS");
    expect(platformLabel("windows")).toBe("Windows");
    expect(platformLabel("linux")).toBe("Linux");
  });

  it("passes an unknown platform through instead of blanking it", () => {
    // A platform the backend starts sending before this map learns about it
    // should still be readable, not vanish.
    expect(platformLabel("freebsd")).toBe("freebsd");
    expect(platformLabel(null)).toBe("—");
  });
});

describe("hasAnyRcp", () => {
  // The case that motivates the function: the plugin loaded ("rcp") but all
  // three gates are closed by policy. rcpEnabled would say yes.
  it("does not count bare 'rcp' as a usable capability", () => {
    const d = device({ capabilities: ["rcp"], rcpEnabled: true });
    expect(d.rcpEnabled).toBe(true);
    expect(hasAnyRcp(d)).toBe(false);
  });

  it("counts any open gate", () => {
    expect(hasAnyRcp(device({ capabilities: ["rcp", "rcp.screen"] }))).toBe(true);
  });

  it("survives a missing capabilities array", () => {
    expect(hasAnyRcp({ deviceId: "x" })).toBe(false);
  });

  // Another plugin's capabilities must not sneak in.
  it("does not confuse other plugins' capabilities", () => {
    expect(hasAnyRcp(device({ capabilities: ["amp", "scp.baseline"] }))).toBe(false);
  });
});

describe("blockedReason", () => {
  it("returns null when the session can be opened", () => {
    expect(blockedReason(device(), "shell")).toBeNull();
    expect(canStart(device(), "shell")).toBe(true);
  });

  it("names the policy switch when the capability is missing", () => {
    const reason = blockedReason(device(), "screen");
    expect(reason).toContain("remoteScreen");
  });

  // Deliberate order: if the device both lacks the capability AND is
  // offline, what needs saying is the part waiting won't fix.
  it("a missing capability outranks being offline", () => {
    const d = device({ online: false, capabilities: ["rcp", "rcp.shell"] });
    expect(blockedReason(d, "screen")).toContain("remoteScreen");
    expect(blockedReason(d, "shell")).toBe("The device is offline.");
  });
});

describe("summarizeFleet", () => {
  // This is the number the old card got wrong: it counted the whole fleet
  // and labelled itself "with rcp enabled".
  it("separates ready-now, capable and fleet total", () => {
    const devices = [
      device({ deviceId: "a", online: true, capabilities: ["rcp", "rcp.shell"] }),
      device({ deviceId: "b", online: false, capabilities: ["rcp", "rcp.shell"] }),
      device({ deviceId: "c", online: true, capabilities: ["rcp"] }),
      device({ deviceId: "d", online: true, capabilities: [] })
    ];
    expect(summarizeFleet(devices)).toEqual({
      readyNow: 1,
      rcpCapable: 2,
      fleetTotal: 4
    });
  });

  it("returns zeros with no list", () => {
    expect(summarizeFleet(null)).toEqual({ readyNow: 0, rcpCapable: 0, fleetTotal: 0 });
  });
});

describe("fleetNumbers", () => {
  const fleet = [
    device({ deviceId: "a", online: true, capabilities: ["rcp", "rcp.shell"] }),
    device({ deviceId: "b", online: false, capabilities: ["rcp", "rcp.shell"] })
  ];

  it("prefers the server's count over the browser's", () => {
    // The server counts every enrolled device; the browser can only count
    // what it was sent. Deliberately different numbers here so a regression
    // that silently keeps deriving locally shows up as 1/2/2.
    const r = fleetNumbers(
      { readyNow: 38, rcpCapable: 96, fleetTotal: 214 },
      fleet
    );
    expect(r).toEqual({ readyNow: 38, rcpCapable: 96, fleetTotal: 214, source: "server" });
  });

  it("⚠️ keeps a real zero from the server instead of falling back", () => {
    // A tenant where nothing is ready legitimately returns 0. A truthiness
    // check would throw that away and count a device list that, once
    // /devices paginates, isn't even the whole fleet.
    const r = fleetNumbers({ readyNow: 0, rcpCapable: 0, fleetTotal: 214 }, fleet);
    expect(r.source).toBe("server");
    expect(r.fleetTotal).toBe(214);
  });

  it("falls back to the browser when the backend hasn't rolled forward", () => {
    // The portal and the API deploy separately. Without this the new bundle
    // would render "0 / 0 · 0 devices" over a table full of devices.
    const r = fleetNumbers({ activeSessions: 2 }, fleet);
    expect(r).toEqual({ readyNow: 1, rcpCapable: 2, fleetTotal: 2, source: "browser" });
  });

  it("falls back when there is no summary at all", () => {
    expect(fleetNumbers(null, fleet).source).toBe("browser");
  });
});

describe("countsByMethod", () => {
  it("counts only devices that can serve it RIGHT NOW", () => {
    const devices = [
      device({ deviceId: "a", online: true, capabilities: ["rcp.shell", "rcp.screen"] }),
      device({ deviceId: "b", online: false, capabilities: ["rcp.shell", "rcp.screen"] }),
      device({ deviceId: "c", online: true, capabilities: ["rcp.file"] })
    ];
    expect(countsByMethod(devices)).toEqual({ shell: 1, file: 1, screen: 1 });
  });
});

describe("availableMethods", () => {
  it("an offline device can serve nothing", () => {
    expect(availableMethods(device({ online: false }))).toEqual([]);
  });

  it("returns only the open gates", () => {
    expect(availableMethods(device()).map((m) => m.type)).toEqual(["shell", "file"]);
  });
});

describe("matchesSearch", () => {
  it("searches hostname, platform and identifier", () => {
    const d = device();
    expect(matchesSearch(d, "srv-dc")).toBe(true);
    expect(matchesSearch(d, "WINDOWS")).toBe(true);
    expect(matchesSearch(d, "4444")).toBe(true);
    expect(matchesSearch(d, "laptop")).toBe(false);
  });

  it("an empty search filters nothing", () => {
    expect(matchesSearch(device(), "   ")).toBe(true);
  });

  // Forward-compat: when phase 3 adds group and site to the response, search
  // already covers them. Without this test, the haystack field is code
  // nobody exercises and the first cleanup pass deletes it.
  it("covers group and site as soon as the backend sends them", () => {
    const d = device({ groupNames: ["Branch offices"], siteName: "Bogota" });
    expect(matchesSearch(d, "branch")).toBe(true);
    expect(matchesSearch(d, "bogota")).toBe(true);
  });
});

describe("filterDevices", () => {
  const fleet = [
    device({ deviceId: "on-shell", hostname: "A", online: true, capabilities: ["rcp.shell"] }),
    device({ deviceId: "off-shell", hostname: "B", online: false, capabilities: ["rcp.shell"] }),
    device({ deviceId: "on-screen", hostname: "C", online: true, capabilities: ["rcp.screen"] }),
    device({ deviceId: "no-rcp", hostname: "D", online: true, capabilities: [] })
  ];

  it("hides devices without remote control by default", () => {
    const ids = filterDevices(fleet, {}).map((d) => d.deviceId);
    expect(ids).not.toContain("no-rcp");
    expect(ids).toHaveLength(3);
  });

  it("shows them on request", () => {
    expect(filterDevices(fleet, { includeWithoutRcp: true })).toHaveLength(4);
  });

  it("filters by method", () => {
    const ids = filterDevices(fleet, { method: "screen" }).map((d) => d.deviceId);
    expect(ids).toEqual(["on-screen"]);
  });

  it("filters by online", () => {
    const ids = filterDevices(fleet, { onlineOnly: true }).map((d) => d.deviceId);
    expect(ids).toEqual(["on-shell", "on-screen"]);
  });

  // The deep link from Asset Management: if the device landed on is offline
  // or has no plugin, the filters would hide it and the flash would
  // highlight a row that doesn't exist.
  it("keepIds beats EVERY filter", () => {
    const ids = filterDevices(fleet, {
      onlineOnly: true,
      method: "screen",
      search: "does-not-exist",
      keepIds: ["no-rcp"]
    }).map((d) => d.deviceId);
    expect(ids).toContain("no-rcp");
  });

  it("keepIds ignores empty entries", () => {
    const ids = filterDevices(fleet, { onlineOnly: true, keepIds: ["", null] }).map(
      (d) => d.deviceId
    );
    expect(ids).toEqual(["on-shell", "on-screen"]);
  });
});

describe("countWithoutRcp", () => {
  it("counts what the filter hides", () => {
    expect(
      countWithoutRcp([
        device({ capabilities: ["rcp.shell"] }),
        device({ capabilities: ["rcp"] }),
        device({ capabilities: [] })
      ])
    ).toBe(2);
  });
});
