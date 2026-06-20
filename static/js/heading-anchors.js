(function () {
  var resetDelay = 1200;

  function fallbackCopy(text) {
    var textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    textarea.style.top = "0";
    document.body.appendChild(textarea);
    textarea.select();

    try {
      document.execCommand("copy");
      return true;
    } finally {
      textarea.remove();
    }
  }

  async function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }

    return fallbackCopy(text);
  }

  function syncHeadingAnchors(root) {
    (root || document).querySelectorAll(".post-content h2, .post-content h3").forEach(function (heading) {
      if (heading.dataset.headingAnchorReady === "true" || !heading.id) {
        return;
      }

      var label = heading.textContent.trim() || "section";
      var button = document.createElement("button");
      button.type = "button";
      button.className = "heading-anchor";
      button.setAttribute("aria-label", "复制“" + label + "”的链接");
      button.textContent = "#";

      button.addEventListener("click", async function () {
        var url = window.location.origin + window.location.pathname + "#" + heading.id;
        try {
          await copyText(url);
        } catch (error) {
          return;
        }

        window.clearTimeout(button._daybookHeadingCopyTimer);
        button.textContent = "✓";
        button._daybookHeadingCopyTimer = window.setTimeout(function () {
          button.textContent = "#";
        }, resetDelay);
      });

      heading.prepend(button);
      heading.dataset.headingAnchorReady = "true";
    });
  }

  window.daybookSyncHeadingAnchors = function () {
    syncHeadingAnchors(document);
  };

  document.addEventListener("daybook:page-load", window.daybookSyncHeadingAnchors);
})();
