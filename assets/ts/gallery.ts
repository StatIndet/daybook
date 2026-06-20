(function () {
  function handleGalleryWheel(e: WheelEvent) {
    const target = e.target as HTMLElement;
    var container = target.closest(".md-gallery") as HTMLElement | null;
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
