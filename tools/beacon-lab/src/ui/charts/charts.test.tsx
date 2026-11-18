// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { BarChart, BoxPlot, CdfChart, HistogramChart, LineChart, ScatterChart, Sparkline, chartToSvgString } from "./index";

afterEach(cleanup);

const pts = (n: number, f: (i: number) => number | null) => Array.from({ length: n }, (_, i) => ({ x: i, y: f(i) }));

describe("LineChart", () => {
  const series = [
    { id: "raw", label: "Roh", points: pts(20, (i) => -70 - (i % 5)), style: "dots" as const },
    { id: "f1", label: "Gefiltert", points: pts(20, (i) => (i === 10 ? null : -72)), style: "line" as const },
    { id: "f2", label: "Kalman", points: pts(20, () => -73), style: "line" as const },
  ];
  it("renders one path per series with accessible name, axis label and legend", () => {
    render(<LineChart title="RSSI über Zeit" series={series} yLabel="RSSI (dBm)" unit="dBm" width={600} />);
    const svg = screen.getByRole("img", { name: "RSSI über Zeit" });
    expect(svg.querySelectorAll("path[data-series]").length).toBe(3);
    expect(svg.textContent).toContain("RSSI (dBm)");
    expect(screen.getByTestId("chart-legend").textContent).toContain("Gefiltert");
    expect(svg.querySelector("title")?.textContent).toBe("RSSI über Zeit");
  });
  it("breaks the line at null values", () => {
    render(<LineChart title="t" series={[series[1]]} yLabel="y" width={600} />);
    const d = document.querySelector("path[data-series='f1']")!.getAttribute("d")!;
    expect(d.match(/M/g)!.length).toBe(2);
  });
  it("shows exact values in a tooltip on hover", () => {
    render(<LineChart title="t" series={series} yLabel="y" unit="dBm" width={600} />);
    fireEvent.mouseMove(screen.getByTestId("chart-hit"), { clientX: 300, clientY: 100 });
    const tip = screen.getByTestId("chart-tooltip");
    expect(tip.textContent).toContain("-72.0 dBm");
    expect(tip.textContent).toContain("Gefiltert");
    fireEvent.mouseLeave(screen.getByTestId("chart-hit"));
    expect(screen.queryByTestId("chart-tooltip")).toBeNull();
  });
  it("renders the SYNTHETISCH tag only when flagged", () => {
    const { rerender } = render(<LineChart title="t" series={series} yLabel="y" width={600} />);
    expect(screen.queryByTestId("synthetic-tag")).toBeNull();
    rerender(<LineChart title="t" series={series} yLabel="y" width={600} synthetic />);
    expect(screen.getByTestId("synthetic-tag").textContent).toBe("SYNTHETISCH");
  });
  it("renders reference lines and works without data", () => {
    render(<LineChart title="leer" series={[]} yLabel="y" referenceLines={[{ y: -80, label: "Schwelle" }]} />);
    expect(screen.getByText("Schwelle")).toBeTruthy();
  });
});

describe("CdfChart", () => {
  it("draws one step path per series and guides at 2/3/5", () => {
    render(
      <CdfChart
        title="Fehlerverteilung"
        unit="m"
        width={600}
        series={[
          { id: "a", label: "Zentroid", values: [0.5, 1, 1.5, 2.5, 4] },
          { id: "b", label: "Trilateration", values: [1, 2, 3], total: 6 },
        ]}
      />,
    );
    expect(document.querySelectorAll("path[data-series]").length).toBe(2);
    expect(screen.getAllByTestId("reference-line").length).toBe(3);
    expect(screen.getByText("Positionsfehler (m)")).toBeTruthy();
    expect(screen.getByText("3 m")).toBeTruthy();
  });
  it("hover reports the cumulative share", () => {
    render(<CdfChart title="c" unit="LE" width={600} guides={[]} series={[{ id: "a", label: "A", values: [1, 2, 3, 4] }]} />);
    fireEvent.mouseMove(screen.getByTestId("chart-hit"), { clientX: 600, clientY: 50 });
    expect(screen.getByTestId("chart-tooltip").textContent).toContain("100.0 %");
  });
});

describe("other charts", () => {
  it("HistogramChart draws bins for overlayed series", () => {
    render(<HistogramChart title="h" xLabel="RSSI (dBm)" binWidth={2} width={600} series={[{ id: "a", label: "A", values: [-70, -71, -72, -75] }, { id: "b", label: "B", values: [-80, -81] }]} />);
    expect(document.querySelectorAll("g[data-series]").length).toBe(2);
    expect(document.querySelectorAll("rect[data-bin]").length).toBeGreaterThan(2);
  });
  it("BarChart renders bars and error bars", () => {
    render(<BarChart title="b" categories={["B1", "B2"]} valueLabel="RSSI (dBm)" width={600} series={[{ id: "m", label: "Mittel", values: [-70, -80], errors: [2, 3] }]} />);
    expect(document.querySelectorAll("rect[data-bar]").length).toBe(2);
    expect(document.querySelectorAll("path[data-errorbar]").length).toBe(2);
  });
  it("BarChart supports horizontal orientation", () => {
    render(<BarChart title="b" orientation="horizontal" categories={["B1"]} valueLabel="n" width={600} series={[{ id: "m", label: "n", values: [5] }]} />);
    expect(document.querySelectorAll("rect[data-bar]").length).toBe(1);
  });
  it("BoxPlot shows outliers", () => {
    render(<BoxPlot title="bp" valueLabel="Fehler (m)" width={600} groups={[{ id: "a", label: "A", values: [1, 2, 3, 4, 5, 6, 7, 8, 9, 100] }, { id: "b", label: "B", values: [] }]} />);
    expect(document.querySelectorAll("circle[data-outlier]").length).toBe(1);
    expect(document.querySelectorAll("g[data-box]").length).toBe(1);
  });
  it("ScatterChart draws points and a curve overlay, log x", () => {
    render(
      <ScatterChart
        title="s"
        xLabel="Distanz (m)"
        yLabel="RSSI (dBm)"
        xLog
        width={600}
        series={[{ id: "p", label: "Messung", points: [{ x: 1, y: -70 }, { x: 4, y: -82 }] }]}
        curves={[{ id: "fit", label: "Pfadverlust", points: [{ x: 1, y: -72 }, { x: 8, y: -90 }] }]}
      />,
    );
    expect(document.querySelectorAll("path[data-series]").length).toBe(1);
    expect(document.querySelectorAll("path[data-curve]").length).toBe(1);
  });
  it("Sparkline is an accessible image", () => {
    render(<Sparkline label="Verlauf" values={[1, 2, null, 3]} />);
    expect(screen.getByRole("img", { name: "Verlauf" })).toBeTruthy();
  });
  it("chartToSvgString produces a standalone svg", () => {
    const svg = chartToSvgString(<LineChart title="x" series={[{ id: "a", label: "A", points: pts(3, (i) => i) }]} yLabel="y" width={400} />);
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(svg).toContain("<title>x</title>");
  });
});
