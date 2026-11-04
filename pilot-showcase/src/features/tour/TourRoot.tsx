import { useEffect } from "react";
import { TourOverlay } from "./TourOverlay";
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

  return <TourOverlay />;
}
