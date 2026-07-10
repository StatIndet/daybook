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
  readonly safePadding: number;
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

interface CurvePath {
  accentPath: string;
  basePath: string;
  peakX: number;
}

const DEFAULT_GEOMETRY: ReadingTocRailGeometry = {
  width: 208,
  height: 640,
  direction: 1,
  safePadding: 56,
  lineInset: 12,
  idleAmplitude: 11,
  maxExtraAmplitude: 12,
  bulgeHalfHeight: 52,
  labelGap: 12,
};

const MARKER_STIFFNESS = 210;
const MARKER_DAMPING = 29;
const LABEL_STIFFNESS = 190;
const LABEL_DAMPING = 27.6;
const AMPLITUDE_STIFFNESS = 175;
const AMPLITUDE_DAMPING = 24;

const MAX_FRAME_STEP = 0.032;
const MAX_SUBSTEP = 0.016;
const POSITION_EPSILON = 0.035;
const VELOCITY_EPSILON = 0.05;
const AMPLITUDE_EPSILON = 0.025;
const SPEED_EPSILON = 0.002;
const SPEED_RESPONSE = 18;
const SPEED_DECAY = 9;
const SPEED_DEAD_ZONE = 40;
const SPEED_SATURATION = 1400;
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

function smoothstep(value: number): number {
  const normalized = clamp(value, 0, 1);
  return normalized * normalized * (3 - 2 * normalized);
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
    && approximatelyEqual(a.safePadding, b.safePadding)
    && approximatelyEqual(a.lineInset, b.lineInset)
    && approximatelyEqual(a.idleAmplitude, b.idleAmplitude)
    && approximatelyEqual(a.maxExtraAmplitude, b.maxExtraAmplitude)
    && approximatelyEqual(a.bulgeHalfHeight, b.bulgeHalfHeight)
    && approximatelyEqual(a.labelGap, b.labelGap);
}

