// image-loader.ts

export function setupImages() {
  // Only target images inside article content or gallery, 
  // exclude Netease cover images, logos, avatars
  const contentImages = document.querySelectorAll('.markdown img, .gallery img');
  
  contentImages.forEach((imgEl) => {
    const img = imgEl as HTMLImageElement;
    
    // Ignore specific images we don't want to skeleton-load
    if (img.classList.contains("nm-cover")) return;
    if (img.closest('.persistent-logo')) return;
    if (img.closest('.side-nav-avatar')) return;

    if (img.dataset.embedStatus === "loading" || img.dataset.embedStatus === "ready" || img.dataset.embedStatus === "error") {
      return;
    }

    // If it's already completely loaded by the browser (e.g. from cache)
    if (img.complete && img.naturalHeight > 0) {
      img.dataset.embedStatus = "ready";
      return;
    }

    img.dataset.embedStatus = "loading";
    
    let isFinished = false;

    // We use a generous timeout for remote images
    const timer = window.setTimeout(() => {
      if (isFinished) return;
      isFinished = true;
      img.dataset.embedStatus = "error";
      // We don't want to hide the image if it times out, the browser broken image icon is okay,
      // but we could set an error SVG if we wanted. For now, just mark it error.
    }, 20000);

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
