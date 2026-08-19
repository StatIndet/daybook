// assets/ts/toc.ts
import {
  ReadingTocRail
} from "../../../../assets/ts/toc/reading-toc-rail";
var RAIL_MEDIA_QUERY = "(min-width: 116rem)";
var MOTION_MEDIA_QUERY = "(prefers-reduced-motion: reduce)";
var DEFAULT_ACTIVATION_LINE = 96;
var DEFAULT_BOTTOM_INSET = 96;
var MIN_HEADING_COUNT = 2;
var MIN_READING_TRAVEL = 240;
var MIN_RAIL_HEIGHT = 320;
var MIN_RAIL_WIDTH = 160;
var MODE_HYSTERESIS = 8;
var MAX_SCROLL_SPEED = 5e3;
var GEOMETRY_EPSILON = 1;
function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
function finiteOr(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}
function cssNumber(style, name, fallback) {
  const value = Number.parseFloat(style.getPropertyValue(name));
  return finiteOr(value, fallback);
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
        clamp(finiteOr(speed, 0), 0, MAX_SCROLL_SPEED)
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
          const progress = clamp(
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
      heading.railRatio = contentHeight > 0 ? clamp((heading.documentY - contentTop) / contentHeight, 0, 1) : 0;
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
//# sourceMappingURL=toc.js.map
