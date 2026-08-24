"use strict";
(() => {
  // assets/ts/heading-anchors.ts
  (function() {
    function syncHeadingAnchors(root) {
      (root || document).querySelectorAll(".post-content h1, .post-content h2, .post-content h3, .post-content h4").forEach(function(headingEl) {
        const heading = headingEl;
        if (heading.dataset.headingAnchorReady === "true" || !heading.id) {
          return;
        }
        var label = heading.textContent?.trim() || "section";
        var anchor = document.createElement("a");
        anchor.className = "heading-anchor";
        anchor.href = "#" + heading.id;
        const lang = document.documentElement.lang;
        if (lang === "en") {
          anchor.setAttribute("aria-label", "Link to " + label);
        } else {
          anchor.setAttribute("aria-label", label + " \u7684\u6C38\u4E45\u94FE\u63A5");
        }
        var icon = document.createElement("span");
        icon.className = "material-symbol";
        icon.setAttribute("aria-hidden", "true");
        icon.textContent = "link_2";
        anchor.appendChild(icon);
        heading.appendChild(anchor);
        heading.dataset.headingAnchorReady = "true";
      });
    }
    window.daybookSyncHeadingAnchors = function() {
      syncHeadingAnchors(document);
    };
    document.addEventListener("daybook:page-load", window.daybookSyncHeadingAnchors);
    document.addEventListener("daybook:article-content-swapped", window.daybookSyncHeadingAnchors);
  })();
})();
