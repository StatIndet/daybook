export type ReadingTocRailDirection = -1 | 1;

export interface ReadingTocRailHeading {
  readonly id: string;
  readonly text: string;
  readonly level: number;
  readonly ratio: number;
  readonly ariaLabel: string;
}

export interface ReadingTocRailGeometry {
  readonly width: number;
  readonly height: number;
  readonly direction: ReadingTocRailDirection;
  readonly lineInset: number;
  readonly idleAmplitude: number;
  readonly maxExtraAmplitude: number;
  readonly bulgeHalfHeight: number;
  readonly labelGap: number;
}

interface MutableRailHeading {
  id: string;
  text: string;
  level: number;
  ratio: number;
  ariaLabel: string;
}

interface SpringValue {
  current: number;
  target: number;
  velocity: number;
}

export interface ReadingTocRailCurve {
  basePath: string;
  peakX: number;
  effectiveAmplitude: number;
  effectiveHalfHeight: number;
  topY: number;
  bottomY: number;
}

const DEFAULT_GEOMETRY: ReadingTocRailGeometry = {
  width: 208,
  height: 640,
  direction: 1,
  lineInset: 12,
  idleAmplitude: 10.4,
  maxExtraAmplitude: 14,
  bulgeHalfHeight: 56,
  labelGap: 12,
};

const AMPLITUDE_STIFFNESS = 90;
const AMPLITUDE_DAMPING = 2 * Math.sqrt(AMPLITUDE_STIFFNESS) * 0.75;

const MAX_FRAME_STEP = 0.064;
const MAX_SUBSTEP = 0.016;
const POSITION_EPSILON = 0.035;
const VELOCITY_EPSILON = 0.05;
const AMPLITUDE_EPSILON = 0.025;
const SPEED_EPSILON = 0.5;
const PROGRESS_RESPONSE_SECONDS = 0.14;
const SPEED_RESPONSE_SECONDS = 0.08;
const SPEED_TO_AMPLITUDE = 0.012;
const HALF_HEIGHT_SPEED_GAIN = 2.2;
const BREATH_AMPLITUDE = 0.6;
const BREATH_PERIOD_MS = 9000;
const MIN_AMPLITUDE_REBOUND = -4;
const MAX_SCROLL_SPEED = 5000;
const MIN_DIMENSION = 1;

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function finiteOr(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

function approximatelyEqual(a: number, b: number, epsilon = 0.001): boolean {
  return Math.abs(a - b) <= epsilon;
}

function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return "0";
  return String(Math.round(value * 1000) / 1000);
}

function requiredElement<T extends Element>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (!element) {
    throw new Error(`[Daybook] Reading TOC rail is missing ${selector}`);
  }
  return element;
}

function makeSpring(initial: number): SpringValue {
  return {
    current: initial,
    target: initial,
    velocity: 0,
  };
}

function snapSpring(spring: SpringValue): void {
  spring.current = spring.target;
  spring.velocity = 0;
}

function stepSpring(
  spring: SpringValue,
  stiffness: number,
  damping: number,
  deltaTime: number,
): void {
  const acceleration = stiffness * (spring.target - spring.current) - damping * spring.velocity;
  spring.velocity += acceleration * deltaTime;
  spring.current += spring.velocity * deltaTime;

  if (!Number.isFinite(spring.current) || !Number.isFinite(spring.velocity)) {
    snapSpring(spring);
  }
}

function springIsSettled(
  spring: SpringValue,
  positionEpsilon: number,
  velocityEpsilon = VELOCITY_EPSILON,
): boolean {
  return Math.abs(spring.target - spring.current) <= positionEpsilon
    && Math.abs(spring.velocity) <= velocityEpsilon;
}

