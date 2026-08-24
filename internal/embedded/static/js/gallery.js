"use strict";
(() => {
  // assets/ts/gallery.ts
  (function() {
    function handleGalleryWheel(e) {
      const target = e.target;
      var container = target.closest(".md-gallery");
      if (!container) {
        return;
      }
      var previousScrollLeft = container.scrollLeft;
      container.scrollLeft += e.deltaY;
      if (container.scrollLeft === previousScrollLeft) {
        return;
      }
      e.preventDefault();
    }
    document.addEventListener("wheel", handleGalleryWheel, { passive: false });
  })();
})();