function normalizeGeometry(geometry: ReadingTocRailGeometry): ReadingTocRailGeometry {
  const width = Math.max(MIN_DIMENSION, finiteOr(geometry.width, DEFAULT_GEOMETRY.width));
  const height = Math.max(MIN_DIMENSION, finiteOr(geometry.height, DEFAULT_GEOMETRY.height));
  const safePadding = clamp(
    finiteOr(geometry.safePadding, DEFAULT_GEOMETRY.safePadding),
    0,
    height / 2,
  );

  return {
    width,
    height,
    direction: geometry.direction < 0 ? -1 : 1,
    safePadding,
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
  private readonly marker: SVGCircleElement;
  private readonly dotsRoot: HTMLElement;
  private readonly label: HTMLElement;
  private readonly currentLink: HTMLAnchorElement;
  private readonly titleSlots: readonly [HTMLElement, HTMLElement];
  private readonly percent: HTMLElement;

  private geometry: ReadingTocRailGeometry = DEFAULT_GEOMETRY;
  private headings: MutableRailHeading[] = [];
  private dotButtons: HTMLButtonElement[] = [];
  private markerY = makeSpring(DEFAULT_GEOMETRY.safePadding);
  private labelY = makeSpring(DEFAULT_GEOMETRY.safePadding);
  private amplitude = makeSpring(DEFAULT_GEOMETRY.idleAmplitude);
  private progressTarget = 0;
  private activeIndex = -1;
  private renderedActiveIndex = -2;
  private renderedPercent = -1;
  private renderedTitle = "";
  private visibleTitleSlot: 0 | 1 = 0;
  private speedDrive = 0;
  private speedEnvelope = 0;
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
    this.marker = requiredElement<SVGCircleElement>(root, "[data-reading-toc-rail-marker]");
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

    this.refreshPositionTargets();
  }

  setHeadings(entries: readonly ReadingTocRailHeading[]): void {
    if (this.destroyed) return;

    this.headings = entries.map(normalizeHeading);
    const fragment = document.createDocumentFragment();
    this.dotButtons = this.headings.map((heading, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "reading-toc-rail-dot";
      button.dataset.readingTocRailDot = "";
      button.dataset.readingTocRailIndex = String(index);
      button.dataset.headingLevel = String(heading.level);
      button.tabIndex = -1;
      button.setAttribute("aria-label", heading.ariaLabel);
      fragment.appendChild(button);
      return button;
    });
    this.dotsRoot.replaceChildren(fragment);

    this.activeIndex = this.normalizeActiveIndex(this.activeIndex);
    this.renderedActiveIndex = -2;
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

  setGeometry(geometry: ReadingTocRailGeometry): void;
  setGeometry(
    width: number,
    height: number,
    direction: ReadingTocRailDirection,
    safePadding: number,
    lineInset: number,
    idleAmplitude: number,
    maxExtraAmplitude: number,
    bulgeHalfHeight: number,
    labelGap: number,
  ): void;
  setGeometry(
    geometryOrWidth: ReadingTocRailGeometry | number,
    height?: number,
    direction?: ReadingTocRailDirection,
    safePadding?: number,
    lineInset?: number,
    idleAmplitude?: number,
    maxExtraAmplitude?: number,
    bulgeHalfHeight?: number,
    labelGap?: number,
  ): void {
    if (this.destroyed) return;

    const nextGeometry = typeof geometryOrWidth === "number"
      ? normalizeGeometry({
          width: geometryOrWidth,
          height: finiteOr(height ?? Number.NaN, this.geometry.height),
          direction: direction ?? this.geometry.direction,
          safePadding: finiteOr(safePadding ?? Number.NaN, this.geometry.safePadding),
          lineInset: finiteOr(lineInset ?? Number.NaN, this.geometry.lineInset),
          idleAmplitude: finiteOr(idleAmplitude ?? Number.NaN, this.geometry.idleAmplitude),
          maxExtraAmplitude: finiteOr(
            maxExtraAmplitude ?? Number.NaN,
            this.geometry.maxExtraAmplitude,
          ),
          bulgeHalfHeight: finiteOr(
            bulgeHalfHeight ?? Number.NaN,
            this.geometry.bulgeHalfHeight,
          ),
          labelGap: finiteOr(labelGap ?? Number.NaN, this.geometry.labelGap),
        })
      : normalizeGeometry(geometryOrWidth);

    if (geometryIsEqual(nextGeometry, this.geometry)) return;

    this.geometry = nextGeometry;
    this.refreshPositionTargets();
    this.clampSpringPositions();
    this.amplitude.target = this.targetAmplitude();
    this.amplitude.current = this.clampAmplitude(this.amplitude.current);
    this.geometryDirty = true;
    this.dotsDirty = true;
  }

  /** Updates only in-memory targets and is safe to call directly from scroll handlers. */
  setTargets(progress: number, activeIndex: number, scrollSpeed: number | null = null): void {
    if (this.destroyed) return;

    const nextProgress = clamp(finiteOr(progress, this.progressTarget), 0, 1);
    if (!approximatelyEqual(nextProgress, this.progressTarget, 0.00001)) {
      this.progressTarget = nextProgress;
      this.refreshPositionTargets();
    }

    const nextActiveIndex = this.normalizeActiveIndex(activeIndex);
    if (nextActiveIndex !== this.activeIndex) {
      this.activeIndex = nextActiveIndex;
      this.interactionDirty = true;
    }

    if (!this.reducedMotion && scrollSpeed !== null && Number.isFinite(scrollSpeed)) {
      const normalizedSpeed = this.normalizedSpeed(Math.abs(scrollSpeed));
      this.speedDrive = Math.max(this.speedDrive, normalizedSpeed);
    }
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
    this.interactionDirty = true;
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

    const animating = !this.reducedMotion && !this.animationIsSettled();
    if (!animating) {
      this.speedDrive = 0;
      this.speedEnvelope = 0;
      this.amplitude.target = this.geometry.idleAmplitude;
      snapSpring(this.markerY);
      snapSpring(this.labelY);
      snapSpring(this.amplitude);
    }

    this.writeDOM();

    return animating;
  }

  /** Snaps state in memory; the following advance() commits it to the DOM. */
  snapToTargets(): void {
    if (this.destroyed) return;
    this.speedDrive = 0;
    this.speedEnvelope = 0;
    this.amplitude.target = this.geometry.idleAmplitude;
    this.snapRequested = true;
    this.lastTimestamp = null;
  }

  resumeAfterVisibility(): void {
    if (this.destroyed) return;
    this.snapToTargets();
  }

  getHeading(index = this.activeIndex): Readonly<ReadingTocRailHeading> | undefined {
    const heading = this.headings[index];
    if (!heading) return undefined;
    return { ...heading };
  }

  getActiveIndex(): number {
    return this.activeIndex;
  }

  focusDot(index = this.activeIndex): boolean {
    if (this.destroyed || !this.interactive) return false;
    const dot = this.dotButtons[index];
    if (!dot) return false;
    dot.focus({ preventScroll: true });
    return true;
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.dotsRoot.replaceChildren();
    this.dotButtons = [];
    this.headings = [];
    this.basePath.setAttribute("d", "M 0 0");
    this.accentPath.setAttribute("d", "M 0 0");
    this.marker.setAttribute("cx", "0");
    this.marker.setAttribute("cy", "0");
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
    this.root.dataset.interactive = "false";
    this.root.style.removeProperty("--reading-toc-rail-direction");
    this.lastTimestamp = null;
    this.speedDrive = 0;
    this.speedEnvelope = 0;
  }

  private refreshPositionTargets(): void {
    const markerTarget = this.mapRatioToY(this.progressTarget);
    this.markerY.target = markerTarget;
    this.labelY.target = markerTarget;
  }

  private mapRatioToY(ratio: number): number {
    const start = this.geometry.safePadding;
    const end = Math.max(start, this.geometry.height - this.geometry.safePadding);
    return start + (end - start) * clamp(ratio, 0, 1);
  }

  private normalizeActiveIndex(index: number): number {
    if (this.headings.length === 0 || !Number.isFinite(index)) return -1;
    return Math.round(clamp(index, 0, this.headings.length - 1));
  }

  private normalizedSpeed(speed: number): number {
    const bounded = clamp(finiteOr(speed, 0), 0, MAX_SCROLL_SPEED);
    const effective = Math.max(0, bounded - SPEED_DEAD_ZONE);
    return clamp(1 - Math.exp(-effective / SPEED_SATURATION), 0, 1);
  }

  private clampAmplitude(value: number): number {
    return clamp(
      finiteOr(value, this.geometry.idleAmplitude),
      this.geometry.idleAmplitude,
      this.geometry.idleAmplitude + this.geometry.maxExtraAmplitude,
    );
  }

  private targetAmplitude(): number {
    if (this.reducedMotion) return this.geometry.idleAmplitude;
    return this.clampAmplitude(
      this.geometry.idleAmplitude + this.geometry.maxExtraAmplitude * this.speedEnvelope,
    );
  }

  private clampSpringPositions(): void {
    const minY = this.geometry.safePadding;
    const maxY = Math.max(minY, this.geometry.height - this.geometry.safePadding);

    [this.markerY, this.labelY].forEach((spring) => {
      spring.target = clamp(spring.target, minY, maxY);
      const clampedCurrent = clamp(spring.current, minY, maxY);
      if (!approximatelyEqual(clampedCurrent, spring.current)) {
        spring.current = clampedCurrent;
        spring.velocity = 0;
      }
    });
  }

  private applySnap(): void {
    this.refreshPositionTargets();
    this.speedDrive = 0;
    this.speedEnvelope = 0;
    this.amplitude.target = this.geometry.idleAmplitude;
    snapSpring(this.markerY);
    snapSpring(this.labelY);
    snapSpring(this.amplitude);
    this.frameInitialized = true;
    this.snapRequested = false;
  }

  private stepAnimation(deltaTime: number): void {
    const substeps = Math.max(1, Math.ceil(deltaTime / MAX_SUBSTEP));
    const step = deltaTime / substeps;

    for (let index = 0; index < substeps; index += 1) {
      const response = 1 - Math.exp(-SPEED_RESPONSE * step);
      this.speedEnvelope += (this.speedDrive - this.speedEnvelope) * response;
      this.speedDrive *= Math.exp(-SPEED_DECAY * step);
      if (this.speedDrive < SPEED_EPSILON) this.speedDrive = 0;
      if (this.speedEnvelope < SPEED_EPSILON && this.speedDrive === 0) this.speedEnvelope = 0;

      this.amplitude.target = this.targetAmplitude();
      stepSpring(this.markerY, MARKER_STIFFNESS, MARKER_DAMPING, step);
      stepSpring(this.labelY, LABEL_STIFFNESS, LABEL_DAMPING, step);
      stepSpring(this.amplitude, AMPLITUDE_STIFFNESS, AMPLITUDE_DAMPING, step);

      this.clampSpringPositions();
      this.amplitude.current = this.clampAmplitude(this.amplitude.current);
      if (this.amplitude.current === this.geometry.idleAmplitude && this.amplitude.velocity < 0) {
        this.amplitude.velocity = 0;
      }
      const maxAmplitude = this.geometry.idleAmplitude + this.geometry.maxExtraAmplitude;
      if (this.amplitude.current === maxAmplitude && this.amplitude.velocity > 0) {
        this.amplitude.velocity = 0;
      }
    }
  }

  private animationIsSettled(): boolean {
    return springIsSettled(this.markerY, POSITION_EPSILON)
      && springIsSettled(this.labelY, POSITION_EPSILON)
      && springIsSettled(this.amplitude, AMPLITUDE_EPSILON)
      && this.speedDrive <= SPEED_EPSILON
      && this.speedEnvelope <= SPEED_EPSILON;
  }

  private baselineX(): number {
    return this.geometry.direction > 0
      ? this.geometry.lineInset
      : this.geometry.width - this.geometry.lineInset;
  }

  private availableAmplitude(): number {
    const baseline = this.baselineX();
    return this.geometry.direction > 0
      ? Math.max(0, this.geometry.width - baseline)
      : Math.max(0, baseline);
  }

  private curvePath(markerY: number, amplitude: number): CurvePath {
    const height = this.geometry.height;
    const baselineX = this.baselineX();
    const safeMarkerY = clamp(markerY, 0, height);
    const halfHeight = this.geometry.bulgeHalfHeight;
    const topSpan = Math.min(halfHeight, safeMarkerY);
    const bottomSpan = Math.min(halfHeight, Math.max(0, height - safeMarkerY));
    const topRatio = halfHeight > 0 ? topSpan / halfHeight : 0;
    const bottomRatio = halfHeight > 0 ? bottomSpan / halfHeight : 0;
    const edgeFactor = smoothstep(Math.min(topRatio, bottomRatio));
    const effectiveAmplitude = Math.min(
      this.availableAmplitude(),
      Math.max(0, finiteOr(amplitude, this.geometry.idleAmplitude)),
    ) * edgeFactor;
    const peakX = baselineX + this.geometry.direction * effectiveAmplitude;
    const topY = safeMarkerY - topSpan;
    const bottomY = safeMarkerY + bottomSpan;

    const topControlOneY = topY + topSpan * 0.38;
    const topControlTwoY = safeMarkerY - topSpan * 0.34;
    const bottomControlOneY = safeMarkerY + bottomSpan * 0.34;
    const bottomControlTwoY = bottomY - bottomSpan * 0.38;

    const curve = [
      `C ${formatNumber(baselineX)} ${formatNumber(topControlOneY)}`,
      `${formatNumber(peakX)} ${formatNumber(topControlTwoY)}`,
      `${formatNumber(peakX)} ${formatNumber(safeMarkerY)}`,
      `C ${formatNumber(peakX)} ${formatNumber(bottomControlOneY)}`,
      `${formatNumber(baselineX)} ${formatNumber(bottomControlTwoY)}`,
      `${formatNumber(baselineX)} ${formatNumber(bottomY)}`,
    ].join(" ");

    return {
      accentPath: `M ${formatNumber(baselineX)} ${formatNumber(topY)} ${curve}`,
      basePath: [
        `M ${formatNumber(baselineX)} 0`,
        `L ${formatNumber(baselineX)} ${formatNumber(topY)}`,
        curve,
        `L ${formatNumber(baselineX)} ${formatNumber(height)}`,
      ].join(" "),
      peakX,
    };
  }

  private writeDOM(): void {
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
      this.geometry.safePadding,
      Math.max(this.geometry.safePadding, this.geometry.height - this.geometry.safePadding),
    );
    const labelY = clamp(
      finiteOr(this.labelY.current, this.labelY.target),
      this.geometry.safePadding,
      Math.max(this.geometry.safePadding, this.geometry.height - this.geometry.safePadding),
    );
    const path = this.curvePath(markerY, this.clampAmplitude(this.amplitude.current));
    this.basePath.setAttribute("d", path.basePath);
    this.accentPath.setAttribute("d", path.accentPath);
    this.marker.setAttribute("cx", formatNumber(path.peakX));
    this.marker.setAttribute("cy", formatNumber(markerY));

    const labelX = path.peakX + this.geometry.direction * this.geometry.labelGap;
    this.label.style.left = "0";
    this.label.style.top = "0";
    this.label.style.transform = [
      `translate3d(${formatNumber(labelX)}px, ${formatNumber(labelY)}px, 0)`,
      this.geometry.direction < 0 ? "translate(-100%, -50%)" : "translateY(-50%)",
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
  }

  private writeInteractionState(): void {
    if (!this.interactionDirty && this.renderedActiveIndex === this.activeIndex) return;

    this.dotButtons.forEach((button, index) => {
      const active = index === this.activeIndex;
      button.classList.toggle("is-active", active);
      button.tabIndex = this.interactive && active ? 0 : -1;
      if (active) {
        button.setAttribute("aria-current", "true");
      } else {
        button.removeAttribute("aria-current");
      }
    });

    this.currentLink.tabIndex = this.interactive && this.activeIndex >= 0 ? 0 : -1;
    this.root.dataset.interactive = this.interactive ? "true" : "false";
    this.interactionDirty = false;
  }
}
