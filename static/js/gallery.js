(function () {
  function handleGalleryWheel(e) {
    var container = e.target.closest(".md-gallery");
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
