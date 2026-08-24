// assets/ts/reader-mode.ts
var isBound = false;
function toggleReaderMode() {
  const isImmersive = document.body.dataset.readerMode === "immersive";
  setReaderMode(!isImmersive);
}
function setReaderMode(enabled) {
  if (enabled) {
    document.body.dataset.readerMode = "immersive";
  } else {
    delete document.body.dataset.readerMode;
  }
  syncReaderControls();
  document.dispatchEvent(new CustomEvent("daybook:reader-mode-change", { detail: { enabled } }));
}
function clearReaderMode() {
  if (document.body.dataset.readerMode === "immersive") {
    delete document.body.dataset.readerMode;
  }
}
function syncReaderControls() {
  const isImmersive = document.body.dataset.readerMode === "immersive";
  const toggleBtns = document.querySelectorAll("[data-reader-toggle]");
  toggleBtns.forEach((btn) => {
    btn.setAttribute("aria-pressed", isImmersive.toString());
  });
  const exitBtns = document.querySelectorAll("[data-reader-exit]");
  exitBtns.forEach((btn) => {
    if (isImmersive) {
      btn.removeAttribute("hidden");
    } else {
      btn.setAttribute("hidden", "true");
    }
  });
}
function handleKeyDown(e) {
  if (e.key === "Escape" && document.body.dataset.readerMode === "immersive") {
    e.preventDefault();
    setReaderMode(false);
  }
}
function bindEvents() {
  if (isBound) return;
  isBound = true;
  document.addEventListener("click", (e) => {
    const target = e.target;
    const toggleBtn = target.closest("[data-reader-toggle]");
    if (toggleBtn) {
      e.preventDefault();
      toggleReaderMode();
      return;
    }
    const exitBtn = target.closest("[data-reader-exit]");
    if (exitBtn) {
      e.preventDefault();
      setReaderMode(false);
      return;
    }
  });
  document.addEventListener("keydown", handleKeyDown);
  document.addEventListener("daybook:before-swap", clearReaderMode);
  document.addEventListener("daybook:page-load", syncReaderControls);
}
function initReaderMode() {
  bindEvents();
  syncReaderControls();
}
export {
  initReaderMode
};
