let isBound = false;

function toggleReaderMode() {
  const isImmersive = document.body.dataset.readerMode === "immersive";
  setReaderMode(!isImmersive);
}

function setReaderMode(enabled: boolean) {
  if (enabled) {
    document.body.dataset.readerMode = "immersive";
  } else {
    delete document.body.dataset.readerMode;
  }
  syncReaderControls();
}

function clearReaderMode() {
  if (document.body.dataset.readerMode === "immersive") {
    delete document.body.dataset.readerMode;
  }
}

function syncReaderControls() {
  const isImmersive = document.body.dataset.readerMode === "immersive";
  
  const toggleBtns = document.querySelectorAll<HTMLButtonElement>("[data-reader-toggle]");
  toggleBtns.forEach(btn => {
    btn.setAttribute("aria-pressed", isImmersive.toString());
  });

  const exitBtns = document.querySelectorAll<HTMLButtonElement>("[data-reader-exit]");
  exitBtns.forEach(btn => {
    if (isImmersive) {
      btn.removeAttribute("hidden");
    } else {
      btn.setAttribute("hidden", "true");
    }
  });
}

function handleKeyDown(e: KeyboardEvent) {
  if (e.key === "Escape" && document.body.dataset.readerMode === "immersive") {
    e.preventDefault();
    setReaderMode(false);
  }
}

function bindEvents() {
  if (isBound) return;
  isBound = true;

  document.addEventListener("click", (e) => {
    const target = e.target as HTMLElement;
    
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

export function initReaderMode() {
  bindEvents();
  syncReaderControls();
}
