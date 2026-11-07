import { Component, lazy, Suspense } from "react";
import type { ReactNode } from "react";

const HeroScene = lazy(() => import("./HeroScene"));
const HowScene = lazy(() => import("./HowScene"));

/** Swallows scene errors (e.g. a lost or blocked WebGL context) so the page keeps its 2D fallback. */
class SceneBoundary extends Component<{ children: ReactNode; onError?: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    this.props.onError?.();
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

/** Lazy-loaded cinematic hero scene. Renders nothing until three.js is loaded and a frame was drawn. */
export function HeroStage({ onReady, onError }: { onReady?: () => void; onError?: () => void }) {
  return (
    <SceneBoundary onError={onError}>
      <Suspense fallback={null}>
        <HeroScene onReady={onReady} />
      </Suspense>
    </SceneBoundary>
  );
}

/** Lazy-loaded exploded system illustration; `progress` is a mutable 0..1 scroll value read every frame. */
export function HowStage({ progress, onReady, onError }: { progress: { current: number }; onReady?: () => void; onError?: () => void }) {
  return (
    <SceneBoundary onError={onError}>
      <Suspense fallback={null}>
        <HowScene progress={progress} onReady={onReady} />
      </Suspense>
    </SceneBoundary>
  );
}