function geometryIsEqual(a: ReadingTocRailGeometry, b: ReadingTocRailGeometry): boolean {
  return a.direction === b.direction
    && approximatelyEqual(a.width, b.width)
    && approximatelyEqual(a.height, b.height)
    && approximatelyEqual(a.lineInset, b.lineInset)
    && approximatelyEqual(a.idleAmplitude, b.idleAmplitude)
    && approximatelyEqual(a.maxExtraAmplitude, b.maxExtraAmplitude)
    && approximatelyEqual(a.bulgeHalfHeight, b.bulgeHalfHeight)
    && approximatelyEqual(a.labelGap, b.labelGap);
}

function normalizeGeometry(geometry: ReadingTocRailGeometry): ReadingTocRailGeometry {
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
      finiteOr(geometry.maxExtraAmplitude, DEFAULT_GEOMETRY.maxExtraAmplitude),
    ),
    bulgeHalfHeight: Math.max(
      1,
      finiteOr(geometry.bulgeHalfHeight, DEFAULT_GEOMETRY.bulgeHalfHeight),
    ),
    labelGap: Math.max(0, finiteOr(geometry.labelGap, DEFAULT_GEOMETRY.labelGap)),
  };
}

/**
 * Builds the whole rail path. Near an edge only the path endpoints are clipped;
 * the control points keep their full wave positions, which creates the short
 * hook visible before the wave settles into a straight line at 0% or 100%.
 */
export function buildReadingTocRailCurve(
  geometry: ReadingTocRailGeometry,
  markerY: number,
  amplitude: number,
  halfHeight = geometry.bulgeHalfHeight,
): ReadingTocRailCurve {
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
    1,
  );
  const availableAmplitude = normalized.direction > 0
    ? Math.max(0, normalized.width - baselineX)
    : Math.max(0, baselineX);
  const effectiveAmplitude = Math.min(
    availableAmplitude,
    Math.max(0, finiteOr(amplitude, normalized.idleAmplitude)) * edgeFactor,
  );
  const peakX = baselineX + normalized.direction * effectiveAmplitude;

  const curve = [
    `C ${formatNumber(baselineX)} ${formatNumber(safeMarkerY - 0.6 * safeHalfHeight)}`,
    `${formatNumber(peakX)} ${formatNumber(safeMarkerY - 0.3 * safeHalfHeight)}`,
    `${formatNumber(peakX)} ${formatNumber(safeMarkerY)}`,
    `C ${formatNumber(peakX)} ${formatNumber(safeMarkerY + 0.3 * safeHalfHeight)}`,
    `${formatNumber(baselineX)} ${formatNumber(safeMarkerY + 0.6 * safeHalfHeight)}`,
    `${formatNumber(baselineX)} ${formatNumber(bottomY)}`,
  ].join(" ");

  return {
    basePath: [
      `M ${formatNumber(baselineX)} ${formatNumber(Math.min(0, topY))}`,
      `L ${formatNumber(baselineX)} ${formatNumber(topY)}`,
      curve,
      `L ${formatNumber(baselineX)} ${formatNumber(Math.max(height, bottomY))}`,
    ].join(" "),
    peakX,
    effectiveAmplitude,
    effectiveHalfHeight: safeHalfHeight,
    topY,
    bottomY,
  };
}

export function readingTocRailDotOffset(
  dotY: number,
  markerY: number,
  halfHeight: number,
  amplitude: number,
  direction: ReadingTocRailDirection,
): number {
  const safeHalfHeight = Math.max(1, finiteOr(halfHeight, 1));
  const ratio = Math.abs(finiteOr(dotY, 0) - finiteOr(markerY, 0)) / safeHalfHeight;
  if (ratio >= 1) return 0;

  const envelope = Math.cos(ratio * Math.PI / 2) ** 2;
  return direction * Math.max(0, finiteOr(amplitude, 0)) * envelope;
}

