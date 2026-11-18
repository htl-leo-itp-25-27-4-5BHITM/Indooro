// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { DataTable, IssueList, Modal, OriginBadge, StatTile, Tabs, FileDrop, NumberInput, Callout, Badge } from "./index";
import type { DataColumn } from "./index";
import { ERROR_METRIC_DEFINITIONS, DYNAMIC_METRIC_DEFINITIONS } from "./metricDefinitions";
import type { DataIssue } from "../../core/types";

afterEach(cleanup);

describe("StatTile", () => {
  it("renders label, value, unit, hint and a definition tooltip", () => {
    render(<StatTile label="RMSE" value="2,41" unit="m" hint="n = 120" definition="Wurzel aus dem Mittel" />);
    expect(screen.getByText("RMSE")).toBeTruthy();
    expect(screen.getByTestId("stat-value").textContent).toBe("2,41");
    expect(screen.getByText("m")).toBeTruthy();
    expect(screen.getByText("n = 120")).toBeTruthy();
    const tip = screen.getByRole("tooltip", { hidden: true });
    expect(tip.textContent).toContain("Wurzel");
    expect(tip.hasAttribute("hidden")).toBe(true);
    fireEvent.focus(screen.getByRole("button", { name: /Erklärung/ }));
    expect(screen.getByRole("tooltip").hasAttribute("hidden")).toBe(false);
  });
});

describe("OriginBadge", () => {
  it("distinguishes synthetic from real", () => {
    const { rerender } = render(<OriginBadge origin="synthetic" />);
    expect(screen.getByTestId("origin-label").textContent).toBe("SYNTHETISCH");
    expect(document.querySelector('[data-variant="synthetic"]')).toBeTruthy();
    rerender(<OriginBadge origin="real" />);
    expect(screen.getByTestId("origin-label").textContent).toBe("ECHTDATEN");
    expect(document.querySelector('[data-variant="real"]')).toBeTruthy();
  });
});

interface Row {
  id: string;
  name: string;
  v: number | null;
}
const cols: DataColumn<Row>[] = [
  { key: "name", header: "Name", sortValue: (r) => r.name, render: (r) => r.name },
  { key: "v", header: "Wert", numeric: true, sortValue: (r) => r.v, render: (r) => (r.v === null ? "–" : r.v.toFixed(1)) },
];
const rows: Row[] = [
  { id: "a", name: "A", v: 3 },
  { id: "b", name: "B", v: null },
  { id: "c", name: "C", v: 1 },
];

describe("DataTable", () => {
  const order = () => screen.getAllByRole("row").slice(1).map((r) => within(r).getAllByRole("cell")[0].textContent);
  it("sorts ascending, descending and resets; nulls always last", () => {
    render(<DataTable columns={cols} rows={rows} rowKey={(r) => r.id} />);
    expect(order()).toEqual(["A", "B", "C"]);
    fireEvent.click(screen.getByRole("button", { name: /Wert/ }));
    expect(order()).toEqual(["C", "A", "B"]);
    fireEvent.click(screen.getByRole("button", { name: /Wert/ }));
    expect(order()).toEqual(["A", "C", "B"]);
    expect(screen.getByRole("columnheader", { name: /Wert/ }).getAttribute("aria-sort")).toBe("descending");
    fireEvent.click(screen.getByRole("button", { name: /Wert/ }));
    expect(order()).toEqual(["A", "B", "C"]);
  });
  it("shows an empty state", () => {
    render(<DataTable columns={cols} rows={[]} rowKey={(r) => r.id} emptyMessage="Nichts da" />);
    expect(screen.getByText("Nichts da")).toBeTruthy();
  });
});

describe("IssueList", () => {
  it("groups by severity with errors first and shows codes, counts and rows", () => {
    const issues: DataIssue[] = [
      { severity: "info", code: "i-1", message: "Info A" },
      { severity: "error", code: "rssi-out-of-range", message: "RSSI ungültig", rows: [3, 7], count: 2 },
      { severity: "warning", code: "dup", message: "Duplikat", rows: [1], count: 1 },
    ];
    render(<IssueList issues={issues} />);
    const sections = Array.from(document.querySelectorAll("section[data-severity]")).map((s) => s.getAttribute("data-severity"));
    expect(sections).toEqual(["error", "warning", "info"]);
    expect(screen.getByText("rssi-out-of-range")).toBeTruthy();
    expect(screen.getByText("2×")).toBeTruthy();
    expect(screen.getByText("Zeile 3, 7")).toBeTruthy();
    expect(screen.getByText("Fehler")).toBeTruthy();
  });
  it("renders the empty text", () => {
    render(<IssueList issues={[]} />);
    expect(screen.getByText("Keine Auffälligkeiten.")).toBeTruthy();
  });
});

