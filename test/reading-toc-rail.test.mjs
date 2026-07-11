import assert from "node:assert/strict";
import test from "node:test";

import {
  buildReadingTocRailCurve,
  readingTocRailDotOffset,
} from "../assets/ts/toc/reading-toc-rail.ts";

const geometry = {
  width: 208,
  height: 200,
  direction: -1,
  lineInset: 188,
  idleAmplitude: 20,
  maxExtraAmplitude: 14,
  bulgeHalfHeight: 50,
  labelGap: 12,
};

function approximatelyEqual(actual, expected, epsilon = 0.000001) {
  assert.ok(
    Math.abs(actual - expected) <= epsilon,
    `expected ${actual} to be within ${epsilon} of ${expected}`,
  );
}

test("the wave spans the full rail and becomes straight at both endpoints", () => {
  const top = buildReadingTocRailCurve(geometry, 0, 20);
  assert.equal(top.topY, 0);
  assert.equal(top.bottomY, 50);
  assert.equal(top.effectiveAmplitude, 0);
  assert.equal(top.peakX, 188);

  const middle = buildReadingTocRailCurve(geometry, 100, 20);
  assert.equal(middle.topY, 50);
  assert.equal(middle.bottomY, 150);
  assert.equal(middle.effectiveAmplitude, 20);
  assert.equal(middle.peakX, 168);

  const bottom = buildReadingTocRailCurve(geometry, 200, 20);
  assert.equal(bottom.topY, 150);
  assert.equal(bottom.bottomY, 200);
  assert.equal(bottom.effectiveAmplitude, 0);
  assert.equal(bottom.peakX, 188);
});

test("near-edge paths clip endpoints but retain full bezier control points", () => {
  const nearTop = buildReadingTocRailCurve(geometry, 10, 20);
  assert.equal(nearTop.topY, 0);
  assert.equal(nearTop.bottomY, 60);
  assert.equal(nearTop.effectiveAmplitude, 4);
  assert.equal(nearTop.peakX, 184);
  assert.match(nearTop.basePath, /C 188 -12\.5 184 -5 184 10/);

  const nearBottom = buildReadingTocRailCurve(geometry, 190, 20);
  assert.equal(nearBottom.topY, 140);
  assert.equal(nearBottom.bottomY, 200);
  assert.equal(nearBottom.effectiveAmplitude, 4);
  assert.equal(nearBottom.peakX, 184);
  assert.match(nearBottom.basePath, /C 184 205 188 212\.5 188 200/);
});

test("direction mirrors only the horizontal wave geometry", () => {
  const left = buildReadingTocRailCurve(geometry, 100, 20);
  const right = buildReadingTocRailCurve({ ...geometry, direction: 1 }, 100, 20);

  assert.equal(left.peakX, 168);
  assert.equal(right.peakX, 208);
  assert.equal(right.topY, left.topY);
  assert.equal(right.bottomY, left.bottomY);
  assert.equal(right.effectiveAmplitude, left.effectiveAmplitude);
});

test("heading dots follow the same cosine-squared wave envelope", () => {
  approximatelyEqual(readingTocRailDotOffset(100, 100, 50, 20, -1), -20);
  approximatelyEqual(readingTocRailDotOffset(75, 100, 50, 20, -1), -10);
  approximatelyEqual(readingTocRailDotOffset(125, 100, 50, 20, -1), -10);
  approximatelyEqual(readingTocRailDotOffset(50, 100, 50, 20, -1), 0);
  approximatelyEqual(readingTocRailDotOffset(30, 100, 50, 20, -1), 0);
  approximatelyEqual(readingTocRailDotOffset(100, 100, 50, 20, 1), 20);
});
