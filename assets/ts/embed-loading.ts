export interface EmbedFallbackOptions {
  message?: string;
  linkText?: string;
  linkUrl?: string;
}

export function createFallbackElement(options: EmbedFallbackOptions): HTMLElement {
  const wrapper = document.createElement("div");
  wrapper.className = "embed-fallback";
  
  const icon = document.createElement("div");
  icon.innerHTML = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>`;
  wrapper.appendChild(icon);

  if (options.message) {
    const msg = document.createElement("span");
    msg.textContent = options.message;
    wrapper.appendChild(msg);
  }

  if (options.linkText && options.linkUrl) {
    const link = document.createElement("a");
    link.href = options.linkUrl;
    link.textContent = options.linkText;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    wrapper.appendChild(link);
  }

  return wrapper;
}

export function setupIframeEmbeds() {
  const iframes = document.querySelectorAll(".embed-frame iframe");
  iframes.forEach((iframeEl) => {
    const iframe = iframeEl as HTMLIFrameElement;
    const container = iframe.parentElement;
    if (!container || !container.classList.contains("embed-frame")) return;

    if (container.dataset.embedStatus === "loading" || container.dataset.embedStatus === "ready" || container.dataset.embedStatus === "error") {
      return; // Idempotent check
    }
    
    // Set initial state
    container.dataset.embedStatus = "loading";

    let isFinished = false;
    let timer: number | null = null;

    const finalize = (status: "ready" | "error") => {
      if (isFinished) return;
      isFinished = true;
      if (timer) window.clearTimeout(timer);
      container.dataset.embedStatus = status;

      if (status === "error") {
        let platformName = "外链";
        let url = iframe.src;
        if (url.includes("youtube") || url.includes("youtu.be")) platformName = "YouTube";
        else if (url.includes("bilibili")) platformName = "Bilibili";
        else if (url.includes("spotify")) platformName = "Spotify";
        else if (url.includes("codepen")) platformName = "CodePen";

        iframe.style.display = "none";
        const fallback = createFallbackElement({
          message: `无法加载 ${platformName} 嵌入内容`,
          linkText: `前往 ${platformName} 查看`,
          linkUrl: url
        });
        container.appendChild(fallback);
      }
    };

    iframe.addEventListener("load", () => finalize("ready"));
    iframe.addEventListener("error", () => finalize("error"));

    // 15s timeout
    timer = window.setTimeout(() => finalize("error"), 15000);
  });
}
