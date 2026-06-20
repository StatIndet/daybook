(function () {
  var drawerToggle = document.getElementById("mobile-menu-toggle");
  var drawer = document.getElementById("mobile-drawer");
  var drawerMask = document.getElementById("mobile-drawer-mask");
  
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

  function setDrawerOpen(isOpen) {
    var expanded = isOpen ? "true" : "false";
    drawerToggle.setAttribute("aria-expanded", expanded);
    drawer.setAttribute("aria-hidden", !isOpen ? "true" : "false");
    drawerMask.setAttribute("aria-hidden", !isOpen ? "true" : "false");

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
          searchInput.focus();
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

  document.addEventListener("keydown", function (event) {
    if (event.key !== "Escape") return;
    
    if (document.body.classList.contains("is-tags-overlay-open") || document.body.classList.contains("is-search-overlay-open")) {
      closeOverlays();
      return;
    }
    
    if (document.body.classList.contains("is-mobile-drawer-open")) {
      setDrawerOpen(false);
    }
  });

  document.addEventListener("click", function (event) {
    if (event.target.closest(".drawer-nav-link[href], .drawer-footer-row a")) {
      setDrawerOpen(false);
      return;
    }

    var overlayBtn = event.target.closest("[data-mobile-overlay-target]");
    if (overlayBtn) {
      if (overlayBtn.tagName === "A") {
        event.preventDefault();
      }
      var target = overlayBtn.dataset.mobileOverlayTarget;
      
      if (document.body.classList.contains("is-mobile-drawer-open")) {
        setDrawerOpen(false);
        
        var motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
        if (motionQuery && motionQuery.matches) {
           openOverlay(target);
        } else {
           var opened = false;
           var onTransitionEnd = function(e) {
             if (e && e.target !== drawer || e.propertyName !== "transform") return;
             drawer.removeEventListener("transitionend", onTransitionEnd);
             if (!opened) {
               opened = true;
               openOverlay(target);
             }
           };
           drawer.addEventListener("transitionend", onTransitionEnd);
           window.setTimeout(function() {
             if (!opened) {
               drawer.removeEventListener("transitionend", onTransitionEnd);
               opened = true;
               openOverlay(target);
             }
           }, 450);
        }
      } else {
        openOverlay(target);
      }
      return;
    }

    if (event.target.closest("[data-overlay-close]")) {
      closeOverlays();
      return;
    }
    
    var tagLink = event.target.closest("[data-mobile-tag]");
    if (tagLink) {
       closeOverlays();
    }
  });

  window.daybookCloseMobileOverlays = closeOverlays;

})();
