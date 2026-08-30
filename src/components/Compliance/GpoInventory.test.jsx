import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { GpoInventorySection } from "./GpoInventory";

afterEach(cleanup);

const findingWithGpos = (evidence) => ({
  id: 1,
  checkId: "windows.domain.gpo_inventory_available",
  category: "identity_policy",
  severity: "info",
  status: "info",
  evidence
});

describe("GpoInventorySection (render smoke)", () => {
  it("renders nothing when the finding isn't in the list (non-domain device)", () => {
    const { container } = render(<GpoInventorySection findings={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when findings is missing/not an array", () => {
    const { container } = render(<GpoInventorySection findings={undefined} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders both columns with the applied GPOs from evidence", () => {
    render(
      <GpoInventorySection
        findings={[
          findingWithGpos({
            appliedComputerGpos: ["Default Domain Policy", "Firewall Baseline"],
            appliedUserGpos: ["User Desktop Lockdown"]
          })
        ]}
      />
    );
    expect(screen.getByText("Applied Group Policy Objects")).toBeInTheDocument();
    expect(screen.getByText("Computer (2)")).toBeInTheDocument();
    expect(screen.getByText("Default Domain Policy")).toBeInTheDocument();
    expect(screen.getByText("Firewall Baseline")).toBeInTheDocument();
    expect(screen.getByText("User (1)")).toBeInTheDocument();
    expect(screen.getByText("User Desktop Lockdown")).toBeInTheDocument();
  });

  it("shows 'None applied' for a side with an empty/null list, without throwing", () => {
    render(
      <GpoInventorySection
        findings={[findingWithGpos({ appliedComputerGpos: ["Default Domain Policy"], appliedUserGpos: null })]}
      />
    );
    expect(screen.getByText("Computer (1)")).toBeInTheDocument();
    expect(screen.getByText("User (0)")).toBeInTheDocument();
    expect(screen.getByText("None applied")).toBeInTheDocument();
  });
});
