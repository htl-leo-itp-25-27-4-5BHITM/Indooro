// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useEffect, useState, type ComponentType } from "react";
import { LabProvider, useLab } from "../../state/LabContext";
import { CalibrationPage } from "../CalibrationPage";
import { ComparePage } from "../ComparePage";
import { HeatmapsPage } from "../HeatmapsPage";
import { ReplayPage } from "../ReplayPage";
import { SignalsPage } from "../SignalsPage";

afterEach(cleanup);

function Harness({ Page }: { Page: ComponentType }) {
  const lab = useLab();
  const [ready, setReady] = useState(false);
  useEffect(() => {
    void (async () => {
      const id = await lab.loadDemoCampaign();
      await lab.openCampaign(id);
      setReady(true);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return ready && lab.campaign ? <Page /> : <div>lädt</div>;
}

const mount = (Page: ComponentType) =>
  render(
    <LabProvider>
      <Harness Page={Page} />
    </LabProvider>,
  );

describe("analysis pages (demo campaign)", () => {
  it("SignalsPage shows stats for a selected beacon and the original-data note", async () => {
    mount(SignalsPage);
    await screen.findByTestId("signals-page");
    expect(screen.getByTestId("signals-original-note").textContent).toContain("Originaldaten bleiben unverändert");
    const select = screen.getByTestId("signals-beacon-select") as HTMLSelectElement;
    const firstBeacon = Array.from(select.options).find((o) => o.value !== "__all__")!;
    fireEvent.change(select, { target: { value: firstBeacon.value } });
    await screen.findByTestId("signals-stats");
    expect(screen.getByTestId("signals-filter-effect").textContent).toContain("Verzögerung");
  });

  it("CalibrationPage lists only calibration runs and fits a model", async () => {
    mount(CalibrationPage);
    await screen.findByTestId("calibration-page");
    const boxes = screen.getByTestId("calibration-run-list").querySelectorAll("input[type=checkbox]");
    expect(boxes.length).toBe(2);
    expect(screen.getByTestId("calibration-current-source").textContent).toContain("unkalibriert");
    fireEvent.click(screen.getByTestId("calibration-run"));
    await screen.findByTestId("calibration-result");
    expect(screen.getByTestId("calibration-apply-campaign")).toBeTruthy();
    fireEvent.click(screen.getByTestId("calibration-apply-campaign"));
    await waitFor(() => expect(screen.getByTestId("calibration-current-source").textContent).toContain("kalibriert (Fit)"));
  });

  it("ComparePage computes metrics, the common-epoch table and never hardcodes results", async () => {
    mount(ComparePage);
    await screen.findByTestId("compare-page");
    expect(screen.getByTestId("compare-config-list").querySelectorAll("li").length).toBe(5); // 4 presets + kNN (calibration runs exist)
    fireEvent.click(screen.getByTestId("compare-run"));
    await screen.findByTestId("compare-results", undefined, { timeout: 15000 });
    expect(screen.getByTestId("compare-metrics-table").textContent).toContain("Ausfallrate");
    expect(screen.getByTestId("compare-common-table").textContent).toContain("Fehlschläge");
    expect(screen.getByText(/Gemeinsame Epochenmenge \(n = \d+\)/)).toBeTruthy();
  }, 30000);

  it("HeatmapsPage renders the map and honesty text", async () => {
    mount(HeatmapsPage);
    await screen.findByTestId("heatmaps-page");
    expect(screen.getByTestId("heatmap-mode-text").textContent).toContain("Nichts wird interpoliert");
    fireEvent.change(screen.getByTestId("heatmap-mode"), { target: { value: "idw" } });
    expect(screen.getByTestId("heatmap-mode-text").textContent).toContain("INTERPOLIERT");
    expect(screen.getByTestId("heatmap-map")).toBeTruthy();
  });

  it("ReplayPage defaults to an evaluation run and renders the replay", async () => {
    mount(ReplayPage);
    await screen.findByTestId("replay-page");
    await screen.findByTestId("replay-container", undefined, { timeout: 10000 });
    expect(screen.queryByTestId("replay-page-error")).toBeNull();
  }, 20000);
});
