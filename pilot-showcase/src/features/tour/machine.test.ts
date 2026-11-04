import { describe, expect, it } from "vitest";
import { chapterInfo, chaptersOf, initialTourState, tourReducer } from "./machine";

const N = 4;
const started = tourReducer(initialTourState, { type: "start", count: N });

describe("tourReducer", () => {
  it("starts at the first step", () => {
    expect(started).toMatchObject({ active: true, index: 0 });
  });
  it("can start at a given step and clamps it", () => {
    expect(tourReducer(initialTourState, { type: "start", count: N, at: 2 }).index).toBe(2);
    expect(tourReducer(initialTourState, { type: "start", count: N, at: 99 }).index).toBe(N - 1);
  });
  it("moves forward and back with direction", () => {
    const a = tourReducer(started, { type: "next", count: N });
    expect(a).toMatchObject({ index: 1, direction: 1 });
    expect(tourReducer(a, { type: "prev" })).toMatchObject({ index: 0, direction: -1 });
  });
  it("does not go before the first step", () => {
    expect(tourReducer(started, { type: "prev" })).toBe(started);
  });
  it("finishes after the last step", () => {
    const last = tourReducer(started, { type: "goto", index: N - 1, count: N });
    expect(last.index).toBe(N - 1);
    expect(tourReducer(last, { type: "next", count: N }).active).toBe(false);
  });
  it("ignores navigation while inactive", () => {
    expect(tourReducer(initialTourState, { type: "next", count: N })).toBe(initialTourState);
    expect(tourReducer(initialTourState, { type: "goto", index: 2, count: N })).toBe(initialTourState);
  });
  it("stop resets the index and keeps presentation mode", () => {
    const p = tourReducer(tourReducer(started, { type: "next", count: N }), { type: "togglePresentation" });
    const s = tourReducer(p, { type: "stop" });
    expect(s).toMatchObject({ active: false, index: 0, presentation: true });
  });
});

describe("chapters", () => {
  const steps = [{ chapter: "A" }, { chapter: "A" }, { chapter: "B" }, { chapter: "C" }];
  it("lists chapters in order", () => expect(chaptersOf(steps)).toEqual(["A", "B", "C"]));
  it("describes the chapter of a step", () => expect(chapterInfo(steps, 2)).toEqual({ chapter: "B", number: 2, total: 3 }));
});
