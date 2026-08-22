// assets/ts/custom-cursor-clock.ts
var IdleClockController = class {
  constructor() {
    this.rafId = null;
    this.state = "hidden";
    this.width = 0;
    this.height = 0;
    this.cursor = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    // Physics & Animation Arrays
    this.dy = new Float64Array(200);
    this.dx = new Float64Array(200);
    this.zy = new Float64Array(200);
    this.zx = new Float64Array(200);
    this.pscale = new Float64Array(200);
    this.popacity = new Float64Array(200);
    this.pradiusOffset = new Float64Array(200);
    this.pdx = new Float64Array(200);
    this.pdy = new Float64Array(200);
    this.vx = new Float64Array(200);
    this.vy = new Float64Array(200);
    this.sum = 0;
    this.theDays = ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"];
    this.theMonths = ["JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE", "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER"];
    this.dateInWords = [];
    this.clockNumbers = ["3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "1", "2"];
    this.hourHand = ["\u2022", "\u2022", "\u2022"];
    this.minuteHand = ["\u2022", "\u2022", "\u2022", "\u2022"];
    this.secondHand = ["\u2022", "\u2022", "\u2022", "\u2022", "\u2022"];
    this.F = this.clockNumbers.length;
    this.siz = 70;
    // Increased size for new hand geometry
    this.eqf = 360 / this.F;
    this.eqd = 0;
    this.han = 12;
    // Fixed 12px gap between 8px dots
    this.colors = {
      main: "",
      text: "",
      muted: ""
    };
    this.lastDateString = "";
    this.canvas = document.createElement("canvas");
    this.canvas.className = "daybook-cursor-clock";
    this.canvas.setAttribute("aria-hidden", "true");
    this.ctx = this.canvas.getContext("2d");
    document.body.appendChild(this.canvas);
    this.sum = this.dateInWords.length + this.F + this.hourHand.length + this.minuteHand.length + this.secondHand.length + 1;
    for (let i = 0; i < 200; i++) {
      this.dy[i] = 0;
      this.dx[i] = 0;
      this.zy[i] = 0;
      this.zx[i] = 0;
      this.pscale[i] = 0;
      this.popacity[i] = 0;
      this.pradiusOffset[i] = -15;
      this.vx[i] = 0;
      this.vy[i] = 0;
    }
    this.onResizeBound = () => this.onResize();
    this.onResize();
    window.addEventListener("resize", this.onResizeBound, { passive: true });
    this.updateDateWords();
  }
  onResize() {
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = this.width * dpr;
    this.canvas.height = this.height * dpr;
    this.canvas.style.width = `${this.width}px`;
    this.canvas.style.height = `${this.height}px`;
    this.ctx.scale(dpr, dpr);
  }
  updateColors() {
    const computed = getComputedStyle(document.body);
    this.colors.main = computed.getPropertyValue("--color-accent").trim() || "blue";
    this.colors.text = computed.getPropertyValue("--color-text").trim() || "black";
    this.colors.muted = computed.getPropertyValue("--color-muted").trim() || "gray";
  }
  updateDateWords() {
    const date = /* @__PURE__ */ new Date();
    const day = date.getDate();
    const year = date.getFullYear();
    const newDateString = ` ${this.theDays[date.getDay()]} ${this.theMonths[date.getMonth()]} ${day} ${year} `;
    if (newDateString !== this.lastDateString) {
      this.lastDateString = newDateString;
      this.dateInWords = newDateString.split("");
      this.eqd = 360 / this.dateInWords.length;
      this.sum = this.dateInWords.length + this.F + this.hourHand.length + this.minuteHand.length + this.secondHand.length + 1;
    }
  }
  updateTarget(x, y) {
    this.cursor.x = x;
    this.cursor.y = y;
  }
  start(x, y) {
    if (this.state === "entering" || this.state === "active") return;
    this.updateTarget(x, y);
    if (this.state === "hidden" || this.state === "snapped") {
      for (let i = 0; i < this.sum; i++) {
        this.dx[i] = 0;
        this.dy[i] = 0;
        this.pdx[i] = 0;
        this.pdy[i] = 0;
        this.zx[i] = 0;
        this.zy[i] = 0;
        this.pscale[i] = 1;
        this.popacity[i] = 0;
        this.pradiusOffset[i] = 0;
      }
    }
    this.updateColors();
    this.updateDateWords();
    this.canvas.classList.add("is-visible");
    this.state = "entering";
    if (!this.rafId) {
      this.loop();
    }
  }
  stop() {
    if (this.state === "hidden" || this.state === "exiting" || this.state === "snapped") return;
    this.state = "exiting";
  }
  destroy() {
    this.state = "hidden";
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    if (this.canvas && this.canvas.parentNode) {
      this.canvas.parentNode.removeChild(this.canvas);
    }
    window.removeEventListener("resize", this.onResizeBound);
  }
  snap() {
    if (this.state === "hidden" || this.state === "snapped") return;
    this.state = "snapped";
    for (let i = 0; i < this.sum; i++) {
      this.vx[i] = this.dx[i] - this.pdx[i];
      this.vy[i] = this.dy[i] - this.pdy[i];
    }
  }
  loop() {
    let allDone = true;
    if (this.state === "entering") {
      for (let i = 0; i < this.sum; i++) {
        this.popacity[i] += (1 - this.popacity[i]) * 0.3;
      }
      if (Math.abs(this.dy[this.sum - 1] - this.cursor.y) < 2) {
        allDone = true;
      } else {
        allDone = false;
      }
      if (allDone) this.state = "active";
    } else if (this.state === "exiting") {
      for (let i = 0; i < this.sum; i++) {
        if (i === this.sum - 1 || this.pscale[i + 1] < 0.8) {
          this.pscale[i] += (0 - this.pscale[i]) * 0.08;
          this.popacity[i] += (0 - this.popacity[i]) * 0.08;
        }
        if (this.pscale[i] > 0.01) allDone = false;
      }
      if (allDone) {
        this.state = "hidden";
        this.canvas.classList.remove("is-visible");
      }
    } else if (this.state === "snapped") {
      for (let i = 0; i < this.sum; i++) {
        this.dx[i] += this.vx[i];
        this.dy[i] += this.vy[i];
        this.vx[i] *= 0.96;
        this.vy[i] *= 0.96;
        this.popacity[i] -= 0.01;
        if (this.popacity[i] > 0) allDone = false;
        else this.popacity[i] = 0;
      }
      if (allDone) {
        this.state = "hidden";
        this.canvas.classList.remove("is-visible");
      }
    } else if (this.state === "active") {
      allDone = false;
    }
    if (this.state === "hidden") {
      this.rafId = null;
      this.ctx.clearRect(0, 0, this.width, this.height);
      return;
    }
    if (this.state !== "snapped") {
      this.updatePositions();
    }
    this.draw();
    this.rafId = requestAnimationFrame(() => this.loop());
  }
  updatePositions() {
    const del = 0.4;
    for (let i = 0; i < this.sum; i++) {
      this.pdx[i] = this.dx[i];
      this.pdy[i] = this.dy[i];
    }
    this.zy[0] = this.dy[0] += (this.cursor.y - this.dy[0]) * del;
    this.zx[0] = this.dx[0] += (this.cursor.x - this.dx[0]) * del;
    for (let i = 1; i < this.sum; i++) {
      this.zy[i] = this.dy[i] += (this.zy[i - 1] - this.dy[i]) * del;
      this.zx[i] = this.dx[i] += (this.zx[i - 1] - this.dx[i]) * del;
    }
  }
  drawParticle(idx, x, y, text, color) {
    if (this.popacity[idx] <= 0) return;
    this.ctx.save();
    this.ctx.translate(x, y);
    this.ctx.scale(this.pscale[idx], this.pscale[idx]);
    this.ctx.globalAlpha = this.popacity[idx];
    this.ctx.fillStyle = color;
    if (text === "\u2022") {
      this.ctx.beginPath();
      this.ctx.arc(0, 0, 4, 0, Math.PI * 2);
      this.ctx.fill();
    } else {
      this.ctx.fillText(text, 0, 0);
    }
    this.ctx.restore();
  }
  draw() {
    this.ctx.clearRect(0, 0, this.width, this.height);
    const time = /* @__PURE__ */ new Date();
    const secs = time.getSeconds();
    const sec = Math.PI * (secs - 15) / 30;
    const mins = time.getMinutes();
    const min = Math.PI * (mins - 15) / 30;
    const hrs = time.getHours();
    const hr = Math.PI * (hrs - 3) / 6 + Math.PI * time.getMinutes() / 360;
    this.ctx.font = "normal 14px 'Maple Mono CN', 'Maple Mono', monospace";
    this.ctx.textAlign = "center";
    this.ctx.textBaseline = "middle";
    for (let i = 0; i < this.dateInWords.length; i++) {
      const rad = this.siz * 1.5 + this.pradiusOffset[i];
      const y = this.dy[i] + rad * Math.sin(-sec + i * this.eqd * Math.PI / 180);
      const x = this.dx[i] + rad * Math.cos(-sec + i * this.eqd * Math.PI / 180);
      this.drawParticle(i, x, y, this.dateInWords[i], this.colors.muted);
    }
    for (let i = 0; i < this.clockNumbers.length; i++) {
      const idx = this.dateInWords.length + i;
      const rad = this.siz + this.pradiusOffset[idx];
      const y = this.dy[idx] + rad * Math.sin(i * this.eqf * Math.PI / 180);
      const x = this.dx[idx] + rad * Math.cos(i * this.eqf * Math.PI / 180);
      this.drawParticle(idx, x, y, this.clockNumbers[i], this.colors.text);
    }
    for (let i = 0; i < this.hourHand.length; i++) {
      const idx = this.dateInWords.length + this.F + i;
      const rad = i * this.han + this.pradiusOffset[idx];
      const y = this.dy[idx] + rad * Math.sin(hr);
      const x = this.dx[idx] + rad * Math.cos(hr);
      this.drawParticle(idx, x, y, this.hourHand[i], this.colors.text);
    }
    for (let i = 0; i < this.minuteHand.length; i++) {
      const idx = this.dateInWords.length + this.F + this.hourHand.length + i;
      const rad = i * this.han + this.pradiusOffset[idx];
      const y = this.dy[idx] + rad * Math.sin(min);
      const x = this.dx[idx] + rad * Math.cos(min);
      this.drawParticle(idx, x, y, this.minuteHand[i], this.colors.text);
    }
    for (let i = 0; i < this.secondHand.length; i++) {
      const idx = this.dateInWords.length + this.F + this.hourHand.length + this.minuteHand.length + i;
      const rad = i * this.han + this.pradiusOffset[idx];
      const y = this.dy[idx] + rad * Math.sin(sec);
      const x = this.dx[idx] + rad * Math.cos(sec);
      this.drawParticle(idx, x, y, this.secondHand[i], this.colors.main);
    }
  }
};

// assets/ts/custom-cursor.ts
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
