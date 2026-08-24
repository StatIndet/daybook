// assets/ts/image-loader.ts
function setupImages() {
  const contentImages = document.querySelectorAll(".markdown img, .gallery img");
  contentImages.forEach((imgEl) => {
    const img = imgEl;
    if (img.classList.contains("music-cover")) return;
    if (img.closest(".persistent-logo")) return;
    if (img.closest(".side-nav-avatar")) return;
    if (img.dataset.embedStatus === "loading" || img.dataset.embedStatus === "ready" || img.dataset.embedStatus === "error") {
      return;
    }
    if (img.complete && img.naturalHeight > 0) {
      img.dataset.embedStatus = "ready";
      return;
    }
    img.dataset.embedStatus = "loading";
    let isFinished = false;
    const timer = window.setTimeout(() => {
      if (isFinished) return;
      isFinished = true;
      img.dataset.embedStatus = "error";
    }, 2e4);
    const onReady = () => {
      if (isFinished) return;
      isFinished = true;
      window.clearTimeout(timer);
      img.dataset.embedStatus = "ready";
    };
    const onError = () => {
      if (isFinished) return;
      isFinished = true;
      window.clearTimeout(timer);
      img.dataset.embedStatus = "error";
    };
    img.addEventListener("load", onReady);
    img.addEventListener("error", onError);
  });
}
export {
  setupImages
};
//# sourceMappingURL=image-loader.js.map
