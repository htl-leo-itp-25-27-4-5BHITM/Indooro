/** Pure state machine of the guided tour (no DOM, no React). */
export interface TourState {
  active: boolean;
  /** 0-based index of the current step. */
  index: number;
  /** Presentation mode: larger text, navigation hidden. */
  presentation: boolean;
  /** Direction of the last move, used for transitions. */
  direction: 1 | -1;
}

export type TourAction =
  | { type: "start"; count: number; at?: number }
  | { type: "next"; count: number }
  | { type: "prev" }
  | { type: "goto"; index: number; count: number }
  | { type: "stop" }
  | { type: "togglePresentation" };

export const initialTourState: TourState = { active: false, index: 0, presentation: false, direction: 1 };

const clamp = (n: number, count: number) => Math.max(0, Math.min(count - 1, n));

export function tourReducer(state: TourState, action: TourAction): TourState {
  switch (action.type) {
    case "start":
      return { ...state, active: true, index: clamp(action.at ?? 0, action.count), direction: 1 };
    case "next":
      if (!state.active) return state;
      // "Weiter" on the last step finishes the tour.
      if (state.index >= action.count - 1) return { ...state, active: false, index: 0, direction: 1 };
      return { ...state, index: state.index + 1, direction: 1 };
    case "prev":
      if (!state.active || state.index === 0) return state;
      return { ...state, index: state.index - 1, direction: -1 };
    case "goto": {
      if (!state.active) return state;
      const index = clamp(action.index, action.count);
      return index === state.index ? state : { ...state, index, direction: index > state.index ? 1 : -1 };
    }
    case "stop":
      return state.active ? { ...state, active: false, index: 0, direction: 1 } : state;
    case "togglePresentation":
      return { ...state, presentation: !state.presentation };
  }
}

export interface ChapterInfo {
  chapter: string;
  /** 1-based number of the chapter. */
  number: number;
  total: number;
}

/** Distinct chapters in order of first appearance. */
export function chaptersOf(steps: readonly { chapter: string }[]): string[] {
  const out: string[] = [];
  for (const s of steps) if (!out.includes(s.chapter)) out.push(s.chapter);
  return out;
}

export function chapterInfo(steps: readonly { chapter: string }[], index: number): ChapterInfo {
  const chapters = chaptersOf(steps);
  const chapter = steps[index]?.chapter ?? chapters[0] ?? "";
  return { chapter, number: chapters.indexOf(chapter) + 1, total: chapters.length };
}
