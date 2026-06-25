import { IdleClockController } from "./custom-cursor-clock";

(() => {
  if (typeof window === "undefined") return;
  
  // Try to avoid touch devices that don't support hover well
  if (window.matchMedia("(hover: none)").matches) return;

  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    return;
  }

  if (document.querySelector(".daybook-cursor")) {
    return;
  }

  const cursorEl = document.createElement("div");
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
  
  document.body.appendChild(cursorEl);
  document.documentElement.classList.add("has-custom-cursor");

  let mouseX = window.innerWidth / 2;
  let mouseY = window.innerHeight / 2;
  let cursorX = mouseX;
  let cursorY = mouseY;
  let isMoving = false;
  let rafId: number | null = null;
  let currentState = "default";

  const clockController = new IdleClockController();
  const IDLE_DELAY = 2000;
  // 阈值加大：只基于速度判断。移动速度超过 6.0 px/ms 时触发拉断
  const BREAK_SPEED = 3.0;
  
  let idleTimer: number | null = null;
  let isClockActive = false;
  let lastMoveTime = performance.now();
  let lastMoveX = mouseX;
  let lastMoveY = mouseY;

  const lerpFactor = 0.3;
  
  const selectors = {
    hover: 'a, button, [role="button"], summary, .note-card, .nav-link, .theme-toggle, .mobile-drawer-button, .graph-toolbar button, .copy-button',
    text: 'p, li, blockquote, .post-content, input, textarea, select, [contenteditable="true"], pre, code, .search-input',
    zoom: '.post-content img:not(.no-lightbox):not([data-no-lightbox="true"]), .gallery-image, .zoom-img'
  };

  function updateCursorPosition() {
    cursorX += (mouseX - cursorX) * lerpFactor;
    cursorY += (mouseY - cursorY) * lerpFactor;
    
    cursorEl.style.transform = `translate3d(${cursorX}px, ${cursorY}px, 0)`;
    
    if (Math.abs(mouseX - cursorX) > 0.1 || Math.abs(mouseY - cursorY) > 0.1) {
      rafId = requestAnimationFrame(updateCursorPosition);
    } else {
      isMoving = false;
    }
  }

  function resetIdleTimer() {
    if (idleTimer) {
      clearTimeout(idleTimer);
      idleTimer = null;
    }
    const path = window.location.pathname;
    // 严格白名单：仅在首页显示时钟
    if (path !== "/") {
      return;
    }
    if (currentState === "default") {
      idleTimer = window.setTimeout(() => {
        isClockActive = true;
        clockController.start(cursorX, cursorY);
      }, IDLE_DELAY);
    }
  }

  function breakIdleClock(snap = false) {
    isClockActive = false;
    if (snap) {
      clockController.snap();
    } else {
      clockController.stop();
    }
    resetIdleTimer();
  }

  function handlePointerMove(e: PointerEvent) {
    mouseX = e.clientX;
    mouseY = e.clientY;
    
    const now = performance.now();
    // 强制 dt 至少为 16ms（约等于 60fps 的一帧），防止微秒级事件连发导致的瞬间速度无限大 Bug
    const dt = Math.max(now - lastMoveTime, 16); 
    const dx = mouseX - lastMoveX;
    const dy = mouseY - lastMoveY;
    const distSq = dx * dx + dy * dy;
    
    if (isClockActive) {
      let speed = 0;
      if (dt > 0) speed = Math.sqrt(distSq) / dt;
      
      if (speed > BREAK_SPEED) {
        breakIdleClock(true);
      } else {
        clockController.updateTarget(mouseX, mouseY);
      }
    } else {
      resetIdleTimer();
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
    if (currentState === state) return;
    currentState = state;
    cursorEl.dataset.cursorState = state;

    if (state !== "default" && state !== "hidden") {
      isClockActive = false;
      clockController.stop();
      if (idleTimer) {
        clearTimeout(idleTimer);
        idleTimer = null;
      }
    } else if (state === "default") {
      resetIdleTimer();
    }
  }
  
  function updateStateFromTarget(target: HTMLElement | null) {
    if (!target) {
      setState("default");
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
    updateStateFromTarget(e.target as HTMLElement);
  }

  function handleMouseDown() {
    cursorEl.classList.add("is-active");
  }

  function handleMouseUp() {
    cursorEl.classList.remove("is-active");
  }

  function handleMouseLeave(e: MouseEvent) {
    if (e.relatedTarget === null) {
      setState("hidden");
    }
  }
  
  function handleMouseEnter(e: MouseEvent) {
    updateStateFromTarget(e.target as HTMLElement);
  }

  document.addEventListener("pointermove", handlePointerMove, { passive: true });
  document.addEventListener("mouseover", handleMouseOver, { passive: true });
  document.addEventListener("mousedown", handleMouseDown, { passive: true });
  document.addEventListener("mouseup", handleMouseUp, { passive: true });
  document.addEventListener("mouseleave", handleMouseLeave);
  document.addEventListener("mouseenter", handleMouseEnter);

  function handleInteraction() {
    breakIdleClock();
  }

  document.addEventListener("scroll", handleInteraction, { passive: true });
  document.addEventListener("click", handleInteraction, { passive: true });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) handleInteraction();
    else clockController.updateColors();
  });

  // Fallback for SPA routing to re-eval hover state
  document.addEventListener("daybook:page-load", () => {
    const path = window.location.pathname;
    if (path !== "/") {
      breakIdleClock(); // 原地倒序坍缩退出
    }
  });
})();
