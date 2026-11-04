import type { Point, TemporalFilterConfig } from "../core/types";

/**
 * Temporal filtering of POSITION estimates (after the algorithm, before evaluation).
 *
 * Failure policy: positions that are `null` stay `null` – nothing is carried forward or held. A failure
 * RESETS all filter state (EMA value, Kalman state, speed-gate reference), and so does a time gap larger
 * than 3 x the median epoch spacing of the sequence. After a reset the next valid position starts the
 * filter fresh (output = input). Rationale: after an unobserved interval the old state is stale; coasting
 * on it would fabricate positions or bias the first new estimate.
 *
 * Order: speed gate first (on the raw positions), then smoothing (ema / kalman). Gating before smoothing
 * keeps single jump outliers out of the smoother's state.
 *
 * Speed gate (maxSpeedMps > 0): if the implied speed from the last ACCEPTED (gated) position exceeds
 * maxSpeed, the step is CLAMPED to maxSpeed * dt along the direction of the new estimate (not dropped).
 * A real, sustained displacement is therefore followed at most at maxSpeed (it is delayed, not lost).
 * maxSpeedMps is metres/second and is converted to layout units/second with metersPerUnit.
 *
 * Kalman: constant-velocity model, state (x, y, vx, vy), white-noise acceleration with std `kalmanAccelStd`
 * (m/s^2) and measurement std `kalmanMeasStd` (m), both converted to layout units with metersPerUnit.
 * Because the model is identical and independent for both axes, it is implemented as two decoupled 2-state
 * filters (mathematically the same as the 4-state filter with block-diagonal covariance). dt comes from the
 * timestamps. The initial velocity prior is 1 m/s (std).
 *
 * `est` must be ordered by t. An invalid metersPerUnit (<= 0 / NaN) falls back to 1.
 */
export function applyTemporalFilter(
  est: readonly { t: number; position: Point | null }[],
  cfg: TemporalFilterConfig,
  metersPerUnit: number,
): (Point | null)[] {
  const mpu = Number.isFinite(metersPerUnit) && metersPerUnit > 0 ? metersPerUnit : 1;
  const n = est.length;
  const out: (Point | null)[] = new Array(n).fill(null);
  if (n === 0) return out;

  const gapLimit = 3 * medianStep(est.map((e) => e.t));
  const maxSpeedUnits = Number.isFinite(cfg.maxSpeedMps) && cfg.maxSpeedMps > 0 ? cfg.maxSpeedMps / mpu : 0;
  const alpha = Number.isFinite(cfg.alpha) ? Math.min(1, Math.max(1e-6, cfg.alpha)) : 1;
  const accelStd = (Number.isFinite(cfg.kalmanAccelStd) ? Math.max(0, cfg.kalmanAccelStd) : 0) / mpu;
  const measStd = (Number.isFinite(cfg.kalmanMeasStd) && cfg.kalmanMeasStd > 0 ? cfg.kalmanMeasStd : 1e-3) / mpu;
  const velStd = 1 / mpu;

  let lastT: number | null = null;
  let gated: Point | null = null; // last accepted (gated) position
  let ema: Point | null = null;
  let kx: Axis | null = null;
  let ky: Axis | null = null;

  const reset = () => {
    lastT = null;
    gated = null;
    ema = null;
    kx = null;
    ky = null;
  };

  for (let i = 0; i < n; i++) {
    const { t, position } = est[i];
    if (!position || !Number.isFinite(position.x) || !Number.isFinite(position.y) || !Number.isFinite(t)) {
      reset();
      continue;
    }
    if (lastT !== null && Number.isFinite(gapLimit) && t - lastT > gapLimit) reset();
    const dt = lastT === null ? 0 : Math.max(0, t - lastT);

    // 1) speed gate
    let p: Point = { x: position.x, y: position.y };
    if (maxSpeedUnits > 0 && gated) {
      const dx = p.x - gated.x;
      const dy = p.y - gated.y;
      const dist = Math.hypot(dx, dy);
      const allowed = maxSpeedUnits * dt;
      if (dist > allowed) {
        const f = dist > 0 ? allowed / dist : 0;
        p = { x: gated.x + dx * f, y: gated.y + dy * f };
      }
    }
    gated = p;

    // 2) smoothing
    let result: Point;
    if (cfg.kind === "ema") {
      ema = ema ? { x: ema.x + alpha * (p.x - ema.x), y: ema.y + alpha * (p.y - ema.y) } : { ...p };
      result = { ...ema };
    } else if (cfg.kind === "kalman") {
      if (!kx || !ky) {
        kx = newAxis(p.x, measStd, velStd);
        ky = newAxis(p.y, measStd, velStd);
      } else {
        stepAxis(kx, p.x, dt, accelStd, measStd);
        stepAxis(ky, p.y, dt, accelStd, measStd);
      }
      result = { x: kx.pos, y: ky.pos };
    } else {
      result = p;
    }
    out[i] = result;
    lastT = t;
  }
  return out;
}

interface Axis {
  pos: number;
  vel: number;
  p00: number;
  p01: number;
  p11: number;
}

function newAxis(z: number, measStd: number, velStd: number): Axis {
  return { pos: z, vel: 0, p00: measStd * measStd, p01: 0, p11: velStd * velStd };
}

function stepAxis(a: Axis, z: number, dt: number, accelStd: number, measStd: number): void {
  // predict (F = [[1,dt],[0,1]], Q = sigma_a^2 [[dt^4/4, dt^3/2],[dt^3/2, dt^2]])
  const q = accelStd * accelStd;
  a.pos += a.vel * dt;
  const p00 = a.p00 + 2 * dt * a.p01 + dt * dt * a.p11 + (q * dt ** 4) / 4;
  const p01 = a.p01 + dt * a.p11 + (q * dt ** 3) / 2;
  const p11 = a.p11 + q * dt * dt;
  // update (H = [1, 0])
  const s = p00 + measStd * measStd;
  const k0 = p00 / s;
  const k1 = p01 / s;
  const y = z - a.pos;
  a.pos += k0 * y;
  a.vel += k1 * y;
  a.p00 = (1 - k0) * p00;
  a.p01 = (1 - k0) * p01;
  a.p11 = p11 - k1 * p01;
}

function medianStep(ts: readonly number[]): number {
  const d: number[] = [];
  for (let i = 1; i < ts.length; i++) {
    const x = ts[i] - ts[i - 1];
    if (Number.isFinite(x) && x > 0) d.push(x);
  }
  if (d.length === 0) return Infinity;
  d.sort((a, b) => a - b);
  return d[Math.floor(d.length / 2)];
}
