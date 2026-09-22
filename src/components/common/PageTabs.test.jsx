import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import TuneOutlinedIcon from "@mui/icons-material/TuneOutlined";
import PageTabs from "./PageTabs";

afterEach(cleanup);

describe("PageTabs", () => {
  it("renders one tab per item, skipping the conditional nulls", () => {
    render(
      <PageTabs
        value="a"
        onChange={() => {}}
        items={[
          { value: "a", label: "Alpha" },
          null,
          false,
          { value: "b", label: "Beta" },
        ]}
      />
    );
    expect(screen.getAllByRole("tab").map((t) => t.textContent)).toEqual(["Alpha", "Beta"]);
    expect(screen.getByRole("tab", { name: "Alpha" })).toHaveAttribute("aria-selected", "true");
  });

  it("hands MUI's (event, value) to onChange with the item's own value", () => {
    const onChange = vi.fn();
    render(
      <PageTabs value={0} onChange={onChange} items={[{ value: 0, label: "Zero" }, { value: 7, label: "Seven" }]} />
    );
    fireEvent.click(screen.getByRole("tab", { name: "Seven" }));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][1]).toBe(7);
  });

  it("passes the rest of an item (a11y ids) through to the Tab", () => {
    render(
      <PageTabs
        value={0}
        onChange={() => {}}
        aria-label="Sections"
        items={[{ value: 0, label: "Zero", id: "x-tab-0", "aria-controls": "x-tabpanel-0" }]}
      />
    );
    const tab = screen.getByRole("tab", { name: "Zero" });
    expect(tab).toHaveAttribute("id", "x-tab-0");
    expect(tab).toHaveAttribute("aria-controls", "x-tabpanel-0");
    expect(screen.getByRole("tablist", { name: "Sections" })).toBeInTheDocument();
  });

  it("renders the icon small, whatever size the page passed", () => {
    render(
      <PageTabs value={0} onChange={() => {}} items={[{ value: 0, label: "Rules", icon: <TuneOutlinedIcon /> }]} />
    );
    const svg = screen.getByRole("tab", { name: "Rules" }).querySelector("svg");
    expect(svg.getAttribute("class")).toMatch(/MuiSvgIcon-fontSizeSmall/);
  });
});
