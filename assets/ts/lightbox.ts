(function () {
  var overlay: HTMLElement | null = null;
  var zoomedImg: HTMLImageElement | null = null;
  var originalImg: HTMLImageElement | null = null;

  // Setup overlay element
  function setupOverlay() {
    if (overlay) return;
    overlay = document.createElement("div");
    overlay.className = "zoom-overlay";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-label", "图片浏览器");
    overlay.setAttribute("tabindex", "-1");

    document.body.appendChild(overlay);
  }

  // Zoom in the image
  function zoomIn(img: HTMLImageElement) {
    if (!overlay) {
      setupOverlay();
    }

    // Disable scrolling and get position
    document.body.style.overflow = "hidden";
    var rect = img.getBoundingClientRect();
    originalImg = img;

    // Clone and setup image
    zoomedImg = img.cloneNode() as HTMLImageElement;
    zoomedImg.className = "zoom-img";
    zoomedImg.removeAttribute("id");
    zoomedImg.removeAttribute("loading");

    zoomedImg.style.top = rect.top + "px";
    zoomedImg.style.left = rect.left + "px";
    zoomedImg.style.width = rect.width + "px";
    zoomedImg.style.height = rect.height + "px";

    // Add to DOM and show
    document.body.appendChild(zoomedImg);
    if(overlay) overlay.style.display = "block";
    if(overlay) overlay.focus();

    // Calculate scale and position
    var viewportWidth = window.innerWidth;
    var viewportHeight = window.innerHeight;
    var scaleFactor = window.innerWidth < 768 ? 1 : 0.8;
    var scale = Math.min(
      (viewportWidth * scaleFactor) / rect.width,
      (viewportHeight * scaleFactor) / rect.height
    );
    
    var translateX = (-rect.left + (viewportWidth - rect.width) / 2) / scale;
    var translateY = (-rect.top + (viewportHeight - rect.height) / 2) / scale;

    // Start animation
    requestAnimationFrame(function () {
      if (overlay) {
        overlay.style.opacity = "1";
      }

      if (zoomedImg) {
        zoomedImg.style.transform = "scale(" + scale + ") translate3d(" + translateX + "px, " + translateY + "px, 0)";
      }
    });
  }

  // Zoom out the image
  function zoomOut() {
    if (!overlay || !zoomedImg || !originalImg) {
      return;
    }

    // Start closing animation
    zoomedImg.style.transform = "";
    overlay.style.opacity = "0";
    document.body.style.overflow = "";

    var currentZoomedImg = zoomedImg;
    var currentOverlay = overlay;
    var currentOriginalImg = originalImg;

    // Define cleanup logic
    var cleanup = function () {
      if (!currentZoomedImg) return;

      // Remove zoomed image
      if (currentZoomedImg.parentNode) {
        currentZoomedImg.parentNode.removeChild(currentZoomedImg);
      }

      // Hide overlay
      if (currentOverlay) {
        currentOverlay.style.display = "none";
      }

      // Restore focus
      if (currentOriginalImg && document.body.contains(currentOriginalImg)) {
        try {
          currentOriginalImg.focus({ preventScroll: true });
        } catch (e) {
          currentOriginalImg.focus();
        }
      }
    };

    // Listen for transition end to cleanup
    currentZoomedImg.addEventListener("transitionend", cleanup, { once: true });
    
    // Reset state early so multiple clicks don't break it
    zoomedImg = null;
    originalImg = null;
  }

  // Handle click events
  function handleClick(event: MouseEvent) {
    if (zoomedImg) {
      zoomOut();
      return;
    }

    var target = event.target as HTMLElement;
    // We only target images in .post-content
    if (!target || target.tagName !== "IMG" || !target.closest(".post-content")) {
      return;
    }
    
    // Ignore images inside explicit links or with no-lightbox
    if (target.closest("a[href]") || target.matches(".no-lightbox, [data-no-lightbox=\"true\"]")) {
      return;
    }

    var imgTarget = target as HTMLImageElement;

    // Ignore small or incomplete images
    if (!imgTarget.complete || imgTarget.width < 100 || imgTarget.height < 100) {
      return;
    }

    event.preventDefault();
    zoomIn(imgTarget);
  }
  
  function handleKeyDown(event: KeyboardEvent) {
    if (zoomedImg && event.key === "Escape") {
      event.preventDefault();
      zoomOut();
    }
  }

  document.addEventListener("daybook:page-load", setupOverlay);

  document.addEventListener("daybook:before-swap", function() {
    if (zoomedImg) {
      zoomOut();
    }
  });

  document.addEventListener("click", handleClick);
  document.addEventListener("keydown", handleKeyDown);
  window.addEventListener("resize", zoomOut);
  window.addEventListener("scroll", zoomOut, { passive: true });
})();
