// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { Beacon, FloorPlan, PositionEstimate, ReferencePoint, RssiSample } from "../core/types";
import { FloorPlanMap } from "./FloorPlanMap";
import { HeatmapLayer, HeatmapLegend } from "./HeatmapLayer";
import { EstimateLayer, EstimateLegend } from "./overlays";
import { Replay } from "./Replay";

afterEach(() => cleanup());

function makePlan(over: Partial<FloorPlan> = {}): FloorPlan {
  return {
    id: "p1",
    name: "Testmarkt",
    width: 20,
    height: 10,
    origin: "synthetic",
    source: "test",
    scale: { metersPerUnit: 1, confirmed: false, note: "" },
    elements: [
      { id: "s1", type: "shelf", x: 2, y: 2, width: 6, height: 1, rotationDeg: 0, label: "Regal A" },
      { id: "c1", type: "checkout", x: 14, y: 6, width: 3, height: 2, rotationDeg: 30 },
      { id: "w1", type: "wall", x: 0, y: 0, width: 20, height: 0.3, rotationDeg: 0 },
    ],
    ...over,
  };
}

const beacons: Beacon[] = [
  { id: "B1", position: { x: 3, y: 3 }, enabled: true },
  { id: "B2", position: { x: 15, y: 4 }, enabled: false },
];