function normalizeHeading(heading: ReadingTocRailHeading): MutableRailHeading {
  const text = String(heading.text || "").trim();
  return {
    id: String(heading.id || ""),
    text,
    level: Math.round(clamp(finiteOr(heading.level, 2), 1, 6)),
    ratio: clamp(finiteOr(heading.ratio, 0), 0, 1),
    ariaLabel: String(heading.ariaLabel || text),
  };
}

/**
 * Pure renderer for the desktop reading rail. Its owner supplies measurements,
 * targets, lifecycle, events, and animation frames.
 */
export class ReadingTocRail {
  private readonly root: HTMLElement;
  private readonly svg: SVGSVGElement;
  private readonly basePath: SVGPathElement;
  private readonly accentPath: SVGPathElement;
  private readonly baseTop: SVGPathElement;
  private readonly baseBottom: SVGPathElement;
  private readonly accentTop: SVGPathElement;
  private readonly accentBottom: SVGPathElement;
  private readonly dotsRoot: HTMLElement;
  private readonly label: HTMLElement;
  private readonly currentLink: HTMLAnchorElement;
  private readonly titleSlots: readonly [HTMLElement, HTMLElement];
  private readonly percent: HTMLElement;

  private geometry: ReadingTocRailGeometry = DEFAULT_GEOMETRY;
  private headings: MutableRailHeading[] = [];
  private dotButtons: HTMLElement[] = [];
  private markerY = makeSpring(0);
  private amplitude = makeSpring(0);
  private hoverSpring = makeSpring(0);
  private progressTarget = 0;
  private activeIndex = -1;
  private endActiveIndex = -1;
  private renderedActiveIndex = -2;
  private renderedEndActiveIndex = -2;
  private renderedPercent = -1;
  private renderedTitle = "";
  private visibleTitleSlot: 0 | 1 = 0;
  private speedTarget = 0;
  private smoothedSpeed = 0;
  private lastTimestamp: number | null = null;
  private frameInitialized = false;
  private reducedMotion = false;
  private interactive = false;
  private destroyed = false;
  private snapRequested = true;
  private geometryDirty = true;
  private dotsDirty = true;
  private interactionDirty = true;

  constructor(root: HTMLElement) {
    this.root = root;
    this.svg = requiredElement<SVGSVGElement>(root, "[data-reading-toc-rail-svg]");
    this.basePath = requiredElement<SVGPathElement>(root, "[data-reading-toc-rail-base]");
    this.accentPath = requiredElement<SVGPathElement>(root, "[data-reading-toc-rail-accent]");
    this.dotsRoot = requiredElement<HTMLElement>(root, "[data-reading-toc-rail-dots]");
    this.label = requiredElement<HTMLElement>(root, "[data-reading-toc-rail-label]");
    this.currentLink = requiredElement<HTMLAnchorElement>(root, "[data-reading-toc-rail-link]");
    this.percent = requiredElement<HTMLElement>(root, "[data-reading-toc-rail-percent]");

    const titleSlots = Array.from(root.querySelectorAll<HTMLElement>("[data-reading-toc-rail-title]"));
    const firstTitle = titleSlots[0];
    const secondTitle = titleSlots[1];
    if (!firstTitle || !secondTitle) {
      throw new Error("[Daybook] Reading TOC rail requires two title slots");
    }
    this.titleSlots = [firstTitle, secondTitle];

    this.baseTop = this.basePath.cloneNode() as SVGPathElement;
    this.baseBottom = this.basePath.cloneNode() as SVGPathElement;
    this.accentTop = this.accentPath.cloneNode() as SVGPathElement;
    this.accentBottom = this.accentPath.cloneNode() as SVGPathElement;

    this.svg.insertBefore(this.baseTop, this.basePath);
    this.svg.insertBefore(this.baseBottom, this.basePath);
    this.svg.appendChild(this.accentTop);
    this.svg.appendChild(this.accentBottom);

    this.svg.style.overflow = "hidden";

    this.refreshPositionTargets();
  }

