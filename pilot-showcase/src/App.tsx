import { useEffect } from "react";
import { SiteNav } from "./sections/SiteNav";
import { Hero } from "./sections/Hero";
import { Problem } from "./sections/Problem";
import { DemoSection } from "./sections/DemoSection";
import { HowItWorks } from "./sections/HowItWorks";
import { OperatorSection } from "./sections/OperatorSection";
import { ProjectStatus } from "./sections/ProjectStatus";
import { PilotSection } from "./sections/PilotSection";
import { SiteFooter } from "./sections/SiteFooter";
import { TourRoot } from "./features/tour/TourRoot";

/**
 * One page, anchor sections (ids): #top, #problem, #demo, #so-funktionierts, #betreiber,
 * #projektstand, #pilot, #kontakt.
 */
export function App() {
  // The page renders on the client, so the browser cannot resolve a deep link such as /#kontakt itself.
  useEffect(() => {
    const id = decodeURIComponent(window.location.hash.slice(1));
    if (!id) return;
    const jump = () => document.getElementById(id)?.scrollIntoView({ behavior: "instant" });
    const raf = requestAnimationFrame(jump);
    // Sections above the target can still change height while they mount: follow until settled or the visitor takes over.
    const observer = new ResizeObserver(jump);
    observer.observe(document.body);
    const inputs = ["wheel", "touchstart", "pointerdown", "keydown"] as const;
    const stop = () => {
      observer.disconnect();
      inputs.forEach((type) => window.removeEventListener(type, stop));
    };
    inputs.forEach((type) => window.addEventListener(type, stop, { passive: true }));
    const timeout = window.setTimeout(stop, 2000);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(timeout);
      stop();
    };
  }, []);

  return (
    <>
      <SiteNav />
      <main>
        <Hero />
        <Problem />
        <DemoSection />
        <HowItWorks />
        <OperatorSection />
        <ProjectStatus />
        <PilotSection />
      </main>
      <SiteFooter />
      <TourRoot />
    </>
  );
}
