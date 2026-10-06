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
  assert.match(nearTop.basePath, /C 188 -20 184 -5 184 10/);

  const nearBottom = buildReadingTocRailCurve(geometry, 190, 20);
  assert.equal(nearBottom.topY, 140);
  assert.equal(nearBottom.bottomY, 200);
  assert.equal(nearBottom.effectiveAmplitude, 4);
  assert.equal(nearBottom.peakX, 184);
  assert.match(nearBottom.basePath, /C 184 205 188 220 188 200/);
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

test("endpoint folds stay visible and the highlight follows their actual arc length", async () => {
  const { readFile } = await import("node:fs/promises");
  const { build } = await import("esbuild");
  const { chromium } = await import("playwright");
  const { default: sharp } = await import("sharp");
  const { outputFiles } = await build({
    entryPoints: [new URL("../assets/ts/toc/reading-toc-rail.ts", import.meta.url).pathname],
    bundle: true, format: "iife", globalName: "Rail", write: false,
  });
  const css = (await Promise.all(["tokens.css", "components.css", "pages/note.css"].map(name =>
    readFile(new URL(`../internal/embedded/static/css/${name}`, import.meta.url), "utf8"),
  ))).join("\n");
  const template = await readFile(new URL("../internal/embedded/templates/partials/toc.html", import.meta.url), "utf8");
  const nav = template.match(/<nav class="reading-toc-rail"[\s\S]*?<\/nav>/)[0].replace(/{{.*?}}/g, "");
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1400, height: 600 } });
    await page.setContent(`<html data-reduced-motion="true"><style>${css}
      body { margin: 0; background: white; --color-line: #888; --color-muted: #888; --color-accent: #7055ad;
        --reading-toc-rail-height: 200px; --note-toc-width: 208px; }
      .note-toc-stage { position: absolute; left: 100px; top: 140px; }
      .reading-toc-rail-current { display: none; }
    </style><div class="note-toc-stage has-reading-rail is-reading">${nav}</div></html>`);
    await page.addScriptTag({ content: outputFiles[0].text });
    await page.evaluate(() => {
      window.rail = new Rail.ReadingTocRail(document.querySelector("[data-reading-toc-rail]"));
      window.rail.setReducedMotion(true);
    });
    for (const halfHeight of [50, 100]) {
      for (const progress of [0, 0.01, 0.05, 0.5, 0.95, 0.99, 1]) {
        const bounds = await page.evaluate(({ geometry, halfHeight, progress }) => {
          window.rail.setGeometry({ ...geometry, bulgeHalfHeight: halfHeight });
          window.rail.setTargets(progress, -1, -1);
          window.rail.advance(0);
          const box = document.querySelector("[data-reading-toc-rail-base]").getBBox();
          return { top: 140 + box.y, bottom: 140 + box.y + box.height };
        }, { geometry, halfHeight, progress });
        const screenshot = await page.screenshot({ clip: { x: 90, y: 20, width: 228, height: 440 } });
        const { data, info } = await sharp(screenshot).removeAlpha().raw().toBuffer({ resolveWithObject: true });
        const paintedRows = [];
        for (let y = 0; y < info.height; y++) {
          for (let x = 0; x < info.width; x++) {
            const offset = (y * info.width + x) * info.channels;
            if (data[offset] < 240 || data[offset + 1] < 240 || data[offset + 2] < 240) {
              paintedRows.push(y + 20);
              break;
            }
          }
        }
        // The visible ink must reach the original curve's extrema, and must
        // not include the long mirrored rails outside the original viewport.
        assert.ok(Math.abs(paintedRows[0] - bounds.top) <= 2.1, `top clipped or extended at ${progress}, span ${halfHeight}: ${paintedRows[0]} vs ${bounds.top}`);
        assert.ok(Math.abs(paintedRows.at(-1) - bounds.bottom) <= 2.1, `bottom clipped or extended at ${progress}, span ${halfHeight}: ${paintedRows.at(-1)} vs ${bounds.bottom}`);
      }
    }
    const measurements = await page.evaluate(({ geometry }) => {
      const measurements = [];
      const accent = document.querySelector("[data-reading-toc-rail-svg] > [data-reading-toc-rail-accent]");
      for (const height of [40, 200, 840]) {
        for (const amplitude of [10.4, 24.4]) {
          for (const progress of [0, 0.00001, 0.001, 0.01, 0.1, 0.5, 0.9, 0.99, 0.999, 0.99999, 1]) {
            const g = { ...geometry, height, idleAmplitude: amplitude };
            window.rail.setGeometry(g);
            window.rail.setTargets(progress, -1, -1);
            window.rail.advance(0);
            const curve = Rail.buildReadingTocRailCurve(g, height * progress, amplitude);
            const length = accent.getTotalLength();
            const center = accent.getPointAtLength(Math.min(0.06 * height, curve.markerLength));
            const expectedLength = Math.min(curve.totalLength, curve.markerLength + 0.06 * height)
              - Math.max(0, curve.markerLength - 0.06 * height);
            measurements.push({ height, amplitude, progress,
              lengthError: Math.abs(length - expectedLength),
              centerError: Math.hypot(center.x - curve.peakX, center.y - height * progress),
              solid: getComputedStyle(accent).strokeDasharray === "none",
            });
          }
        }
      }
      return measurements;
    }, { geometry });
    for (const result of measurements) {
      const context = JSON.stringify(result);
      assert.ok(result.lengthError < 0.1, `arc length agrees with browser: ${context}`);
      assert.ok(result.centerError < 0.1, `highlight follows the peak through endpoint folds: ${context}`);
      assert.ok(result.solid, `highlight must be an explicit solid path: ${context}`);
    }
    const animated = await page.evaluate(({ geometry }) => {
      const accent = document.querySelector("[data-reading-toc-rail-svg] > [data-reading-toc-rail-accent]");
      const base = document.querySelector("[data-reading-toc-rail-svg] > [data-reading-toc-rail-base]");
      const prefix = document.createElementNS("http://www.w3.org/2000/svg", "path");
      const samples = [];
      window.rail.setGeometry({ ...geometry, height: 840 });
      window.rail.setReducedMotion(false);
      window.rail.setInteractive(true);
      for (const [start, end] of [[0.1, 0], [0.9, 1]]) {
        window.rail.setTargets(start, -1, -1);
        window.rail.snapToTargets();
        window.rail.advance(0);
        window.rail.setTargets(end, -1, -1, 4000);
        for (let frame = 1; frame <= 90; frame++) {
          window.rail.advance(frame * 1000 / 60);
          const length = accent.getTotalLength();
          prefix.setAttribute("d", base.getAttribute("d").match(/^(.*?C.*?) C/)[1]);
          const markerLength = prefix.getTotalLength();
          const center = accent.getPointAtLength(Math.min(0.06 * 840, markerLength));
          const expectedLength = Math.min(base.getTotalLength(), markerLength + 0.06 * 840)
            - Math.max(0, markerLength - 0.06 * 840);
          // The first cubic ends at the moving wave peak.
          const coordinates = base.getAttribute("d").match(/-?\d+(?:\.\d+)?/g).map(Number);
          samples.push({ end, frame,
            centerError: Math.hypot(center.x - coordinates[8], center.y - coordinates[9]),
            lengthError: Math.abs(length - expectedLength),
          });
        }
      }
      return samples;
    }, { geometry });
    for (const sample of animated) {
      assert.ok(sample.centerError < 0.1, `animated highlight drifts from peak: ${JSON.stringify(sample)}`);
      assert.ok(sample.lengthError < 0.1, `animated highlight changes length: ${JSON.stringify(sample)}`);
    }
    // Inspect painted pixels, not just SVG measurements: a dashed, collinear
    // fold can paint differently even when its reported arc length is correct.
    await page.setViewportSize({ width: 1400, height: 1200 });
    await page.evaluate(() => {
      document.body.style.setProperty("--reading-toc-rail-height", "840px");
      window.rail.setReducedMotion(true);
    });
    for (const end of [0, 1]) {
      let previous = null;
      for (const distance of [0.0001, 0.00001, 0.000001, 0]) {
        const bounds = await page.evaluate(({ end, distance }) => {
          window.rail.setTargets(end === 0 ? distance : 1 - distance, -1, -1);
          window.rail.advance(0);
          const box = document.querySelector("[data-reading-toc-rail-svg] > [data-reading-toc-rail-accent]").getBBox();
          return { top: 140 + box.y, bottom: 140 + box.y + box.height };
        }, { end, distance });
        const png = await page.screenshot({ clip: { x: 250, y: 100, width: 80, height: 980 } });
        const { data, info } = await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true });
        const rows = [];
        for (let y = 0; y < info.height; y++) {
          for (let x = 0; x < info.width; x++) {
            const offset = (y * info.width + x) * info.channels;
            if (data[offset + 2] - data[offset] > 20 && data[offset] - data[offset + 1] > 10) {
              rows.push(y + 100);
              break;
            }
          }
        }
        const painted = { top: rows[0], bottom: rows.at(-1) };
        for (const edge of ["top", "bottom"]) {
          assert.ok(Math.abs(painted[edge] - bounds[edge]) <= 2, `painted ${edge} differs from solid highlight at ${end}: ${distance}`);
          if (previous) assert.ok(Math.abs(painted[edge] - previous[edge]) <= 1, `highlight pixels jump as fold becomes collinear at ${end}`);
        }
        previous = painted;
      }
    }
    await page.evaluate(() => window.rail.destroy());
    assert.equal(await page.locator("[data-reading-toc-rail-svg] g").count(), 0);
  } finally {
    await browser.close();
  }
});
