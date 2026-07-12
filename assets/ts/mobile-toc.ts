/**
 * Mobile TOC Controller
 * Manages the floating action button (FAB) and the bottom sheet for the Table of Contents on small screens.
 */
class MobileTocController {
  private readonly fab: HTMLElement;
  private readonly sheet: HTMLElement;
  private readonly backdrop: HTMLElement;
  private readonly panel: HTMLElement;
  private readonly dragHandle: HTMLElement;
  private readonly tocNav: HTMLElement;
  private readonly indicator: HTMLElement;
  private readonly listItems: NodeListOf<HTMLElement>;
  
  private readonly postContent: HTMLElement;
  private headings: { element: HTMLElement, id: string }[] = [];
  private observer: IntersectionObserver | null = null;
  private isOpen = false;
  private lastScrollY: number = window.scrollY;
  private activeIndex = -1;
  private endActiveIndex = -1;
  
  // Drag state
  private startY = 0;
  private currentY = 0;
  private isDragging = false;
  
  constructor(
    fab: HTMLElement,
    sheet: HTMLElement,
    backdrop: HTMLElement,
    panel: HTMLElement,
    dragHandle: HTMLElement,
    tocNav: HTMLElement,
    indicator: HTMLElement,
    listItems: NodeListOf<HTMLElement>,
    postContent: HTMLElement
  ) {
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
  
  private init(): void {
    // Collect headings
    this.listItems.forEach(item => {
      const link = item.querySelector("a");
      if (link) {
        const id = link.getAttribute("href")?.substring(1);
        if (id) {
          const element = document.getElementById(id);
          if (element) {
            this.headings.push({ id, element });
          }
        }
      }
    });
    
    // Bind events
    this.fab.addEventListener("click", () => this.openSheet());
    this.backdrop.addEventListener("click", () => this.closeSheet());
    
    // Smooth scrolling for links
    this.listItems.forEach(item => {
      const link = item.querySelector("a");
      link?.addEventListener("click", (e) => {
        e.preventDefault();
        const id = link.getAttribute("href")?.substring(1);
        const target = document.getElementById(id || "");
        if (target) {
          target.scrollIntoView({ behavior: "smooth" });
          this.closeSheet();
        }
      });
    });
    
    // Drag to close events
    this.dragHandle.addEventListener("touchstart", this.handleTouchStart, { passive: true });
    document.addEventListener("touchmove", this.handleTouchMove, { passive: false });
    document.addEventListener("touchend", this.handleTouchEnd);
    
    // Scroll event for FAB
    window.addEventListener("scroll", () => this.handleScroll(), { passive: true });
    
    // Intersection observer for headings
    this.setupIntersectionObserver();
    
    // Initial scroll check
    this.handleScroll();
  }
  
  private handleScroll(): void {
    const currentScrollY = window.scrollY;
    // Show FAB when scrolling up, hide when scrolling down
    // Also show if at the very top
    if (currentScrollY < 100 || currentScrollY < this.lastScrollY) {
      this.fab.classList.remove("is-hidden");
    } else if (currentScrollY > this.lastScrollY + 10) {
      this.fab.classList.add("is-hidden");
    }
    this.lastScrollY = currentScrollY;
  }
  
  private openSheet(): void {
    if (this.isOpen) return;
    this.isOpen = true;
    this.sheet.classList.add("is-open");
    this.sheet.removeAttribute("inert");
    this.sheet.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden"; // Prevent background scrolling
    this.syncIndicator();
  }
  
  private closeSheet(): void {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.sheet.classList.remove("is-open");
    this.sheet.setAttribute("inert", "");
    this.sheet.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
    
    // Reset any drag transforms
    this.panel.style.transform = "";
  }
  
  // --- Drag Handling ---
  
  private handleTouchStart = (e: TouchEvent): void => {
    const touch = e.touches[0];
    if (!this.isOpen || !touch) return;
    this.isDragging = true;
    this.startY = touch.clientY;
    this.currentY = this.startY;
    this.sheet.classList.add("is-dragging");
  };
  
  private handleTouchMove = (e: TouchEvent): void => {
    const touch = e.touches[0];
    if (!this.isDragging || !touch) return;
    this.currentY = touch.clientY;
    const deltaY = Math.max(0, this.currentY - this.startY); // Only allow dragging down
    
    if (deltaY > 0) {
      // Prevent default scrolling on the panel if we are dragging the handle
      e.preventDefault();
      this.panel.style.transform = `translateY(${deltaY}px)`;
    }
  };
  
  private handleTouchEnd = (): void => {
    if (!this.isDragging) return;
    this.isDragging = false;
    this.sheet.classList.remove("is-dragging");
    
    const deltaY = this.currentY - this.startY;
    const threshold = 100; // pixels to drag down before closing
    
    if (deltaY > threshold) {
      this.closeSheet();
    } else {
      // Snap back
      this.panel.style.transform = "";
    }
  };
  
  // --- Active Heading Tracking ---
  
  private setupIntersectionObserver(): void {
    if (this.headings.length === 0) return;
    
    // Create an observer to track which headings are in view
    this.observer = new IntersectionObserver((entries) => {
      // A simplified approach is just to recalculate based on scroll position on ANY intersection change
      this.updateActiveHeading();
    }, {
      rootMargin: "-10% 0px -80% 0px", // Trigger when heading is near the top
      threshold: 0
    });
    
    this.headings.forEach(h => this.observer?.observe(h.element));
    window.addEventListener("scroll", () => this.updateActiveHeading(), { passive: true });
    
    // Initial check
    this.updateActiveHeading();
  }
  
  private updateActiveHeading(): void {
    if (this.headings.length === 0) return;
    
    const viewportTop = window.scrollY;
    const viewportBottom = viewportTop + window.innerHeight;
    
    let activeIndex = -1;
    const scrollYWithOffset = window.scrollY + 120; // Offset for fixed headers
    
    // Find the last heading that is above the current scroll position for the base active index
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
      activeIndex = 0; // Default to first if we are above it
    }

    // Now find visible range
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
  
  private setActiveIndex(index: number, endIndex: number): void {
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
  
  private syncIndicator(): void {
    if (this.activeIndex === -1 || this.endActiveIndex === -1) {
      this.tocNav.classList.remove("has-active");
      return;
    }
    
    this.tocNav.classList.add("has-active");
    
    // We need to wait for layout if it was just opened
    requestAnimationFrame(() => {
      const startItem = this.listItems[this.activeIndex];
      const endItem = this.listItems[this.endActiveIndex];
      if (!startItem || !endItem) return;

      const navRect = this.tocNav.getBoundingClientRect();
      const startItemRect = startItem.getBoundingClientRect();
      const endItemRect = endItem.getBoundingClientRect();
      
      // Calculate relative position
      const relativeTop = startItemRect.top - navRect.top + this.tocNav.scrollTop;
      const indicatorHeight = 18; // From CSS (base height)
      
      const totalHeight = Math.max(1, endItemRect.bottom - startItemRect.top);
      
      // We want to scale the indicator vertically to cover the total height
      const scale = totalHeight / indicatorHeight;
      const yOffset = relativeTop + (totalHeight - indicatorHeight * scale) / 2;
      
      this.indicator.style.setProperty("--indicator-y", `${yOffset}px`);
      this.indicator.style.setProperty("--indicator-scale", `${scale}`);
    });
  }
  
  public destroy(): void {
    this.observer?.disconnect();
    window.removeEventListener("scroll", this.handleScroll);
    
    // We used arrow functions for document touch events, so we can't remove them easily
    // But we can set a flag so they don't do anything
    this.isOpen = false; 
    
    // Actually we CAN remove them because they are bound to the class methods which are arrow functions
    document.removeEventListener("touchmove", this.handleTouchMove);
    document.removeEventListener("touchend", this.handleTouchEnd);
  }
}

let currentMobileTocController: MobileTocController | null = null;

// Initialization
function initMobileToc(): void {
  if (currentMobileTocController) {
    currentMobileTocController.destroy();
    currentMobileTocController = null;
  }

  const fab = document.querySelector<HTMLElement>("[data-mobile-toc-fab]");
  const sheet = document.querySelector<HTMLElement>("[data-mobile-toc-sheet]");
  const backdrop = document.querySelector<HTMLElement>("[data-mobile-toc-backdrop]");
  const panel = sheet?.querySelector<HTMLElement>(".mobile-toc-panel");
  const dragHandle = sheet?.querySelector<HTMLElement>("[data-mobile-toc-drag-handle]");
  const tocNav = sheet?.querySelector<HTMLElement>(".mobile-toc-nav");
  const indicator = tocNav?.querySelector<HTMLElement>("[data-mobile-toc-indicator]");
  const listItems = tocNav?.querySelectorAll<HTMLElement>("li");
  const postContent = document.querySelector<HTMLElement>(".post-content");
  
  if (fab && sheet && backdrop && panel && dragHandle && tocNav && indicator && listItems && postContent) {
    currentMobileTocController = new MobileTocController(
      fab, sheet, backdrop, panel, dragHandle, tocNav, indicator, listItems, postContent
    );
  }
}

// Initialize on DOM load and after page transitions
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initMobileToc);
} else {
  initMobileToc();
}

// Hook into page transitions if applicable
document.addEventListener("daybook:page-load", initMobileToc);
