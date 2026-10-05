import { IdleClockController } from "./custom-cursor-clock.js";
import { LiquidCursor } from './liquid-cursor';
import { reducedMotion } from './text-roll';

let isInitialized = false;
let cursorEl: HTMLDivElement | null = null;
let rafId: number | null = null;
let clockController: IdleClockController | null = null;
let liquid: LiquidCursor | null = null;
let isBusy = false;
let pointerInside = false;
const eligiblePointer = matchMedia('(min-width: 961px) and (hover: hover) and (pointer: fine)');
const motionPreference = matchMedia('(prefers-reduced-motion: reduce)');

let mouseX = window.innerWidth / 2;
let mouseY = window.innerHeight / 2;
let cursorX = mouseX;
let cursorY = mouseY;
let isMoving = false;
let currentState = "default";
let isClockActive = false;
let lastMoveTime = performance.now();
let lastMoveX = mouseX;
let lastMoveY = mouseY;
const BREAK_SPEED = 3.0;

const selectors = {
  hover: 'a, button, [role="button"], summary, .note-card, .memo-card[data-memo-card], .nav-link, .theme-toggle, .mobile-drawer-button, .graph-toolbar button, .copy-button',
  text: 'p, li, blockquote, .post-content, input, textarea, select, [contenteditable="true"], pre, code, .search-input',
  zoom: '.post-content img:not(.no-lightbox):not([data-no-lightbox="true"]), .gallery-image, .zoom-img'
};

function updateCursorPosition() {
  cursorX = mouseX;
  cursorY = mouseY;
  
  if (cursorEl) {
    cursorEl.style.transform = `translate3d(${cursorX}px, ${cursorY}px, 0)`;
  }
  
  isMoving = false;
  rafId = null;
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

function handlePointerMove(e: PointerEvent) {
  if (e.pointerType === 'touch') return;
  pointerInside = true;
  mouseX = e.clientX;
  mouseY = e.clientY;
  updateStateFromTarget(e.target);
  
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

function setState(state: string) {
  if (currentState === state || !cursorEl) return;
  currentState = state;
  cursorEl.dataset.cursorState = state;
  syncLoading();

  if (state !== "default" && state !== "hidden") {
    isClockActive = false;
    if (clockController) clockController.stop();
  }
}

function updateStateFromTarget(target: EventTarget | null) {
  if (!pointerInside) { setState('hidden'); return; }
  if (!(target instanceof Element)) {
    setState("default");
    return;
  }
  if (target.closest('.settings-overlay')) {
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

function handleMouseOver(e: MouseEvent) {
  updateStateFromTarget(e.target);
}

function handleMouseDown() {
  if (cursorEl) cursorEl.classList.add("is-active");
}

function handleMouseUp() {
  if (cursorEl) cursorEl.classList.remove("is-active");
}

function handleMouseLeave(e: MouseEvent) {
  if (e.relatedTarget === null) {
    pointerInside = false;
    setState("hidden");
  }
}

function handleMouseEnter(e: MouseEvent) {
  pointerInside = true;
  updateStateFromTarget(e.target);
}

function handleClick(e: MouseEvent) {
  if (document.documentElement.dataset.navigationPending === 'true') return;
  if (document.documentElement.getAttribute('data-clock-cursor') !== 'true') {
    return;
  }
  if (isClockActive) {
    breakIdleClock(false);
  } else {
    if (currentState === "default") {
      clockController ||= new IdleClockController();
      isClockActive = true;
      clockController.start(cursorX, cursorY);
    }
  }
}

function handleVisibilityChange() {
  if (document.hidden) breakIdleClock(false);
  else if (clockController) clockController.updateColors();
  syncLoading();
}

function handlePageLoad() {
  breakIdleClock(false);
  updateStateFromTarget(document.elementFromPoint(mouseX, mouseY));
}

function syncLoading() {
  if (!cursorEl || !liquid) return;
  const busy = document.documentElement.dataset.navigationLoading === 'true' &&
    currentState !== 'hidden' && !document.hidden;
  if (busy === isBusy) return;
  isBusy = busy;
  if (busy) {
    isClockActive = false;
    clockController?.destroy();
    clockController = null;
    liquid.start();
  } else {
    liquid.stop(currentState === 'hidden' || document.hidden);
  }
}

function setupCustomCursor() {
  if (typeof window === "undefined" || isInitialized) return;
  
  if (!eligiblePointer.matches || reducedMotion()) return;
  if (document.documentElement.getAttribute('data-use-system-cursor') === 'true') return;

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
    liquid = new LiquidCursor();
    cursorEl.append(liquid.element);
  }
  
  if (!document.body.contains(cursorEl)) {
    document.body.appendChild(cursorEl);
  }
  
  document.documentElement.classList.add("has-custom-cursor");

  if (!clockController) {
    clockController = new IdleClockController();
  }

  cursorX = mouseX;
  cursorY = mouseY;
  isMoving = false;
  currentState = pointerInside ? 'default' : 'hidden';
  cursorEl.dataset.cursorState = currentState;
  isBusy = false;
  isClockActive = false;
  lastMoveTime = performance.now();
  lastMoveX = mouseX;
  lastMoveY = mouseY;

  document.addEventListener("mouseover", handleMouseOver, { passive: true });
  document.addEventListener("mousedown", handleMouseDown, { passive: true });
  document.addEventListener("mouseup", handleMouseUp, { passive: true });
  document.addEventListener("mouseleave", handleMouseLeave);
  document.addEventListener("mouseenter", handleMouseEnter);
  document.addEventListener("click", handleClick, { passive: true });
  document.addEventListener("visibilitychange", handleVisibilityChange);
  document.addEventListener("daybook:page-load", handlePageLoad);
  document.addEventListener('daybook:navigation-loading', syncLoading);

  isInitialized = true;
  updateStateFromTarget(document.elementFromPoint(mouseX, mouseY));
  updateCursorPosition();
  syncLoading();
}

function teardownCustomCursor() {
  if (!isInitialized) return;

  document.removeEventListener("mouseover", handleMouseOver);
  document.removeEventListener("mousedown", handleMouseDown);
  document.removeEventListener("mouseup", handleMouseUp);
  document.removeEventListener("mouseleave", handleMouseLeave);
  document.removeEventListener("mouseenter", handleMouseEnter);
  document.removeEventListener("click", handleClick);
  document.removeEventListener("visibilitychange", handleVisibilityChange);
  document.removeEventListener("daybook:page-load", handlePageLoad);
  document.removeEventListener('daybook:navigation-loading', syncLoading);
  liquid?.destroy();
  liquid = null;
  isBusy = false;

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

function syncCursorAvailability() {
  if (!eligiblePointer.matches || reducedMotion() || document.documentElement.dataset.useSystemCursor === 'true') {
    teardownCustomCursor();
  } else {
    setupCustomCursor();
  }
}

syncCursorAvailability();
// Remember the hotspot while the native cursor is in use as well. Re-enabling
// the custom cursor must not jump it to the middle of the screen.
document.addEventListener('pointermove', event => {
  if (event.pointerType === 'touch') return;
  if (isInitialized) handlePointerMove(event);
  else {
    mouseX = event.clientX;
    mouseY = event.clientY;
    pointerInside = true;
  }
}, { passive: true });
eligiblePointer.addEventListener('change', syncCursorAvailability);
motionPreference.addEventListener('change', syncCursorAvailability);
document.addEventListener('daybook:settings-change', syncCursorAvailability);
new MutationObserver(syncCursorAvailability).observe(document.documentElement, {
  attributes: true, attributeFilter: ['data-use-system-cursor', 'data-reduced-motion']
});