describe("Tabs", () => {
  function Harness() {
    const [v, setV] = useState("a");
    return (
      <Tabs
        value={v}
        onChange={setV}
        tabs={[
          { id: "a", label: "Eins", content: "Inhalt A" },
          { id: "b", label: "Zwei", content: "Inhalt B", disabled: true },
          { id: "c", label: "Drei", content: "Inhalt C" },
        ]}
      />
    );
  }
  it("supports arrow, Home and End keys and skips disabled tabs", () => {
    render(<Harness />);
    const first = screen.getByRole("tab", { name: "Eins" });
    first.focus();
    fireEvent.keyDown(first, { key: "ArrowRight" });
    expect(screen.getByRole("tab", { name: "Drei" }).getAttribute("aria-selected")).toBe("true");
    expect(document.activeElement).toBe(screen.getByRole("tab", { name: "Drei" }));
    expect(screen.getByRole("tabpanel").textContent).toBe("Inhalt C");
    fireEvent.keyDown(document.activeElement as Element, { key: "Home" });
    expect(screen.getByRole("tab", { name: "Eins" }).getAttribute("aria-selected")).toBe("true");
    fireEvent.keyDown(document.activeElement as Element, { key: "End" });
    expect(screen.getByRole("tab", { name: "Drei" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("tab", { name: "Eins" }).getAttribute("tabindex")).toBe("-1");
  });
});

describe("Modal", () => {
  it("closes on Escape and traps nothing when closed", () => {
    const onClose = vi.fn();
    const { rerender } = render(
      <Modal open onClose={onClose} title="Titel">
        <button>OK</button>
      </Modal>,
    );
    expect(screen.getByRole("dialog", { name: "Titel" })).toBeTruthy();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
    rerender(
      <Modal open={false} onClose={onClose} title="Titel">
        x
      </Modal>,
    );
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("FileDrop", () => {
  it("accepts supported files and reports rejected ones", () => {
    const onFiles = vi.fn();
    render(<FileDrop onFiles={onFiles} />);
    const good = new File(["a"], "run.csv");
    const bad = new File(["a"], "image.png");
    fireEvent.change(screen.getByTestId("file-input"), { target: { files: [good, bad] } });
    expect(onFiles).toHaveBeenCalledWith([good]);
    expect(screen.getByRole("alert").textContent).toContain("image.png");
  });
});

describe("NumberInput / Callout / definitions", () => {
  it("emits null for empty and clamps on blur", () => {
    const onChange = vi.fn();
    render(<NumberInput value={10} onChange={onChange} min={0} max={5} unit="m" aria-label="Wert" />);
    const input = screen.getByLabelText("Wert");
    fireEvent.change(input, { target: { value: "" } });
    expect(onChange).toHaveBeenCalledWith(null);
    fireEvent.blur(input);
    expect(onChange).toHaveBeenCalledWith(5);
  });
  it("Callout uses alert role for danger", () => {
    render(<Callout tone="danger" title="Keine belastbare Auswertung möglich" />);
    expect(screen.getByRole("alert")).toBeTruthy();
  });
  it("has a definition for every metric key", () => {
    for (const d of [...Object.values(ERROR_METRIC_DEFINITIONS), ...Object.values(DYNAMIC_METRIC_DEFINITIONS)]) {
      expect(d.definition.length).toBeGreaterThan(20);
    }
    expect(ERROR_METRIC_DEFINITIONS.p95.definition).toContain("Typ 7");
    expect(ERROR_METRIC_DEFINITIONS.within3.definition).toContain("Fehlschläge zählen als nicht innerhalb");
    expect(DYNAMIC_METRIC_DEFINITIONS.jumpRate.definition).toContain("2 m/s");
  });
});

describe("data attribute forwarding", () => {
  it("Badge and NumberInput forward data-testid", () => {
    render(
      <div>
        <Badge data-testid="b1">x</Badge>
        <NumberInput value={1} onChange={() => {}} data-testid="n1" />
      </div>,
    );
    expect(screen.getByTestId("b1").textContent).toBe("x");
    expect(screen.getByTestId("n1").tagName).toBe("INPUT");
  });
});
