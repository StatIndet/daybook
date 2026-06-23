(function () {
  type LightboxState = "idle" | "opening" | "open" | "closing";

  class LightboxController {
    private state: LightboxState = "idle";
    private overlay: HTMLDivElement | null = null;
    private clonedImg: HTMLImageElement | null = null;
    private originalImg: HTMLImageElement | null = null;
    private transitionTimeout: number | null = null;

    constructor() {
      this.setupOverlay();
      this.bindEvents();
    }

    private setupOverlay() {
      // Remove existing overlay if any
      if (this.overlay && this.overlay.parentNode) {
        this.overlay.parentNode.removeChild(this.overlay);
      }
      this.overlay = document.createElement("div");
      this.overlay.className = "zoom-overlay";
      this.overlay.setAttribute("role", "dialog");
      this.overlay.setAttribute("aria-modal", "true");
      this.overlay.setAttribute("aria-label", "图片浏览器");
      this.overlay.setAttribute("tabindex", "-1");
      document.body.appendChild(this.overlay);
    }

    private bindEvents() {
      document.addEventListener("click", this.handleClick.bind(this));
      document.addEventListener("keydown", this.handleKeyDown.bind(this));
      window.addEventListener("resize", () => {
        if (this.state !== "idle") this.forceCleanup();
      });
      window.addEventListener("scroll", () => {
        if (this.state === "open") this.close();
      }, { passive: true });

      document.addEventListener("daybook:page-load", () => {
        this.forceCleanup();
        this.setupOverlay();
      });
      document.addEventListener("daybook:before-swap", () => this.forceCleanup());
      window.addEventListener("beforeunload", () => this.forceCleanup());
    }

    private playAnimation(element: HTMLElement, keyframes: Keyframe[], options: KeyframeAnimationOptions): Promise<void> {
      return new Promise((resolve) => {
        try {
          const animation = element.animate(keyframes, options);
          animation.onfinish = () => resolve();
          animation.oncancel = () => resolve();
        } catch (e) {
          // Fallback if WAAPI fails
          const lastFrame = keyframes[keyframes.length - 1];
          if (lastFrame && "transform" in lastFrame) {
            element.style.transform = lastFrame.transform as string;
          }
          resolve();
        }
      });
    }

    private fadeOverlay(opacity: string): Promise<void> {
      return new Promise((resolve) => {
        if (!this.overlay) return resolve();
        let isResolved = false;
        const complete = () => {
          if (isResolved) return;
          isResolved = true;
          this.overlay?.removeEventListener("transitionend", complete);
          if (this.transitionTimeout !== null) {
            window.clearTimeout(this.transitionTimeout);
            this.transitionTimeout = null;
          }
          resolve();
        };

        this.overlay.addEventListener("transitionend", complete, { once: true });
        this.transitionTimeout = window.setTimeout(complete, 350);
        this.overlay.style.opacity = opacity;
      });
    }

    public async open(img: HTMLImageElement) {
      // Lazy setup if overlay was somehow destroyed
      if (!this.overlay || !document.body.contains(this.overlay)) {
        this.setupOverlay();
      }

      if (this.state !== "idle" || !this.overlay) return;
      this.state = "opening";
      this.originalImg = img;

      // Lock scrolling
      document.body.style.overflow = "hidden";

      // FLIP - First
      const rect = img.getBoundingClientRect();

      // Create clone
      this.clonedImg = img.cloneNode() as HTMLImageElement;
      this.clonedImg.className = "zoom-img";
      this.clonedImg.removeAttribute("id");
      this.clonedImg.removeAttribute("loading");

      // Apply initial state
      this.clonedImg.style.top = rect.top + "px";
      this.clonedImg.style.left = rect.left + "px";
      this.clonedImg.style.width = rect.width + "px";
      this.clonedImg.style.height = rect.height + "px";
      // Remove any CSS transition so WAAPI takes full control
      this.clonedImg.style.transition = "none";

      // Add to DOM
      document.body.appendChild(this.clonedImg);
      this.overlay.style.display = "block";

      // Hide original image
      this.originalImg.style.visibility = "hidden";

      // FLIP - Last & Invert
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const scaleFactor = viewportWidth < 768 ? 1 : 0.8;
      const scale = Math.min(
        (viewportWidth * scaleFactor) / rect.width,
        (viewportHeight * scaleFactor) / rect.height
      );

      const translateX = -rect.left + (viewportWidth - rect.width) / 2;
      const translateY = -rect.top + (viewportHeight - rect.height) / 2;
      const targetTransform = `translate3d(${translateX}px, ${translateY}px, 0) scale(${scale})`;

      // FLIP - Play
      await Promise.all([
        this.fadeOverlay("1"),
        this.playAnimation(this.clonedImg, [
          { transform: "translate3d(0, 0, 0) scale(1)" },
          { transform: targetTransform }
        ], {
          duration: 300,
          easing: "cubic-bezier(0.4, 0, 0.2, 1)",
          fill: "forwards"
        })
      ]);

      if (this.state === "opening") {
        this.state = "open";
        this.clonedImg.style.transform = targetTransform;
        this.overlay.focus();
      }
    }

    public async close() {
      if (this.state !== "open" && this.state !== "opening") return;
      this.state = "closing";

      if (!this.clonedImg || !this.originalImg || !this.overlay) {
        this.forceCleanup();
        return;
      }

      // Re-read original rect in case of scrolling/resizing
      const newRect = this.originalImg.getBoundingClientRect();
      const oldRectTop = parseFloat(this.clonedImg.style.top || "0");
      const oldRectLeft = parseFloat(this.clonedImg.style.left || "0");

      const dx = newRect.left - oldRectLeft;
      const dy = newRect.top - oldRectTop;
      
      // Get current transform to animate from it smoothly if interrupted
      const currentTransform = getComputedStyle(this.clonedImg).transform;
      const targetTransform = `translate3d(${dx}px, ${dy}px, 0) scale(1)`;

      document.body.style.overflow = "";

      // Play closing animation
      await Promise.all([
        this.fadeOverlay("0"),
        this.playAnimation(this.clonedImg, [
          { transform: currentTransform !== "none" ? currentTransform : "translate3d(0, 0, 0) scale(1)" },
          { transform: targetTransform }
        ], {
          duration: 300,
          easing: "cubic-bezier(0.4, 0, 0.2, 1)",
          fill: "forwards"
        })
      ]);

      this.cleanup();
    }

    public forceCleanup() {
      if (this.transitionTimeout !== null) {
        window.clearTimeout(this.transitionTimeout);
        this.transitionTimeout = null;
      }
      this.cleanup();
    }

    private cleanup() {
      if (this.clonedImg && this.clonedImg.parentNode) {
        this.clonedImg.parentNode.removeChild(this.clonedImg);
      }

      if (this.overlay) {
        this.overlay.style.display = "none";
        this.overlay.style.opacity = "0";
      }

      if (this.originalImg) {
        this.originalImg.style.visibility = "";
        if (document.body.contains(this.originalImg) && document.activeElement === this.overlay) {
          try {
            this.originalImg.focus({ preventScroll: true });
          } catch (e) {
            this.originalImg.focus();
          }
        }
      }

      document.body.style.overflow = "";
      this.clonedImg = null;
      this.originalImg = null;
      this.state = "idle";
    }

    private handleClick(event: MouseEvent) {
      if (this.state === "open" || this.state === "opening") {
        this.close();
        return;
      }

      if (this.state !== "idle") {
        return;
      }

      const target = event.target as HTMLElement;
      if (!target || target.tagName !== "IMG" || !target.closest(".post-content")) {
        return;
      }
      
      if (target.closest("a[href]") || target.matches(".no-lightbox, [data-no-lightbox=\"true\"]")) {
        return;
      }

      const imgTarget = target as HTMLImageElement;
      if (!imgTarget.complete || imgTarget.width < 100 || imgTarget.height < 100) {
        return;
      }

      event.preventDefault();
      this.open(imgTarget);
    }
    
    private handleKeyDown(event: KeyboardEvent) {
      if ((this.state === "open" || this.state === "opening") && event.key === "Escape") {
        event.preventDefault();
        this.close();
      }
    }
  }

  new LightboxController();
})();
