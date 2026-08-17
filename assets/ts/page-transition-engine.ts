
(() => {
  const ARTICLE_MOBILE_QUERY = "(max-width: 1280px)";

  function reducedMotion(): boolean {
    return document.documentElement.getAttribute('data-reduced-motion') === 'true' || 
           (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }

  function cssDuration(name: string, fallback: number): number {
    const rawValue = window.getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    const value = Number.parseFloat(rawValue);
    if (!Number.isFinite(value)) return fallback;
    if (rawValue.endsWith("s") && !rawValue.endsWith("ms")) return value * 1000;
    return value;
  }

  function cleanPath(url: URL): string {
    let path = url.pathname;
    if (path.length > 1 && path.endsWith("/")) path = path.slice(0, -1);
    if (path.endsWith("/index.html")) path = path.slice(0, -11) || "/";
    return path;
  }

  function isNotesIndex(url: URL): boolean {
    return cleanPath(url) === "/notes";
  }

  function isNoteDetail(url: URL): boolean {
    return /^\/notes\/[^/]+$/.test(cleanPath(url));
  }

  function articleTransitionInfo(currentUrlStr: string, targetUrlStr: string): { direction: "to-detail" | "to-list", slug: string } | null {
    try {
      const currentURL = new URL(currentUrlStr, location.origin);
      const targetURL = new URL(targetUrlStr, location.origin);

      if (isNotesIndex(currentURL) && isNoteDetail(targetURL)) {
        const parts = cleanPath(targetURL).split("/");
        return { direction: "to-detail", slug: parts[parts.length - 1] || "" };
      }
      if (isNoteDetail(currentURL) && isNotesIndex(targetURL)) {
        const parts = cleanPath(currentURL).split("/");
        return { direction: "to-list", slug: parts[parts.length - 1] || "" };
      }
    } catch {
      return null;
    }
    return null;
  }

  function isArticleTransition(currentUrlStr: string, targetUrlStr: string): boolean {
    if (reducedMotion()) return false;
    return Boolean(articleTransitionInfo(currentUrlStr, targetUrlStr));
  }

  function findDataElement(root: Document | HTMLElement, attributeName: string, value: string): HTMLElement | null {
    if (!root || !value) return null;
    const elements = root.querySelectorAll(`[${attributeName}]`);
    for (const element of Array.from(elements)) {
      if (element.getAttribute(attributeName) === value) {
        return element as HTMLElement;
      }
    }
    return null;
  }

  function findTitleBySlug(root: Document | HTMLElement, slug: string): HTMLElement | null {
    return findDataElement(root, "data-title-transition-key", slug) || findDataElement(root, "data-title-id", slug);
  }

  function findMetaBySlug(root: Document | HTMLElement, slug: string): HTMLElement | null {
    return findDataElement(root, "data-meta-transition-key", slug);
  }

  function clearArticleSharedTransitions(root: Document | HTMLElement | null) {
    if (!root) return;
    root.querySelectorAll(".title-glyph").forEach(el => {
      (el as HTMLElement).style.removeProperty("view-transition-name");
    });
    root.querySelectorAll("[data-title-transition-key]").forEach(el => {
      (el as HTMLElement).style.removeProperty("view-transition-name");
    });
    root.querySelectorAll("[data-meta-transition-key]").forEach(el => {
      (el as HTMLElement).style.removeProperty("view-transition-name");
    });
  }

  function prepareArticleSharedTransition(nextDocument: Document, currentUrlStr: string, targetUrlStr: string, sourceLink?: HTMLElement | null): any {
    clearArticleSharedTransitions(document);
    clearArticleSharedTransitions(nextDocument);

    const info = articleTransitionInfo(currentUrlStr, targetUrlStr);
    if (!info || !info.slug) return null;

    let sourceTitle = findTitleBySlug(document, info.slug);
    let targetTitle = findTitleBySlug(nextDocument, info.slug);

    if (sourceLink && sourceLink.matches("[data-title-transition-key]")) {
      sourceTitle = sourceLink;
    }

    if (sourceTitle && targetTitle) {
      const sourceGlyphs = sourceTitle.querySelectorAll(".title-glyph");
      const targetGlyphs = targetTitle.querySelectorAll(".title-glyph");
      
      sourceGlyphs.forEach((el) => {
        const sg = el as HTMLElement;
        sg.style.viewTransitionName = `title-${info.slug}-${sg.dataset.glyphIndex}`;
      });
      
      targetGlyphs.forEach((el) => {
        const tg = el as HTMLElement;
        tg.style.viewTransitionName = `title-${info.slug}-${tg.dataset.glyphIndex}`;
      });
    }

    const sourceMeta = findMetaBySlug(document, info.slug);
    const targetMeta = findMetaBySlug(nextDocument, info.slug);
    
    if (sourceMeta && targetMeta) {
      // Use meta- prefix to avoid slug-only collision!
      sourceMeta.style.viewTransitionName = "meta-" + info.slug;
      targetMeta.style.viewTransitionName = "meta-" + info.slug;
      targetMeta.classList.add("meta-shared-target");
      document.documentElement.classList.add("meta-shared-transition");
    }

    return null; // Force daybook-router to NOT call playArticleMorph
  }

  function hasSiteIdentity(root: Document | HTMLElement): boolean {
    return Boolean(root.querySelector(".hero-identity, .notes-aside-identity"));
  }

  function shouldAnimateIdentityExit(nextDocument: Document): boolean {
    return hasSiteIdentity(document) && !hasSiteIdentity(nextDocument);
  }

  function exitClassName(body: HTMLElement): string {
    if (body.classList.contains("home-body")) return "home-exiting";
    return "page-exiting";
  }

  function enterClassName(body: HTMLElement): string {
    if (body.classList.contains("home-body")) return "home-entering";
    return "page-entering";
  }

  function clearTransitionClasses() {
    document.documentElement.classList.remove(
      "is-transitioning",
      "article-transition",
      "identity-exit-down",
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
    prepareArticleSharedTransition,
    clearArticleSharedTransitions,
    shouldAnimateIdentityExit,
    exitClassName,
    enterClassName,
    clearTransitionClasses
  };

})();
