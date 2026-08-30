// src/components/patch-management/PriorityQueue.test.jsx
//
// "Start here" is the first thing on the page, and it was showing a spinner on
// every single visit — the queue that exists to tell you what is urgent made
// you wait to be told. It now renders through the app's stale-while-revalidate
// hook, like the summary and device list beside it.
//
// The distinction these tests protect is between the two loading states:
//
//   loading    — cold start, nothing cached, there is genuinely nothing to show
//   refreshing — cache in hand, revalidating behind it
//
// Collapsing them is what made the section feel slow: hiding a perfectly good
// answer behind a spinner because a request happened to be in flight.

import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import PriorityQueue from "./PriorityQueue";

// This repo unmounts explicitly; without it every render stacks in the same
// document and assertions start seeing the previous test's output.
afterEach(cleanup);

const cve = (over = {}) => ({
  cveId: "CVE-2026-1234",
  title: "Remote code execution in libfoo",
  severity: "critical",
  cvssScore: 9.1,
  knownExploited: true,
  kevOverdue: false,
  affectedDeviceCount: 4,
  ...over,
});

describe("cold start", () => {
  it("shows a spinner only when there is nothing cached", () => {
    render(<PriorityQueue exposures={[]} findings={[]} loading />);
    expect(screen.getByText(/needs attention first/i)).toBeInTheDocument();
  });
});

describe("refreshing with cache in hand", () => {
  it("keeps the list on screen instead of blanking it", () => {
    // The actual complaint: leaving and re-entering the page threw away a
    // perfectly good answer while it refetched.
    render(<PriorityQueue exposures={[cve()]} findings={[]} refreshing />);
    expect(screen.getByText(/Remote code execution in libfoo/)).toBeInTheDocument();
    expect(screen.queryByText(/needs attention first/i)).not.toBeInTheDocument();
  });

  it("says it is updating, quietly", () => {
    // Quiet, but not silent — otherwise stale data looks like current data.
    render(<PriorityQueue exposures={[cve()]} findings={[]} refreshing />);
    expect(screen.getByText("Updating")).toBeInTheDocument();
  });

  it("says nothing when it is not refreshing", () => {
    render(<PriorityQueue exposures={[cve()]} findings={[]} />);
    expect(screen.queryByText("Updating")).not.toBeInTheDocument();
  });
});

describe("what the rows say", () => {
  it("leads with why the top item is the top item", () => {
    render(<PriorityQueue exposures={[cve()]} findings={[]} />);
    expect(screen.getByText(/Actively exploited/i)).toBeInTheDocument();
  });

  it("reports an empty fleet as done, not as loading", () => {
    render(<PriorityQueue exposures={[]} findings={[]} />);
    expect(screen.getByText(/Nothing is waiting on you/i)).toBeInTheDocument();
  });

  it("survives the hook's first render, before any data exists", () => {
    // useCachedFetch hands back undefined until the first resolve; a queue
    // that throws there would take the whole page down.
    expect(() => render(<PriorityQueue />)).not.toThrow();
  });
});
