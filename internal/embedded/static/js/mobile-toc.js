"use strict";
(() => {
  // assets/ts/mobile-toc.ts
  var MobileTocController = class {
    constructor(fab, sheet, backdrop, panel, dragHandle, tocNav, indicator, listItems, postContent) {
      this.headings = [];
      this.observer = null;
      this.events = new AbortController();
      this.previousOverflow = "";
      this.isOpen = false;
      this.lastScrollY = window.scrollY;
      this.activeIndex = -1;
      this.endActiveIndex = -1;
      // Drag state
      this.startY = 0;
      this.currentY = 0;
      this.isDragging = false;
      // --- Drag Handling ---
      this.handleTouchStart = (e) => {
        const touch = e.touches[0];
        if (!this.isOpen || !touch) return;
        this.isDragging = true;
        this.startY = touch.clientY;
        this.currentY = this.startY;
        this.sheet.classList.add("is-dragging");
      };
      this.handleTouchMove = (e) => {
        const touch = e.touches[0];
        if (!this.isDragging || !touch) return;
        this.currentY = touch.clientY;
        const deltaY = Math.max(0, this.currentY - this.startY);
        if (deltaY > 0) {
          e.preventDefault();
          this.panel.style.transform = `translateY(${deltaY}px)`;
        }
      };
      this.handleTouchEnd = () => {
        if (!this.isDragging) return;
        this.isDragging = false;
        this.sheet.classList.remove("is-dragging");
        const deltaY = this.currentY - this.startY;
        const threshold = 100;
        if (deltaY > threshold) {
          this.closeSheet();
        } else {
          this.panel.style.transform = "";
        }
      };
      this.fab = fab;
      this.sheet = sheet;
      this.backdrop = backdrop;
      this.panel = panel;
      this.dragHandle = dragHandle;
      this.tocNav = tocNav;
      this.indicator = indicator;
      this.listItems = listItems;
      this.postContent = postContent;
      this.init();
    }
    init() {
      document.body.append(this.fab, this.sheet);
      const signal = this.events.signal;
      this.listItems.forEach((item) => {
        const link = item.querySelector("a");
        if (link) {
          const id = this.headingID(link);
          if (id) {
            const element = document.getElementById(id);
            if (element) {
              this.headings.push({ id, element });
            }
          }
        }
      });
      this.fab.addEventListener("click", () => this.openSheet(), { signal });
      this.backdrop.addEventListener("click", () => this.closeSheet(), { signal });
      this.listItems.forEach((item) => {
        const link = item.querySelector("a");
        link?.addEventListener("click", (e) => {
          e.preventDefault();
          const id = this.headingID(link);
          const target = document.getElementById(id || "");
          if (target) {
            this.closeSheet();
            requestAnimationFrame(() => {
              const reduced = document.documentElement.dataset.reducedMotion === "true" || window.matchMedia("(prefers-reduced-motion: reduce)").matches;
              const offset = Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--mobile-topbar-height")) || 64;
              window.scrollTo({ top: Math.max(0, target.getBoundingClientRect().top + window.scrollY - offset - 16), behavior: reduced ? "instant" : "smooth" });
              const url = new URL(location.href);
              url.hash = encodeURIComponent(id || "");
              if (window.daybookReplaceURL) window.daybookReplaceURL(url.href);
              else history.replaceState(history.state, "", url.href);
            });
          }
        }, { signal });
      });
      this.dragHandle.addEventListener("touchstart", this.handleTouchStart, { passive: true, signal });
      document.addEventListener("touchmove", this.handleTouchMove, { passive: false, signal });
      document.addEventListener("touchend", this.handleTouchEnd, { signal });
      document.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && this.isOpen) this.closeSheet();
      }, { signal });
      window.addEventListener("scroll", () => this.handleScroll(), { passive: true, signal });
      this.setupIntersectionObserver();
      this.handleScroll();
    }
    headingID(link) {
      const hash = link.getAttribute("href")?.slice(1) || "";
      try {
        return decodeURIComponent(hash);
      } catch {
        return hash;
      }
    }
    isForContent(content) {
      return this.postContent === content;
    }
    handleScroll() {
      const currentScrollY = window.scrollY;
      if (currentScrollY < 100 || currentScrollY < this.lastScrollY) {
        this.fab.classList.remove("is-hidden");
      } else if (currentScrollY > this.lastScrollY + 10) {
        this.fab.classList.add("is-hidden");
      }
      this.lastScrollY = currentScrollY;
    }
    openSheet() {
      if (this.isOpen) return;
      this.isOpen = true;
      this.sheet.classList.add("is-open");
      this.sheet.removeAttribute("inert");
      this.sheet.setAttribute("aria-hidden", "false");
      this.fab.setAttribute("aria-expanded", "true");
      this.previousOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      this.syncIndicator();
    }
    closeSheet() {
      if (!this.isOpen) return;
      this.isOpen = false;
      this.sheet.classList.remove("is-open");
      this.sheet.setAttribute("inert", "");
      this.sheet.setAttribute("aria-hidden", "true");
      this.fab.setAttribute("aria-expanded", "false");
      document.body.style.overflow = this.previousOverflow;
      this.panel.style.transform = "";
    }
    // --- Active Heading Tracking ---
    setupIntersectionObserver() {
      if (this.headings.length === 0) return;
      this.observer = new IntersectionObserver((entries) => {
        this.updateActiveHeading();
      }, {
        rootMargin: "-10% 0px -80% 0px",
        // Trigger when heading is near the top
        threshold: 0
      });
      this.headings.forEach((h) => this.observer?.observe(h.element));
      window.addEventListener("scroll", () => this.updateActiveHeading(), { passive: true, signal: this.events.signal });
      this.updateActiveHeading();
    }
    updateActiveHeading() {
      if (this.headings.length === 0) return;
      const viewportTop = window.scrollY;
      const viewportBottom = viewportTop + window.innerHeight;
      let activeIndex = -1;
      const scrollYWithOffset = window.scrollY + 120;
      for (let i = 0; i < this.headings.length; i++) {
        const heading = this.headings[i];
        if (!heading) continue;
        const offsetTop = heading.element.getBoundingClientRect().top + window.scrollY;
        if (offsetTop <= scrollYWithOffset) {
          activeIndex = i;
        } else {
          break;
        }
      }
      if (activeIndex === -1 && this.headings.length > 0) {
        activeIndex = 0;
      }
      let firstVis = -1;
      let lastVis = -1;
      for (let i = 0; i < this.headings.length; i++) {
        const heading = this.headings[i];
        if (!heading) continue;
        const offsetTop = heading.element.getBoundingClientRect().top + window.scrollY;
        if (offsetTop >= viewportTop && offsetTop <= viewportBottom) {
          if (firstVis === -1) firstVis = i;
          lastVis = i;
        }
      }
      const endActiveIndex = firstVis !== -1 ? Math.max(activeIndex, lastVis) : activeIndex;
      this.setActiveIndex(activeIndex, endActiveIndex);
    }
    setActiveIndex(index, endIndex) {
      if (index < 0 || index >= this.listItems.length) return;
      this.activeIndex = index;
      this.endActiveIndex = endIndex;
      let hasChanged = false;
      this.listItems.forEach((item, i) => {
        const isActive = i === index;
        if (isActive !== item.classList.contains("is-active")) {
          hasChanged = true;
          item.classList.toggle("is-active", isActive);
        }
      });
      if (hasChanged || this.isOpen) {
        this.syncIndicator();
      }
    }
    syncIndicator() {
      if (this.activeIndex === -1 || this.endActiveIndex === -1) {
        this.tocNav.classList.remove("has-active");
        return;
      }
      this.tocNav.classList.add("has-active");
      requestAnimationFrame(() => {
        const startItem = this.listItems[this.activeIndex];
        const endItem = this.listItems[this.endActiveIndex];
        if (!startItem || !endItem) return;
        const navRect = this.tocNav.getBoundingClientRect();
        const startItemRect = startItem.getBoundingClientRect();
        const endItemRect = endItem.getBoundingClientRect();
        const relativeTop = startItemRect.top - navRect.top + this.tocNav.scrollTop;
        const indicatorHeight = 18;
        const totalHeight = Math.max(1, endItemRect.bottom - startItemRect.top);
        const scale = totalHeight / indicatorHeight;
        const yOffset = relativeTop + (totalHeight - indicatorHeight * scale) / 2;
        this.indicator.style.setProperty("--indicator-y", `${yOffset}px`);
        this.indicator.style.setProperty("--indicator-scale", `${scale}`);
      });
    }
    destroy() {
      this.closeSheet();
      this.events.abort();
      this.observer?.disconnect();
      this.fab.remove();
      this.sheet.remove();
    }
  };
  var currentMobileTocController = null;
  function initMobileToc() {
    if (currentMobileTocController?.isForContent(document.querySelector(".post-content"))) return;
    if (currentMobileTocController) {
      currentMobileTocController.destroy();
      currentMobileTocController = null;
    }
    const fab = document.querySelector("[data-mobile-toc-fab]");
    const sheet = document.querySelector("[data-mobile-toc-sheet]");
    const backdrop = document.querySelector("[data-mobile-toc-backdrop]");
    const panel = sheet?.querySelector(".mobile-toc-panel");
    const dragHandle = sheet?.querySelector("[data-mobile-toc-drag-handle]");
    const tocNav = sheet?.querySelector(".mobile-toc-nav");
    const indicator = tocNav?.querySelector("[data-mobile-toc-indicator]");
    const listItems = tocNav?.querySelectorAll("li");
    const postContent = document.querySelector(".post-content");
    if (fab && sheet && backdrop && panel && dragHandle && tocNav && indicator && listItems && postContent) {
      currentMobileTocController = new MobileTocController(
        fab,
        sheet,
        backdrop,
        panel,
        dragHandle,
        tocNav,
        indicator,
        listItems,
        postContent
      );
    }
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initMobileToc);
  } else {
    initMobileToc();
  }
  document.addEventListener("daybook:page-load", initMobileToc);
  document.addEventListener("daybook:before-swap", () => {
    currentMobileTocController?.destroy();
    currentMobileTocController = null;
  });
})();
