"use strict";
(() => {
  // assets/ts/toc/reading-toc-rail.ts
  var DEFAULT_GEOMETRY = {
    width: 208,
    height: 640,
    direction: 1,
    lineInset: 12,
    idleAmplitude: 10.4,
    maxExtraAmplitude: 14,
    bulgeHalfHeight: 56,
    labelGap: 12
  };
  var AMPLITUDE_STIFFNESS = 90;
  var AMPLITUDE_DAMPING = 2 * Math.sqrt(AMPLITUDE_STIFFNESS) * 0.75;
  var MAX_FRAME_STEP = 0.064;
  var MAX_SUBSTEP = 0.016;
  var POSITION_EPSILON = 0.035;
  var VELOCITY_EPSILON = 0.05;
  var AMPLITUDE_EPSILON = 0.025;
  var SPEED_EPSILON = 0.5;
  var PROGRESS_RESPONSE_SECONDS = 0.14;
  var SPEED_RESPONSE_SECONDS = 0.08;
  var SPEED_TO_AMPLITUDE = 0.012;
  var HALF_HEIGHT_SPEED_GAIN = 2.2;
  var BREATH_AMPLITUDE = 0.6;
  var BREATH_PERIOD_MS = 9e3;
  var MIN_AMPLITUDE_REBOUND = -4;
  var MAX_SCROLL_SPEED = 5e3;
  var MIN_DIMENSION = 1;
  function clamp(value, min, max) {
    if (!Number.isFinite(value)) return min;
    return Math.min(max, Math.max(min, value));
  }
  function finiteOr(value, fallback) {
    return Number.isFinite(value) ? value : fallback;
  }
  function approximatelyEqual(a, b, epsilon = 1e-3) {
    return Math.abs(a - b) <= epsilon;
  }
  function formatNumber(value) {
    if (!Number.isFinite(value)) return "0";
    return String(Math.round(value * 1e3) / 1e3);
  }
  function requiredElement(root, selector) {
    const element = root.querySelector(selector);
    if (!element) {
      throw new Error(`[Daybook] Reading TOC rail is missing ${selector}`);
    }
    return element;
  }
  function makeSpring(initial) {
    return {
      current: initial,
      target: initial,
      velocity: 0
    };
  }
  function snapSpring(spring) {
    spring.current = spring.target;
    spring.velocity = 0;
  }
  function stepSpring(spring, stiffness, damping, deltaTime) {
    const acceleration = stiffness * (spring.target - spring.current) - damping * spring.velocity;
    spring.velocity += acceleration * deltaTime;
    spring.current += spring.velocity * deltaTime;
    if (!Number.isFinite(spring.current) || !Number.isFinite(spring.velocity)) {
      snapSpring(spring);
    }
  }
  function springIsSettled(spring, positionEpsilon, velocityEpsilon = VELOCITY_EPSILON) {
    return Math.abs(spring.target - spring.current) <= positionEpsilon && Math.abs(spring.velocity) <= velocityEpsilon;
  }
  function geometryIsEqual(a, b) {
    return a.direction === b.direction && approximatelyEqual(a.width, b.width) && approximatelyEqual(a.height, b.height) && approximatelyEqual(a.lineInset, b.lineInset) && approximatelyEqual(a.idleAmplitude, b.idleAmplitude) && approximatelyEqual(a.maxExtraAmplitude, b.maxExtraAmplitude) && approximatelyEqual(a.bulgeHalfHeight, b.bulgeHalfHeight) && approximatelyEqual(a.labelGap, b.labelGap);
  }
  function normalizeGeometry(geometry) {
    const width = Math.max(MIN_DIMENSION, finiteOr(geometry.width, DEFAULT_GEOMETRY.width));
    const height = Math.max(MIN_DIMENSION, finiteOr(geometry.height, DEFAULT_GEOMETRY.height));
    return {
      width,
      height,
      direction: geometry.direction < 0 ? -1 : 1,
      lineInset: clamp(finiteOr(geometry.lineInset, DEFAULT_GEOMETRY.lineInset), 0, width),
      idleAmplitude: Math.max(0, finiteOr(geometry.idleAmplitude, DEFAULT_GEOMETRY.idleAmplitude)),
      maxExtraAmplitude: Math.max(
        0,
        finiteOr(geometry.maxExtraAmplitude, DEFAULT_GEOMETRY.maxExtraAmplitude)
      ),
      bulgeHalfHeight: Math.max(
        1,
        finiteOr(geometry.bulgeHalfHeight, DEFAULT_GEOMETRY.bulgeHalfHeight)
      ),
      labelGap: Math.max(0, finiteOr(geometry.labelGap, DEFAULT_GEOMETRY.labelGap))
    };
  }
  function buildReadingTocRailCurve(geometry, markerY, amplitude, halfHeight = geometry.bulgeHalfHeight) {
    const normalized = normalizeGeometry(geometry);
    const height = normalized.height;
    const baselineX = normalized.lineInset;
    const safeMarkerY = clamp(finiteOr(markerY, 0), 0, height);
    const safeHalfHeight = Math.max(1, finiteOr(halfHeight, normalized.bulgeHalfHeight));
    const topY = Math.max(0, safeMarkerY - safeHalfHeight);
    const bottomY = Math.min(height, safeMarkerY + safeHalfHeight);
    const edgeFactor = clamp(
      Math.min(safeMarkerY / safeHalfHeight, (height - safeMarkerY) / safeHalfHeight),
      0,
      1
    );
    const availableAmplitude = normalized.direction > 0 ? Math.max(0, normalized.width - baselineX) : Math.max(0, baselineX);
    const effectiveAmplitude = Math.min(
      availableAmplitude,
      Math.max(0, finiteOr(amplitude, normalized.idleAmplitude)) * edgeFactor
    );
    const peakX = baselineX + normalized.direction * effectiveAmplitude;
    const curve = [
      `C ${formatNumber(baselineX)} ${formatNumber(safeMarkerY - 0.6 * safeHalfHeight)}`,
      `${formatNumber(peakX)} ${formatNumber(safeMarkerY - 0.3 * safeHalfHeight)}`,
      `${formatNumber(peakX)} ${formatNumber(safeMarkerY)}`,
      `C ${formatNumber(peakX)} ${formatNumber(safeMarkerY + 0.3 * safeHalfHeight)}`,
      `${formatNumber(baselineX)} ${formatNumber(safeMarkerY + 0.6 * safeHalfHeight)}`,
      `${formatNumber(baselineX)} ${formatNumber(bottomY)}`
    ].join(" ");
    return {
      basePath: [
        `M ${formatNumber(baselineX)} ${formatNumber(Math.min(0, topY))}`,
        `L ${formatNumber(baselineX)} ${formatNumber(topY)}`,
        curve,
        `L ${formatNumber(baselineX)} ${formatNumber(Math.max(height, bottomY))}`
      ].join(" "),
      peakX,
      effectiveAmplitude,
      effectiveHalfHeight: safeHalfHeight,
      topY,
      bottomY
    };
  }
  function readingTocRailDotOffset(dotY, markerY, halfHeight, amplitude, direction) {
    const safeHalfHeight = Math.max(1, finiteOr(halfHeight, 1));
    const ratio = Math.abs(finiteOr(dotY, 0) - finiteOr(markerY, 0)) / safeHalfHeight;
    if (ratio >= 1) return 0;
    const envelope = Math.cos(ratio * Math.PI / 2) ** 2;
    return direction * Math.max(0, finiteOr(amplitude, 0)) * envelope;
  }
  function normalizeHeading(heading) {
    const text = String(heading.text || "").trim();
    return {
      id: String(heading.id || ""),
      text,
      level: Math.round(clamp(finiteOr(heading.level, 2), 1, 6)),
      ratio: clamp(finiteOr(heading.ratio, 0), 0, 1),
      ariaLabel: String(heading.ariaLabel || text)
    };
  }
  var ReadingTocRail = class {
    constructor(root) {
      this.geometry = DEFAULT_GEOMETRY;
      this.headings = [];
      this.dotButtons = [];
      this.markerY = makeSpring(0);
      this.amplitude = makeSpring(0);
      this.hoverSpring = makeSpring(0);
      this.progressTarget = 0;
      this.activeIndex = -1;
      this.endActiveIndex = -1;
      this.renderedActiveIndex = -2;
      this.renderedEndActiveIndex = -2;
      this.renderedPercent = -1;
      this.renderedTitle = "";
      this.visibleTitleSlot = 0;
      this.speedTarget = 0;
      this.smoothedSpeed = 0;
      this.lastTimestamp = null;
      this.frameInitialized = false;
      this.reducedMotion = false;
      this.interactive = false;
      this.destroyed = false;
      this.snapRequested = true;
      this.geometryDirty = true;
      this.dotsDirty = true;
      this.interactionDirty = true;
      this.root = root;
      this.svg = requiredElement(root, "[data-reading-toc-rail-svg]");
      this.basePath = requiredElement(root, "[data-reading-toc-rail-base]");
      this.accentPath = requiredElement(root, "[data-reading-toc-rail-accent]");
      this.dotsRoot = requiredElement(root, "[data-reading-toc-rail-dots]");
      this.label = requiredElement(root, "[data-reading-toc-rail-label]");
      this.currentLink = requiredElement(root, "[data-reading-toc-rail-link]");
      this.percent = requiredElement(root, "[data-reading-toc-rail-percent]");
      const titleSlots = Array.from(root.querySelectorAll("[data-reading-toc-rail-title]"));
      const firstTitle = titleSlots[0];
      const secondTitle = titleSlots[1];
      if (!firstTitle || !secondTitle) {
        throw new Error("[Daybook] Reading TOC rail requires two title slots");
      }
      this.titleSlots = [firstTitle, secondTitle];
      this.baseTop = this.basePath.cloneNode();
      this.baseBottom = this.basePath.cloneNode();
      this.accentTop = this.accentPath.cloneNode();
      this.accentBottom = this.accentPath.cloneNode();
      this.svg.insertBefore(this.baseTop, this.basePath);
      this.svg.insertBefore(this.baseBottom, this.basePath);
      this.svg.appendChild(this.accentTop);
      this.svg.appendChild(this.accentBottom);
      this.svg.style.overflow = "hidden";
      this.refreshPositionTargets();
    }
    setHeadings(entries) {
      if (this.destroyed) return;
      this.headings = entries.map(normalizeHeading);
      const fragment = document.createDocumentFragment();
      this.dotButtons = this.headings.map((heading) => {
        const dot = document.createElement("div");
        dot.setAttribute("data-reading-toc-rail-dot", "");
        dot.setAttribute("data-heading-level", String(heading.level));
        dot.setAttribute("aria-hidden", "true");
        fragment.appendChild(dot);
        return dot;
      });
      this.dotsRoot.replaceChildren(fragment);
      this.activeIndex = this.normalizeActiveIndex(this.activeIndex);
      this.endActiveIndex = this.normalizeActiveIndex(this.endActiveIndex);
      this.renderedActiveIndex = -2;
      this.renderedEndActiveIndex = -2;
      this.renderedTitle = "";
      this.renderedPercent = -1;
      this.dotsDirty = true;
      this.interactionDirty = true;
    }
    updateHeadingRatios(ratios) {
      if (this.destroyed) return;
      let changed = false;
      this.headings.forEach((heading, index) => {
        const ratio = ratios[index];
        if (ratio === void 0) return;
        const normalized = clamp(finiteOr(ratio, heading.ratio), 0, 1);
        if (!approximatelyEqual(normalized, heading.ratio)) {
          heading.ratio = normalized;
          changed = true;
        }
      });
      if (changed) {
        this.dotsDirty = true;
      }
    }
    setGeometry(geometry) {
      if (this.destroyed) return;
      const nextGeometry = normalizeGeometry(geometry);
      if (geometryIsEqual(nextGeometry, this.geometry)) return;
      this.geometry = nextGeometry;
      this.refreshPositionTargets();
      this.clampSpringPositions();
      this.amplitude.target = this.targetAmplitude();
      this.geometryDirty = true;
      this.dotsDirty = true;
    }
    /** Updates only in-memory targets and is safe to call directly from scroll handlers. */
    setTargets(progress, activeIndex, endActiveIndex, scrollSpeed = null) {
      if (this.destroyed) return;
      const nextProgress = clamp(finiteOr(progress, this.progressTarget), 0, 1);
      if (!approximatelyEqual(nextProgress, this.progressTarget, 1e-5)) {
        this.progressTarget = nextProgress;
        this.refreshPositionTargets();
      }
      const nextActiveIndex = this.normalizeActiveIndex(activeIndex);
      const nextEndActiveIndex = this.normalizeActiveIndex(endActiveIndex);
      if (nextActiveIndex !== this.activeIndex || nextEndActiveIndex !== this.endActiveIndex) {
        this.activeIndex = nextActiveIndex;
        this.endActiveIndex = nextEndActiveIndex;
        this.interactionDirty = true;
      }
      this.speedTarget = !this.reducedMotion && scrollSpeed !== null ? clamp(Math.abs(finiteOr(scrollSpeed, 0)), 0, MAX_SCROLL_SPEED) : 0;
    }
    setReducedMotion(reduced) {
      if (this.destroyed || reduced === this.reducedMotion) return;
      this.reducedMotion = reduced;
      if (reduced) {
        this.snapToTargets();
      } else {
        this.lastTimestamp = null;
        this.frameInitialized = true;
      }
    }
    setInteractive(interactive) {
      if (this.destroyed || interactive === this.interactive) return;
      this.interactive = interactive;
      this.root.inert = !interactive;
      if (!interactive) {
        this.speedTarget = 0;
        this.amplitude.target = 0;
      }
      this.interactionDirty = true;
    }
    setHovered(hovered) {
      if (this.destroyed) return;
      this.hoverSpring.target = hovered ? 1 : 0;
    }
    /**
     * Advances springs and performs every continuous DOM write. The owner should
     * request another frame only when this method returns true.
     */
    advance(timestamp) {
      if (this.destroyed) return false;
      const safeTimestamp = finiteOr(timestamp, this.lastTimestamp ?? 0);
      let deltaTime = this.lastTimestamp === null ? 0 : clamp((safeTimestamp - this.lastTimestamp) / 1e3, 0, MAX_FRAME_STEP);
      this.lastTimestamp = safeTimestamp;
      if (!this.frameInitialized || this.snapRequested || this.reducedMotion) {
        this.applySnap();
        deltaTime = 0;
      } else if (deltaTime > 0) {
        this.stepAnimation(deltaTime);
      }
      const animating = !this.reducedMotion && (this.interactive || !this.animationIsSettled());
      if (!animating) {
        this.speedTarget = 0;
        this.smoothedSpeed = 0;
        this.amplitude.target = 0;
        snapSpring(this.markerY);
        snapSpring(this.amplitude);
      }
      this.writeDOM(safeTimestamp);
      return animating;
    }
    /** Snaps state in memory; the following advance() commits it to the DOM. */
    snapToTargets() {
      if (this.destroyed) return;
      this.speedTarget = 0;
      this.smoothedSpeed = 0;
      this.amplitude.target = 0;
      this.snapRequested = true;
      this.lastTimestamp = null;
    }
    resumeAfterVisibility() {
      if (this.destroyed) return;
      this.snapToTargets();
    }
    destroy() {
      if (this.destroyed) return;
      this.destroyed = true;
      this.dotsRoot.replaceChildren();
      this.dotButtons = [];
      this.headings = [];
      this.basePath.setAttribute("d", "M 0 0");
      this.accentPath.setAttribute("d", "M 0 0");
      this.baseTop.remove();
      this.baseBottom.remove();
      this.accentTop.remove();
      this.accentBottom.remove();
      this.label.style.left = "";
      this.label.style.top = "";
      this.label.style.transform = "";
      this.currentLink.setAttribute("href", "#");
      this.currentLink.removeAttribute("aria-current");
      this.currentLink.tabIndex = -1;
      this.titleSlots.forEach((slot) => {
        slot.textContent = "";
        slot.classList.remove("is-active", "is-leaving");
        slot.setAttribute("aria-hidden", "true");
      });
      this.percent.textContent = "0%";
      this.root.inert = true;
      this.root.dataset.interactive = "false";
      this.root.style.removeProperty("--reading-toc-rail-direction");
      this.lastTimestamp = null;
      this.speedTarget = 0;
      this.smoothedSpeed = 0;
    }
    refreshPositionTargets() {
      const markerTarget = this.mapRatioToY(this.progressTarget);
      this.markerY.target = markerTarget;
    }
    mapRatioToY(ratio) {
      return this.geometry.height * clamp(ratio, 0, 1);
    }
    normalizeActiveIndex(index) {
      if (this.headings.length === 0 || !Number.isFinite(index)) return -1;
      return Math.round(clamp(index, 0, this.headings.length - 1));
    }
    targetAmplitude() {
      if (this.reducedMotion || !this.interactive) return 0;
      return Math.min(
        this.geometry.maxExtraAmplitude,
        SPEED_TO_AMPLITUDE * Math.abs(this.smoothedSpeed)
      );
    }
    clampSpringPositions() {
      this.markerY.target = clamp(this.markerY.target, 0, this.geometry.height);
      const clampedCurrent = clamp(this.markerY.current, 0, this.geometry.height);
      if (!approximatelyEqual(clampedCurrent, this.markerY.current)) {
        this.markerY.current = clampedCurrent;
        this.markerY.velocity = 0;
      }
    }
    applySnap() {
      this.refreshPositionTargets();
      this.speedTarget = 0;
      this.smoothedSpeed = 0;
      this.amplitude.target = 0;
      snapSpring(this.markerY);
      snapSpring(this.amplitude);
      this.frameInitialized = true;
      this.snapRequested = false;
    }
    stepAnimation(deltaTime) {
      const progressResponse = Math.min(
        1,
        1.4 * (1 - Math.exp(-deltaTime / PROGRESS_RESPONSE_SECONDS))
      );
      this.markerY.current += (this.markerY.target - this.markerY.current) * progressResponse;
      if (Math.abs(this.markerY.target - this.markerY.current) <= POSITION_EPSILON) {
        this.markerY.current = this.markerY.target;
      }
      const speedResponse = Math.min(1, deltaTime / SPEED_RESPONSE_SECONDS);
      this.smoothedSpeed += (this.speedTarget - this.smoothedSpeed) * speedResponse;
      this.speedTarget = 0;
      if (Math.abs(this.smoothedSpeed) <= SPEED_EPSILON && this.speedTarget === 0) {
        this.smoothedSpeed = 0;
      }
      this.amplitude.target = this.targetAmplitude();
      const substeps = Math.max(1, Math.ceil(deltaTime / MAX_SUBSTEP));
      const step = deltaTime / substeps;
      for (let index = 0; index < substeps; index += 1) {
        stepSpring(this.amplitude, AMPLITUDE_STIFFNESS, AMPLITUDE_DAMPING, step);
        if (this.amplitude.current < MIN_AMPLITUDE_REBOUND) {
          this.amplitude.current = MIN_AMPLITUDE_REBOUND;
          if (this.amplitude.velocity < 0) {
            this.amplitude.velocity = 0;
          }
        }
        if (!Number.isFinite(this.amplitude.current)) {
          this.amplitude.current = this.amplitude.target;
          this.amplitude.velocity = 0;
        }
        stepSpring(this.hoverSpring, 300, 25, step);
      }
      this.clampSpringPositions();
    }
    animationIsSettled() {
      return springIsSettled(this.markerY, POSITION_EPSILON) && springIsSettled(this.amplitude, AMPLITUDE_EPSILON) && springIsSettled(this.hoverSpring, AMPLITUDE_EPSILON) && Math.abs(this.speedTarget) <= SPEED_EPSILON && Math.abs(this.smoothedSpeed) <= SPEED_EPSILON;
    }
    baselineX() {
      return this.geometry.lineInset;
    }
    writeDOM(timestamp) {
      if (this.geometryDirty) {
        this.svg.setAttribute(
          "viewBox",
          `0 0 ${formatNumber(this.geometry.width)} ${formatNumber(this.geometry.height)}`
        );
        this.root.style.setProperty("--reading-toc-rail-direction", String(this.geometry.direction));
        this.geometryDirty = false;
      }
      if (this.dotsDirty) {
        const dotX = this.baselineX();
        this.dotButtons.forEach((button, index) => {
          const heading = this.headings[index];
          if (!heading) return;
          button.style.left = `${formatNumber(dotX)}px`;
          button.style.top = `${formatNumber(this.mapRatioToY(heading.ratio))}px`;
        });
        this.dotsDirty = false;
      }
      const markerY = clamp(
        finiteOr(this.markerY.current, this.markerY.target),
        0,
        this.geometry.height
      );
      const hoverState = Math.max(0, Math.min(1, this.hoverSpring.current));
      const boost = this.amplitude.current;
      const breath = !this.reducedMotion ? BREATH_AMPLITUDE * Math.sin(timestamp / BREATH_PERIOD_MS * Math.PI * 2) : 0;
      const waveAmplitude = Math.max(0, this.geometry.idleAmplitude + breath + boost);
      const halfHeight = Math.max(
        1,
        this.geometry.bulgeHalfHeight + HALF_HEIGHT_SPEED_GAIN * boost
      );
      this.root.style.setProperty("--hover-opacity", `${1 - Math.pow(hoverState, 2)}`);
      this.root.style.pointerEvents = hoverState > 0.5 ? "none" : "auto";
      const path = buildReadingTocRailCurve(
        this.geometry,
        markerY,
        waveAmplitude,
        halfHeight
      );
      this.basePath.setAttribute("d", path.basePath);
      this.accentPath.setAttribute("d", path.basePath);
      this.baseTop.setAttribute("d", path.basePath);
      this.baseTop.setAttribute("transform", "scale(1, -1)");
      this.accentTop.setAttribute("d", path.basePath);
      this.accentTop.setAttribute("transform", "scale(1, -1)");
      const bottomTransform = `scale(1, -1) translate(0, -${formatNumber(2 * this.geometry.height)})`;
      this.baseBottom.setAttribute("d", path.basePath);
      this.baseBottom.setAttribute("transform", bottomTransform);
      this.accentBottom.setAttribute("d", path.basePath);
      this.accentBottom.setAttribute("transform", bottomTransform);
      const pathStartY = Math.min(0, path.topY);
      const pathEndY = Math.max(this.geometry.height, path.bottomY);
      const totalLength = pathEndY - pathStartY;
      const distanceToDot = markerY - pathStartY;
      const offset = formatNumber(0.06 - distanceToDot / totalLength);
      this.accentPath.setAttribute("stroke-dashoffset", offset);
      this.accentTop.setAttribute("stroke-dashoffset", offset);
      this.accentBottom.setAttribute("stroke-dashoffset", offset);
      this.dotButtons.forEach((button, index) => {
        const heading = this.headings[index];
        if (!heading) return;
        const dotY = this.mapRatioToY(heading.ratio);
        const offsetX = readingTocRailDotOffset(
          dotY,
          markerY,
          path.effectiveHalfHeight,
          path.effectiveAmplitude,
          this.geometry.direction
        );
        button.style.transform = `translate3d(calc(-50% + ${formatNumber(offsetX)}px), -50%, 0)`;
      });
      const labelX = path.peakX - this.geometry.labelGap;
      this.label.style.left = "0";
      this.label.style.top = `clamp(var(--reading-toc-rail-label-edge-inset), ${formatNumber(markerY)}px, calc(100% - var(--reading-toc-rail-label-edge-inset)))`;
      this.label.style.transform = [
        `translate3d(${formatNumber(labelX)}px, 0, 0)`,
        "translate(-100%, -50%)"
      ].join(" ");
      this.writeLabelContent();
      this.writeInteractionState();
    }
    writeLabelContent() {
      const percentage = Math.round(clamp(this.progressTarget, 0, 1) * 100);
      const heading = this.headings[this.activeIndex];
      if (percentage !== this.renderedPercent) {
        this.percent.textContent = `${percentage}%`;
        if (heading) {
          this.currentLink.setAttribute("aria-label", `${heading.ariaLabel}, ${percentage}%`);
        }
        this.renderedPercent = percentage;
      }
      if (!heading) {
        if (this.renderedActiveIndex !== -1) {
          this.titleSlots.forEach((slot) => {
            slot.classList.remove("is-active", "is-leaving");
            slot.setAttribute("aria-hidden", "true");
          });
          this.currentLink.setAttribute("href", "#");
          this.currentLink.removeAttribute("aria-current");
          this.renderedActiveIndex = -1;
          this.renderedTitle = "";
        }
        return;
      }
      if (this.activeIndex === this.renderedActiveIndex) return;
      this.currentLink.setAttribute("href", `#${encodeURIComponent(heading.id)}`);
      this.currentLink.setAttribute("aria-label", `${heading.ariaLabel}, ${percentage}%`);
      this.currentLink.setAttribute("aria-current", "location");
      if (heading.text !== this.renderedTitle) {
        if (this.renderedTitle === "") {
          const initialSlot = this.titleSlots[this.visibleTitleSlot];
          initialSlot.textContent = heading.text;
          initialSlot.classList.remove("is-leaving");
          initialSlot.classList.add("is-active");
          initialSlot.removeAttribute("aria-hidden");
        } else {
          const previousSlot = this.titleSlots[this.visibleTitleSlot];
          const nextSlotIndex = this.visibleTitleSlot === 0 ? 1 : 0;
          const nextSlot = this.titleSlots[nextSlotIndex];
          nextSlot.textContent = heading.text;
          nextSlot.classList.remove("is-leaving");
          nextSlot.classList.add("is-active");
          nextSlot.removeAttribute("aria-hidden");
          previousSlot.classList.remove("is-active");
          previousSlot.classList.add("is-leaving");
          previousSlot.setAttribute("aria-hidden", "true");
          this.visibleTitleSlot = nextSlotIndex;
        }
        this.renderedTitle = heading.text;
      }
      this.renderedActiveIndex = this.activeIndex;
      this.renderedEndActiveIndex = this.endActiveIndex;
    }
    writeInteractionState() {
      if (!this.interactionDirty && this.renderedActiveIndex === this.activeIndex && this.renderedEndActiveIndex === this.endActiveIndex) return;
      this.dotButtons.forEach((button, index) => {
        const active = index >= this.activeIndex && index <= this.endActiveIndex;
        button.classList.toggle("is-active", active);
      });
      this.currentLink.tabIndex = this.interactive && this.activeIndex >= 0 ? 0 : -1;
      this.root.dataset.interactive = this.interactive ? "true" : "false";
      this.interactionDirty = false;
    }
  };

  // assets/ts/toc.ts
  var RAIL_MEDIA_QUERY = "(min-width: 116rem)";
  var MOTION_MEDIA_QUERY = "(prefers-reduced-motion: reduce)";
  var DEFAULT_ACTIVATION_LINE = 96;
  var DEFAULT_BOTTOM_INSET = 96;
  var MIN_HEADING_COUNT = 2;
  var MIN_READING_TRAVEL = 240;
  var MIN_RAIL_HEIGHT = 320;
  var MIN_RAIL_WIDTH = 160;
  var MODE_HYSTERESIS = 8;
  var MAX_SCROLL_SPEED2 = 5e3;
  var GEOMETRY_EPSILON = 1;
  function clamp2(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }
  function finiteOr2(value, fallback) {
    return Number.isFinite(value) ? value : fallback;
  }
  function cssNumber(style, name, fallback) {
    const value = Number.parseFloat(style.getPropertyValue(name));
    return finiteOr2(value, fallback);
  }
  function layoutDocumentTop(element) {
    let top = 0;
    let current = element;
    while (current) {
      top += current.offsetTop;
      current = current.offsetParent;
    }
    return top;
  }
  function upperBoundHeading(headings, documentY) {
    let low = 0;
    let high = headings.length;
    while (low < high) {
      const middle = low + Math.floor((high - low) / 2);
      const heading = headings[middle];
      if (heading && heading.documentY <= documentY) {
        low = middle + 1;
      } else {
        high = middle;
      }
    }
    return Math.max(0, low - 1);
  }
  function syncNoteToc(toc) {
    const button = toc.querySelector(".note-toc-toggle");
    const icon = button?.querySelector(".material-symbol");
    const isOpen = toc.classList.contains("is-open");
    button?.setAttribute("aria-expanded", isOpen ? "true" : "false");
    if (icon) {
      icon.textContent = isOpen ? "menu_open" : "menu";
    }
  }
  function ensureTocIndicator(tocPanel) {
    let indicator = tocPanel.querySelector(".note-toc-indicator");
    if (!indicator) {
      indicator = document.createElement("div");
      indicator.className = "note-toc-indicator";
    }
    indicator.setAttribute("aria-hidden", "true");
    if (indicator.parentElement !== tocPanel) {
      tocPanel.insertBefore(indicator, tocPanel.firstChild);
    }
    indicator.style.height = "1px";
    return indicator;
  }
  function headingIdFromLink(link) {
    const href = link.getAttribute("href") || "";
    if (!href.startsWith("#")) return "";
    try {
      return decodeURIComponent(href.slice(1));
    } catch {
      return href.slice(1);
    }
  }
  var NoteTocController = class {
    constructor(stage, toc, tocPanel, tocList, railRoot, note, noteHeader, postContent, tocWrapper, headings) {
      this.abortController = new AbortController();
      this.railMediaQuery = window.matchMedia(RAIL_MEDIA_QUERY);
      this.motionMediaQuery = window.matchMedia(MOTION_MEDIA_QUERY);
      this.rail = null;
      this.resizeObserver = null;
      this.frameId = 0;
      this.needsMeasure = true;
      this.destroyed = false;
      this.generation = 0;
      this.metrics = null;
      this.activeIndex = -1;
      this.endActiveIndex = -1;
      this.isReadingMode = false;
      this.reducedMotion = false;
      this.latestScrollY = window.scrollY;
      this.lastScrollY = window.scrollY;
      this.lastScrollTime = performance.now();
      this.pendingScrollSpeed = null;
      this.snapOnNextFrame = true;
      this.railHeadingsReady = false;
      this.readingStateDirty = true;
      this.isStageHovered = false;
      this.indicatorDirty = true;
      this.indicatorTop = Number.NaN;
      this.indicatorHeight = Number.NaN;
      this.handleScroll = () => {
        if (this.destroyed || document.hidden) return;
        if (this.metrics && !this.metrics.tocVisible && !this.metrics.railEligible) return;
        const now = performance.now();
        const scrollY = window.scrollY;
        const elapsed = now - this.lastScrollTime;
        let speed = 0;
        if (elapsed > 0 && elapsed < 180) {
          speed = Math.abs(scrollY - this.lastScrollY) / elapsed * 1e3;
        }
        this.pendingScrollSpeed = Math.max(
          this.pendingScrollSpeed || 0,
          clamp2(finiteOr2(speed, 0), 0, MAX_SCROLL_SPEED2)
        );
        this.latestScrollY = scrollY;
        this.lastScrollY = scrollY;
        this.lastScrollTime = now;
        this.readingStateDirty = true;
        this.ensureFrame();
      };
      this.handleResize = () => {
        this.latestScrollY = window.scrollY;
        this.lastScrollY = window.scrollY;
        this.lastScrollTime = performance.now();
        this.pendingScrollSpeed = 0;
        this.requestMeasure(true);
      };
      this.handleTocListScroll = () => {
        this.indicatorDirty = true;
        this.readingStateDirty = true;
        this.ensureFrame();
      };
      this.handleStageMouseEnter = () => {
        this.setStageHovered(true);
      };
      this.handleStageMouseLeave = () => {
        this.setStageHovered(false);
      };
      this.handleContentLoad = () => {
        this.requestMeasure();
      };
      this.handleFontLoad = () => {
        this.requestMeasure(true);
      };
      this.handleRailMediaChange = () => {
        this.requestMeasure(true);
      };
      this.handleMotionChange = () => {
        const reducedMotion = this.motionDisabled();
        if (reducedMotion === this.reducedMotion) return;
        this.reducedMotion = reducedMotion;
        this.rail?.setReducedMotion(reducedMotion);
        this.snapOnNextFrame = reducedMotion;
        this.ensureFrame();
      };
      this.handleVisibilityChange = () => {
        if (document.hidden) {
          if (this.frameId) {
            window.cancelAnimationFrame(this.frameId);
            this.frameId = 0;
          }
          this.pendingScrollSpeed = null;
          return;
        }
        this.latestScrollY = window.scrollY;
        this.lastScrollY = window.scrollY;
        this.lastScrollTime = performance.now();
        this.pendingScrollSpeed = 0;
        this.readingStateDirty = true;
        this.snapOnNextFrame = true;
        this.requestMeasure(true);
      };
      this.handleStageClick = (event) => {
        const target = event.target;
        const currentLink = target.closest("[data-reading-toc-rail-link]");
        if (currentLink) {
          event.preventDefault();
          this.jumpToHeading(this.activeIndex);
        }
      };
      this.runFrame = (timestamp) => {
        this.frameId = 0;
        if (this.destroyed || document.hidden) return;
        const measuredThisFrame = this.needsMeasure;
        if (measuredThisFrame) {
          this.measure();
        }
        const metrics = this.metrics;
        if (!metrics || this.headings.length === 0) return;
        let railAnimating = false;
        if (measuredThisFrame || this.readingStateDirty) {
          this.readingStateDirty = false;
          const activationY = this.latestScrollY + metrics.activationLine;
          const activeIndex = upperBoundHeading(this.headings, activationY);
          const shouldRead = this.readingModeFor(activationY, metrics);
          const tocScrollTop = metrics.tocVisible ? measuredThisFrame ? metrics.tocListScrollTop : this.tocList.scrollTop : 0;
          const viewportTop = this.latestScrollY;
          const viewportBottom = viewportTop + window.innerHeight;
          let firstVis = -1;
          let lastVis = -1;
          for (let i = 0; i < this.headings.length; i++) {
            const h = this.headings[i];
            if (!h) continue;
            if (h.documentY >= viewportTop && h.documentY <= viewportBottom) {
              if (firstVis === -1) firstVis = i;
              lastVis = i;
            }
          }
          const endActiveIndex = firstVis !== -1 ? Math.max(activeIndex, lastVis) : activeIndex;
          if (metrics.railEligible && this.rail) {
            const progress = clamp2(
              (activationY - metrics.contentTop) / metrics.readingTravel,
              0,
              1
            );
            const speed = this.pendingScrollSpeed;
            this.pendingScrollSpeed = null;
            this.rail.setTargets(progress, activeIndex, endActiveIndex, speed);
            if (this.snapOnNextFrame) {
              this.rail.snapToTargets();
              this.snapOnNextFrame = false;
            }
          } else {
            this.pendingScrollSpeed = null;
            this.snapOnNextFrame = false;
          }
          this.updateActiveHeading(
            activeIndex,
            endActiveIndex,
            metrics.tocListTop,
            tocScrollTop,
            metrics.tocVisible
          );
          this.setReadingMode(shouldRead);
        }
        if (metrics.railEligible && this.rail) {
          railAnimating = this.rail.advance(timestamp);
        }
        if (railAnimating || this.needsMeasure || this.readingStateDirty) {
          this.ensureFrame();
        }
      };
      this.stage = stage;
      this.toc = toc;
      this.tocPanel = tocPanel;
      this.tocList = tocList;
      this.tocIndicator = ensureTocIndicator(tocPanel);
      this.railRoot = railRoot;
      this.note = note;
      this.noteHeader = noteHeader;
      this.postContent = postContent;
      this.tocWrapper = tocWrapper;
      this.headings = headings;
    }
    init() {
      syncNoteToc(this.toc);
      this.reducedMotion = this.motionDisabled();
      this.bindPageListeners();
      this.setupHoverEvents();
      this.observeLayout();
      this.waitForFonts();
      this.requestMeasure(true);
    }
    setupHoverEvents() {
    }
    requestMeasure(snap = false) {
      if (this.destroyed) return;
      this.needsMeasure = true;
      this.readingStateDirty = true;
      this.snapOnNextFrame || (this.snapOnNextFrame = snap);
      this.ensureFrame();
    }
    destroy() {
      if (this.destroyed) return;
      this.destroyed = true;
      this.generation += 1;
      this.abortController.abort();
      this.resizeObserver?.disconnect();
      this.resizeObserver = null;
      this.railMediaQuery.removeEventListener("change", this.handleRailMediaChange);
      this.motionMediaQuery.removeEventListener("change", this.handleMotionChange);
      if (this.frameId) {
        window.cancelAnimationFrame(this.frameId);
        this.frameId = 0;
      }
      this.disableRail(true);
      this.rail?.destroy();
      this.rail = null;
      this.headings = [];
      this.metrics = null;
    }
    bindPageListeners() {
      const signal = this.abortController.signal;
      window.addEventListener("scroll", this.handleScroll, { passive: true, signal });
      window.addEventListener("resize", this.handleResize, { passive: true, signal });
      this.tocList.addEventListener("scroll", this.handleTocListScroll, { passive: true, signal });
      this.stage.addEventListener("click", this.handleStageClick, { signal });
      this.stage.addEventListener("mouseenter", this.handleStageMouseEnter, { signal });
      this.stage.addEventListener("mouseleave", this.handleStageMouseLeave, { signal });
      this.postContent.addEventListener("load", this.handleContentLoad, { capture: true, signal });
      document.addEventListener("visibilitychange", this.handleVisibilityChange, { signal });
      document.addEventListener("daybook:settings-change", this.handleMotionChange, { signal });
      document.fonts?.addEventListener("loadingdone", this.handleFontLoad, { signal });
      this.railMediaQuery.addEventListener("change", this.handleRailMediaChange);
      this.motionMediaQuery.addEventListener("change", this.handleMotionChange);
    }
    observeLayout() {
      if (!("ResizeObserver" in window)) return;
      this.resizeObserver = new ResizeObserver(() => {
        this.requestMeasure();
      });
      this.resizeObserver.observe(this.noteHeader);
      this.resizeObserver.observe(this.postContent);
    }
    waitForFonts() {
      if (!document.fonts) return;
      const generation = this.generation;
      document.fonts.ready.then(() => {
        if (!this.destroyed && generation === this.generation) {
          this.requestMeasure(true);
        }
      }).catch(() => {
      });
    }
    setStageHovered(hovered) {
      if (this.isStageHovered === hovered) return;
      this.isStageHovered = hovered;
      this.stage.classList.toggle("is-hovered", hovered);
      this.rail?.setHovered(hovered);
      this.syncReadingPresentation();
      this.ensureFrame();
    }
    jumpToHeading(index) {
      const heading = this.headings[index];
      const metrics = this.metrics;
      if (!heading || !metrics) return;
      const top = Math.max(0, heading.documentY - metrics.activationLine);
      window.scrollTo({
        top,
        behavior: this.reducedMotion ? "instant" : "smooth"
      });
      const url = new URL(window.location.href);
      url.hash = heading.id;
      const state = history.state;
      const nextState = state && typeof state === "object" ? { ...state, url: url.href } : state;
      history.replaceState(nextState, "", `${url.pathname}${url.search}${url.hash}`);
    }
    motionDisabled() {
      return document.documentElement.getAttribute("data-reduced-motion") === "true" || this.motionMediaQuery.matches;
    }
    ensureFrame() {
      if (this.destroyed || this.frameId) return;
      this.frameId = window.requestAnimationFrame(this.runFrame);
    }
    measure() {
      this.needsMeasure = false;
      const railStyle = window.getComputedStyle(this.railRoot);
      const stageStyle = window.getComputedStyle(this.stage);
      const wrapperStyle = window.getComputedStyle(this.tocWrapper);
      const railRect = this.railRoot.getBoundingClientRect();
      const wrapperRect = this.tocWrapper.getBoundingClientRect();
      const noteRect = this.note.getBoundingClientRect();
      const sideRailRect = document.querySelector(".side-rail")?.getBoundingClientRect() || null;
      const contentTop = layoutDocumentTop(this.postContent);
      const contentHeight = this.postContent.offsetHeight;
      const headerBottom = layoutDocumentTop(this.noteHeader) + this.noteHeader.offsetHeight;
      const activationLine = cssNumber(stageStyle, "--reading-toc-activation-line", DEFAULT_ACTIVATION_LINE);
      const bottomInset = cssNumber(stageStyle, "--reading-toc-bottom-inset", DEFAULT_BOTTOM_INSET);
      const readableViewport = window.innerHeight - activationLine - bottomInset;
      const readingTravel = contentHeight - readableViewport;
      const direction = cssNumber(stageStyle, "--reading-toc-rail-direction", 1) < 0 ? -1 : 1;
      const cssEligible = cssNumber(stageStyle, "--reading-toc-rail-eligible", 0) === 1;
      const sideRailRight = sideRailRect?.right || 0;
      const hasHorizontalRoom = wrapperRect.left + GEOMETRY_EPSILON >= sideRailRight && wrapperRect.right <= noteRect.left + GEOMETRY_EPSILON;
      const hasVerticalRoom = readableViewport > 0 && railRect.height >= MIN_RAIL_HEIGHT;
      const railEligible = this.railMediaQuery.matches && cssEligible && wrapperStyle.position === "absolute" && railRect.width >= MIN_RAIL_WIDTH && hasHorizontalRoom && hasVerticalRoom && this.headings.length >= MIN_HEADING_COUNT && readingTravel >= MIN_READING_TRAVEL;
      const tocVisible = wrapperStyle.display !== "none" && wrapperRect.width > 0 && wrapperRect.height > 0;
      this.headings.forEach((heading) => {
        heading.documentY = layoutDocumentTop(heading.element);
        heading.railRatio = contentHeight > 0 ? clamp2((heading.documentY - contentTop) / contentHeight, 0, 1) : 0;
        heading.tocTop = heading.item.offsetTop;
        heading.tocHeight = Math.max(1, heading.item.offsetHeight);
      });
      const railGeometry = railEligible ? {
        width: railRect.width,
        height: railRect.height,
        direction,
        lineInset: cssNumber(railStyle, "--reading-toc-rail-line-inset", 6),
        idleAmplitude: cssNumber(railStyle, "--reading-toc-rail-idle-amplitude", 10.4),
        maxExtraAmplitude: cssNumber(railStyle, "--reading-toc-rail-max-extra-amplitude", 14),
        bulgeHalfHeight: cssNumber(railStyle, "--reading-toc-rail-bulge-half-height", 56),
        labelGap: cssNumber(railStyle, "--reading-toc-rail-label-gap", 12)
      } : null;
      this.metrics = {
        activationLine,
        contentHeight,
        contentTop,
        headerBottom,
        railEligible,
        railGeometry,
        readingTravel,
        tocListScrollTop: this.tocList.scrollTop,
        tocListTop: this.tocList.offsetTop,
        tocVisible
      };
      this.indicatorDirty = true;
      if (railEligible && railGeometry) {
        this.enableRail(railGeometry);
      } else {
        this.disableRail(true);
      }
    }
    enableRail(geometry) {
      if (!this.rail) {
        this.rail = new ReadingTocRail(this.railRoot);
        this.rail.setReducedMotion(this.reducedMotion);
        this.railHeadingsReady = false;
      }
      this.stage.dataset.railDirection = String(geometry.direction);
      this.stage.classList.add("has-reading-rail");
      this.rail.setGeometry(geometry);
      const language = (this.postContent.lang || document.documentElement.lang).toLowerCase();
      const english = language.startsWith("en");
      if (!this.railHeadingsReady) {
        const railHeadings = this.headings.map((heading) => ({
          id: heading.id,
          text: heading.text,
          level: heading.level,
          ratio: heading.railRatio,
          ariaLabel: english ? `Jump to section: ${heading.text}` : `\u8DF3\u8F6C\u5230\u7AE0\u8282\uFF1A${heading.text}`
        }));
        this.rail.setHeadings(railHeadings);
        this.railHeadingsReady = true;
      } else {
        this.rail.updateHeadingRatios(this.headings.map((heading) => heading.railRatio));
      }
      this.railRoot.setAttribute("aria-label", english ? "Reading outline" : "\u9605\u8BFB\u76EE\u5F55");
      this.syncReadingPresentation();
    }
    disableRail(clear) {
      this.stage.classList.remove("has-reading-rail", "is-reading");
      this.stage.removeAttribute("data-rail-direction");
      this.isReadingMode = false;
      this.toc.removeAttribute("aria-hidden");
      this.toc.inert = false;
      this.railRoot.setAttribute("aria-hidden", "true");
      this.rail?.setInteractive(false);
      if (clear && this.rail) {
        this.rail.destroy();
        this.rail = null;
        this.railHeadingsReady = false;
      }
    }
    readingModeFor(activationY, metrics) {
      if (!metrics.railEligible) return false;
      if (this.isReadingMode) {
        return activationY >= metrics.headerBottom - MODE_HYSTERESIS;
      }
      return activationY >= metrics.headerBottom + MODE_HYSTERESIS;
    }
    setReadingMode(reading) {
      if (reading !== this.isReadingMode) {
        this.isReadingMode = reading;
        this.stage.classList.toggle("is-reading", reading);
        this.setStageHovered(this.stage.matches(":hover"));
      }
      this.syncReadingPresentation();
    }
    syncReadingPresentation() {
      const showRail = this.isReadingMode && !this.isStageHovered;
      if (showRail) {
        this.toc.setAttribute("aria-hidden", "true");
        this.toc.inert = true;
      } else {
        this.toc.removeAttribute("aria-hidden");
        this.toc.inert = false;
      }
      this.railRoot.setAttribute("aria-hidden", showRail ? "false" : "true");
      this.rail?.setInteractive(showRail);
    }
    updateActiveHeading(index, endIndex, tocListTop, tocScrollTop, showIndicator) {
      const heading = this.headings[index];
      if (!heading) return;
      let activeChanged = false;
      if (index !== this.activeIndex || endIndex !== this.endActiveIndex) {
        this.headings.forEach((entry, entryIndex) => {
          const active = entryIndex === index;
          entry.link.classList.toggle("is-active", active);
          if (active) {
            entry.link.setAttribute("aria-current", "location");
          } else {
            entry.link.removeAttribute("aria-current");
          }
        });
        this.activeIndex = index;
        this.endActiveIndex = endIndex;
        activeChanged = true;
      }
      if (!showIndicator) {
        this.indicatorDirty = true;
        return;
      }
      const startIdx = index;
      const endIdx = endIndex;
      const startHeading = this.headings[startIdx];
      const endHeading = this.headings[endIdx];
      if (!startHeading || !endHeading) return;
      const indicatorTop = tocListTop + startHeading.tocTop - tocScrollTop;
      const indicatorHeight = Math.max(1, endHeading.tocTop + endHeading.tocHeight - startHeading.tocTop);
      if (!activeChanged && !this.indicatorDirty && indicatorTop === this.indicatorTop && indicatorHeight === this.indicatorHeight) {
        return;
      }
      this.indicatorDirty = false;
      this.indicatorTop = indicatorTop;
      this.indicatorHeight = indicatorHeight;
      this.tocIndicator.style.setProperty("--indicator-opacity", "1");
      this.tocIndicator.style.setProperty("--indicator-y", `${indicatorTop}px`);
      this.tocIndicator.style.setProperty("--indicator-scale", `${indicatorHeight}`);
    }
  };
  var activeController = null;
  function collectHeadingEntries(postContent, tocPanel) {
    const links = Array.from(tocPanel.querySelectorAll('a[href^="#"]'));
    const linksById = /* @__PURE__ */ new Map();
    links.forEach((link) => {
      const id = headingIdFromLink(link);
      if (id) linksById.set(id, link);
    });
    return Array.from(postContent.querySelectorAll("h1, h2, h3, h4, h5, h6")).map((element) => {
      const link = linksById.get(element.id);
      const item = link?.closest("li");
      if (!element.id || !link || !item) return null;
      return {
        id: element.id,
        text: (link.textContent || "").trim(),
        level: Number.parseInt(element.tagName.slice(1), 10) || 2,
        element,
        link,
        item,
        documentY: 0,
        railRatio: 0,
        tocTop: 0,
        tocHeight: 1
      };
    }).filter((entry) => entry !== null);
  }
  function initNoteTocController() {
    activeController?.destroy();
    activeController = null;
    document.querySelectorAll(".note-toc").forEach(syncNoteToc);
    const stage = document.querySelector("[data-note-toc-stage]");
    const toc = stage?.querySelector("[data-note-toc]");
    const tocPanel = toc?.querySelector(".note-toc-panel");
    const tocList = tocPanel?.querySelector("ol");
    const railRoot = stage?.querySelector("[data-reading-toc-rail]");
    const note = document.querySelector(".note");
    const noteHeader = note?.querySelector(".note-header");
    const postContent = note?.querySelector(".post-content");
    const tocWrapper = stage?.closest(".note-toc-wrapper");
    if (!stage || !toc || !tocPanel || !tocList || !railRoot || !note || !noteHeader || !postContent || !tocWrapper) {
      return;
    }
    const headings = collectHeadingEntries(postContent, tocPanel);
    if (headings.length === 0) return;
    activeController = new NoteTocController(
      stage,
      toc,
      tocPanel,
      tocList,
      railRoot,
      note,
      noteHeader,
      postContent,
      tocWrapper,
      headings
    );
    activeController.init();
  }
  window.daybookSyncNoteTocs = initNoteTocController;
  document.addEventListener("daybook:before-swap", () => {
    activeController?.destroy();
    activeController = null;
  });
  document.addEventListener("daybook:reader-mode-change", () => {
    activeController?.requestMeasure(true);
  });
  document.addEventListener("daybook:page-load", initNoteTocController);
  document.addEventListener("daybook:article-content-swapped", initNoteTocController);
  document.addEventListener("daybook:transition-finished", () => {
    activeController?.requestMeasure(true);
  });
  document.addEventListener("click", (event) => {
    const target = event.target;
    const tocToggle = target.closest(".note-toc-toggle");
    if (!tocToggle) return;
    const toc = tocToggle.closest(".note-toc");
    if (!toc) return;
    toc.classList.toggle("is-open");
    syncNoteToc(toc);
    activeController?.requestMeasure();
  });
  initNoteTocController();
})();
