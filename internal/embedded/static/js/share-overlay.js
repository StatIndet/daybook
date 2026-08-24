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
  let currentShareURL = "";
  function openShare(title, url, shareText) {
    if (!overlay || !textarea) return;
    currentShareURL = url;
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
      const url = btn.getAttribute("data-share-link") || "";
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
  function buildTelegramPayload(text, shareURL) {
    if (!shareURL || !text.includes(shareURL)) {
      return text;
    }
    const idx = text.indexOf(shareURL);
    let before = text.substring(0, idx);
    let after = text.substring(idx + shareURL.length);
    if (before.endsWith("\n") && after.startsWith("\n")) {
      before = before.substring(0, before.length - 1);
    } else if (before.trim() === "" && after.startsWith("\n")) {
      after = after.substring(1);
    } else if (after.trim() === "" && before.endsWith("\n")) {
      before = before.substring(0, before.length - 1);
    }
    return (before + after).trim();
  }
  if (tgBtn) {
    tgBtn.addEventListener("click", () => {
      const text = textarea.value;
      const tgText = buildTelegramPayload(text, currentShareURL);
      const url = `https://t.me/share/url?url=${encodeURIComponent(currentShareURL)}&text=${encodeURIComponent(tgText)}`;
      window.open(url, "_blank", "noopener,noreferrer");
    });
  }
  function animateTextChange(container, newText) {
    let oldText = "";
    const newSpans = container.querySelectorAll(".share-char-new");
    if (newSpans.length > 0) {
      newSpans.forEach((span) => {
        oldText += span.textContent || "";
      });
    } else {
      oldText = container.textContent?.trim() || "";
    }
    if (oldText === newText) return;
    const animationId = Math.random().toString(36).substring(2);
    container.setAttribute("data-animation-id", animationId);
    const maxLength = Math.max(oldText.length, newText.length);
    container.innerHTML = "";
    container.style.display = "inline";
    container.style.whiteSpace = "nowrap";
    for (let i = 0; i < maxLength; i++) {
      const wrapper = document.createElement("span");
      wrapper.style.position = "relative";
      if (oldText[i]) {
        const oldSpan = document.createElement("span");
        oldSpan.textContent = oldText[i] || null;
        oldSpan.style.position = newText[i] ? "absolute" : "relative";
        oldSpan.style.left = "0";
        oldSpan.style.top = "0";
        oldSpan.style.animation = `shareRollOut 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards`;
        oldSpan.style.animationDelay = `${i * 0.03}s`;
        wrapper.appendChild(oldSpan);
      }
      if (newText[i]) {
        const newSpan = document.createElement("span");
        newSpan.className = "share-char-new";
        newSpan.textContent = newText[i] || null;
        newSpan.style.position = "relative";
        newSpan.style.animation = `shareRollIn 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards`;
        newSpan.style.animationDelay = `${i * 0.03}s`;
        newSpan.style.opacity = "0";
        newSpan.style.top = "1em";
        wrapper.appendChild(newSpan);
      }
      container.appendChild(wrapper);
    }
    setTimeout(() => {
      if (container.getAttribute("data-animation-id") === animationId) {
        container.textContent = newText;
        container.style.display = "";
        container.style.whiteSpace = "";
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
