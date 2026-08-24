"use strict";
(() => {
  // assets/ts/mobile-drawer.ts
  (function() {
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
      if (isDrawerOpen || isTagsOpen || isSearchOpen) {
        document.body.style.overflow = "hidden";
      } else {
        document.body.style.overflow = "";
      }
    }
    function setDrawerOpen(isOpen) {
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
    function openOverlay(overlayTarget) {
      var overlayClass = "is-" + overlayTarget + "-overlay-open";
      document.body.classList.remove("is-tags-overlay-open", "is-search-overlay-open");
      document.body.classList.add(overlayClass);
      updateScrollLock();
      if (overlayTarget === "search") {
        var searchInput = document.getElementById("mobile-search-input");
        if (searchInput) {
          window.setTimeout(function() {
            if (searchInput) searchInput.focus();
          }, 50);
        }
      }
    }
    function closeOverlays() {
      document.body.classList.remove("is-tags-overlay-open", "is-search-overlay-open");
      updateScrollLock();
    }
    document.addEventListener("keydown", function(event) {
      if (event.key !== "Escape") return;
      if (document.body.classList.contains("is-tags-overlay-open") || document.body.classList.contains("is-search-overlay-open")) {
        closeOverlays();
        return;
      }
      if (document.body.classList.contains("is-mobile-drawer-open")) {
        setDrawerOpen(false);
      }
    });
    document.addEventListener("click", function(event) {
      var evTarget = event.target;
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
      if (evTarget.closest(".drawer-nav-link[href], .drawer-footer-row a")) {
        setDrawerOpen(false);
        return;
      }
      var overlayBtn = evTarget.closest("[data-mobile-overlay-target]");
      if (overlayBtn) {
        if (overlayBtn.tagName === "A") {
          event.preventDefault();
        }
        var target = overlayBtn.dataset.mobileOverlayTarget;
        if (!target) return;
        if (document.body.classList.contains("is-mobile-drawer-open")) {
          setDrawerOpen(false);
          var motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
          if (motionQuery && motionQuery.matches) {
            openOverlay(target || "");
          } else {
            var opened = false;
            var drawer = getDrawer();
            var onTransitionEnd = function(e) {
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
    window.daybookCloseMobileOverlays = closeOverlays;
  })();
})();
