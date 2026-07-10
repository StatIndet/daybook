import {
  ReadingTocRail,
  type ReadingTocRailGeometry,
  type ReadingTocRailHeading,
} from "./toc/reading-toc-rail";

const RAIL_MEDIA_QUERY = "(min-width: 116rem)";
const MOTION_MEDIA_QUERY = "(prefers-reduced-motion: reduce)";
const DEFAULT_ACTIVATION_LINE = 96;
const DEFAULT_BOTTOM_INSET = 96;
const MIN_HEADING_COUNT = 2;
const MIN_READING_TRAVEL = 240;
const MIN_RAIL_HEIGHT = 320;
const MIN_RAIL_WIDTH = 160;
const MODE_HYSTERESIS = 8;
const MAX_SCROLL_SPEED = 5000;
const GEOMETRY_EPSILON = 1;

interface TocHeadingEntry {
  id: string;
  text: string;
  level: number;
  element: HTMLElement;
  link: HTMLAnchorElement;
  item: HTMLElement;
  documentY: number;
  railRatio: number;
  tocTop: number;
  tocHeight: number;
}

interface TocMetrics {
  activationLine: number;
  contentHeight: number;
  contentTop: number;
  headerBottom: number;
  railEligible: boolean;
  railGeometry: ReadingTocRailGeometry | null;
  readingTravel: number;
  tocListScrollTop: number;
  tocListTop: number;
  tocVisible: boolean;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function finiteOr(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

function cssNumber(style: CSSStyleDeclaration, name: string, fallback: number): number {
  const value = Number.parseFloat(style.getPropertyValue(name));
  return finiteOr(value, fallback);
}

function layoutDocumentTop(element: HTMLElement): number {
  let top = 0;
  let current: HTMLElement | null = element;

  while (current) {
    top += current.offsetTop;
    current = current.offsetParent as HTMLElement | null;
  }

  return top;
}

function upperBoundHeading(headings: TocHeadingEntry[], documentY: number): number {
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

function syncNoteToc(toc: HTMLElement): void {
  const button = toc.querySelector<HTMLButtonElement>(".note-toc-toggle");
  const icon = button?.querySelector<HTMLElement>(".material-symbol");
  const isOpen = toc.classList.contains("is-open");

  button?.setAttribute("aria-expanded", isOpen ? "true" : "false");
  if (icon) {
    icon.textContent = isOpen ? "menu_open" : "menu";
  }
}

function ensureTocIndicator(tocPanel: HTMLElement): HTMLElement {
  let indicator = tocPanel.querySelector<HTMLElement>(".note-toc-indicator");
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

function headingIdFromLink(link: HTMLAnchorElement): string {
  const href = link.getAttribute("href") || "";
  if (!href.startsWith("#")) return "";

  try {
    return decodeURIComponent(href.slice(1));
  } catch {
    return href.slice(1);
  }
}

class NoteTocController {
  private readonly abortController = new AbortController();
  private readonly railMediaQuery = window.matchMedia(RAIL_MEDIA_QUERY);
  private readonly motionMediaQuery = window.matchMedia(MOTION_MEDIA_QUERY);
  private readonly stage: HTMLElement;
  private readonly toc: HTMLElement;
  private readonly tocPanel: HTMLElement;
  private readonly tocList: HTMLOListElement;
  private readonly tocIndicator: HTMLElement;
  private readonly railRoot: HTMLElement;
  private readonly note: HTMLElement;
  private readonly noteHeader: HTMLElement;
  private readonly postContent: HTMLElement;
  private readonly tocWrapper: HTMLElement;
  private headings: TocHeadingEntry[];
  private rail: ReadingTocRail | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private frameId = 0;
  private needsMeasure = true;
  private destroyed = false;
  private generation = 0;
  private metrics: TocMetrics | null = null;
  private activeIndex = -1;
  private isReadingMode = false;
  private reducedMotion = false;
  private latestScrollY = window.scrollY;
  private lastScrollY = window.scrollY;
  private lastScrollTime = performance.now();
  private pendingScrollSpeed: number | null = null;
  private snapOnNextFrame = true;
  private railHeadingsReady = false;
  private indicatorDirty = true;
  private indicatorTop = Number.NaN;
  private indicatorHeight = Number.NaN;

  constructor(
    stage: HTMLElement,
    toc: HTMLElement,
    tocPanel: HTMLElement,
    tocList: HTMLOListElement,
    railRoot: HTMLElement,
    note: HTMLElement,
    noteHeader: HTMLElement,
    postContent: HTMLElement,
    tocWrapper: HTMLElement,
    headings: TocHeadingEntry[],
  ) {
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

  init(): void {
    syncNoteToc(this.toc);
    this.reducedMotion = this.motionDisabled();
    this.bindPageListeners();
    this.observeLayout();
    this.waitForFonts();
    this.requestMeasure(true);
  }

  requestMeasure(snap = false): void {
    if (this.destroyed) return;
    this.needsMeasure = true;
    this.snapOnNextFrame ||= snap;
    this.ensureFrame();
  }

  destroy(): void {
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

  private bindPageListeners(): void {
    const signal = this.abortController.signal;

    window.addEventListener("scroll", this.handleScroll, { passive: true, signal });
    window.addEventListener("resize", this.handleResize, { passive: true, signal });
    this.tocList.addEventListener("scroll", this.handleTocListScroll, { passive: true, signal });
    this.stage.addEventListener("click", this.handleStageClick, { signal });
    this.postContent.addEventListener("load", this.handleContentLoad, { capture: true, signal });
    document.addEventListener("visibilitychange", this.handleVisibilityChange, { signal });
    document.addEventListener("daybook:settings-change", this.handleMotionChange, { signal });
    document.fonts?.addEventListener("loadingdone", this.handleFontLoad, { signal });

    this.railMediaQuery.addEventListener("change", this.handleRailMediaChange);
    this.motionMediaQuery.addEventListener("change", this.handleMotionChange);
  }

  private observeLayout(): void {
    if (!("ResizeObserver" in window)) return;

    this.resizeObserver = new ResizeObserver(() => {
      this.requestMeasure();
    });
    this.resizeObserver.observe(this.noteHeader);
    this.resizeObserver.observe(this.postContent);
  }

  private waitForFonts(): void {
    if (!document.fonts) return;
    const generation = this.generation;

    document.fonts.ready.then(() => {
      if (!this.destroyed && generation === this.generation) {
        this.requestMeasure(true);
      }
    }).catch(() => {
      // Font loading failure does not prevent the cached layout from working.
    });
  }

  private readonly handleScroll = (): void => {
    if (this.destroyed || document.hidden) return;
    if (this.metrics && !this.metrics.tocVisible && !this.metrics.railEligible) return;

    const now = performance.now();
    const scrollY = window.scrollY;
    const elapsed = now - this.lastScrollTime;
    let speed = 0;

    if (elapsed > 0 && elapsed < 180) {
      speed = Math.abs(scrollY - this.lastScrollY) / elapsed * 1000;
    }

    this.pendingScrollSpeed = Math.max(
      this.pendingScrollSpeed || 0,
      clamp(finiteOr(speed, 0), 0, MAX_SCROLL_SPEED),
    );
    this.latestScrollY = scrollY;
    this.lastScrollY = scrollY;
    this.lastScrollTime = now;
    this.ensureFrame();
  };

  private readonly handleResize = (): void => {
    this.latestScrollY = window.scrollY;
    this.lastScrollY = window.scrollY;
    this.lastScrollTime = performance.now();
    this.pendingScrollSpeed = 0;
    this.requestMeasure(true);
  };

  private readonly handleTocListScroll = (): void => {
    this.indicatorDirty = true;
    this.ensureFrame();
  };

  private readonly handleContentLoad = (): void => {
    this.requestMeasure();
  };

  private readonly handleFontLoad = (): void => {
    this.requestMeasure(true);
  };

  private readonly handleRailMediaChange = (): void => {
    this.requestMeasure(true);
  };

  private readonly handleMotionChange = (): void => {
    const reducedMotion = this.motionDisabled();
    if (reducedMotion === this.reducedMotion) return;

    this.reducedMotion = reducedMotion;
    this.rail?.setReducedMotion(reducedMotion);
    this.snapOnNextFrame = reducedMotion;
    this.ensureFrame();
  };

  private readonly handleVisibilityChange = (): void => {
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
    this.snapOnNextFrame = true;
    this.requestMeasure(true);
  };

  private readonly handleStageClick = (event: MouseEvent): void => {
    const target = event.target as HTMLElement;

    const currentLink = target.closest<HTMLAnchorElement>("[data-reading-toc-rail-link]");



    if (currentLink) {
      event.preventDefault();
      this.jumpToHeading(this.activeIndex);
    }
  };

  private jumpToHeading(index: number): void {
    const heading = this.headings[index];
    const metrics = this.metrics;
    if (!heading || !metrics) return;

    const top = Math.max(0, heading.documentY - metrics.activationLine);
    window.scrollTo({
      top,
      behavior: this.reducedMotion ? "instant" : "smooth",
    });

    const url = new URL(window.location.href);
    url.hash = heading.id;
    const state = history.state;
    const nextState = state && typeof state === "object"
      ? { ...state, url: url.href }
      : state;
    history.replaceState(nextState, "", `${url.pathname}${url.search}${url.hash}`);
  }

  private motionDisabled(): boolean {
    return document.documentElement.getAttribute("data-reduced-motion") === "true"
      || this.motionMediaQuery.matches;
  }

  private ensureFrame(): void {
    if (this.destroyed || this.frameId) return;
    this.frameId = window.requestAnimationFrame(this.runFrame);
  }

  private readonly runFrame = (timestamp: number): void => {
    this.frameId = 0;
    if (this.destroyed || document.hidden) return;

    const measuredThisFrame = this.needsMeasure;
    if (measuredThisFrame) {
      this.measure();
    }

    const metrics = this.metrics;
    if (!metrics || this.headings.length === 0) return;

    const activationY = this.latestScrollY + metrics.activationLine;
    const activeIndex = upperBoundHeading(this.headings, activationY);
    const shouldRead = this.readingModeFor(activationY, metrics);
    const tocScrollTop = metrics.tocVisible
      ? (measuredThisFrame ? metrics.tocListScrollTop : this.tocList.scrollTop)
      : 0;

    let railAnimating = false;
    if (metrics.railEligible && this.rail) {
      const progress = clamp(
        (activationY - metrics.contentTop) / metrics.readingTravel,
        0,
        1,
      );
      const speed = this.pendingScrollSpeed;
      this.pendingScrollSpeed = null;

      this.rail.setTargets(progress, activeIndex, speed);
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
      metrics.tocListTop,
      tocScrollTop,
      metrics.tocVisible,
    );
    this.setReadingMode(shouldRead);

    if (metrics.railEligible && this.rail) {
      railAnimating = this.rail.advance(timestamp);
    }

    if (railAnimating || this.needsMeasure) {
      this.ensureFrame();
    }
  };

  private measure(): void {
    this.needsMeasure = false;

    const railStyle = window.getComputedStyle(this.railRoot);
    const stageStyle = window.getComputedStyle(this.stage);
    const wrapperStyle = window.getComputedStyle(this.tocWrapper);
    const railRect = this.railRoot.getBoundingClientRect();
    const wrapperRect = this.tocWrapper.getBoundingClientRect();
    const noteRect = this.note.getBoundingClientRect();
    const sideRailRect = document.querySelector<HTMLElement>(".side-rail")?.getBoundingClientRect() || null;
    const contentTop = layoutDocumentTop(this.postContent);
    const contentHeight = this.postContent.offsetHeight;
    const headerBottom = layoutDocumentTop(this.noteHeader) + this.noteHeader.offsetHeight;
    const activationLine = cssNumber(stageStyle, "--reading-toc-activation-line", DEFAULT_ACTIVATION_LINE);
    const bottomInset = cssNumber(stageStyle, "--reading-toc-bottom-inset", DEFAULT_BOTTOM_INSET);
    const readableViewport = window.innerHeight - activationLine - bottomInset;
    const readingTravel = contentHeight - readableViewport;
    const direction = cssNumber(stageStyle, "--reading-toc-rail-direction", 1) < 0 ? -1 : 1;
    const safePadding = cssNumber(railStyle, "--reading-toc-rail-safe-padding", 56);
    const cssEligible = cssNumber(stageStyle, "--reading-toc-rail-eligible", 0) === 1;
    const sideRailRight = sideRailRect?.right || 0;
    const hasHorizontalRoom = wrapperRect.left + GEOMETRY_EPSILON >= sideRailRight
        && wrapperRect.right <= noteRect.left + GEOMETRY_EPSILON;
    const hasVerticalRoom = readableViewport > 0
      && railRect.height >= Math.max(MIN_RAIL_HEIGHT, safePadding * 2 + 1);
    const railEligible = this.railMediaQuery.matches
      && cssEligible
      && wrapperStyle.position === "absolute"
      && railRect.width >= MIN_RAIL_WIDTH
      && hasHorizontalRoom
      && hasVerticalRoom
      && this.headings.length >= MIN_HEADING_COUNT
      && readingTravel >= MIN_READING_TRAVEL;
    const tocVisible = wrapperStyle.display !== "none"
      && wrapperRect.width > 0
      && wrapperRect.height > 0;

    this.headings.forEach((heading) => {
      heading.documentY = layoutDocumentTop(heading.element);
      heading.railRatio = contentHeight > 0
        ? clamp((heading.documentY - contentTop) / contentHeight, 0, 1)
        : 0;
      heading.tocTop = heading.item.offsetTop;
      heading.tocHeight = Math.max(1, heading.item.offsetHeight);
    });

    const railGeometry: ReadingTocRailGeometry | null = railEligible ? {
      width: railRect.width,
      height: railRect.height,
      direction,
      safePadding,
      lineInset: cssNumber(railStyle, "--reading-toc-rail-line-inset", 6),
      idleAmplitude: cssNumber(railStyle, "--reading-toc-rail-idle-amplitude", 11),
      maxExtraAmplitude: cssNumber(railStyle, "--reading-toc-rail-max-extra-amplitude", 12),
      bulgeHalfHeight: cssNumber(railStyle, "--reading-toc-rail-bulge-half-height", 52),
      labelGap: cssNumber(railStyle, "--reading-toc-rail-label-gap", 12),
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
      tocVisible,
    };
    this.indicatorDirty = true;

    if (railEligible && railGeometry) {
      this.enableRail(railGeometry);
    } else {
      this.disableRail(true);
    }
  }

  private enableRail(geometry: ReadingTocRailGeometry): void {
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
      const railHeadings: ReadingTocRailHeading[] = this.headings.map((heading) => ({
        id: heading.id,
        text: heading.text,
        level: heading.level,
        ratio: heading.railRatio,
        ariaLabel: english ? `Jump to section: ${heading.text}` : `跳转到章节：${heading.text}`,
      }));
      this.rail.setHeadings(railHeadings);
      this.railHeadingsReady = true;
    } else {
      this.rail.updateHeadingRatios(this.headings.map((heading) => heading.railRatio));
    }

    this.railRoot.setAttribute("aria-label", english ? "Reading outline" : "阅读目录");
  }

  private disableRail(clear: boolean): void {
    this.stage.classList.remove("has-reading-rail", "is-reading");
    this.stage.removeAttribute("data-rail-direction");
    this.isReadingMode = false;
    this.toc.removeAttribute("aria-hidden");
    this.railRoot.setAttribute("aria-hidden", "true");
    this.rail?.setInteractive(false);

    if (clear && this.rail) {
      this.rail.destroy();
      this.rail = null;
      this.railHeadingsReady = false;
    }
  }

  private readingModeFor(activationY: number, metrics: TocMetrics): boolean {
    if (!metrics.railEligible) return false;
    if (this.isReadingMode) {
      return activationY >= metrics.headerBottom - MODE_HYSTERESIS;
    }
    return activationY >= metrics.headerBottom + MODE_HYSTERESIS;
  }

  private setReadingMode(reading: boolean): void {
    if (reading === this.isReadingMode) return;
    this.isReadingMode = reading;
    this.stage.classList.toggle("is-reading", reading);

    if (reading) {
      this.toc.setAttribute("aria-hidden", "true");
    } else {
      this.toc.removeAttribute("aria-hidden");
    }

    this.railRoot.setAttribute("aria-hidden", reading ? "false" : "true");
    this.rail?.setInteractive(reading);
  }

  private updateActiveHeading(
    index: number,
    tocListTop: number,
    tocScrollTop: number,
    showIndicator: boolean,
  ): void {
    const heading = this.headings[index];
    if (!heading) return;

    let activeChanged = false;
    if (index !== this.activeIndex) {
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
      activeChanged = true;
    }

    if (!showIndicator) {
      this.indicatorDirty = true;
      return;
    }

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

    const startIdx = index;
    const endIdx = firstVis !== -1 ? Math.max(index, lastVis) : index;
    
    const startHeading = this.headings[startIdx];
    const endHeading = this.headings[endIdx];
    
    if (!startHeading || !endHeading) return;

    const indicatorTop = tocListTop + startHeading.tocTop - tocScrollTop;
    const indicatorHeight = Math.max(1, endHeading.tocTop + endHeading.tocHeight - startHeading.tocTop);

    if (
      !activeChanged
      && !this.indicatorDirty
      && indicatorTop === this.indicatorTop
      && indicatorHeight === this.indicatorHeight
    ) {
      return;
    }

    this.indicatorDirty = false;
    this.indicatorTop = indicatorTop;
    this.indicatorHeight = indicatorHeight;
    this.tocIndicator.style.opacity = "1";
    this.tocIndicator.style.transform = `translateY(${indicatorTop}px) scaleY(${indicatorHeight})`;
  }
}

let activeController: NoteTocController | null = null;

function collectHeadingEntries(
  postContent: HTMLElement,
  tocPanel: HTMLElement,
): TocHeadingEntry[] {
  const links = Array.from(tocPanel.querySelectorAll<HTMLAnchorElement>('a[href^="#"]'));
  const linksById = new Map<string, HTMLAnchorElement>();

  links.forEach((link) => {
    const id = headingIdFromLink(link);
    if (id) linksById.set(id, link);
  });

  return Array.from(postContent.querySelectorAll<HTMLElement>("h1, h2, h3, h4, h5, h6"))
    .map((element): TocHeadingEntry | null => {
      const link = linksById.get(element.id);
      const item = link?.closest<HTMLElement>("li");
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
        tocHeight: 1,
      };
    })
    .filter((entry): entry is TocHeadingEntry => entry !== null);
}

function initNoteTocController(): void {
  activeController?.destroy();
  activeController = null;

  document.querySelectorAll<HTMLElement>(".note-toc").forEach(syncNoteToc);

  const stage = document.querySelector<HTMLElement>("[data-note-toc-stage]");
  const toc = stage?.querySelector<HTMLElement>("[data-note-toc]");
  const tocPanel = toc?.querySelector<HTMLElement>(".note-toc-panel");
  const tocList = tocPanel?.querySelector<HTMLOListElement>("ol");
  const railRoot = stage?.querySelector<HTMLElement>("[data-reading-toc-rail]");
  const note = document.querySelector<HTMLElement>(".note");
  const noteHeader = note?.querySelector<HTMLElement>(".note-header");
  const postContent = note?.querySelector<HTMLElement>(".post-content");
  const tocWrapper = stage?.closest<HTMLElement>(".note-toc-wrapper");

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
    headings,
  );
  activeController.init();
}

window.daybookSyncNoteTocs = initNoteTocController;

document.addEventListener("daybook:before-swap", () => {
  activeController?.destroy();
  activeController = null;
});
document.addEventListener("daybook:page-load", initNoteTocController);
document.addEventListener("daybook:article-content-swapped", initNoteTocController);
document.addEventListener("daybook:transition-finished", () => {
  activeController?.requestMeasure(true);
});

document.addEventListener("click", (event: MouseEvent) => {
  const target = event.target as HTMLElement;
  const tocToggle = target.closest<HTMLElement>(".note-toc-toggle");
  if (!tocToggle) return;

  const toc = tocToggle.closest<HTMLElement>(".note-toc");
  if (!toc) return;

  toc.classList.toggle("is-open");
  syncNoteToc(toc);
  activeController?.requestMeasure();
});

initNoteTocController();
