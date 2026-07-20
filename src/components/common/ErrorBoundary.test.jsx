import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import ErrorBoundary from "./ErrorBoundary";

afterEach(cleanup);

function Boom({ crash }) {
  if (crash) throw new Error("kaboom");
  return <div>healthy content</div>;
}

describe("ErrorBoundary", () => {
  it("renders children when there is no error", () => {
    render(
      <ErrorBoundary label="Assets">
        <div>healthy content</div>
      </ErrorBoundary>
    );
    expect(screen.getByText("healthy content")).toBeInTheDocument();
  });

  it("catches a render throw and shows a scoped fallback instead of unmounting the tree", () => {
    // Silence the expected React error log for this test.
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    render(
      <ErrorBoundary label="Assets">
        <Boom crash />
      </ErrorBoundary>
    );
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByText(/Something went wrong on Assets/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /reload page/i })).toBeInTheDocument();
    spy.mockRestore();
  });

  it("'Try again' resets the boundary and calls onReset", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const onReset = vi.fn();
    render(
      <ErrorBoundary label="Assets" onReset={onReset}>
        <Boom crash />
      </ErrorBoundary>
    );
    expect(screen.getByRole("alert")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /try again/i }));
    expect(onReset).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });
});
