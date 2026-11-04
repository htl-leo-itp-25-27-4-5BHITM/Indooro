import { SiteNav } from "./sections/SiteNav";
import { Hero } from "./sections/Hero";
import { Problem } from "./sections/Problem";
import { DemoSection } from "./sections/DemoSection";
import { HowItWorks } from "./sections/HowItWorks";
import { OperatorSection } from "./sections/OperatorSection";
import { ProjectStatus } from "./sections/ProjectStatus";
import { PilotSection } from "./sections/PilotSection";
import { SiteFooter } from "./sections/SiteFooter";

/**
 * One page, anchor sections (ids): #top, #problem, #demo, #so-funktionierts, #betreiber,
 * #projektstand, #pilot, #kontakt.
 */
export function App() {
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
    </>
  );
}
