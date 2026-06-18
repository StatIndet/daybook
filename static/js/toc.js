(function () {
  function syncNoteToc(toc) {
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
    document.querySelectorAll(".note-toc").forEach(syncNoteToc);
  }

  window.daybookSyncNoteTocs = syncNoteTocs;

  document.addEventListener("click", function (event) {
    var tocToggle = event.target.closest(".note-toc-toggle");
    if (!tocToggle) {
      return;
    }

    var toc = tocToggle.closest(".note-toc");
    if (!toc) {
      return;
    }

    toc.classList.toggle("is-open");
    syncNoteToc(toc);
  });

  syncNoteTocs();
})();
