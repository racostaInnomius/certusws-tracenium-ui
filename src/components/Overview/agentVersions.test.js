// src/components/Overview/agentVersions.test.js
//
// La regla de "current / one behind / older" vive en UN sitio. La dona la usa
// para contar y la tabla de Assets para filtrar; si divergen, el Overview dice
// "Older 4" y la tabla enseña otra cosa.

import { describe, expect, it } from "vitest";
import { bucketOfAgentVersion, classifyAgentVersions, versionsInBucket } from "./agentVersions";

const LATEST = { "windows:x64": "1.1.70", "macos:arm64": "1.1.69" };
const BY_VERSION = [
  { version: "1.1.70", count: 46 },
  { version: "1.1.69", count: 2 },
  { version: "1.1.68", count: 1 },
  { version: "1.1.65", count: 2 },
  { version: "1.1.63", count: 2 },
  { version: "unknown", count: 1 },
];

describe("bucketOfAgentVersion", () => {
  it("compara contra la versión más alta publicada en cualquier plataforma", () => {
    expect(bucketOfAgentVersion("1.1.70", "1.1.70")).toBe("current");
    expect(bucketOfAgentVersion("1.1.68", "1.1.70")).toBe("one_behind");
    expect(bucketOfAgentVersion("1.1.67", "1.1.70")).toBe("older");
    expect(bucketOfAgentVersion("unknown", "1.1.70")).toBe("unknown");
    expect(bucketOfAgentVersion("1.1.70", null)).toBe("unknown");
  });
});

describe("versionsInBucket", () => {
  it("⭐ las versiones de un grupo suman lo mismo que la dona cuenta para ese grupo", () => {
    const { buckets } = classifyAgentVersions(BY_VERSION, LATEST);
    const count = (vs) => BY_VERSION.filter((r) => vs.includes(r.version)).reduce((s, r) => s + r.count, 0);

    expect(count(versionsInBucket(BY_VERSION, LATEST, "older").versions)).toBe(buckets.older);
    expect(count(versionsInBucket(BY_VERSION, LATEST, "one_behind").versions)).toBe(buckets.oneBehind);
    expect(count(versionsInBucket(BY_VERSION, LATEST, "current").versions)).toBe(buckets.current);
  });

  it("older → las versiones exactas, sin 'unknown'", () => {
    expect(versionsInBucket(BY_VERSION, LATEST, "older")).toEqual({
      versions: ["1.1.65", "1.1.63"],
      includeUnknown: false,
    });
  });

  it("unknown → sin versiones y con includeUnknown", () => {
    expect(versionsInBucket(BY_VERSION, LATEST, "unknown")).toEqual({ versions: [], includeUnknown: true });
  });

  it("un grupo sin equipos devuelve lista vacía (el servidor responde 'ninguno')", () => {
    expect(versionsInBucket([{ version: "1.1.70", count: 3 }], LATEST, "older")).toEqual({
      versions: [],
      includeUnknown: false,
    });
  });
});
