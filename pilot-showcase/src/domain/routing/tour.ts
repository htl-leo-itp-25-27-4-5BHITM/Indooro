/**
 * Tour ordering: nearest neighbour + 2-opt on the open path.
 * Port of the iOS TourPlanner.swift / StabilizedNavigationConfig.swift (maxPasses 50,
 * min gain 0.01) and orderStops() from the web app's route.js. Start is fixed; an optional
 * end node (checkout) is fixed as well.
 *
 * Node layout of the distance matrix `d`: 0 = start, 1..n = stops, n+1 = end (only if hasEnd).
 */
export const TWO_OPT_MAX_PASSES = 50;
export const TWO_OPT_MIN_GAIN = 0.01;

/** Nearest neighbour from node 0 over the stops 1..n (ties: lowest index). Returns stop node ids. */
export function nearestNeighbour(d: readonly (readonly number[])[], n: number): number[] {
  const remaining: number[] = [];
  for (let i = 1; i <= n; i++) remaining.push(i);
  const order: number[] = [];
  let current = 0;
  while (remaining.length > 0) {
    let bestPos = 0;
    let best = Infinity;
    for (let p = 0; p < remaining.length; p++) {
      const dist = d[current][remaining[p]];
      if (dist < best) {
        best = dist;
        bestPos = p;
      }
    }
    current = remaining.splice(bestPos, 1)[0];
    order.push(current);
  }
  return order;
}

/** Length of start → order → (end). */
export function tourLength(d: readonly (readonly number[])[], order: readonly number[], endNode?: number): number {
  let total = 0;
  let prev = 0;
  for (const node of order) {
    total += d[prev][node];
    prev = node;
  }
  if (endNode !== undefined) total += d[prev][endNode];
  return total;
}

/** 2-opt on the open path; segments between the fixed ends are reversed while that gains > minGain. */
export function twoOpt(
  d: readonly (readonly number[])[],
  initial: readonly number[],
  endNode?: number,
  maxPasses = TWO_OPT_MAX_PASSES,
  minGain = TWO_OPT_MIN_GAIN
): number[] {
  const order = initial.slice();
  const n = order.length;
  if (n < 2) return order;
  for (let pass = 0; pass < maxPasses; pass++) {
    let improved = false;
    for (let i = 0; i < n - 1; i++) {
      for (let j = i + 1; j < n; j++) {
        const before = i === 0 ? 0 : order[i - 1];
        const after = j + 1 < n ? order[j + 1] : endNode;
        const oldCost = d[before][order[i]] + (after !== undefined ? d[order[j]][after] : 0);
        const newCost = d[before][order[j]] + (after !== undefined ? d[order[i]][after] : 0);
        if (oldCost - newCost > minGain) {
          let a = i;
          let b = j;
          while (a < b) {
            const t = order[a];
            order[a] = order[b];
            order[b] = t;
            a++;
            b--;
          }
          improved = true;
        }
      }
    }
    if (!improved) break;
  }
  return order;
}

/** Nearest neighbour followed by 2-opt. Returns stop node ids (1..n). */
export function optimiseOrder(d: readonly (readonly number[])[], n: number, endNode?: number): number[] {
  return twoOpt(d, nearestNeighbour(d, n), endNode);
}
