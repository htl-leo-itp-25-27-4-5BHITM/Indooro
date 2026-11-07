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
    const raf = requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ behavior: "instant" }));
    return () => cancelAnimationFrame(raf);
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
