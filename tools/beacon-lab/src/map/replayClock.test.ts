import { describe, expect, it } from "vitest";
import { advance, durationMsOf, epochIndexAt, epochIndexAtTime, latestInWindow, posOfEpoch, stepEpoch } from "./replayClock";
import { formatAbsTime, formatRelTime, groupHolds, splitSegments } from "./format";

const times = [100, 100.5, 101, 102, 105];

describe("advance", () => {
  it("scales wall time by speed", () => {
    expect(advance(0, 100, 2, 10_000)).toEqual({ posMs: 200, ended: false });
    expect(advance(1000, 100, 0.5, 10_000).posMs).toBeCloseTo(1050);
  });
  it("clamps at the end and reports ended", () => {
    expect(advance(9900, 100, 10, 10_000)).toEqual({ posMs: 10_000, ended: true });
  });
  it("ignores negative / invalid deltas", () => {
    expect(advance(500, -50, 1, 10_000).posMs).toBe(500);
    expect(advance(500, NaN, 1, 10_000).posMs).toBe(500);
  });
});

describe("epoch index", () => {
  it("finds the last epoch not after t", () => {
    expect(epochIndexAtTime(times, 99)).toBe(-1);
    expect(epochIndexAtTime(times, 100.5)).toBe(1);
    expect(epochIndexAtTime(times, 101.9)).toBe(2);
    expect(epochIndexAtTime(times, 999)).toBe(4);
  });
  it("maps playback position to epoch index", () => {
    expect(epochIndexAt(times, 0)).toBe(0);
    expect(epochIndexAt(times, 600)).toBe(1);
    expect(epochIndexAt(times, 2500)).toBe(3);
    expect(epochIndexAt([], 10)).toBe(-1);
  });
  it("steps and clamps", () => {
    expect(stepEpoch(times, 0, -1).index).toBe(0);
    expect(stepEpoch(times, 4, 1).index).toBe(4);
    const s = stepEpoch(times, 1, 1);
    expect(s.index).toBe(2);
    expect(s.posMs).toBeCloseTo(1000);
  });
  it("posOfEpoch / duration", () => {
    expect(posOfEpoch(times, 4)).toBeCloseTo(5000);
    expect(durationMsOf(times)).toBeCloseTo(5000);
    expect(durationMsOf([1])).toBe(0);
  });
  it("is deterministic when stepping through all epochs", () => {
    let pos = 0;
    const seen: number[] = [];
    let ended = false;
    while (!ended) {
      seen.push(epochIndexAt(times, pos));
      const r = advance(pos, 250, 1, durationMsOf(times));
      pos = r.posMs;
      ended = r.ended;
    }
    seen.push(epochIndexAt(times, pos));
    expect(new Set(seen)).toEqual(new Set([0, 1, 2, 3, 4]));
    expect(seen[seen.length - 1]).toBe(4);
  });
});

describe("latestInWindow", () => {
  const series = [{ t: 1 }, { t: 2 }, { t: 4 }];
  it("returns the latest sample inside the window", () => {
    expect(latestInWindow(series, 4.5, 2)?.t).toBe(4);
    expect(latestInWindow(series, 3, 2)?.t).toBe(2);
  });
  it("returns null if the latest sample is too old or in the future", () => {
    expect(latestInWindow(series, 7, 2)).toBeNull();
    expect(latestInWindow(series, 0.5, 2)).toBeNull();
  });
});

describe("format helpers", () => {
  it("formats relative and absolute time", () => {
    expect(formatRelTime(65.25)).toBe("01:05.3");
    expect(formatRelTime(3.04)).toBe("00:03.0");
    expect(formatAbsTime(12)).toBeNull();
    expect(formatAbsTime(1_700_000_000)).toBe("2023-11-14T22:13:20.000Z");
  });
  it("splitSegments breaks at failures and large gaps", () => {
    const items = [
      { t: 0, p: { x: 0, y: 0 } },
      { t: 1, p: { x: 1, y: 0 } },
      { t: 2, p: null },
      { t: 3, p: { x: 3, y: 0 } },
      { t: 4, p: { x: 4, y: 0 } },
      { t: 20, p: { x: 5, y: 0 } },
    ];
    const segs = splitSegments(items);
    expect(segs.map((s) => s.length)).toEqual([2, 2, 1]);
    expect(splitSegments(items, 100).map((s) => s.length)).toEqual([2, 3]);
  });
  it("groupHolds merges consecutive identical positions", () => {
    const holds = groupHolds([
      { t: 0, position: { x: 1, y: 1 } },
      { t: 1, position: { x: 1, y: 1 } },
      { t: 2, position: { x: 3, y: 1 } },
    ]);
    expect(holds).toHaveLength(2);
    expect(holds[0]).toMatchObject({ start: 0, end: 1, count: 2 });
  });
});
