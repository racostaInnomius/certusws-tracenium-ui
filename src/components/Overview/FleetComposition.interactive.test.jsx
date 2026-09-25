// La dona de Agent versions en la página de Assets: pulsar un grupo filtra la
// tabla, y el grupo del filtro activo se ve resaltado.
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { AgentVersionDonut, DonutCard } from "./FleetComposition";

afterEach(cleanup);

const byVersion = [
  { version: "1.2.88", count: 10 },
  { version: "1.2.86", count: 2 },
  { version: "1.1.10", count: 3 },
];
const latestMap = { "windows:x64": "1.2.88" };

describe("AgentVersionDonut interactiva", () => {
  it("⭐ pulsar un grupo de la leyenda llama con esa rebanada", () => {
    const onSegmentClick = vi.fn();
    render(<AgentVersionDonut byVersion={byVersion} latestMap={latestMap} onSegmentClick={onSegmentClick} />);
    fireEvent.click(screen.getByText(/^Older \d+/));
    expect(onSegmentClick).toHaveBeenCalledWith(expect.objectContaining({ name: "Older" }));
  });

  it("el grupo del filtro activo sale resaltado", () => {
    render(<AgentVersionDonut byVersion={byVersion} latestMap={latestMap} activeBucket="older" onSegmentClick={() => {}} />);
    expect(getComputedStyle(screen.getByText(/^Older \d+/)).fontWeight).toBe("800");
    expect(getComputedStyle(screen.getByText(/^Current \d+/)).fontWeight).toBe("600");
  });
});

describe("DonutCard", () => {
  it("pasa activeKey a la rebanada con ese nombre", () => {
    render(
      <DonutCard
        title="Last check-in"
        data={[{ name: "< 1 hour", value: 12, color: "#0a0" }, { name: "> 7 days", value: 1, color: "#a00" }]}
        activeKey="> 7 days"
        onSegmentClick={() => {}}
      />
    );
    expect(getComputedStyle(screen.getByText("> 7 days 1")).fontWeight).toBe("800");
  });
});