  setHeadings(entries: readonly ReadingTocRailHeading[]): void {
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

  updateHeadingRatios(ratios: readonly number[]): void {
    if (this.destroyed) return;

    let changed = false;
    this.headings.forEach((heading, index) => {
      const ratio = ratios[index];
      if (ratio === undefined) return;
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

  setGeometry(geometry: ReadingTocRailGeometry): void {
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
  setTargets(progress: number, activeIndex: number, endActiveIndex: number, scrollSpeed: number | null = null): void {
    if (this.destroyed) return;

    const nextProgress = clamp(finiteOr(progress, this.progressTarget), 0, 1);
    if (!approximatelyEqual(nextProgress, this.progressTarget, 0.00001)) {
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

    this.speedTarget = !this.reducedMotion && scrollSpeed !== null
      ? clamp(Math.abs(finiteOr(scrollSpeed, 0)), 0, MAX_SCROLL_SPEED)
      : 0;
  }

  setReducedMotion(reduced: boolean): void {
    if (this.destroyed || reduced === this.reducedMotion) return;
    this.reducedMotion = reduced;
    if (reduced) {
      this.snapToTargets();
    } else {
      this.lastTimestamp = null;
      this.frameInitialized = true;
    }
  }

  setInteractive(interactive: boolean): void {
    if (this.destroyed || interactive === this.interactive) return;
    this.interactive = interactive;
    this.root.inert = !interactive;
    if (!interactive) {
      this.speedTarget = 0;
      this.amplitude.target = 0;
    }
    this.interactionDirty = true;
  }

  setHovered(hovered: boolean): void {
    if (this.destroyed) return;
    this.hoverSpring.target = hovered ? 1 : 0;
  }

  /**
   * Advances springs and performs every continuous DOM write. The owner should
   * request another frame only when this method returns true.
   */
  advance(timestamp: number): boolean {
    if (this.destroyed) return false;

    const safeTimestamp = finiteOr(timestamp, this.lastTimestamp ?? 0);
    let deltaTime = this.lastTimestamp === null
      ? 0
      : clamp((safeTimestamp - this.lastTimestamp) / 1000, 0, MAX_FRAME_STEP);
    this.lastTimestamp = safeTimestamp;

    if (!this.frameInitialized || this.snapRequested || this.reducedMotion) {
      this.applySnap();
      deltaTime = 0;
    } else if (deltaTime > 0) {
      this.stepAnimation(deltaTime);
    }

    const animating = !this.reducedMotion
      && (this.interactive || !this.animationIsSettled());
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
  snapToTargets(): void {
    if (this.destroyed) return;
    this.speedTarget = 0;
    this.smoothedSpeed = 0;
    this.amplitude.target = 0;
    this.snapRequested = true;
    this.lastTimestamp = null;
  }

  resumeAfterVisibility(): void {
    if (this.destroyed) return;
    this.snapToTargets();
  }

  destroy(): void {
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

  private refreshPositionTargets(): void {
    const markerTarget = this.mapRatioToY(this.progressTarget);
    this.markerY.target = markerTarget;
  }

  private mapRatioToY(ratio: number): number {
    return this.geometry.height * clamp(ratio, 0, 1);
  }

  private normalizeActiveIndex(index: number): number {
    if (this.headings.length === 0 || !Number.isFinite(index)) return -1;
    return Math.round(clamp(index, 0, this.headings.length - 1));
  }

  private targetAmplitude(): number {
    if (this.reducedMotion || !this.interactive) return 0;
    return Math.min(
      this.geometry.maxExtraAmplitude,
      SPEED_TO_AMPLITUDE * Math.abs(this.smoothedSpeed),
    );
  }

  private clampSpringPositions(): void {
    this.markerY.target = clamp(this.markerY.target, 0, this.geometry.height);
    const clampedCurrent = clamp(this.markerY.current, 0, this.geometry.height);
    if (!approximatelyEqual(clampedCurrent, this.markerY.current)) {
      this.markerY.current = clampedCurrent;
      this.markerY.velocity = 0;
    }
  }

  private applySnap(): void {
    this.refreshPositionTargets();
    this.speedTarget = 0;
    this.smoothedSpeed = 0;
    this.amplitude.target = 0;
    snapSpring(this.markerY);
    snapSpring(this.amplitude);
    this.frameInitialized = true;
    this.snapRequested = false;
  }

  private stepAnimation(deltaTime: number): void {
    const progressResponse = Math.min(
      1,
      1.4 * (1 - Math.exp(-deltaTime / PROGRESS_RESPONSE_SECONDS)),
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

  private animationIsSettled(): boolean {
    return springIsSettled(this.markerY, POSITION_EPSILON)
      && springIsSettled(this.amplitude, AMPLITUDE_EPSILON)
      && springIsSettled(this.hoverSpring, AMPLITUDE_EPSILON)
      && Math.abs(this.speedTarget) <= SPEED_EPSILON
      && Math.abs(this.smoothedSpeed) <= SPEED_EPSILON;
  }

  private baselineX(): number {
    return this.geometry.lineInset;
  }

  private writeDOM(timestamp: number): void {
    if (this.geometryDirty) {
      this.svg.setAttribute(
        "viewBox",
        `0 0 ${formatNumber(this.geometry.width)} ${formatNumber(this.geometry.height)}`,
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
      this.geometry.height,
    );
    const hoverState = Math.max(0, Math.min(1, this.hoverSpring.current));
    const boost = this.amplitude.current;
    const breath = !this.reducedMotion
      ? BREATH_AMPLITUDE * Math.sin(timestamp / BREATH_PERIOD_MS * Math.PI * 2)
      : 0;
    
    // Wave amplitude remains constant when hovered, only opacity fades
    const waveAmplitude = Math.max(0, this.geometry.idleAmplitude + breath + boost);
    const halfHeight = Math.max(
      1,
      this.geometry.bulgeHalfHeight + HALF_HEIGHT_SPEED_GAIN * boost,
    );
    
    // Opacity fades out based on hoverState, using CSS variable to avoid overriding base CSS
    this.root.style.setProperty("--hover-opacity", `${1 - Math.pow(hoverState, 2)}`);
    this.root.style.pointerEvents = hoverState > 0.5 ? "none" : "auto";

    const path = buildReadingTocRailCurve(
      this.geometry,
      markerY,
      waveAmplitude,
      halfHeight,
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
        this.geometry.direction,
      );
      button.style.transform = `translate3d(calc(-50% + ${formatNumber(offsetX)}px), -50%, 0)`;
    });

    const labelX = path.peakX - this.geometry.labelGap;
    this.label.style.left = "0";
    this.label.style.top = `clamp(var(--reading-toc-rail-label-edge-inset), ${formatNumber(markerY)}px, calc(100% - var(--reading-toc-rail-label-edge-inset)))`;
    this.label.style.transform = [
      `translate3d(${formatNumber(labelX)}px, 0, 0)`,
      "translate(-100%, -50%)",
    ].join(" ");

    this.writeLabelContent();
    this.writeInteractionState();
  }

  private writeLabelContent(): void {
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
        const nextSlotIndex: 0 | 1 = this.visibleTitleSlot === 0 ? 1 : 0;
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

  private writeInteractionState(): void {
    if (!this.interactionDirty && this.renderedActiveIndex === this.activeIndex && this.renderedEndActiveIndex === this.endActiveIndex) return;

    this.dotButtons.forEach((button, index) => {
      const active = index >= this.activeIndex && index <= this.endActiveIndex;
      button.classList.toggle("is-active", active);
    });

    this.currentLink.tabIndex = this.interactive && this.activeIndex >= 0 ? 0 : -1;
    this.root.dataset.interactive = this.interactive ? "true" : "false";
    this.interactionDirty = false;
  }
}
