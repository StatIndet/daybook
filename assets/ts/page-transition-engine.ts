
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

    function noteSlugFromURL(url: URL): string | null {
    let p = cleanPath(url);
    if (p.endsWith('/index.html')) p = p.substring(0, p.length - 11);
    if (p.endsWith('/')) p = p.substring(0, p.length - 1);
    
    // strip /en prefix if present
    if (p.startsWith('/en_US/')) {
        p = '/' + p.substring(4);
    }
    
    if (p.startsWith('/notes/')) {
        const slug = p.substring(7); // remove /notes/
        if (slug.length > 0) {
            return decodeURIComponent(slug);
        }
    }
    return null;
  }

  function isNotesIndex(url: URL): boolean {
    let p = cleanPath(url);
    if (p.endsWith('/index.html')) p = p.substring(0, p.length - 11);
    if (p.endsWith('/')) p = p.substring(0, p.length - 1);
    if (p.startsWith('/en_US/')) p = '/' + p.substring(4);
    return p === '/notes';
  }

  function articleTransitionInfo(currentUrlStr: string, targetUrlStr: string): { direction: "to-detail" | "to-list", slug: string } | null {
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

  function clearArticleSharedTransitions(root: Document | HTMLElement | null) {
    if (!root) return;
    root.querySelectorAll(".title-glyph").forEach(el => {
      (el as HTMLElement).style.removeProperty("view-transition-name");
    });
    root.querySelectorAll("[data-title-transition-key]").forEach(el => {
      (el as HTMLElement).style.removeProperty("view-transition-name");
    });
    root.querySelectorAll("[data-article-shared]").forEach(el => {
      (el as HTMLElement).style.removeProperty("view-transition-name");
    });
  }

  function prepareArticleTransitionSource(currentUrlStr: string, targetUrlStr: string, sourceLink?: HTMLElement | null): any {
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
        const sg = el as HTMLElement;
        sg.style.viewTransitionName = `title-glyph-${sg.dataset.glyphIndex}`;
      });
    }

    const sourceScope = findDataElement(document, "data-transition-scope", info.slug);
    if (sourceScope) {
      const sharedElements = sourceScope.querySelectorAll("[data-article-shared]");
      sharedElements.forEach(el => {
        const name = el.getAttribute("data-article-shared");
        (el as HTMLElement).style.viewTransitionName = `article-shared-${name}`;
      });
      document.documentElement.classList.add("meta-shared-transition");
    }

    return info;
  }

  function prepareArticleTransitionTarget(info: any) {
    if (!info || !info.slug) return;
    
    let targetTitle = findTitleBySlug(document, info.slug);
    if (targetTitle) {
      const targetGlyphs = targetTitle.querySelectorAll(".title-glyph");
      targetGlyphs.forEach((el) => {
        const tg = el as HTMLElement;
        tg.style.viewTransitionName = `title-glyph-${tg.dataset.glyphIndex}`;
      });
    }

    const targetScope = findDataElement(document, "data-transition-scope", info.slug);
    if (targetScope) {
      const sharedElements = targetScope.querySelectorAll("[data-article-shared]");
      sharedElements.forEach(el => {
        const name = el.getAttribute("data-article-shared");
        (el as HTMLElement).style.viewTransitionName = `article-shared-${name}`;
      });
      targetScope.classList.add("meta-shared-target");
    }
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
      "meta-shared-transition"
    );
    if (document.body) {
      document.body.classList.remove("home-exiting", "page-exiting", "home-entering", "page-entering");
    }
  }

  function resolveStableRegions(oldDoc: Document, newDoc: Document) {
    const oldRegions = oldDoc.querySelectorAll("[data-transition-region]");
    const newRegions = newDoc.querySelectorAll("[data-transition-region]");
    const oldMap = new Map();
    
    oldRegions.forEach(el => {
      oldMap.set(el.getAttribute("data-transition-region"), el);
      el.classList.remove("transition-stable");
    });

    newRegions.forEach(newEl => {
      const region = newEl.getAttribute("data-transition-region");
      const oldEl = oldMap.get(region);
      newEl.classList.remove("transition-stable");
      if (oldEl) {
         oldEl.classList.add("transition-stable");
         newEl.classList.add("transition-stable");
      }
    });
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
    clearTransitionClasses,
    resolveStableRegions
  };

})();
