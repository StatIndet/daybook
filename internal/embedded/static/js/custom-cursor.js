// assets/ts/custom-cursor.ts
import { IdleClockController } from "../../../../assets/ts/custom-cursor-clock.js";
var isInitialized = false;
var cursorEl = null;
var rafId = null;
var clockController = null;
var mouseX = window.innerWidth / 2;
var mouseY = window.innerHeight / 2;
var cursorX = mouseX;
var cursorY = mouseY;
var isMoving = false;
var currentState = "default";
var isClockActive = false;
var lastMoveTime = performance.now();
var lastMoveX = mouseX;
var lastMoveY = mouseY;
var BREAK_SPEED = 3;
var selectors = {
  hover: 'a, button, [role="button"], summary, .note-card, .nav-link, .theme-toggle, .mobile-drawer-button, .graph-toolbar button, .copy-button',
  text: 'p, li, blockquote, .post-content, input, textarea, select, [contenteditable="true"], pre, code, .search-input',
  zoom: '.post-content img:not(.no-lightbox):not([data-no-lightbox="true"]), .gallery-image, .zoom-img'
};
function updateCursorPosition() {
  cursorX = mouseX;
  cursorY = mouseY;
  if (cursorEl) {
    cursorEl.style.transform = `translate3d(${cursorX}px, ${cursorY}px, 0)`;
  }
  if (Math.abs(mouseX - cursorX) > 0.1 || Math.abs(mouseY - cursorY) > 0.1) {
    rafId = requestAnimationFrame(updateCursorPosition);
  } else {
    isMoving = false;
  }
}
function breakIdleClock(snap = false) {
  isClockActive = false;
  if (!clockController) return;
  if (snap) {
    clockController.snap();
  } else {
    clockController.stop();
  }
}
function handlePointerMove(e) {
  mouseX = e.clientX;
  mouseY = e.clientY;
  const now = performance.now();
  const dt = Math.max(now - lastMoveTime, 16);
  const dx = mouseX - lastMoveX;
  const dy = mouseY - lastMoveY;
  const distSq = dx * dx + dy * dy;
  if (isClockActive && clockController) {
    let speed = 0;
    if (dt > 0) speed = Math.sqrt(distSq) / dt;
    if (speed > BREAK_SPEED) {
      breakIdleClock(true);
    } else {
      clockController.updateTarget(mouseX, mouseY);
    }
  }
  lastMoveTime = now;
  lastMoveX = mouseX;
  lastMoveY = mouseY;
  if (!isMoving) {
    isMoving = true;
    rafId = requestAnimationFrame(updateCursorPosition);
  }
}
function setState(state) {
  if (currentState === state || !cursorEl) return;
  currentState = state;
  cursorEl.dataset.cursorState = state;
  if (state !== "default" && state !== "hidden") {
    isClockActive = false;
    if (clockController) clockController.stop();
  }
}
function updateStateFromTarget(target) {
  if (!target) {
    setState("default");
    return;
  }
  if (target.closest(".settings-overlay")) {
    setState("hidden");
    return;
  }
  const zoomMatch = target.closest(selectors.zoom);
  if (zoomMatch) {
    setState("zoom");
    return;
  }
  const hoverMatch = target.closest(selectors.hover);
  if (hoverMatch) {
    setState("hover");
    return;
  }
  const textMatch = target.closest(selectors.text);
  if (textMatch) {
    setState("text");
    return;
  }
  setState("default");
}
function handleMouseOver(e) {
  updateStateFromTarget(e.target);
}
function handleMouseDown() {
  if (cursorEl) cursorEl.classList.add("is-active");
}
function handleMouseUp() {
  if (cursorEl) cursorEl.classList.remove("is-active");
}
function handleMouseLeave(e) {
  if (e.relatedTarget === null) {
    setState("hidden");
  }
}
function handleMouseEnter(e) {
  updateStateFromTarget(e.target);
}
function handleClick(e) {
  const path = window.location.pathname;
  if (path.startsWith("/graph/") || path.startsWith("/about/")) {
    return;
  }
  if (document.documentElement.getAttribute("data-clock-cursor") !== "true") {
    return;
  }
  if (isClockActive) {
    breakIdleClock(false);
  } else {
    if (currentState === "default" && clockController) {
      isClockActive = true;
      clockController.start(cursorX, cursorY);
    }
  }
}
function handleVisibilityChange() {
  if (document.hidden) breakIdleClock(false);
  else if (clockController) clockController.updateColors();
}
function handlePageLoad() {
  breakIdleClock(false);
}
function setupCustomCursor() {
  if (typeof window === "undefined" || isInitialized) return;
  const isTouch = window.matchMedia("(hover: none), (pointer: coarse)").matches;
  const isMobileSize = window.matchMedia("(max-width: 768px)").matches;
  if (isTouch || isMobileSize) return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  if (document.documentElement.getAttribute("data-use-system-cursor") === "true") return;
  if (!cursorEl) {
    cursorEl = document.createElement("div");
    cursorEl.className = "daybook-cursor";
    cursorEl.setAttribute("aria-hidden", "true");
    cursorEl.dataset.cursorState = "default";
    const coreEl = document.createElement("div");
    coreEl.className = "daybook-cursor__core";
    cursorEl.appendChild(coreEl);
    const viewfinderEl = document.createElement("div");
    viewfinderEl.className = "daybook-cursor__viewfinder";
    for (let i = 0; i < 4; i++) {
      const corner = document.createElement("div");
      corner.className = "daybook-cursor__corner";
      viewfinderEl.appendChild(corner);
    }
    cursorEl.appendChild(viewfinderEl);
  }
  if (!document.body.contains(cursorEl)) {
    document.body.appendChild(cursorEl);
  }
  document.documentElement.classList.add("has-custom-cursor");
  if (!clockController) {
    clockController = new IdleClockController();
  }
  mouseX = window.innerWidth / 2;
  mouseY = window.innerHeight / 2;
  cursorX = mouseX;
  cursorY = mouseY;
  isMoving = false;
  currentState = "default";
  isClockActive = false;
  lastMoveTime = performance.now();
  lastMoveX = mouseX;
  lastMoveY = mouseY;
  document.addEventListener("pointermove", handlePointerMove, { passive: true });
  document.addEventListener("mouseover", handleMouseOver, { passive: true });
  document.addEventListener("mousedown", handleMouseDown, { passive: true });
  document.addEventListener("mouseup", handleMouseUp, { passive: true });
  document.addEventListener("mouseleave", handleMouseLeave);
  document.addEventListener("mouseenter", handleMouseEnter);
  document.addEventListener("click", handleClick, { passive: true });
  document.addEventListener("visibilitychange", handleVisibilityChange);
  document.addEventListener("daybook:page-load", handlePageLoad);
  isInitialized = true;
}
function teardownCustomCursor() {
  if (!isInitialized) return;
  document.removeEventListener("pointermove", handlePointerMove);
  document.removeEventListener("mouseover", handleMouseOver);
  document.removeEventListener("mousedown", handleMouseDown);
  document.removeEventListener("mouseup", handleMouseUp);
  document.removeEventListener("mouseleave", handleMouseLeave);
  document.removeEventListener("mouseenter", handleMouseEnter);
  document.removeEventListener("click", handleClick);
  document.removeEventListener("visibilitychange", handleVisibilityChange);
  document.removeEventListener("daybook:page-load", handlePageLoad);
  if (rafId !== null) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
  if (clockController) {
    clockController.destroy();
    clockController = null;
  }
  if (cursorEl) {
    if (cursorEl.parentNode) {
      cursorEl.parentNode.removeChild(cursorEl);
    }
    cursorEl = null;
  }
  document.documentElement.classList.remove("has-custom-cursor");
  isInitialized = false;
}
setupCustomCursor();
document.addEventListener("daybook:settings-change", (e) => {
  const settings = e.detail;
  if (settings.useSystemCursor) {
    teardownCustomCursor();
  } else {
    setupCustomCursor();
  }
});
//# sourceMappingURL=custom-cursor.js.map
