interface MorphSnapshot {
  rect: {
    left: number;
    top: number;
    width: number;
    height: number;
  };
  style: any;
  text: string;
}

interface TokenSnapshot extends MorphSnapshot {
  index: number;
}

interface MorphItem {
  animations?: Animation[];
  animation?: Animation | null;
  clones?: HTMLElement[];
  clone?: HTMLElement;
  kind: "title-tokens" | "title" | "meta";
  sourceElement: HTMLElement;
  sourceSnapshot: MorphSnapshot;
  sourceTokens?: TokenSnapshot[];
  targetElement: HTMLElement | null;
  targetSnapshot: MorphSnapshot | null;
  targetTokens?: TokenSnapshot[] | null;
}

interface ArticleMorphSession {
  direction: "to-detail" | "to-list";
  isMobile: boolean;
  items: MorphItem[];
  layer: HTMLElement;
  slug: string;
}

(() => {
  const ARTICLE_MOBILE_QUERY = "(max-width: 768px)";
  let activeArticleMorph: ArticleMorphSession | null = null;

  function reducedMotion(): boolean {
    return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  function cssDuration(name: string, fallback: number): number {
    const rawValue = window.getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    const value = Number.parseFloat(rawValue);
    if (!Number.isFinite(value)) {
      return fallback;
    }
    if (rawValue.endsWith("s") && !rawValue.endsWith("ms")) {
      return value * 1000;
    }
    return value;
  }

  function cleanPath(url: URL): string {
    let path = url.pathname;
    if (path.length > 1 && path.endsWith("/")) {
      path = path.slice(0, -1);
    }
    if (path.endsWith("/index.html")) {
      path = path.slice(0, -11) || "/";
    }
    return path;
  }

  function isNotesIndex(url: URL): boolean {
    return cleanPath(url) === "/notes";
  }

  function isNoteDetail(url: URL): boolean {
    return /^\/notes\/[^/]+$/.test(cleanPath(url));
  }

  function isArticleTransition(currentUrlStr: string, targetUrlStr: string): boolean {
    return Boolean(articleTransitionInfo(currentUrlStr, targetUrlStr));
  }

  function articleTransitionInfo(currentUrlStr: string, targetUrlStr: string): { direction: "to-detail" | "to-list", slug: string } | null {
    try {
      const currentURL = new URL(currentUrlStr, location.origin);
      const targetURL = new URL(targetUrlStr, location.origin);

      if (isNotesIndex(currentURL) && isNoteDetail(targetURL)) {
        const slug = getNoteSlugFromUrl(targetURL);
        return slug ? { direction: "to-detail", slug } : null;
      }
      if (isNoteDetail(currentURL) && isNotesIndex(targetURL)) {
        const slug = getNoteSlugFromUrl(currentURL);
        return slug ? { direction: "to-list", slug } : null;
      }
    } catch {
      return null;
    }
    return null;
  }

  function clearArticleSharedTransitions(root: Document | HTMLElement | null) {
    if (!root) return;

    root.querySelectorAll("[style*='view-transition-name']").forEach(el => {
      const element = el as HTMLElement;
      const name = element.style.viewTransitionName || "";
      if (name.startsWith("note-title-transition-") || name.startsWith("note-time-transition-")) {
        element.style.removeProperty("view-transition-name");
      }
    });

    root.querySelectorAll(".article-morph-hidden").forEach(el => {
      el.classList.remove("article-morph-hidden");
    });

    if (root === document) {
      clearArticleMorph();
    }
  }

  function getNoteSlugFromUrl(url: URL): string | null {
    if (isNoteDetail(url)) {
      const parts = cleanPath(url).split("/");
      return parts[parts.length - 1] || null;
    }
    return null;
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
    return findDataElement(root, "data-title-transition-key", slug);
  }

  function findMetaBySlug(root: Document | HTMLElement, slug: string): HTMLElement | null {
    return findDataElement(root, "data-meta-transition-key", slug);
  }

  function supportsElementAnimation(): boolean {
    return document.documentElement && typeof document.documentElement.animate === "function";
  }

  function px(value: number): string {
    return `${value}px`;
  }

  function normalizeLength(value: string | undefined, fallback = "0px"): string {
    if (!value || value === "normal") return fallback;
    return value;
  }

  function normalizedLineHeight(style: CSSStyleDeclaration): string {
    if (style.lineHeight && style.lineHeight !== "normal") {
      return style.lineHeight;
    }

    const fontSize = Number.parseFloat(style.fontSize);
    if (!Number.isFinite(fontSize)) {
      return style.lineHeight || "normal";
    }
    return px(fontSize * 1.2);
  }

  function normalizedFontWeight(value: string): string {
    if (value === "normal") return "400";
    if (value === "bold") return "700";
    return value;
  }

  function normalizedTextWrap(style: CSSStyleDeclaration): string {
    const value = style.getPropertyValue("text-wrap") || style.textWrap || "wrap";
    return value === "balance" ? "wrap" : value;
  }

  function captureStyle(element: HTMLElement): any {
    const style = window.getComputedStyle(element);
    return {
      alignItems: style.alignItems,
      boxSizing: style.boxSizing,
      color: style.color,
      columnGap: normalizeLength(style.columnGap),
      display: style.display,
      fontFamily: style.fontFamily,
      fontFeatureSettings: style.fontFeatureSettings,
      fontSize: style.fontSize,
      fontStretch: style.fontStretch,
      fontStyle: style.fontStyle,
      fontVariationSettings: style.fontVariationSettings,
      fontWeight: normalizedFontWeight(style.fontWeight),
      hyphens: style.hyphens,
      justifyContent: style.justifyContent,
      letterSpacing: normalizeLength(style.letterSpacing),
      lineHeight: normalizedLineHeight(style),
      overflowWrap: style.overflowWrap,
      paddingBottom: style.paddingBottom,
      paddingLeft: style.paddingLeft,
      paddingRight: style.paddingRight,
      paddingTop: style.paddingTop,
      rowGap: normalizeLength(style.rowGap),
      textAlign: style.textAlign,
      textDecorationColor: style.textDecorationColor,
      textDecorationLine: style.textDecorationLine,
      textDecorationStyle: style.textDecorationStyle,
      textDecorationThickness: style.textDecorationThickness,
      textTransform: style.textTransform,
      textUnderlineOffset: style.textUnderlineOffset,
      textWrap: normalizedTextWrap(style),
      verticalAlign: style.verticalAlign,
      whiteSpace: style.whiteSpace,
      wordBreak: style.wordBreak
    };
  }

  function rectSnapshot(rect: DOMRect): MorphSnapshot['rect'] {
    return {
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height
    };
  }

  function withFinalLayout<T>(element: HTMLElement, callback: () => T): T | null {
    if (!element) return null;

    const properties = ["animation", "transform", "transition"];
    const saved = properties.map(name => ({
      name,
      priority: element.style.getPropertyPriority(name),
      value: element.style.getPropertyValue(name)
    }));

    element.style.setProperty("animation", "none", "important");
    element.style.setProperty("transform", "none", "important");
    element.style.setProperty("transition", "none", "important");
    void element.offsetWidth;

    try {
      return callback();
    } finally {
      for (const property of saved) {
        if (property.value) {
          element.style.setProperty(property.name, property.value, property.priority);
        } else {
          element.style.removeProperty(property.name);
        }
      }
      void element.offsetWidth;
    }
  }

  function captureElement(element: HTMLElement): MorphSnapshot | null {
    if (!element) return null;

    const rect = element.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      return null;
    }

    return {
      rect: rectSnapshot(rect),
      style: captureStyle(element),
      text: element.textContent || ""
    };
  }

  function captureElementFinal(element: HTMLElement): MorphSnapshot | null {
    return withFinalLayout(element, () => captureElement(element));
  }

  function visibleChildrenUnion(element: HTMLElement): {left: number, top: number, right: number, bottom: number, width: number, height: number} | null {
    const rects = Array.from(element.children)
      .map(child => child.getBoundingClientRect())
      .filter(rect => rect.width > 0 && rect.height > 0);

    if (rects.length === 0) {
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 ? {
        left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height
      } : null;
    }

    const left = Math.min(...rects.map(rect => rect.left));
    const top = Math.min(...rects.map(rect => rect.top));
    const right = Math.max(...rects.map(rect => rect.right));
    const bottom = Math.max(...rects.map(rect => rect.bottom));
    return { left, top, right, bottom, width: right - left, height: bottom - top };
  }

  function captureMetaElement(element: HTMLElement): MorphSnapshot | null {
    if (!element) return null;

    const rect = visibleChildrenUnion(element);
    if (!rect || rect.width <= 0 || rect.height <= 0) {
      return null;
    }

    const style = captureStyle(element);
    style.display = "inline-flex";
    style.paddingBottom = "0px";
    style.paddingLeft = "0px";
    style.paddingRight = "0px";
    style.paddingTop = "0px";

    return {
      rect: {
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height
      },
      style,
      text: element.textContent || ""
    };
  }

  function captureMetaElementFinal(element: HTMLElement): MorphSnapshot | null {
    return withFinalLayout(element, () => captureMetaElement(element));
  }

  function ensureArticleMorphLayer(): HTMLElement {
    const layer = document.createElement("div");
    layer.className = "article-morph-layer";
    document.body.appendChild(layer);
    return layer;
  }

  function applyCloneStyle(clone: HTMLElement, snapshot: MorphSnapshot) {
    const rect = snapshot.rect;
    const style = snapshot.style;

    clone.style.left = px(rect.left);
    clone.style.top = px(rect.top);
    clone.style.width = px(rect.width);
    clone.style.alignItems = style.alignItems;
    clone.style.boxSizing = style.boxSizing;
    clone.style.color = style.color;
    clone.style.columnGap = style.columnGap;
    clone.style.display = style.display;
    clone.style.fontFamily = style.fontFamily;
    clone.style.fontFeatureSettings = style.fontFeatureSettings;
    clone.style.fontSize = style.fontSize;
    clone.style.fontStretch = style.fontStretch;
    clone.style.fontStyle = style.fontStyle;
    clone.style.fontVariationSettings = style.fontVariationSettings;
    clone.style.fontWeight = style.fontWeight;
    clone.style.hyphens = style.hyphens;
    clone.style.justifyContent = style.justifyContent;
    clone.style.letterSpacing = style.letterSpacing;
    clone.style.lineHeight = style.lineHeight;
    clone.style.overflowWrap = style.overflowWrap;
    clone.style.paddingBottom = style.paddingBottom;
    clone.style.paddingLeft = style.paddingLeft;
    clone.style.paddingRight = style.paddingRight;
    clone.style.paddingTop = style.paddingTop;
    clone.style.rowGap = style.rowGap;
    clone.style.textAlign = style.textAlign;
    clone.style.textDecorationColor = style.textDecorationColor;
    clone.style.textDecorationLine = style.textDecorationLine;
    clone.style.textDecorationStyle = style.textDecorationStyle;
    clone.style.textDecorationThickness = style.textDecorationThickness;
    clone.style.textTransform = style.textTransform;
    clone.style.textUnderlineOffset = style.textUnderlineOffset;
    clone.style.textWrap = style.textWrap;
    clone.style.verticalAlign = style.verticalAlign;
    clone.style.whiteSpace = style.whiteSpace;
    clone.style.wordBreak = style.wordBreak;
  }

  function blockAnimationFrame(snapshot: MorphSnapshot): Keyframe {
    const rect = snapshot.rect;
    const style = snapshot.style;

    return {
      color: style.color,
      columnGap: style.columnGap,
      fontSize: style.fontSize,
      fontWeight: style.fontWeight,
      left: px(rect.left),
      letterSpacing: style.letterSpacing,
      lineHeight: style.lineHeight,
      paddingBottom: style.paddingBottom,
      paddingLeft: style.paddingLeft,
      paddingRight: style.paddingRight,
      paddingTop: style.paddingTop,
      rowGap: style.rowGap,
      top: px(rect.top),
      width: px(rect.width)
    };
  }

  function tokenAnimationFrame(token: TokenSnapshot, style: any): Keyframe {
    return {
      color: style.color,
      fontSize: style.fontSize,
      fontWeight: style.fontWeight,
      left: px(token.rect.left),
      letterSpacing: style.letterSpacing,
      lineHeight: style.lineHeight,
      top: px(token.rect.top)
    };
  }

  function measurePrecalculatedTokens(element: HTMLElement): TokenSnapshot[] | null {
    if (!element) return null;
    const tokenElements = element.querySelectorAll(".title-token[data-token]");
    if (tokenElements.length === 0) return null;

    const tokens: TokenSnapshot[] = [];
    for (const el of Array.from(tokenElements)) {
      const rects = Array.from(el.getClientRects()).filter(rect => rect.width > 0 && rect.height > 0);
      if (rects.length !== 1) {
        return null;
      }
      tokens.push({
        index: Number(el.getAttribute("data-token")),
        rect: rectSnapshot(rects[0]!),
        text: el.textContent || "",
        style: captureStyle(el as HTMLElement)
      });
    }

    tokens.sort((a, b) => a.index - b.index);
    return tokens;
  }

  function measurePrecalculatedTokensFinal(element: HTMLElement): TokenSnapshot[] | null {
    return withFinalLayout(element, () => measurePrecalculatedTokens(element));
  }

  function createTokenClone(layer: HTMLElement, token: TokenSnapshot): HTMLElement {
    const clone = document.createElement("span");
    const style = token.style;
    clone.className = "article-morph-clone article-morph-token";
    clone.textContent = token.text;
    clone.style.left = px(token.rect.left);
    clone.style.top = px(token.rect.top);
    clone.style.color = style.color;
    clone.style.display = "block";
    clone.style.fontFamily = style.fontFamily;
    clone.style.fontFeatureSettings = style.fontFeatureSettings;
    clone.style.fontSize = style.fontSize;
    clone.style.fontStretch = style.fontStretch;
    clone.style.fontStyle = style.fontStyle;
    clone.style.fontVariationSettings = style.fontVariationSettings;
    clone.style.fontWeight = style.fontWeight;
    clone.style.letterSpacing = style.letterSpacing;
    clone.style.lineHeight = style.lineHeight;
    clone.style.textDecorationColor = style.textDecorationColor;
    clone.style.textDecorationLine = style.textDecorationLine;
    clone.style.textDecorationStyle = style.textDecorationStyle;
    clone.style.textDecorationThickness = style.textDecorationThickness;
    clone.style.textTransform = style.textTransform;
    clone.style.textUnderlineOffset = style.textUnderlineOffset;
    clone.style.whiteSpace = "pre";
    clone.style.wordBreak = "normal";
    layer.appendChild(clone);
    return clone;
  }

  function createTitleMorphItem(layer: HTMLElement, sourceElement: HTMLElement): MorphItem | null {
    const sourceSnapshot = captureElementFinal(sourceElement);
    if (!sourceSnapshot) return null;

    const sourceTokens = measurePrecalculatedTokens(sourceElement);
    if (!sourceTokens || sourceTokens.length === 0) {
      return createBlockMorphItem(layer, sourceElement, sourceSnapshot, "title");
    }

    const clones = sourceTokens.map(token => createTokenClone(layer, token));
    sourceElement.classList.add("article-morph-hidden");

    return {
      animations: [],
      clones,
      kind: "title-tokens",
      sourceElement,
      sourceSnapshot,
      sourceTokens,
      targetElement: null,
      targetSnapshot: null,
      targetTokens: null
    };
  }

  function createBlockMorphItem(layer: HTMLElement, sourceElement: HTMLElement, snapshot: MorphSnapshot, kind: "title" | "meta"): MorphItem {
    const clone = document.createElement("span");
    clone.className = `article-morph-clone article-morph-clone-${kind}`;
    if (kind === "meta") {
      clone.innerHTML = sourceElement.innerHTML;
    } else {
      clone.textContent = snapshot.text;
    }
    applyCloneStyle(clone, snapshot);
    layer.appendChild(clone);
    sourceElement.classList.add("article-morph-hidden");

    return {
      animation: null,
      clone,
      kind,
      sourceElement,
      sourceSnapshot: snapshot,
      targetElement: null,
      targetSnapshot: null
    };
  }

  function prepareArticleMorph(nextDocument: Document, currentUrlStr: string, targetUrlStr: string): ArticleMorphSession | null {
    clearArticleMorph();

    if (!supportsElementAnimation()) return null;

    const info = articleTransitionInfo(currentUrlStr, targetUrlStr);
    if (!info || !info.slug || !findTitleBySlug(nextDocument, info.slug)) {
      return null;
    }

    const sourceTitle = findTitleBySlug(document, info.slug);
    if (!sourceTitle) return null;

    const layer = ensureArticleMorphLayer();
    const titleItem = createTitleMorphItem(layer, sourceTitle);
    if (!titleItem) {
      layer.remove();
      return null;
    }

    const isMobile = window.matchMedia(ARTICLE_MOBILE_QUERY).matches;
    const items: MorphItem[] = [titleItem];

    if (isMobile && findMetaBySlug(nextDocument, info.slug)) {
      const sourceMeta = findMetaBySlug(document, info.slug);
      if (sourceMeta) {
        const sourceMetaSnapshot = captureMetaElement(sourceMeta);
        if (sourceMetaSnapshot) {
          items.push(createBlockMorphItem(layer, sourceMeta, sourceMetaSnapshot, "meta"));
        }
      }
    }

    activeArticleMorph = {
      direction: info.direction,
      isMobile,
      items,
      layer,
      slug: info.slug
    };

    return activeArticleMorph;
  }

  function animateTitleTokens(item: MorphItem, targetElement: HTMLElement, duration: number, easing: string): Promise<Animation>[] {
    const targetSnapshot = captureElementFinal(targetElement);
    if (!targetSnapshot) return [];

    const targetTokens = measurePrecalculatedTokensFinal(targetElement);
    
    if (
      !targetTokens ||
      !item.sourceTokens ||
      targetTokens.length !== item.sourceTokens.length
    ) {
      return fallbackToBlock(item, targetElement, targetSnapshot!, duration, easing);
    }

    let isTextMatched = true;
    for (let i = 0; i < targetTokens.length; i++) {
      if (targetTokens[i]!.text !== item.sourceTokens[i]!.text || targetTokens[i]!.index !== item.sourceTokens[i]!.index) {
        isTextMatched = false;
        break;
      }
    }
    if (!isTextMatched) {
      return fallbackToBlock(item, targetElement, targetSnapshot!, duration, easing);
    }

    item.targetElement = targetElement;
    item.targetSnapshot = targetSnapshot;
    item.targetTokens = targetTokens;
    targetElement.classList.add("article-morph-hidden");

    const animations = (item.clones || []).map((clone, index) => {
      const animation = clone.animate([
        tokenAnimationFrame(item.sourceTokens![index]!, item.sourceTokens![index]!.style),
        tokenAnimationFrame(targetTokens[index]!, targetTokens[index]!.style)
      ], {
        duration,
        easing,
        fill: "forwards"
      });
      return animation;
    });

    item.animations = animations;
    return animations.map(animation => animation.finished);
  }

  function fallbackToBlock(item: MorphItem, targetElement: HTMLElement, targetSnapshot: MorphSnapshot, duration: number, easing: string): Promise<Animation>[] {
      item.clone = fallbackTitleClone(item);
      item.targetElement = targetElement;
      item.targetSnapshot = targetSnapshot;
      targetElement.classList.add("article-morph-hidden");
      return animateBlockItem(item, duration, easing);
  }

  function fallbackTitleClone(item: MorphItem): HTMLElement {
    const layer = (item.clones && item.clones[0]) ? item.clones[0].parentElement! : document.body;
    if (item.clones) {
      item.clones.forEach(clone => clone.remove());
    }
    const clone = document.createElement("span");
    clone.className = "article-morph-clone article-morph-clone-title";
    clone.textContent = item.sourceSnapshot.text;
    applyCloneStyle(clone, item.sourceSnapshot);
    item.sourceElement.classList.add("article-morph-hidden");
    item.clones = [clone];
    layer.appendChild(clone);
    return clone;
  }

  function animateBlockItem(item: MorphItem, duration: number, easing: string): Promise<Animation>[] {
    if (!item.clone || !item.targetSnapshot) return [];

    const animation = item.clone.animate([
      blockAnimationFrame(item.sourceSnapshot),
      blockAnimationFrame(item.targetSnapshot)
    ], {
      duration,
      easing,
      fill: "forwards"
    });

    item.animation = animation;
    return [animation.finished];
  }

  function playArticleMorph(session: ArticleMorphSession | null): Promise<void> {
    if (!session || activeArticleMorph !== session) {
      return Promise.resolve();
    }

    const duration = cssDuration("--duration-shared", 720);
    const easing = window.getComputedStyle(document.documentElement).getPropertyValue("--article-enter-ease").trim() || "cubic-bezier(0.165, 0.84, 0.44, 1)";
    const finished: Promise<any>[] = [];

    for (const item of session.items) {
      const targetElement = item.kind === "meta" ? findMetaBySlug(document, session.slug) : findTitleBySlug(document, session.slug);
      if (!targetElement) {
        continue;
      }

      if (item.kind === "title-tokens") {
        finished.push(...animateTitleTokens(item, targetElement, duration, easing));
        continue;
      }

      const targetSnapshot = item.kind === "meta" ? captureMetaElementFinal(targetElement) : captureElementFinal(targetElement);
      if (!targetSnapshot) {
        continue;
      }

      item.targetElement = targetElement;
      item.targetSnapshot = targetSnapshot;
      targetElement.classList.add("article-morph-hidden");
      finished.push(...animateBlockItem(item, duration, easing));
    }

    if (finished.length === 0) {
      cleanupArticleMorph(session, false);
      return Promise.resolve();
    }

    return Promise.allSettled(finished).then(() => {
      cleanupArticleMorph(session, false);
    });
  }

  function cleanupArticleMorph(session: ArticleMorphSession | null, cancelAnimations: boolean) {
    if (!session) return;

    for (const item of session.items) {
      if (cancelAnimations && item.animation) {
        item.animation.cancel();
      }
      if (cancelAnimations && item.animations) {
        item.animations.forEach(animation => animation.cancel());
      }
      if (item.sourceElement) {
        item.sourceElement.classList.remove("article-morph-hidden");
      }
      if (item.targetElement) {
        item.targetElement.classList.remove("article-morph-hidden");
      }
      if (item.clone) {
        item.clone.remove();
      }
      if (item.clones) {
        item.clones.forEach(clone => clone.remove());
      }
    }

    if (session.layer) {
      session.layer.remove();
    }

    if (activeArticleMorph === session) {
      activeArticleMorph = null;
    }
  }

  function clearArticleMorph() {
    if (!activeArticleMorph) return;
    cleanupArticleMorph(activeArticleMorph, true);
  }

  function prepareArticleSharedTransition(nextDocument: Document, currentUrlStr: string, targetUrlStr: string): ArticleMorphSession | null {
    return prepareArticleMorph(nextDocument, currentUrlStr, targetUrlStr);
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
    );
    if (document.body) {
      document.body.classList.remove("home-exiting", "page-exiting", "home-entering", "page-entering");
    }
  }

  window.DaybookTransitionEngine = {
    reducedMotion,
    cssDuration,
    isArticleTransition,
    prepareArticleMorph,
    playArticleMorph,
    clearArticleMorph,
    prepareArticleSharedTransition,
    clearArticleSharedTransitions,
    shouldAnimateIdentityExit,
    exitClassName,
    enterClassName,
    clearTransitionClasses
  };

})();
