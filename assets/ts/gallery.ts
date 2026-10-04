(() => {
  const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
  const mix = (from: number, to: number, amount: number) => from + (to - from) * amount;
  const controllers = new Map<HTMLElement, GalleryCarousel>();
  const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");

  class GalleryCarousel {
    private track = document.createElement("div");
    private stage = document.createElement("div");
    private resizeObserver: ResizeObserver;
    private width = 0;
    private gap = 12;
    private large = 0;
    private sizes: number[] = [];
    private step = 1;
    private maxScroll = 0;
    private frame = 0;
    private timer = 0;
    private target: number | null = null;
    private lastTime = 0;
    private drag: { id: number; x: number; scroll: number; moved: boolean } | null = null;
    private suppressClick = false;
    private destroyed = false;

    constructor(private container: HTMLElement, private items: HTMLElement[]) {
      this.track.className = "md-carousel-track";
      this.stage.className = "md-carousel-stage";
      this.items.forEach(item => {
        item.classList.add("md-carousel-item");
        item.setAttribute("role", "group");
        item.querySelectorAll<HTMLImageElement>("img").forEach(image => {
          image.draggable = false;
          if (!image.closest("a[href]") && !image.matches('.no-lightbox, [data-no-lightbox="true"]')) {
            image.tabIndex = 0;
            image.setAttribute("role", "button");
          }
        });
        this.stage.appendChild(item);
      });
      this.track.appendChild(this.stage);
      container.appendChild(this.track);
      container.classList.add("is-carousel");
      container.tabIndex = 0;
      container.setAttribute("role", "region");
      this.localize();
      container.addEventListener("scroll", this.onScroll, { passive: true });
      container.addEventListener("wheel", this.onWheel, { passive: false });
      container.addEventListener("keydown", this.onKeyDown);
      container.addEventListener("focusin", this.onFocus);
      container.addEventListener("pointerdown", this.onPointerDown);
      container.addEventListener("pointermove", this.onPointerMove);
      window.addEventListener("pointerup", this.onPointerEnd);
      window.addEventListener("pointercancel", this.onPointerEnd);
      container.addEventListener("lostpointercapture", this.onPointerEnd);
      container.addEventListener("click", this.onClick, true);
      this.resizeObserver = new ResizeObserver(this.measure);
      this.resizeObserver.observe(container);
      this.measure();
    }

    private reducedMotion = () => motionQuery.matches || document.documentElement.dataset.reducedMotion === "true";

    syncMotion = () => {
      if (this.reducedMotion() && this.target !== null) this.moveTo(this.target, false);
    };

    localize = () => {
      const english = document.documentElement.lang.startsWith("en");
      this.container.setAttribute("aria-label", english ? "Image gallery" : "图片画廊");
      this.container.setAttribute("aria-roledescription", english ? "Carousel" : "轮播");
      this.items.forEach((item, index) => {
        item.setAttribute("aria-roledescription", english ? "Slide" : "图片");
        item.setAttribute("aria-label", `${index + 1} / ${this.items.length}`);
      });
    };

    private measure = () => {
      if (this.destroyed) return;
      const width = this.container.clientWidth;
      if (!width || width === this.width) return;
      const progress = this.container.scrollLeft / this.step;
      this.stop();
      this.width = width;
      const count = Math.min(3, this.items.length);
      this.gap = width < 480 ? 8 : 12;
      const available = width - this.gap * (count - 1);
      this.sizes = count === 1 ? [available] : count === 2
        ? [available * 0.62, available * 0.38]
        : [available * 0.54, available * 0.34, available * 0.12];
      this.large = this.sizes[0]!;
      this.step = this.large + this.gap;
      this.maxScroll = (this.items.length - 1) * this.step;
      this.track.style.width = `${width + this.maxScroll}px`;
      this.stage.style.width = `${width}px`;
      this.container.style.setProperty("--gallery-image-width", `${this.large}px`);
      this.container.scrollLeft = clamp(progress * this.step, 0, this.maxScroll);
      this.render();
    };

    private render() {
      const progress = clamp(this.container.scrollLeft / this.step, 0, this.items.length - 1);
      const lastWindow = this.items.length - this.sizes.length;
      const start = Math.min(progress, lastWindow);
      // At the end, move the focal keyline through the remaining images. Every
      // image can expand fully without leaving an empty trailing viewport.
      const focal = Math.max(0, progress - lastWindow);
      const order = (index: number) => index === 0 ? this.sizes : this.sizes.map((_, slot) => {
        if (slot === index) return this.large;
        return this.sizes[slot < index ? index - slot : slot]!;
      });
      const from = order(Math.floor(focal));
      const to = order(Math.min(this.sizes.length - 1, Math.ceil(focal)));
      const sizes = from.map((size, index) => mix(size, to[index]!, focal % 1));
      const centers: number[] = [];
      let edge = 0;
      sizes.forEach(size => { centers.push(edge + size / 2); edge += size + this.gap; });
      const small = this.sizes[this.sizes.length - 1]!;
      const keyline = (index: number) => {
        if (index < 0) return { center: -this.gap - small / 2 + (index + 1) * (small + this.gap), size: small };
        if (index >= sizes.length) return { center: this.width + this.gap + small / 2 + (index - sizes.length) * (small + this.gap), size: small };
        return { center: centers[index]!, size: sizes[index]! };
      };
      this.items.forEach((item, index) => {
        const position = index - start;
        const left = keyline(Math.floor(position));
        const right = keyline(Math.ceil(position));
        const fraction = position - Math.floor(position);
        const size = mix(left.size, right.size, fraction);
        const center = mix(left.center, right.center, fraction);
        item.style.width = `${size}px`;
        item.style.transform = `translate3d(${center - size / 2}px, 0, 0)`;
        item.style.setProperty("--gallery-caption-opacity", `${clamp((size - 90) / 24, 0, 1)}`);
      });
    }

    private stop() {
      cancelAnimationFrame(this.frame);
      window.clearTimeout(this.timer);
      this.frame = 0;
      this.timer = 0;
      this.target = null;
    }

    private animate = (time: number) => {
      this.frame = 0;
      if (this.target === null || this.destroyed) return;
      const distance = this.target - this.container.scrollLeft;
      const elapsed = Math.min(32, time - this.lastTime);
      this.lastTime = time;
      this.container.scrollLeft += distance * (1 - Math.exp(-elapsed / 65));
      this.render();
      if (Math.abs(distance) > 2.5) this.frame = requestAnimationFrame(this.animate);
      else {
        this.container.scrollLeft = this.target;
        this.target = null;
        this.render();
        this.scheduleSnap();
      }
    };

    private moveTo(position: number, smooth = true) {
      this.target = clamp(position, 0, this.maxScroll);
      if (!smooth || this.reducedMotion()) {
        const target = this.target;
        this.stop();
        this.container.scrollLeft = target;
        this.render();
      } else if (!this.frame) {
        this.lastTime = performance.now();
        this.frame = requestAnimationFrame(this.animate);
      }
    }

    private scheduleSnap() {
      window.clearTimeout(this.timer);
      this.timer = window.setTimeout(() => {
        if (this.drag || this.target !== null) return;
        const destination = Math.round(this.container.scrollLeft / this.step) * this.step;
        if (Math.abs(destination - this.container.scrollLeft) > 1) this.moveTo(destination);
      }, 160);
    }

    private onScroll = () => { this.render(); if (this.target === null) this.scheduleSnap(); };

    private onWheel = (event: WheelEvent) => {
      if (event.ctrlKey || !this.maxScroll) return;
      // Trackpads retain native horizontal momentum. Convert a vertical wheel
      // only while this gallery has room to move; release page scrolling at ends.
      if (Math.abs(event.deltaX) > Math.abs(event.deltaY)) { this.stop(); return; }
      const unit = event.deltaMode === 1 ? 20 : event.deltaMode === 2 ? this.width : 1;
      const delta = event.deltaY * unit;
      const position = this.target ?? this.container.scrollLeft;
      // scrollLeft is rounded by some browsers; fractional layout widths must
      // not trap the page wheel at either end of the native scroll range.
      if ((delta > 0 && position >= this.maxScroll - 1) || (delta < 0 && position <= 1)) return;
      const destination = clamp(position + delta, 0, this.maxScroll);
      if (destination === position) return;
      event.preventDefault();
      this.moveTo(destination);
    };

    private onKeyDown = (event: KeyboardEvent) => {
      const element = event.target as HTMLElement;
      if (element !== this.container && element.tagName !== "IMG") return;
      let index = Math.round((this.target ?? this.container.scrollLeft) / this.step);
      if (event.key === "ArrowRight") index++;
      else if (event.key === "ArrowLeft") index--;
      else if (event.key === "Home") index = 0;
      else if (event.key === "End") index = this.items.length - 1;
      else if (event.key === "Enter" || event.key === " ") {
        const image = element.tagName === "IMG" ? element : this.items[index]?.querySelector("img");
        if (image) { event.preventDefault(); image.click(); }
        return;
      } else return;
      event.preventDefault();
      this.moveTo(index * this.step);
    };

    private onFocus = (event: FocusEvent) => {
      const element = event.target as HTMLElement;
      if (!element.matches(":focus-visible")) return;
      const index = this.items.findIndex(item => item.contains(element));
      if (index >= 0) this.moveTo(index * this.step, false);
    };

    private onPointerDown = (event: PointerEvent) => {
      this.suppressClick = false;
      this.stop();
      if (event.pointerType !== "mouse" || event.button !== 0 || !this.maxScroll) return;
      this.drag = { id: event.pointerId, x: event.clientX, scroll: this.container.scrollLeft, moved: false };
    };

    private onPointerMove = (event: PointerEvent) => {
      if (!this.drag || event.pointerId !== this.drag.id) return;
      const distance = this.drag.x - event.clientX;
      if (!this.drag.moved && Math.abs(distance) < 5) return;
      this.drag.moved = true;
      this.container.classList.add("is-dragging");
      this.container.setPointerCapture(event.pointerId);
      this.container.scrollLeft = clamp(this.drag.scroll + distance, 0, this.maxScroll);
      this.render();
      event.preventDefault();
    };

    private onPointerEnd = (event: PointerEvent) => {
      if (!this.drag || event.pointerId !== this.drag.id) return;
      this.suppressClick = this.drag.moved;
      this.drag = null;
      this.container.classList.remove("is-dragging");
      if (this.container.hasPointerCapture(event.pointerId)) this.container.releasePointerCapture(event.pointerId);
      this.scheduleSnap();
    };

    private onClick = (event: MouseEvent) => {
      this.stop();
      if (!this.suppressClick) return;
      this.suppressClick = false;
      event.preventDefault();
      event.stopImmediatePropagation();
    };

    destroy() {
      this.destroyed = true;
      this.stop();
      this.resizeObserver.disconnect();
      this.container.removeEventListener("scroll", this.onScroll);
      this.container.removeEventListener("wheel", this.onWheel);
      this.container.removeEventListener("keydown", this.onKeyDown);
      this.container.removeEventListener("focusin", this.onFocus);
      this.container.removeEventListener("pointerdown", this.onPointerDown);
      this.container.removeEventListener("pointermove", this.onPointerMove);
      window.removeEventListener("pointerup", this.onPointerEnd);
      window.removeEventListener("pointercancel", this.onPointerEnd);
      this.container.removeEventListener("lostpointercapture", this.onPointerEnd);
      this.container.removeEventListener("click", this.onClick, true);
    }
  }

  function sync() {
    controllers.forEach((controller, container) => {
      if (!container.isConnected) { controller.destroy(); controllers.delete(container); }
    });
    document.querySelectorAll<HTMLElement>(".md-gallery").forEach(container => {
      if (container.closest("[data-memo-card]")) return;
      if (controllers.has(container)) return;
      const items = Array.from(container.children).filter((item): item is HTMLElement =>
        item instanceof HTMLElement && item.matches("figure, p") && item.querySelectorAll("img").length === 1);
      // Keep mixed-content galleries readable using the native overflow fallback.
      if (!items.length || items.length !== container.children.length) return;
      controllers.set(container, new GalleryCarousel(container, items));
    });
  }

  document.addEventListener("daybook:page-load", sync);
  document.addEventListener("daybook:article-content-swapped", sync);
  document.addEventListener("daybook:lang-change", () => controllers.forEach(controller => controller.localize()));
  document.addEventListener("daybook:settings-change", () => controllers.forEach(controller => controller.syncMotion()));
  motionQuery.addEventListener("change", () => controllers.forEach(controller => controller.syncMotion()));
  document.addEventListener("daybook:before-swap", () => {
    controllers.forEach(controller => controller.destroy());
    controllers.clear();
  });
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", sync, { once: true });
  else sync();
})();
