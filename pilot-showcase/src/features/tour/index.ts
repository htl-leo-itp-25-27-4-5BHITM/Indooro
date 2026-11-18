/**
 * Guided tour public API. OWNER: tour agent.
 * startTour() opens the presenter-style walkthrough through the whole page (the overlay is mounted once in App).
 */
import { tourStore } from "./store";

export function startTour(): void {
  tourStore.start(0);
}

export function stopTour(): void {
  tourStore.stop();
}

export { useTour } from "./store";
export { NextChapter } from "./NextChapter";
export { ReadingProgress } from "./ReadingProgress";