describe("FloorPlanMap", () => {
  it("renders elements, beacons, the SYNTHETISCH badge and LE units when the scale is unconfirmed", () => {
    const { container } = render(<FloorPlanMap plan={makePlan()} beacons={beacons} />);
    expect(container.querySelectorAll("[data-element-id]")).toHaveLength(3);
    expect(container.querySelectorAll("[data-beacon-id]")).toHaveLength(2);
    expect(screen.getByText("SYNTHETISCH")).toBeTruthy();
    expect(screen.getByText("Maßstab nicht bestätigt")).toBeTruthy();
    expect(screen.getByLabelText(/Maßstabsbalken .* LE/)).toBeTruthy();
    const svg = screen.getByTestId("floorplan-svg");
    expect(svg.getAttribute("preserveAspectRatio")).toBe("xMidYMid meet");
    expect(screen.getByRole("application")).toBeTruthy();
  });

  it("shows metres only when the scale is confirmed and hides the synthetic badge for real plans", () => {
    const plan = makePlan({ origin: "real", scale: { metersPerUnit: 0.5, confirmed: true, note: "gemessen" } });
    render(<FloorPlanMap plan={plan} beacons={beacons} />);
    expect(screen.queryByText("SYNTHETISCH")).toBeNull();
    expect(screen.queryByText("Maßstab nicht bestätigt")).toBeNull();
    expect(screen.getByLabelText(/Maßstabsbalken .* m$/)).toBeTruthy();
  });

  it("toggles layers and reports selections", () => {
    const selected: string[] = [];
    const { container } = render(
      <FloorPlanMap plan={makePlan()} beacons={beacons} onSelect={(s) => selected.push(`${s.kind}:${s.id}`)} />,
    );
    fireEvent.click(screen.getByLabelText("Ebene Beacons"));
    expect(container.querySelectorAll("[data-beacon-id]")).toHaveLength(0);
    fireEvent.click(screen.getByLabelText("Ebene Beacons"));
    fireEvent.click(container.querySelector("[data-beacon-id='B1']")!);
    expect(selected).toEqual(["beacon:B1"]);
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("zoom buttons change the viewBox without changing its aspect ratio", () => {
    render(<FloorPlanMap plan={makePlan()} beacons={beacons} />);
    const svg = screen.getByTestId("floorplan-svg");
    const parse = () => svg.getAttribute("viewBox")!.split(" ").map(Number);
    const [, , w0, h0] = parse();
    fireEvent.click(screen.getByLabelText("Vergrößern"));
    const [, , w1, h1] = parse();
    expect(w1).toBeLessThan(w0);
    expect(w1 / h1).toBeCloseTo(w0 / h0);
    fireEvent.click(screen.getByLabelText("Ansicht einpassen"));
    expect(parse()[2]).toBeCloseTo(w0);
  });

  it("renders estimates (without failed ones), and a legend that counts failures", () => {
    const plan = makePlan();
    const mk = (t: number, ok: boolean): PositionEstimate => ({
      t,
      position: ok ? { x: t, y: 5 } : null,
      rawPosition: ok ? { x: t, y: 5 } : null,
      failureReason: ok ? undefined : "zu wenige Beacons",
      inputs: [],
      truth: { x: t, y: 5.5 },
      errorUnits: ok ? 0.5 : null,
    });
    const ests = [mk(1, true), mk(2, false), mk(3, true)];
    const { container } = render(
      <FloorPlanMap
        plan={plan}
        overlays={<EstimateLayer estimates={ests} />}
        legend={<EstimateLegend estimates={ests} scale={plan.scale} />}
      />,
    );
    expect(container.querySelectorAll("[data-testid='layer-estimates'] circle")).toHaveLength(2);
    expect(within(screen.getByTestId("estimate-legend")).getByText(/fehlgeschlagen/)).toBeTruthy();
  });
});

describe("HeatmapLayer", () => {
  const pts = [
    { position: { x: 3, y: 3 }, value: -60, n: 4 },
    { position: { x: 10, y: 5 }, value: -80, n: 1 },
  ];
  it("points mode draws only circles at measurement positions", () => {
    const { container } = render(<FloorPlanMap plan={makePlan()} underlay={<HeatmapLayer points={pts} />} />);
    const layer = container.querySelector("[data-testid='layer-heatmap']")!;
    expect(layer.querySelectorAll("circle")).toHaveLength(2);
    expect(layer.querySelectorAll("rect")).toHaveLength(0);
  });
  it("idw mode labels the method in the legend and hatches no-data areas", () => {
    const { container } = render(
      <FloorPlanMap
        plan={makePlan()}
        underlay={<HeatmapLayer points={pts} mode="idw" maxDistance={2} />}
        legend={<HeatmapLegend points={pts} mode="idw" maxDistance={2} unit="dBm" title="RSSI" />}
      />,
    );
    expect(screen.getByText(/INTERPOLIERT \(IDW, p=2, max 2 LE\)/)).toBeTruthy();
    expect(screen.getAllByText("keine Daten").length).toBeGreaterThan(0);
    expect(container.querySelector("pattern")).toBeTruthy();
  });
});

describe("Replay", () => {
  const plan = makePlan();
  const estimates: PositionEstimate[] = [0, 1, 2, 3].map((i) => ({
    t: 1_700_000_000 + i,
    position: i === 2 ? null : { x: 3 + i, y: 5 },
    rawPosition: null,
    failureReason: i === 2 ? "zu wenige Beacons" : undefined,
    inputs: i === 2 ? [] : [{ beaconId: "B1", rssi: -65 }],
    truth: { x: 3 + i, y: 5.5 },
    errorUnits: i === 2 ? null : 0.5,
  }));
  const references: ReferencePoint[] = [{ t: 1_700_000_000, position: { x: 3, y: 5.5 } }];
  const samples: RssiSample[] = [
    { t: 1_700_000_000, beaconId: "B1", rssi: -65 },
    { t: 1_700_000_001, beaconId: "B1", rssi: -70 },
  ];

  it("steps through epochs with the step buttons and shows failures", () => {
    render(<Replay plan={plan} beacons={beacons} estimates={estimates} references={references} samples={samples} />);
    expect(screen.getByTestId("replay-epoch").textContent).toBe("1 / 4");
    fireEvent.click(screen.getByLabelText("Eine Epoche vor"));
    expect(screen.getByTestId("replay-epoch").textContent).toBe("2 / 4");
    expect(screen.getByTestId("replay-error").textContent).toMatch(/0,50 LE/);
    fireEvent.click(screen.getByLabelText("Eine Epoche vor"));
    expect(screen.getByTestId("replay-epoch").textContent).toBe("3 / 4");
    expect(screen.getByTestId("replay-failed").textContent).toMatch(/keine Schätzung: zu wenige Beacons/);
    fireEvent.click(screen.getByLabelText("Eine Epoche zurück"));
    expect(screen.getByTestId("replay-epoch").textContent).toBe("2 / 4");
    expect(screen.getByTestId("replay-time").textContent).toBe("00:01.0");
  });

  it("highlights beacons heard in the last 2 s with their RSSI", () => {
    render(<Replay plan={plan} beacons={beacons} estimates={estimates} references={references} samples={samples} />);
    expect(within(screen.getByTestId("replay-beacon-B1")).getByText("-65 dBm")).toBeTruthy();
    expect(within(screen.getByTestId("replay-beacon-B2")).getByText("nicht gehört")).toBeTruthy();
  });

  it("space toggles play/pause", () => {
    render(<Replay plan={plan} beacons={beacons} estimates={estimates} references={references} samples={samples} />);
    const play = screen.getByLabelText("Abspielen");
    fireEvent.keyDown(screen.getByTestId("replay"), { key: " " });
    expect(play.getAttribute("aria-pressed")).toBe("true");
    fireEvent.keyDown(screen.getByTestId("replay"), { key: " " });
    expect(play.getAttribute("aria-pressed")).toBe("false");
  });
});
