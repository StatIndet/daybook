"use strict";
(() => {
  // assets/ts/lightbox.ts
  (function() {
    class LightboxController {
      constructor() {
        this.state = "idle";
        this.overlay = null;
        this.clonedImg = null;
        this.originalImg = null;
        this.transitionTimeout = null;
        this.setupOverlay();
        this.bindEvents();
      }
      setupOverlay() {
        if (this.overlay && this.overlay.parentNode) {
          this.overlay.parentNode.removeChild(this.overlay);
        }
        this.overlay = document.createElement("div");
        this.overlay.className = "zoom-overlay";
        this.overlay.setAttribute("role", "dialog");
        this.overlay.setAttribute("aria-modal", "true");
        this.overlay.setAttribute("aria-label", "\u56FE\u7247\u6D4F\u89C8\u5668");
        this.overlay.setAttribute("tabindex", "-1");
        document.body.appendChild(this.overlay);
      }
      bindEvents() {
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
        document.addEventListener("daybook:article-content-swapped", () => {
          this.forceCleanup();
          this.setupOverlay();
        });
        document.addEventListener("daybook:before-swap", () => this.forceCleanup());
        window.addEventListener("beforeunload", () => this.forceCleanup());
      }
      playAnimation(element, keyframes, options) {
        return new Promise((resolve) => {
          try {
            const animation = element.animate(keyframes, options);
            animation.onfinish = () => resolve();
            animation.oncancel = () => resolve();
          } catch (e) {
            const lastFrame = keyframes[keyframes.length - 1];
            if (lastFrame && "transform" in lastFrame) {
              element.style.transform = lastFrame.transform;
            }
            resolve();
          }
        });
      }
      fadeOverlay(opacity) {
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
      async open(img) {
        if (!this.overlay || !document.body.contains(this.overlay)) {
          this.setupOverlay();
        }
        if (this.state !== "idle" || !this.overlay) return;
        this.state = "opening";
        this.originalImg = img;
        document.body.style.overflow = "hidden";
        const rect = img.getBoundingClientRect();
        this.clonedImg = img.cloneNode();
        this.clonedImg.className = "zoom-img";
        this.clonedImg.removeAttribute("id");
        this.clonedImg.removeAttribute("loading");
        this.clonedImg.style.top = rect.top + "px";
        this.clonedImg.style.left = rect.left + "px";
        this.clonedImg.style.width = rect.width + "px";
        this.clonedImg.style.height = rect.height + "px";
        this.clonedImg.style.transition = "none";
        document.body.appendChild(this.clonedImg);
        this.overlay.style.display = "block";
        this.originalImg.style.visibility = "hidden";
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        const scaleFactor = viewportWidth < 768 ? 1 : 0.8;
        const scale = Math.min(
          viewportWidth * scaleFactor / rect.width,
          viewportHeight * scaleFactor / rect.height
        );
        const translateX = -rect.left + (viewportWidth - rect.width) / 2;
        const translateY = -rect.top + (viewportHeight - rect.height) / 2;
        const targetTransform = `translate3d(${translateX}px, ${translateY}px, 0) scale(${scale})`;
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
      async close() {
        if (this.state !== "open" && this.state !== "opening") return;
        this.state = "closing";
        if (!this.clonedImg || !this.originalImg || !this.overlay) {
          this.forceCleanup();
          return;
        }
        const newRect = this.originalImg.getBoundingClientRect();
        const oldRectTop = parseFloat(this.clonedImg.style.top || "0");
        const oldRectLeft = parseFloat(this.clonedImg.style.left || "0");
        const dx = newRect.left - oldRectLeft;
        const dy = newRect.top - oldRectTop;
        const currentTransform = getComputedStyle(this.clonedImg).transform;
        const targetTransform = `translate3d(${dx}px, ${dy}px, 0) scale(1)`;
        document.body.style.overflow = "";
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
      forceCleanup() {
        if (this.transitionTimeout !== null) {
          window.clearTimeout(this.transitionTimeout);
          this.transitionTimeout = null;
        }
        this.cleanup();
      }
      cleanup() {
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
      handleClick(event) {
        if (this.state === "open" || this.state === "opening") {
          this.close();
          return;
        }
        if (this.state !== "idle") {
          return;
        }
        const target = event.target;
        if (!target || target.tagName !== "IMG" || !target.closest(".post-content")) {
          return;
        }
        if (target.closest("a[href]") || target.matches('.no-lightbox, [data-no-lightbox="true"]')) {
          return;
        }
        const imgTarget = target;
        if (!imgTarget.complete || imgTarget.width < 100 || imgTarget.height < 100) {
          return;
        }
        event.preventDefault();
        this.open(imgTarget);
      }
      handleKeyDown(event) {
        if ((this.state === "open" || this.state === "opening") && event.key === "Escape") {
          event.preventDefault();
          this.close();
        }
      }
    }
    new LightboxController();
  })();
})();
