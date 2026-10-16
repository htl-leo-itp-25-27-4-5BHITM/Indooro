import { test } from "node:test";
import assert from "node:assert/strict";
import { calibratedScale, calibrationRotation } from "./underlay";

test("two-point calibration yields meters per pixel and rejects zero distance", () => {
  assert.equal(calibratedScale({ x: 10, y: 20 }, { x: 110, y: 20 }, 5), 0.05);
  assert.throws(() => calibratedScale({ x: 1, y: 1 }, { x: 1, y: 1 }, 5));
  assert.throws(() => calibratedScale({ x: 1, y: 1 }, { x: 2, y: 1 }, 0));
});

test("calibration rotation uses image point orientation", () => {
  assert.equal(calibrationRotation({ x: 0, y: 0 }, { x: 1, y: 0 }), 0);
  assert.equal(calibrationRotation({ x: 0, y: 0 }, { x: 0, y: 1 }), 90);
});
