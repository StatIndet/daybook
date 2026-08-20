// assets/ts/page-transition-engine.ts
(() => {
  const ARTICLE_MOBILE_QUERY = "(max-width: 1280px)";
  function reducedMotion() {
    return document.documentElement.getAttribute("data-reduced-motion") === "true" || window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }
  function cssDuration(name, fallback) {
    const rawValue = window.getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    const value = Number.parseFloat(rawValue);
    if (!Number.isFinite(value)) return fallback;
    if (rawValue.endsWith("s") && !rawValue.endsWith("ms")) return value * 1e3;
    return value;
  }
  function cleanPath(url) {
    let path = url.pathname;
    if (path.length > 1 && path.endsWith("/")) path = path.slice(0, -1);
    if (path.endsWith("/index.html")) path = path.slice(0, -11) || "/";
    return path;
  }
  function noteSlugFromURL(url) {
    let p = cleanPath(url);
    if (p.endsWith("/index.html")) p = p.substring(0, p.length - 11);
    if (p.endsWith("/")) p = p.substring(0, p.length - 1);
    if (p.startsWith("/en/")) {
      p = "/" + p.substring(4);
    }
    if (p.startsWith("/notes/")) {
      const slug = p.substring(7);
      if (slug.length > 0) {
        return decodeURIComponent(slug);
      }
    }
    return null;
  }
  function isNotesIndex(url) {
    let p = cleanPath(url);
    if (p.endsWith("/index.html")) p = p.substring(0, p.length - 11);
    if (p.endsWith("/")) p = p.substring(0, p.length - 1);
    if (p.startsWith("/en/")) p = "/" + p.substring(4);
    return p === "/notes";
  }
  function articleTransitionInfo(currentUrlStr, targetUrlStr) {
    try {
      const currentURL = new URL(currentUrlStr, location.origin);
      const targetURL = new URL(targetUrlStr, location.origin);
      const currentSlug = noteSlugFromURL(currentURL);
      const targetSlug = noteSlugFromURL(targetURL);
      const currentIsIndex = isNotesIndex(currentURL);
      const targetIsIndex = isNotesIndex(targetURL);
      if (currentIsIndex && targetSlug) {
        return { direction: "to-detail", slug: targetSlug };
      }
      if (currentSlug && targetIsIndex) {
        return { direction: "to-list", slug: currentSlug };
      }
    } catch {
      return null;
    }
    return null;
  }
  function isArticleTransition(currentUrlStr, targetUrlStr) {
    if (reducedMotion()) return false;
    return Boolean(articleTransitionInfo(currentUrlStr, targetUrlStr));
  }
  function findDataElement(root, attributeName, value) {
    if (!root || !value) return null;
    const elements = root.querySelectorAll(`[${attributeName}]`);
    for (const element of Array.from(elements)) {
      if (element.getAttribute(attributeName) === value) {
        return element;
      }
    }
    return null;
  }
  function findTitleBySlug(root, slug) {
    return findDataElement(root, "data-title-transition-key", slug) || findDataElement(root, "data-title-id", slug);
  }
  function findMetaBySlug(root, slug) {
    return findDataElement(root, "data-meta-transition-key", slug);
  }
  function clearArticleSharedTransitions(root) {
    if (!root) return;
    root.querySelectorAll(".title-glyph").forEach((el) => {
      el.style.removeProperty("view-transition-name");
    });
    root.querySelectorAll("[data-title-transition-key]").forEach((el) => {
      el.style.removeProperty("view-transition-name");
    });
    root.querySelectorAll("[data-meta-transition-key]").forEach((el) => {
      el.style.removeProperty("view-transition-name");
    });
  }
  function prepareArticleTransitionSource(currentUrlStr, targetUrlStr, sourceLink) {
    clearArticleSharedTransitions(document);
    const info = articleTransitionInfo(currentUrlStr, targetUrlStr);
    if (!info || !info.slug) return null;
    let sourceTitle = findTitleBySlug(document, info.slug);
    if (sourceLink && sourceLink.matches("[data-title-transition-key]")) {
      sourceTitle = sourceLink;
    }
    if (sourceTitle) {
      const sourceGlyphs = sourceTitle.querySelectorAll(".title-glyph");
      sourceGlyphs.forEach((el) => {
        const sg = el;
        sg.style.viewTransitionName = `title-glyph-${sg.dataset.glyphIndex}`;
      });
    }
    const sourceMeta = findMetaBySlug(document, info.slug);
    if (sourceMeta) {
      sourceMeta.style.viewTransitionName = "meta-item-shared";
      document.documentElement.classList.add("meta-shared-transition");
    }
    return info;
  }
  function prepareArticleTransitionTarget(info) {
    if (!info || !info.slug) return;
    let targetTitle = findTitleBySlug(document, info.slug);
    if (targetTitle) {
      const targetGlyphs = targetTitle.querySelectorAll(".title-glyph");
      targetGlyphs.forEach((el) => {
        const tg = el;
        tg.style.viewTransitionName = `title-glyph-${tg.dataset.glyphIndex}`;
      });
    }
    const targetMeta = findMetaBySlug(document, info.slug);
    if (targetMeta) {
      targetMeta.style.viewTransitionName = "meta-item-shared";
      targetMeta.classList.add("meta-shared-target");
    }
  }
  function exitClassName(body) {
    if (body.classList.contains("home-body")) return "home-exiting";
    return "page-exiting";
  }
  function enterClassName(body) {
    if (body.classList.contains("home-body")) return "home-entering";
    return "page-entering";
  }
  function clearTransitionClasses() {
    document.documentElement.classList.remove(
      "is-transitioning",
      "article-transition",
      "meta-shared-transition"
    );
    if (document.body) {
      document.body.classList.remove("home-exiting", "page-exiting", "home-entering", "page-entering");
    }
  }
  window.DaybookTransitionEngine = {
    reducedMotion,
    cssDuration,
    isArticleTransition,
    prepareArticleTransitionSource,
    prepareArticleTransitionTarget,
    clearArticleSharedTransitions,
    exitClassName,
    enterClassName,
    clearTransitionClasses
  };
})();
//# sourceMappingURL=page-transition-engine.js.map
