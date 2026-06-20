(function () {
  var drawerToggle = document.getElementById("mobile-menu-toggle") as HTMLElement | null;
  var drawer = document.getElementById("mobile-drawer") as HTMLElement | null;
  var drawerMask = document.getElementById("mobile-drawer-mask") as HTMLElement | null;
  
  if (!drawerToggle || !drawer || !drawerMask) {
    return;
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

  function setDrawerOpen(isOpen: boolean) {
    var expanded = isOpen ? "true" : "false";
    if(drawerToggle) drawerToggle.setAttribute("aria-expanded", expanded);
    if(drawer) drawer.setAttribute("aria-hidden", !isOpen ? "true" : "false");
    if(drawerMask) drawerMask.setAttribute("aria-hidden", !isOpen ? "true" : "false");

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
  }

  drawerToggle.addEventListener("click", function () {
    var isOpen = document.body.classList.contains("is-mobile-drawer-open");
    setDrawerOpen(!isOpen);
  });

  drawerMask.addEventListener("click", function () {
    setDrawerOpen(false);
  });

  var overlayMask = document.getElementById("mobile-overlay-mask");
  if (overlayMask) {
    overlayMask.addEventListener("click", function () {
      closeOverlays();
    });
  }

  document.addEventListener("keydown", function (event: KeyboardEvent) {
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
    if (evTarget.closest(".drawer-nav-link[href], .drawer-footer-row a")) {
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
      
      if (document.body.classList.contains("is-mobile-drawer-open")) {
        setDrawerOpen(false);
        
        var motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
        if (motionQuery && motionQuery.matches) {
           openOverlay(target || "");
        } else {
           var opened = false;
           var onTransitionEnd = function(e: TransitionEvent) {
             if (e && e.target !== drawer || e.propertyName !== "transform") return;
             if(drawer) drawer.removeEventListener("transitionend", onTransitionEnd);
             if (!opened) {
               opened = true;
               openOverlay(target || "");
             }
           };
           if(drawer) drawer.addEventListener("transitionend", onTransitionEnd);
           window.setTimeout(function() {
             if (!opened) {
               if(drawer) drawer.removeEventListener("transitionend", onTransitionEnd);
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
