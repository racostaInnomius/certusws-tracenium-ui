import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";

// Mock the suggestions API so CriteriaValueEditor's autocomplete branch never
// hits the network. The tests below exercise the plain-text branch + the
// builder's add/remove wiring, none of which await the API.
vi.mock("../../api/assetGroups", () => ({
  getCriteriaSuggestions: vi.fn().mockResolvedValue({ items: [] }),
}));

import CriteriaBuilder, { CriteriaValueEditor } from "./CriteriaBuilder";

// "custom_field" is unmapped → getSuggestionFieldKey passes it through →
// shouldUseRemoteAutocomplete is false → the editor renders a plain TextField.
const catalog = {
  fields: [
    {
      key: "custom_field",
      label: "Custom Field",
      ops: [
        { key: "eq", label: "Equals" },
        { key: "contains", label: "Contains" },
      ],
    },
    {
      key: "other_field",
      label: "Other Field",
      ops: [{ key: "eq", label: "Equals" }],
    },
  ],
};

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe("CriteriaBuilder", () => {
  it("renders one row per predicate with the value populated", () => {
    render(
      <CriteriaBuilder
        catalog={catalog}
        predicates={[{ field: "custom_field", op: "eq", value: "abc" }]}
        onChange={() => {}}
        error=""
      />
    );
    expect(screen.getByRole("button", { name: /add predicate/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /remove condition/i })).toBeInTheDocument();
    // The plain-text value editor shows the predicate value.
    expect(screen.getByDisplayValue("abc")).toBeInTheDocument();
  });

  it("Add predicate appends a predicate seeded from the first field", () => {
    const onChange = vi.fn();
    render(
      <CriteriaBuilder catalog={catalog} predicates={[]} onChange={onChange} error="" />
    );
    fireEvent.click(screen.getByRole("button", { name: /add predicate/i }));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith([
      { field: "custom_field", op: "eq", value: "" },
    ]);
  });

  it("Remove condition drops that predicate", () => {
    const onChange = vi.fn();
    render(
      <CriteriaBuilder
        catalog={catalog}
        predicates={[{ field: "custom_field", op: "eq", value: "abc" }]}
        onChange={onChange}
        error=""
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /remove condition/i }));
    expect(onChange).toHaveBeenCalledWith([]);
  });

  it("editing the value field emits an updated predicate", () => {
    const onChange = vi.fn();
    render(
      <CriteriaBuilder
        catalog={catalog}
        predicates={[{ field: "custom_field", op: "eq", value: "abc" }]}
        onChange={onChange}
        error=""
      />
    );
    fireEvent.change(screen.getByDisplayValue("abc"), { target: { value: "xyz" } });
    expect(onChange).toHaveBeenCalledWith([
      { field: "custom_field", op: "eq", value: "xyz" },
    ]);
  });

  it("Add predicate is disabled when the catalog has no fields", () => {
    render(
      <CriteriaBuilder catalog={{ fields: [] }} predicates={[]} onChange={() => {}} error="" />
    );
    expect(screen.getByRole("button", { name: /add predicate/i })).toBeDisabled();
  });

  it("surfaces the error alert when provided", () => {
    render(
      <CriteriaBuilder catalog={catalog} predicates={[]} onChange={() => {}} error="Invalid criteria" />
    );
    expect(screen.getByText("Invalid criteria")).toBeInTheDocument();
  });
});

describe("CriteriaValueEditor (plain-text branch)", () => {
  it("renders a plain TextField for a non-autocomplete field and emits raw input", () => {
    const onChange = vi.fn();
    render(
      <CriteriaValueEditor
        pred={{ field: "custom_field", op: "eq", value: "abc" }}
        fieldSpec={{ key: "custom_field" }}
        opSpec={{ key: "eq" }}
        disabled={false}
        onChange={onChange}
      />
    );
    const input = screen.getByDisplayValue("abc");
    fireEvent.change(input, { target: { value: "def" } });
    expect(onChange).toHaveBeenCalledWith("def");
  });

  it("shows the CIDR helper for a subnet operator", () => {
    render(
      <CriteriaValueEditor
        pred={{ field: "ip", op: "in_subnet", value: "" }}
        fieldSpec={{ key: "ip" }}
        opSpec={{ key: "in_subnet", label: "In Subnet" }}
        disabled={false}
        onChange={() => {}}
      />
    );
    // isIpSubnetOperator → useAutocomplete false → plain TextField w/ CIDR hint.
    expect(screen.getByText(/Enter a CIDR subnet range/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText("192.168.1.0/24")).toBeInTheDocument();
  });
});
