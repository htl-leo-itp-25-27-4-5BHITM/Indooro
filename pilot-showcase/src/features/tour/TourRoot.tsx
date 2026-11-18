import { useEffect } from "react";
import { ChapterRail } from "./ChapterRail";
import { TourLauncher } from "./TourLauncher";
import { TourOverlay } from "./TourOverlay";
import { TourToast } from "./TourToast";
import { tourStore } from "./store";

/** Global tour components, mounted once in App. */
export function TourRoot() {
  // Deep link ?tour=1 starts the tour (after the demo has registered itself).
  useEffect(() => {
    let wanted = false;
    try {
      wanted = new URLSearchParams(window.location.search).get("tour") === "1";
    } catch {
      /* ignore */
    }
    if (!wanted) return;
    const t = window.setTimeout(() => tourStore.start(0), 700);
    return () => window.clearTimeout(t);
  }, []);

  return (
    <>
      <ChapterRail />
      <TourLauncher />
      <TourToast />
      <TourOverlay />
    </>
  );
}
