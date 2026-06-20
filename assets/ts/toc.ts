(function () {
  function syncNoteToc(toc: HTMLElement) {
    var button = toc.querySelector(".note-toc-toggle");
    var icon = button && button.querySelector(".material-symbol");
    var isOpen = toc.classList.contains("is-open");

    if (button) {
      button.setAttribute("aria-expanded", isOpen ? "true" : "false");
    }
    if (icon) {
      icon.textContent = isOpen ? "menu_open" : "menu";
    }
  }

  function syncNoteTocs() {
    document.querySelectorAll(".note-toc").forEach(function (tocEl) {
      syncNoteToc(tocEl as HTMLElement);
    });
  }

  window.daybookSyncNoteTocs = syncNoteTocs;

  document.addEventListener("click", function (event: MouseEvent) {
    var target = event.target as HTMLElement;
    var tocToggle = target.closest(".note-toc-toggle");
    if (!tocToggle) {
      return;
    }

    var toc = tocToggle.closest(".note-toc") as HTMLElement | null;
    if (!toc) {
      return;
    }

    toc.classList.toggle("is-open");
    syncNoteToc(toc);
  });

  syncNoteTocs();
})();
