(function () {
  type State = "idle" | "opening" | "open" | "switching" | "closing";
  type Frame = { left: number; top: number; width: number; height: number };

  class LightboxController {
    private state: State = "idle";
    private overlay = document.createElement("div");
    private image: HTMLImageElement | null = null;
    private original: HTMLImageElement | null = null;
    private originalVisibility = "";
    private images: HTMLImageElement[] = [];
    private index = 0;
    private generation = 0;
    private previousOverflow = "";
    private returnFocus: HTMLElement | null = null;
    private inertElements: HTMLElement[] = [];
    private frame: Frame = { left: 0, top: 0, width: 0, height: 0 };
    private zoom = 1;
    private pan = { x: 0, y: 0 };
    private pointer: { id: number; x: number; y: number; panX: number; panY: number } | null = null;
    private prev: HTMLButtonElement;
    private next: HTMLButtonElement;
    private closer: HTMLButtonElement;
    private zoomButton: HTMLButtonElement;
    private status = document.createElement("div");
    private caption = document.createElement("div");
    private failed = false;
    private tap: { id: number; x: number; y: number; image: HTMLImageElement } | null = null;

    constructor() {
      this.overlay.className = "zoom-overlay";
      this.overlay.setAttribute("role", "dialog");
      this.overlay.setAttribute("aria-modal", "true");
      this.overlay.tabIndex = -1;
      const button = (name: string, icon: string, action: () => void) => {
        const el = document.createElement("button");
        el.type = "button"; el.className = `zoom-control zoom-${name}`;
        const symbol = document.createElement("span");
        symbol.className = "material-symbol"; symbol.setAttribute("aria-hidden", "true"); symbol.textContent = icon;
        el.append(symbol); el.addEventListener("click", action); this.overlay.append(el); return el;
      };
      this.prev = button("previous", "chevron_left", () => void this.navigate(this.index - 1));
      this.next = button("next", "chevron_right", () => void this.navigate(this.index + 1));
      this.closer = button("close", "close", () => void this.close());
      this.zoomButton = button("toggle", "zoom_in", () => this.setZoom(this.zoom > 1 ? 1 : 2));
      this.status.className = "zoom-status";
      this.status.setAttribute("role", "status"); this.status.setAttribute("aria-live", "polite");
      this.caption.className = "zoom-caption";
      this.overlay.append(this.status, this.caption);
      document.body.append(this.overlay);
      this.labels();
      document.addEventListener("click", event => this.openFromClick(event));
      // Touch taps should not depend on a browser-delayed compatibility click.
      document.addEventListener("pointerdown", event => {
        this.tap = this.state === "idle" && event.pointerType === "touch" && event.isPrimary && event.target instanceof HTMLImageElement
          ? { id: event.pointerId, x: event.clientX, y: event.clientY, image: event.target } : null;
      });
      document.addEventListener("pointermove", event => {
        if (this.tap?.id === event.pointerId && Math.hypot(event.clientX - this.tap.x, event.clientY - this.tap.y) > 10) this.tap = null;
      }, { passive: true });
      document.addEventListener("pointercancel", () => { this.tap = null; });
      document.addEventListener("pointerup", event => {
        const tap = this.tap; this.tap = null;
        if (tap?.id === event.pointerId && tap.image === event.target) this.openFromClick(event);
      });
      document.addEventListener("keydown", event => this.keydown(event), true);
      this.overlay.addEventListener("click", event => { if (event.target === this.overlay) void this.close(); });
      this.overlay.addEventListener("dblclick", event => { if (event.target === this.image) { event.preventDefault(); this.setZoom(this.zoom > 1 ? 1 : 2); } });
      this.overlay.addEventListener("wheel", event => {
        event.preventDefault();
        if (this.state === "open") this.setZoom(this.zoom * Math.exp(-event.deltaY * .002));
      }, { passive: false });
      this.overlay.addEventListener("pointerdown", event => {
        if (event.target !== this.image || this.state !== "open" || event.button !== 0 || !event.isPrimary) return;
        this.pointer = { id: event.pointerId, x: event.clientX, y: event.clientY, panX: this.pan.x, panY: this.pan.y };
        this.image!.setPointerCapture(event.pointerId);
      });
      this.overlay.addEventListener("pointermove", event => {
        if (!this.pointer || this.pointer.id !== event.pointerId || this.zoom === 1) return;
        this.pan = { x: this.pointer.panX + event.clientX - this.pointer.x, y: this.pointer.panY + event.clientY - this.pointer.y };
        this.applyZoom();
      });
      this.overlay.addEventListener("pointerup", event => {
        const pointer = this.pointer; this.pointer = null;
        if (!pointer || pointer.id !== event.pointerId) return;
        if (this.image?.hasPointerCapture(event.pointerId)) this.image.releasePointerCapture(event.pointerId);
        const dx = event.clientX - pointer.x, dy = event.clientY - pointer.y;
        if (this.zoom === 1 && Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) void this.navigate(this.index + (dx < 0 ? 1 : -1));
      });
      this.overlay.addEventListener("pointercancel", () => { this.pointer = null; });
      window.addEventListener("resize", () => {
        if (this.state === "open" && this.original) { this.frame = this.fit(this.original); this.place(this.frame); this.setZoom(1); }
        else if (this.state !== "idle") this.cleanup();
      });
      for (const name of ["daybook:before-swap", "daybook:page-load", "daybook:article-content-swapped"]) document.addEventListener(name, () => this.cleanup());
      document.addEventListener("daybook:lang-change", () => this.labels());
      window.addEventListener("beforeunload", () => this.cleanup());
    }

    private english() { return document.documentElement.lang.startsWith("en"); }
    private labels() {
      const en = this.english();
      this.overlay.setAttribute("aria-label", en ? "Image viewer" : "图片浏览器");
      for (const [button, label] of [[this.prev, en ? "Previous image (←)" : "上一张（←）"], [this.next, en ? "Next image (→)" : "下一张（→）"], [this.closer, en ? "Close (Esc)" : "关闭（Esc）"], [this.zoomButton, this.zoom > 1 ? (en ? "Fit image (0)" : "适应窗口（0）") : (en ? "Zoom in (+)" : "放大（+）")]] as const) {
        button.setAttribute("aria-label", label); button.dataset.tooltip = label;
      }
      this.zoomButton.firstElementChild!.textContent = this.zoom > 1 ? "zoom_out" : "zoom_in";
      this.zoomButton.setAttribute("aria-pressed", String(this.zoom > 1));
      this.prev.disabled = this.index <= 0;
      this.next.disabled = this.index >= this.images.length - 1;
      this.status.textContent = this.failed ? (en ? "Image unavailable. Try another image." : "图片暂时无法加载，可切换其他图片。") : `${this.index + 1} / ${this.images.length}`;
    }
    private eligible(img: HTMLImageElement) {
      return !img.closest('a[href], .embed-card, .music-custom-player, .katex') && !img.matches('.no-lightbox, [data-no-lightbox="true"]');
    }
    private openFromClick(event: MouseEvent) {
      const img = event.target;
      if (this.state !== "idle" || !(img instanceof HTMLImageElement) || !img.closest(".post-content, .memo-content") || !this.eligible(img)) return;
      if (!img.complete || img.naturalWidth < 100 || img.naturalHeight < 100) return;
      event.preventDefault(); void this.open(img);
    }
    private reducedMotion() {
      return document.documentElement.dataset.reducedMotion === "true" || matchMedia("(prefers-reduced-motion: reduce)").matches;
    }
    private async animate(element: HTMLElement, frames: Keyframe[], duration = 260) {
      try {
        const animation = element.animate(frames, { duration: this.reducedMotion() ? 0 : duration, easing: "cubic-bezier(.22, .61, .36, 1)", fill: "forwards" });
        await animation.finished.catch(() => {});
      } catch { /* The caller applies the final frame when animations are unavailable. */ }
    }
    private fit(img: HTMLImageElement): Frame {
      const width = innerWidth < 768 ? innerWidth - 24 : innerWidth * .8;
      const height = Math.min(innerHeight * .8, innerHeight - 144);
      const scale = Math.min(width / img.naturalWidth, Math.max(80, height) / img.naturalHeight);
      return { width: img.naturalWidth * scale, height: img.naturalHeight * scale, left: (innerWidth - img.naturalWidth * scale) / 2, top: (innerHeight - img.naturalHeight * scale) / 2 };
    }
    private styleFrame(frame: Frame): Record<string, string> {
      return { left: `${frame.left}px`, top: `${frame.top}px`, width: `${frame.width}px`, height: `${frame.height}px` };
    }
    private place(frame: Frame) {
      if (!this.image) return;
      this.image.getAnimations().forEach(animation => animation.cancel());
      Object.assign(this.image.style, this.styleFrame(frame), { clipPath: "none", objectFit: "contain", transform: "none" });
    }
    private restoreOriginal() {
      if (this.original) this.original.style.visibility = this.originalVisibility;
    }
    private clone(img: HTMLImageElement) {
      this.restoreOriginal(); this.image?.remove();
      this.original = img; this.originalVisibility = img.style.visibility;
      this.image = img.cloneNode() as HTMLImageElement;
      for (const attr of ["id", "style", "width", "height", "loading", "tabindex", "role"]) this.image.removeAttribute(attr);
      this.image.className = "zoom-img"; this.image.draggable = false;
      this.overlay.append(this.image); img.style.visibility = "hidden";
      this.zoom = 1; this.pan = { x: 0, y: 0 }; this.pointer = null; this.failed = false;
      this.caption.textContent = img.closest("figure")?.querySelector("figcaption")?.textContent || img.alt;
      this.labels();
    }
    private async open(img: HTMLImageElement) {
      if (!this.overlay.isConnected) document.body.append(this.overlay);
      this.state = "opening"; const generation = ++this.generation;
      this.images = Array.from(img.closest(".post-content, .memo-content")!.querySelectorAll<HTMLImageElement>("img")).filter(image => this.eligible(image) && (!image.complete || (image.naturalWidth >= 100 && image.naturalHeight >= 100)));
      this.index = this.images.indexOf(img);
      this.returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : img;
      if (this.returnFocus === document.body) this.returnFocus = img;
      this.previousOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      for (const child of document.body.children) {
        if (child instanceof HTMLElement && child !== this.overlay && !child.inert) { child.inert = true; this.inertElements.push(child); }
      }
      const rect = img.getBoundingClientRect();
      const gallery = img.closest<HTMLElement>(".md-carousel-item");
      const mask = gallery ? Math.max(0, (rect.width - gallery.getBoundingClientRect().width) / 2) : 0;
      const crop = `inset(0 ${mask}px round ${gallery ? getComputedStyle(gallery).borderRadius : "0px"})`;
      this.clone(img);
      Object.assign(this.image!.style, this.styleFrame(rect), { clipPath: crop, objectFit: "cover" });
      this.overlay.style.display = "block"; this.overlay.style.opacity = "1";
      this.overlay.setAttribute("aria-busy", "true");
      this.overlay.focus({ preventScroll: true });
      this.frame = this.fit(img);
      // Preserve the cropped gallery surface during the opening transition.
      await this.animate(this.image!, [{ ...this.styleFrame(rect), clipPath: crop }, { ...this.styleFrame(this.frame), clipPath: "inset(0 0px round 0px)" }]);
      if (generation !== this.generation || this.state !== "opening") return;
      this.place(this.frame); this.state = "open"; this.overlay.setAttribute("aria-busy", "false");
    }
    private async navigate(index: number) {
      if (this.state !== "open" || index < 0 || index >= this.images.length || index === this.index) return;
      this.state = "switching"; const generation = ++this.generation;
      const img = this.images[index]!;
      this.overlay.setAttribute("aria-busy", "true");
      let timer = 0;
      try {
        img.loading = "eager";
        await Promise.race([img.decode(), new Promise<never>((_, reject) => { timer = window.setTimeout(() => reject(new Error("Image loading timed out")), 10000); })]);
      } catch {
        if (generation === this.generation && this.state === "switching") { this.index = index; this.failed = true; this.labels(); this.state = "open"; this.overlay.setAttribute("aria-busy", "false"); }
        return;
      } finally { clearTimeout(timer); }
      if (generation !== this.generation || this.state !== "switching") return;
      this.index = index; this.clone(img); this.frame = this.fit(img); this.place(this.frame);
      await this.animate(this.image!, [{ opacity: 0 }, { opacity: 1 }], 160);
      if (generation !== this.generation || this.state !== "switching") return;
      this.image!.getAnimations().forEach(animation => animation.cancel());
      this.state = "open"; this.overlay.setAttribute("aria-busy", "false");
    }
    private setZoom(value: number) {
      if (this.state !== "open") return;
      this.zoom = Math.max(1, Math.min(4, value));
      this.applyZoom(); this.labels();
    }
    private applyZoom() {
      const limitX = Math.max(0, (this.frame.width * this.zoom - innerWidth + 24) / 2);
      const limitY = Math.max(0, (this.frame.height * this.zoom - innerHeight + 100) / 2);
      this.pan.x = Math.max(-limitX, Math.min(limitX, this.pan.x));
      this.pan.y = Math.max(-limitY, Math.min(limitY, this.pan.y));
      if (this.image) {
        this.image.style.transform = `translate3d(${this.pan.x}px, ${this.pan.y}px, 0) scale(${this.zoom})`;
        this.image.style.cursor = this.zoom > 1 ? "grab" : "zoom-in";
      }
    }
    private async close() {
      if (this.state === "idle" || this.state === "closing") return;
      this.state = "closing"; const generation = ++this.generation;
      if (this.image && this.original) {
        const from = this.image.getBoundingClientRect();
        const to = this.original.getBoundingClientRect();
        const visible = to.width > 0 && to.height > 0 && to.bottom > 0 && to.top < innerHeight;
        const gallery = this.original.closest<HTMLElement>(".md-carousel-item");
        const mask = gallery ? Math.max(0, (to.width - gallery.getBoundingClientRect().width) / 2) : 0;
        const crop = `inset(0 ${mask}px round ${gallery ? getComputedStyle(gallery).borderRadius : "0px"})`;
        this.place(from);
        if (visible) await this.animate(this.image, [{ ...this.styleFrame(from), clipPath: "inset(0 0px round 0px)" }, { ...this.styleFrame(to), clipPath: crop }]);
        else await this.animate(this.image, [{ opacity: 1 }, { opacity: 0 }], 160);
      }
      if (generation === this.generation) this.cleanup();
    }
    private cleanup() {
      if (this.state === "idle") return;
      ++this.generation;
      this.image?.getAnimations().forEach(animation => animation.cancel());
      this.image?.remove(); this.restoreOriginal();
      this.overlay.style.display = "none"; this.overlay.style.opacity = "0"; this.overlay.removeAttribute("aria-busy");
      for (const element of this.inertElements) element.inert = false;
      this.inertElements = []; document.body.style.overflow = this.previousOverflow;
      const target = this.returnFocus;
      if (target?.isConnected) {
        const tabindex = target.getAttribute("tabindex");
        if (tabindex === null) target.tabIndex = -1;
        target.focus({ preventScroll: true });
        if (tabindex === null) target.removeAttribute("tabindex");
      }
      this.image = null; this.original = null; this.pointer = null; this.tap = null; this.images = []; this.state = "idle";
    }
    private keydown(event: KeyboardEvent) {
      if (this.state === "idle") return;
      if (["Escape", "ArrowLeft", "ArrowRight", "Home", "End", "+", "=", "-", "0", "Tab"].includes(event.key)) {
        event.preventDefault(); event.stopImmediatePropagation();
        if (event.key === "Escape") void this.close();
        else if (event.key === "ArrowLeft") void this.navigate(this.index - 1);
        else if (event.key === "ArrowRight") void this.navigate(this.index + 1);
        else if (event.key === "Home") void this.navigate(0);
        else if (event.key === "End") void this.navigate(this.images.length - 1);
        else if (event.key === "+" || event.key === "=") this.setZoom(this.zoom + .5);
        else if (event.key === "-") this.setZoom(this.zoom - .5);
        else if (event.key === "0") this.setZoom(1);
        else {
          const buttons = Array.from(this.overlay.querySelectorAll<HTMLButtonElement>("button:not(:disabled)"));
          const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
          buttons[(current + (event.shiftKey ? -1 : 1) + buttons.length) % buttons.length]?.focus();
        }
      }
    }
  }
  new LightboxController();
})();
