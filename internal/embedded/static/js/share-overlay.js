// assets/ts/share-overlay.ts
function initShareOverlay() {
  const overlay = document.getElementById("share-overlay");
  if (!overlay) return;
  const closeBtns = overlay.querySelectorAll("[data-share-close]");
  const textarea = overlay.querySelector("#share-textarea");
  const xBtn = overlay.querySelector("[data-share-x]");
  const tgBtn = overlay.querySelector("[data-share-tg]");
  const copyBtn = overlay.querySelector("[data-share-copy]");
  const copyText = overlay.querySelector(".share-copy-text");
  if (overlay.dataset.shareBound === "true") {
    return;
  }
  overlay.dataset.shareBound = "true";
  function openShare(title, url, shareText) {
    if (!overlay || !textarea) return;
    const defaultText = shareText + "\n" + url;
    textarea.value = defaultText;
    overlay.removeAttribute("inert");
    overlay.setAttribute("aria-hidden", "false");
    overlay.classList.add("is-open");
    document.body.style.overflow = "hidden";
  }
  function closeShare() {
    if (!overlay) return;
    overlay.setAttribute("inert", "");
    overlay.setAttribute("aria-hidden", "true");
    overlay.classList.remove("is-open");
    document.body.style.overflow = "";
  }
  document.addEventListener("click", (e) => {
    const target = e.target;
    const btn = target.closest("[data-share-open]");
    if (btn) {
      const title = btn.getAttribute("data-share-title") || "";
      const url = btn.getAttribute("data-share-url") || "";
      const shareText = btn.getAttribute("data-share-text") || "";
      openShare(title, url, shareText);
    }
  });
  closeBtns.forEach((btn) => {
    btn.addEventListener("click", closeShare);
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && overlay.classList.contains("is-open")) {
      closeShare();
    }
  });
  if (xBtn) {
    xBtn.addEventListener("click", () => {
      const text = textarea.value;
      const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`;
      window.open(url, "_blank", "noopener,noreferrer");
    });
  }
  if (tgBtn) {
    tgBtn.addEventListener("click", () => {
      const text = textarea.value;
      const url = `https://t.me/share/url?url=&text=${encodeURIComponent(text)}`;
      window.open(url, "_blank", "noopener,noreferrer");
    });
  }
  function animateTextChange(container, newText) {
    if (container.hasAttribute("data-animating")) return;
    const oldText = container.textContent?.trim() || "";
    if (oldText === newText) return;
    const htmlContainer = container;
    htmlContainer.setAttribute("data-animating", "true");
    const animationId = Math.random().toString(36).substring(2);
    htmlContainer.setAttribute("data-animation-id", animationId);
    htmlContainer.textContent = oldText;
    const oldRects = [];
    let textNode = htmlContainer.firstChild;
    if (textNode) {
      const range = document.createRange();
      const containerRect = htmlContainer.getBoundingClientRect();
      for (let i = 0; i < oldText.length; i++) {
        range.setStart(textNode, i);
        range.setEnd(textNode, i + 1);
        const r = range.getBoundingClientRect();
        oldRects.push({ left: r.left - containerRect.left });
      }
    }
    htmlContainer.textContent = newText;
    const newRects = [];
    textNode = htmlContainer.firstChild;
    let finalWidth = 0;
    let finalHeight = 0;
    if (textNode) {
      const range = document.createRange();
      const containerRect = htmlContainer.getBoundingClientRect();
      finalWidth = containerRect.width;
      finalHeight = containerRect.height;
      for (let i = 0; i < newText.length; i++) {
        range.setStart(textNode, i);
        range.setEnd(textNode, i + 1);
        const r = range.getBoundingClientRect();
        newRects.push({ left: r.left - containerRect.left });
      }
    }
    htmlContainer.innerHTML = "";
    htmlContainer.style.width = `${finalWidth}px`;
    htmlContainer.style.height = `${finalHeight}px`;
    htmlContainer.style.display = "inline-block";
    htmlContainer.style.position = "relative";
    const maxLength = Math.max(oldText.length, newText.length);
    for (let i = 0; i < maxLength; i++) {
      if (oldText[i] && oldRects[i]) {
        const oldSpan = document.createElement("span");
        oldSpan.textContent = oldText[i];
        oldSpan.style.position = "absolute";
        oldSpan.style.left = `${oldRects[i].left}px`;
        oldSpan.style.top = "0px";
        oldSpan.style.lineHeight = `${finalHeight}px`;
        oldSpan.style.animation = `shareRollOut 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards`;
        oldSpan.style.animationDelay = `${i * 0.03}s`;
        htmlContainer.appendChild(oldSpan);
      }
      if (newText[i] && newRects[i]) {
        const newSpan = document.createElement("span");
        newSpan.textContent = newText[i];
        newSpan.style.position = "absolute";
        newSpan.style.left = `${newRects[i].left}px`;
        newSpan.style.top = "0px";
        newSpan.style.lineHeight = `${finalHeight}px`;
        newSpan.style.animation = `shareRollIn 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards`;
        newSpan.style.animationDelay = `${i * 0.03}s`;
        newSpan.style.opacity = "0";
        newSpan.style.transform = "translateY(100%)";
        htmlContainer.appendChild(newSpan);
      }
    }
    setTimeout(() => {
      if (htmlContainer.getAttribute("data-animation-id") === animationId) {
        if (htmlContainer.children.length > 0) {
          htmlContainer.textContent = newText;
        }
        htmlContainer.style.width = "";
        htmlContainer.style.height = "";
        htmlContainer.style.display = "";
        htmlContainer.style.position = "";
        htmlContainer.removeAttribute("data-animating");
      }
    }, 400 + maxLength * 30 + 50);
  }
  if (copyBtn && copyText) {
    copyBtn.addEventListener("click", () => {
      const text = textarea.value;
      navigator.clipboard.writeText(text).then(() => {
        const lang = document.documentElement.lang.toLowerCase().startsWith("en") ? "en" : "zh";
        const copiedText = copyText.getAttribute(`data-text-copied-${lang}`) || "Copied";
        animateTextChange(copyText, copiedText);
        setTimeout(() => {
          const currentLang = document.documentElement.lang.toLowerCase().startsWith("en") ? "en" : "zh";
          const freshOriginal = copyText.getAttribute(`data-text-copy-${currentLang}`) || "Copy";
          animateTextChange(copyText, freshOriginal);
        }, 1500);
      });
    });
  }
}
export {
  initShareOverlay
};
//# sourceMappingURL=share-overlay.js.map
