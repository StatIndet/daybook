(() => {
  const ARTICLE_MOBILE_QUERY = "(max-width: 768px)";
  let activeArticleMorph = null;

  function reducedMotion() {
    return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  function cssDuration(name, fallback) {
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

  function cleanPath(url) {
    let path = url.pathname;
    if (path.length > 1 && path.endsWith("/")) {
      path = path.slice(0, -1);
    }
    if (path.endsWith("/index.html")) {
      path = path.slice(0, -11) || "/";
    }
    return path;
  }

  function isNotesIndex(url) {
    return cleanPath(url) === "/notes";
  }

  function isNoteDetail(url) {
    return /^\/notes\/[^/]+$/.test(cleanPath(url));
  }

  function isArticleTransition(currentUrlStr, targetUrlStr) {
    return Boolean(articleTransitionInfo(currentUrlStr, targetUrlStr));
  }

  function articleTransitionInfo(currentUrlStr, targetUrlStr) {
    try {
      const currentURL = new URL(currentUrlStr, location.origin);
      const targetURL = new URL(targetUrlStr, location.origin);

      if (isNotesIndex(currentURL) && isNoteDetail(targetURL)) {
        return { direction: "to-detail", slug: getNoteSlugFromUrl(targetURL) };
      }
      if (isNoteDetail(currentURL) && isNotesIndex(targetURL)) {
        return { direction: "to-list", slug: getNoteSlugFromUrl(currentURL) };
      }
    } catch {
      return null;
    }
    return null;
  }

  function clearArticleSharedTransitions(root) {
    if (!root) return;

    root.querySelectorAll("[style*='view-transition-name']").forEach(el => {
      const name = el.style.viewTransitionName || "";
      if (name.startsWith("note-title-transition-") || name.startsWith("note-time-transition-")) {
        el.style.removeProperty("view-transition-name");
      }
    });

    root.querySelectorAll(".article-morph-hidden").forEach(el => {
      el.classList.remove("article-morph-hidden");
    });

    if (root === document) {
      clearArticleMorph();
    }
  }

  function getNoteSlugFromUrl(url) {
    if (isNoteDetail(url)) {
      const parts = cleanPath(url).split("/");
      return parts[parts.length - 1];
    }
    return null;
  }

  function findDataElement(root, attributeName, value) {
    if (!root || !value) return null;

    const elements = root.querySelectorAll(`[${attributeName}]`);
    for (const element of elements) {
      if (element.getAttribute(attributeName) === value) {
        return element;
      }
    }
    return null;
  }

  function findTitleBySlug(root, slug) {
    return findDataElement(root, "data-title-transition-key", slug);
  }

  function findMetaBySlug(root, slug) {
    return findDataElement(root, "data-meta-transition-key", slug);
  }

  function supportsElementAnimation() {
    return document.documentElement && typeof document.documentElement.animate === "function";
  }

  function px(value) {
    return `${value}px`;
  }

  function normalizeLength(value, fallback = "0px") {
    if (!value || value === "normal") return fallback;
    return value;
  }

  function normalizedLineHeight(style) {
    if (style.lineHeight && style.lineHeight !== "normal") {
      return style.lineHeight;
    }

    const fontSize = Number.parseFloat(style.fontSize);
    if (!Number.isFinite(fontSize)) {
      return style.lineHeight || "normal";
    }
    return px(fontSize * 1.2);
  }

  function normalizedFontWeight(value) {
    if (value === "normal") return "400";
    if (value === "bold") return "700";
    return value;
  }

  function normalizedTextWrap(style) {
    const value = style.getPropertyValue("text-wrap") || style.textWrap || "wrap";
    return value === "balance" ? "wrap" : value;
  }

  function captureStyle(element) {
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

  function rectSnapshot(rect) {
    return {
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height
    };
  }

  function withFinalLayout(element, callback) {
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

  function captureElement(element) {
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

  function captureElementFinal(element) {
    return withFinalLayout(element, () => captureElement(element));
  }

  function visibleChildrenUnion(element) {
    const rects = Array.from(element.children)
      .map(child => child.getBoundingClientRect())
      .filter(rect => rect.width > 0 && rect.height > 0);

    if (rects.length === 0) {
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 ? rect : null;
    }

    const left = Math.min(...rects.map(rect => rect.left));
    const top = Math.min(...rects.map(rect => rect.top));
    const right = Math.max(...rects.map(rect => rect.right));
    const bottom = Math.max(...rects.map(rect => rect.bottom));
    return { left, top, right, bottom, width: right - left, height: bottom - top };
  }

  function captureMetaElement(element) {
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
      rect: rectSnapshot(rect),
      style,
      text: element.textContent || ""
    };
  }

  function captureMetaElementFinal(element) {
    return withFinalLayout(element, () => captureMetaElement(element));
  }

  function ensureArticleMorphLayer() {
    const layer = document.createElement("div");
    layer.className = "article-morph-layer";
    document.body.appendChild(layer);
    return layer;
  }

  function applyCloneStyle(clone, snapshot) {
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

  function blockAnimationFrame(snapshot) {
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

  function tokenAnimationFrame(token, style) {
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

  function measurePrecalculatedTokens(element) {
    if (!element) return null;
    const tokenElements = element.querySelectorAll(".title-token[data-token]");
    if (tokenElements.length === 0) return null;

    const tokens = [];
    for (const el of tokenElements) {
      const rects = Array.from(el.getClientRects()).filter(rect => rect.width > 0 && rect.height > 0);
      if (rects.length !== 1) {
        return null;
      }
      tokens.push({
        index: Number(el.getAttribute("data-token")),
        rect: rectSnapshot(rects[0]),
        text: el.textContent || "",
        style: captureStyle(el)
      });
    }

    tokens.sort((a, b) => a.index - b.index);
    return tokens;
  }

  function measurePrecalculatedTokensFinal(element) {
    return withFinalLayout(element, () => measurePrecalculatedTokens(element));
  }

  function createTokenClone(layer, token) {
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

  function createTitleMorphItem(layer, sourceElement) {
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

  function createBlockMorphItem(layer, sourceElement, snapshot, kind) {
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

  function prepareArticleMorph(nextDocument, currentUrlStr, targetUrlStr) {
    clearArticleMorph();

    if (!supportsElementAnimation()) return null;

    const info = articleTransitionInfo(currentUrlStr, targetUrlStr);
    if (!info || !info.slug || !findTitleBySlug(nextDocument, info.slug)) {
      return null;
    }

    const sourceTitle = findTitleBySlug(document, info.slug);
    const layer = ensureArticleMorphLayer();
    const titleItem = createTitleMorphItem(layer, sourceTitle);
    if (!titleItem) {
      layer.remove();
      return null;
    }

    const isMobile = window.matchMedia(ARTICLE_MOBILE_QUERY).matches;
    const items = [titleItem];

    if (isMobile && findMetaBySlug(nextDocument, info.slug)) {
      const sourceMeta = findMetaBySlug(document, info.slug);
      const sourceMetaSnapshot = captureMetaElement(sourceMeta);
      if (sourceMetaSnapshot) {
        items.push(createBlockMorphItem(layer, sourceMeta, sourceMetaSnapshot, "meta"));
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

  function animateTitleTokens(item, targetElement, duration, easing) {
    const targetSnapshot = captureElementFinal(targetElement);
    if (!targetSnapshot) return [];

    const targetTokens = measurePrecalculatedTokensFinal(targetElement);
    
    if (
      !targetTokens ||
      targetTokens.length !== item.sourceTokens.length
    ) {
      return fallbackToBlock(item, targetElement, targetSnapshot, duration, easing);
    }

    let isTextMatched = true;
    for (let i = 0; i < targetTokens.length; i++) {
      if (targetTokens[i].text !== item.sourceTokens[i].text || targetTokens[i].index !== item.sourceTokens[i].index) {
        isTextMatched = false;
        break;
      }
    }
    if (!isTextMatched) {
      return fallbackToBlock(item, targetElement, targetSnapshot, duration, easing);
    }

    item.targetElement = targetElement;
    item.targetSnapshot = targetSnapshot;
    item.targetTokens = targetTokens;
    targetElement.classList.add("article-morph-hidden");

    const animations = item.clones.map((clone, index) => {
      const animation = clone.animate([
        tokenAnimationFrame(item.sourceTokens[index], item.sourceTokens[index].style),
        tokenAnimationFrame(targetTokens[index], targetTokens[index].style)
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

  function fallbackToBlock(item, targetElement, targetSnapshot, duration, easing) {
      item.clone = fallbackTitleClone(item);
      item.targetElement = targetElement;
      item.targetSnapshot = targetSnapshot;
      targetElement.classList.add("article-morph-hidden");
      return animateBlockItem(item, duration, easing);
  }

  function fallbackTitleClone(item) {
    const layer = item.clones[0] ? item.clones[0].parentElement : document.body;
    item.clones.forEach(clone => clone.remove());
    const clone = document.createElement("span");
    clone.className = "article-morph-clone article-morph-clone-title";
    clone.textContent = item.sourceSnapshot.text;
    applyCloneStyle(clone, item.sourceSnapshot);
    item.sourceElement.classList.add("article-morph-hidden");
    item.clones = [clone];
    layer.appendChild(clone);
    return clone;
  }

  function animateBlockItem(item, duration, easing) {
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

  function playArticleMorph(session) {
    if (!session || activeArticleMorph !== session) {
      return Promise.resolve();
    }

    const duration = cssDuration("--duration-shared", 720);
    const easing = window.getComputedStyle(document.documentElement).getPropertyValue("--article-enter-ease").trim() || "cubic-bezier(0.165, 0.84, 0.44, 1)";
    const finished = [];

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

  function cleanupArticleMorph(session, cancelAnimations) {
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

  function prepareArticleSharedTransition(nextDocument, currentUrlStr, targetUrlStr) {
    return prepareArticleMorph(nextDocument, currentUrlStr, targetUrlStr);
  }

  function hasSiteIdentity(root) {
    return Boolean(root.querySelector(".hero-identity, .notes-aside-identity"));
  }

  function shouldAnimateIdentityExit(nextDocument) {
    return hasSiteIdentity(document) && !hasSiteIdentity(nextDocument);
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
