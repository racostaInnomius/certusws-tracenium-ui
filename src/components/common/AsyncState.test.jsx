import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import AsyncState, { extractErrorMessage } from "./AsyncState";

afterEach(cleanup);

describe("extractErrorMessage", () => {
  it("unwraps body.message, then message, then a default", () => {
    expect(extractErrorMessage({ body: { message: "from body" } })).toBe("from body");
    expect(extractErrorMessage({ message: "from message" })).toBe("from message");
    expect(extractErrorMessage("plain string")).toBe("plain string");
    expect(extractErrorMessage({})).toBe("Something went wrong.");
    expect(extractErrorMessage(null)).toBe("");
  });
});

describe("AsyncState precedence", () => {
  it("shows loading first", () => {
    render(<AsyncState loading error={new Error("x")} isEmpty loadingText="Loading…"><div>content</div></AsyncState>);
    expect(screen.getByText("Loading…")).toBeInTheDocument();
    expect(screen.queryByText("content")).not.toBeInTheDocument();
  });

  it("shows error (with Try again) when not loading", () => {
    const onRetry = vi.fn();
    render(<AsyncState error={{ body: { message: "boom" } }} onRetry={onRetry}><div>content</div></AsyncState>);
    expect(screen.getByText("boom")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /try again/i }));
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("content")).not.toBeInTheDocument();
  });

  it("shows empty when not loading/error", () => {
    render(<AsyncState isEmpty emptyText="No devices"><div>content</div></AsyncState>);
    expect(screen.getByText("No devices")).toBeInTheDocument();
    expect(screen.queryByText("content")).not.toBeInTheDocument();
  });

  it("renders children when idle with data", () => {
    render(<AsyncState><div>content</div></AsyncState>);
    expect(screen.getByText("content")).toBeInTheDocument();
  });
});
