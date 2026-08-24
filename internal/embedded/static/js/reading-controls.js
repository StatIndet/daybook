// assets/ts/reading-controls.ts
var scrollListenerAdded = false;
var ticking = false;
var isHidden = false;
var lastScrollY = window.scrollY;
var viewportOffsetTicking = false;
var lastReaderProgressVisualTop = null;
function initReadingControls() {
  const isNotePage = document.querySelector(".note") !== null;
  if (!scrollListenerAdded) {
    window.addEventListener("scroll", onScroll, { passive: true });
    document.addEventListener("daybook:reader-mode-change", (e) => {
      const customEvent = e;
      requestAnimationFrame(() => {
        updateReadingControls();
      });
      if (customEvent.detail && customEvent.detail.enabled) {
        requestReaderProgressVisualSync();
      }
    });
    if (window.visualViewport) {
      window.visualViewport.addEventListener("scroll", requestReaderProgressVisualSync, { passive: true });
      window.visualViewport.addEventListener("resize", requestReaderProgressVisualSync, { passive: true });
    }
    scrollListenerAdded = true;
  }
  if (isNotePage) {
    requestAnimationFrame(() => {
      updateReadingControls();
    });
    requestReaderProgressVisualSync();
  } else {
    document.body.classList.remove("mobile-top-bar-hidden");
    isHidden = false;
  }
}
function requestReaderProgressVisualSync() {
  if (viewportOffsetTicking) return;
  viewportOffsetTicking = true;
  requestAnimationFrame(() => {
    syncReaderProgressVisualTop();
    viewportOffsetTicking = false;
  });
}
function syncReaderProgressVisualTop() {
  const isReaderMode = document.body.dataset.readerMode === "immersive";
  const isMobile = window.innerWidth <= 960;
  if (!isReaderMode || !isMobile) return;
  const rawOffset = window.visualViewport ? window.visualViewport.offsetTop : 0;
  if (lastReaderProgressVisualTop === null || Math.abs(rawOffset - lastReaderProgressVisualTop) > 0.05) {
    document.body.style.setProperty("--reader-progress-visual-top", `${rawOffset}px`);
    lastReaderProgressVisualTop = rawOffset;
  }
}
function onScroll() {
  if (!ticking) {
    window.requestAnimationFrame(() => {
      updateReadingControls();
      ticking = false;
    });
    ticking = true;
  }
}
function updateReadingControls() {
  const isNotePage = document.querySelector(".note") !== null;
  if (!isNotePage) return;
  const topBar = document.getElementById("mobile-top-bar");
  const desktopTexts = document.querySelectorAll("[data-desktop-progress-text]");
  const mobileTexts = document.querySelectorAll("[data-mobile-progress-text]");
  const backToTopBtns = document.querySelectorAll(".back-to-top-btn, .mobile-top-btn");
  const goToBottomBtns = document.querySelectorAll(".go-to-bottom-btn, .mobile-bottom-btn, .reading-progress-btn");
  backToTopBtns.forEach((btn) => {
    const htmlBtn = btn;
    if (!htmlBtn.dataset.rcBound) {
      htmlBtn.addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));
      htmlBtn.dataset.rcBound = "true";
    }
  });
  goToBottomBtns.forEach((btn) => {
    const htmlBtn = btn;
    if (!htmlBtn.dataset.rcBound) {
      htmlBtn.addEventListener("click", () => {
        const headings = document.querySelectorAll(".post-content h1, .post-content h2, .post-content h3, .post-content h4, .post-content h5, .post-content h6");
        if (headings.length > 0) {
          const lastHeading = headings[headings.length - 1];
          if (lastHeading) {
            const y = lastHeading.getBoundingClientRect().top + window.scrollY - 100;
            window.scrollTo({ top: y, behavior: "smooth" });
            return;
          }
        }
        window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "smooth" });
      });
      htmlBtn.dataset.rcBound = "true";
    }
  });
  const currentScrollY = window.scrollY;
  const SCROLL_THRESHOLD = 80;
  if (currentScrollY <= 0) {
    document.body.classList.add("is-at-top");
  } else {
    document.body.classList.remove("is-at-top");
  }
  const scrollHeight = document.documentElement.scrollHeight;
  const innerHeight = window.innerHeight;
  const scrollRange = scrollHeight - innerHeight;
  let progress = 0;
  if (scrollRange > 0) {
    progress = Math.round(currentScrollY / scrollRange * 100);
    progress = Math.max(0, Math.min(100, progress));
  }
  desktopTexts.forEach((el) => el.textContent = `${progress}%`);
  mobileTexts.forEach((el) => el.textContent = `${progress}%`);
  const progressCircles = document.querySelectorAll("[data-progress-circle]");
  const CIRCLE_CIRCUMFERENCE = 62.8318;
  progressCircles.forEach((circle) => {
    const offset = CIRCLE_CIRCUMFERENCE - progress / 100 * CIRCLE_CIRCUMFERENCE;
    circle.style.strokeDashoffset = offset.toString();
  });
  const progressStr = `${progress}%`;
  document.body.style.setProperty("--reading-progress", progressStr);
  const isReaderMode = document.body.dataset.readerMode === "immersive";
  const isMobile = window.innerWidth <= 960;
  if (isMobile) {
    if (!isReaderMode && topBar) {
      const overlaysOpen = document.body.classList.contains("is-mobile-drawer-open") || document.body.classList.contains("is-search-overlay-open") || document.body.classList.contains("is-tags-overlay-open");
      if (overlaysOpen) {
        if (isHidden) {
          document.body.classList.remove("mobile-top-bar-hidden");
          isHidden = false;
        }
      } else {
        if (currentScrollY <= 0) {
          if (isHidden) {
            document.body.classList.remove("mobile-top-bar-hidden");
            isHidden = false;
          }
        } else if (currentScrollY > lastScrollY) {
          document.body.classList.add("is-scrolling-down");
          document.body.classList.remove("is-scrolling-up");
          if (currentScrollY > SCROLL_THRESHOLD && !isHidden) {
            document.body.classList.add("mobile-top-bar-hidden");
            isHidden = true;
          }
        } else if (currentScrollY < lastScrollY) {
          document.body.classList.add("is-scrolling-up");
          document.body.classList.remove("is-scrolling-down");
          if (isHidden) {
            document.body.classList.remove("mobile-top-bar-hidden");
            isHidden = false;
          }
        }
      }
    }
  } else {
    if (isHidden) {
      document.body.classList.remove("mobile-top-bar-hidden");
      isHidden = false;
    }
  }
  lastScrollY = currentScrollY;
}
export {
  initReadingControls
};
//# sourceMappingURL=reading-controls.js.map
