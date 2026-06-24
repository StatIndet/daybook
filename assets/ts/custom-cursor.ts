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

  function handleMouseMove(e: MouseEvent) {
    mouseX = e.clientX;
    mouseY = e.clientY;
    
    if (!isMoving) {
      isMoving = true;
      rafId = requestAnimationFrame(updateCursorPosition);
    }
  }
  
  function setState(state: string) {
    if (currentState === state) return;
    currentState = state;
    cursorEl.dataset.cursorState = state;
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

  document.addEventListener("mousemove", handleMouseMove, { passive: true });
  document.addEventListener("mouseover", handleMouseOver, { passive: true });
  document.addEventListener("mousedown", handleMouseDown, { passive: true });
  document.addEventListener("mouseup", handleMouseUp, { passive: true });
  document.addEventListener("mouseleave", handleMouseLeave);
  document.addEventListener("mouseenter", handleMouseEnter);

  // Fallback for SPA routing to re-eval hover state
  document.addEventListener("daybook:page-load", () => {
    // If needed, we can re-evaluate hover state, but generally the next mousemove handles it smoothly.
  });
})();
