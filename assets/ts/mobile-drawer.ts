(function () {
  let overlayOpener: HTMLElement | null = null;
  function getDrawerToggle() {
    return document.getElementById("mobile-menu-toggle");
  }

  function getDrawer() {
    return document.getElementById("mobile-drawer");
  }

  function getDrawerMask() {
    return document.getElementById("mobile-drawer-mask");
  }

  function getOverlayMask() {
    return document.getElementById("mobile-overlay-mask");
  }

  function updateScrollLock() {
    var isDrawerOpen = document.body.classList.contains("is-mobile-drawer-open");
    var isTagsOpen = document.body.classList.contains("is-tags-overlay-open");
    var isSearchOpen = document.body.classList.contains("is-search-overlay-open");
    
    const overlay = document.getElementById("mobile-overlay-container");
    overlay?.setAttribute("aria-hidden", String(!isTagsOpen && !isSearchOpen));
    document.querySelectorAll<HTMLElement>("[data-mobile-overlay-target]").forEach(button => {
      button.setAttribute("aria-expanded", String(button.dataset.mobileOverlayTarget === "tags" ? isTagsOpen : isSearchOpen));
    });
    const main = document.querySelector<HTMLElement>(".page-frame main");
    if (main) main.inert = isTagsOpen && (window.matchMedia("(min-width: 961px)").matches || document.body.dataset.pageKind === "memos");

    if (isDrawerOpen || isTagsOpen || isSearchOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
  }

  function setDrawerOpen(isOpen: boolean) {
    var drawerToggle = getDrawerToggle();
    var drawer = getDrawer();
    var drawerMask = getDrawerMask();

    var expanded = isOpen ? "true" : "false";
    if (drawerToggle) drawerToggle.setAttribute("aria-expanded", expanded);
    if (drawer) drawer.setAttribute("aria-hidden", !isOpen ? "true" : "false");
    if (drawerMask) drawerMask.setAttribute("aria-hidden", !isOpen ? "true" : "false");

    if (isOpen) {
      document.body.classList.add("is-mobile-drawer-open");
    } else {
      document.body.classList.remove("is-mobile-drawer-open");
    }
    updateScrollLock();
  }

  function openOverlay(overlayTarget: string) {
    var overlayClass = "is-" + overlayTarget + "-overlay-open";
    
    document.body.classList.remove("is-tags-overlay-open", "is-search-overlay-open");
    document.body.classList.add(overlayClass);
    updateScrollLock();

    if (overlayTarget === "tags") {
      // Reduced-motion CSS gives even visibility a 1ms transition. The first
      // frame can still be hidden, so focus only after the sheet is visible.
      const focusVisibleSheet = () => {
        if (!document.body.classList.contains("is-tags-overlay-open")) return;
        const close = document.querySelector<HTMLElement>("#mobile-tags-overlay [data-overlay-close]");
        if (!close) return;
        if (getComputedStyle(close).visibility !== "visible") {
          requestAnimationFrame(focusVisibleSheet);
          return;
        }
        close.focus({ preventScroll: true });
      };
      requestAnimationFrame(focusVisibleSheet);
    }
    if (overlayTarget === "search") {
      var searchInput = document.getElementById("mobile-search-input");
      if (searchInput) {
        window.setTimeout(function() {
          if(searchInput) searchInput.focus();
        }, 50);
      }
    }
  }

  function closeOverlays() {
    document.body.classList.remove("is-tags-overlay-open", "is-search-overlay-open");
    updateScrollLock();
    if (overlayOpener?.isConnected) {
      const returnTarget = document.body.dataset.pageKind === "memos" && overlayOpener.closest("#mobile-drawer") && !document.body.classList.contains("is-mobile-drawer-open") ? getDrawerToggle() : overlayOpener;
      returnTarget?.focus({ preventScroll: true });
    }
    overlayOpener = null;
  }

  document.addEventListener("keydown", function (event: KeyboardEvent) {
    if (event.key === "Tab" && document.body.dataset.pageKind === "memos" && document.body.classList.contains("is-tags-overlay-open")) {
      const panel = document.getElementById("mobile-tags-overlay");
      const controls = Array.from(panel?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), [tabindex="0"]') || []).filter(el => el.getClientRects().length > 0);
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (first && last) {
        if (event.shiftKey && (document.activeElement === first || !panel?.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && (document.activeElement === last || !panel?.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
      }
      return;
    }
    if (event.key !== "Escape") return;
    
    if (document.body.classList.contains("is-tags-overlay-open") || document.body.classList.contains("is-search-overlay-open")) {
      closeOverlays();
      return;
    }
    
    if (document.body.classList.contains("is-mobile-drawer-open")) {
      setDrawerOpen(false);
    }
  });

  document.addEventListener("click", function (event: MouseEvent) {
    var evTarget = event.target as HTMLElement;

    var toggleBtn = evTarget.closest("#mobile-menu-toggle");
    if (toggleBtn) {
      var isOpen = document.body.classList.contains("is-mobile-drawer-open");
      setDrawerOpen(!isOpen);
      return;
    }

    if (evTarget.closest("#mobile-drawer-mask")) {
      setDrawerOpen(false);
      return;
    }

    if (evTarget.closest("#mobile-overlay-mask")) {
      closeOverlays();
      return;
    }

    if (evTarget.closest(".drawer-nav-link[href]:not([data-rss-open]), .drawer-footer-row a")) {
      setDrawerOpen(false);
      return;
    }

    var overlayBtn = evTarget.closest("[data-mobile-overlay-target]") as HTMLElement | null;
    if (overlayBtn) {
      if (overlayBtn.tagName === "A") {
        event.preventDefault();
      }
      var target = overlayBtn.dataset.mobileOverlayTarget;
      if (!target) return;
      if (document.body.classList.contains("is-" + target + "-overlay-open")) {
        closeOverlays();
        return;
      }
      overlayOpener = overlayBtn;

      if (document.body.classList.contains("is-mobile-drawer-open")) {
        setDrawerOpen(false);
        
        var motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
        if (motionQuery && motionQuery.matches) {
           openOverlay(target || "");
        } else {
           var opened = false;
           var drawer = getDrawer();
           var onTransitionEnd = function(e: TransitionEvent) {
             if (e && e.target !== drawer || e.propertyName !== "transform") return;
             if (drawer) drawer.removeEventListener("transitionend", onTransitionEnd);
             if (!opened) {
               opened = true;
               openOverlay(target || "");
             }
           };
           if (drawer) drawer.addEventListener("transitionend", onTransitionEnd);
           window.setTimeout(function() {
             if (!opened) {
               if (drawer) drawer.removeEventListener("transitionend", onTransitionEnd);
               opened = true;
               openOverlay(target || "");
             }
           }, 450);
        }
      } else {
        openOverlay(target || "");
      }
      return;
    }

    if (evTarget.closest("[data-overlay-close]")) {
      closeOverlays();
      return;
    }
    
    var tagLink = evTarget.closest("[data-mobile-tag]");
    if (tagLink) {
       closeOverlays();
    }
  });

  window.addEventListener("resize", () => {
    if (document.body.classList.contains("is-tags-overlay-open") || document.body.classList.contains("is-search-overlay-open")) {
      updateScrollLock();
    }
  });
  document.addEventListener("daybook:page-load", updateScrollLock);
  window.daybookCloseMobileOverlays = closeOverlays;

})();
