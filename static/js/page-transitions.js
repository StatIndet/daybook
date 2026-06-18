(function () {
  var isNavigating = false;
  var currentPageKey = pageKey(window.location.href);
  var cleanupTimer = 0;

  if ("scrollRestoration" in history) {
    history.scrollRestoration = "manual";
  }

  history.replaceState({ daybook: true }, "", window.location.href);

  function reducedMotion() {
    return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  function wait(ms) {
    return new Promise(function (resolve) {
      window.setTimeout(resolve, ms);
    });
  }

  function cssDuration(name, fallback) {
    var rawValue = window.getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    var value = Number.parseFloat(rawValue);
    if (!Number.isFinite(value)) {
      return fallback;
    }
    if (rawValue.endsWith("s") && !rawValue.endsWith("ms")) {
      return value * 1000;
    }
    return value;
  }

  function pageKey(href) {
    var url = new URL(href, window.location.href);
    return url.origin + url.pathname + url.search;
  }

  function cleanPath(url) {
    var path = url.pathname;
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
    var path = cleanPath(url);
    return /^\/notes\/[^/]+$/.test(path);
  }

  function isArticleTransition(url) {
    var currentURL = new URL(currentPageKey);
    return (isNotesIndex(currentURL) && isNoteDetail(url)) || (isNoteDetail(currentURL) && isNotesIndex(url));
  }

  function clearTitleTransitions(root) {
    root.querySelectorAll("[data-title-transition-name]").forEach(function (title) {
      title.style.removeProperty("view-transition-name");
    });
  }

  function clearMetaTransitions(root) {
    root.querySelectorAll("[data-meta-transition-name]").forEach(function (meta) {
      meta.style.removeProperty("view-transition-name");
    });
  }

  function clearArticleSharedTransitions(root) {
    clearTitleTransitions(root);
    clearMetaTransitions(root);
  }

  function linkMatchesURL(link, url) {
    var href = link.getAttribute("href");
    if (!href) {
      return false;
    }
    return cleanPath(new URL(href, window.location.origin)) === cleanPath(url);
  }

  function findListTitleForURL(root, url) {
    var titleLinks = root.querySelectorAll("[data-title-transition-name]");
    for (var i = 0; i < titleLinks.length; i++) {
      if (linkMatchesURL(titleLinks[i], url)) {
        return titleLinks[i];
      }
    }
    return null;
  }

  function findTitleByTransitionName(root, transitionName) {
    if (!transitionName) {
      return null;
    }
    if (root.matches && root.matches("[data-title-transition-name]") && root.dataset.titleTransitionName === transitionName) {
      return root;
    }

    var titles = root.querySelectorAll("[data-title-transition-name]");
    for (var i = 0; i < titles.length; i++) {
      if (titles[i].dataset.titleTransitionName === transitionName) {
        return titles[i];
      }
    }
    return null;
  }

  function findArticleTitle(root) {
    return root.querySelector(".note-title [data-title-transition-name]");
  }

  function findArticleMeta(root) {
    return root.querySelector(".note-meta[data-meta-transition-name]");
  }

  function findMetaForListTitle(titleLink) {
    var noteItem = titleLink && titleLink.closest(".notes-item");
    if (!noteItem) {
      return null;
    }
    return noteItem.querySelector("[data-meta-transition-name]");
  }

  function findListMetaForURL(root, url) {
    return findMetaForListTitle(findListTitleForURL(root, url));
  }

  function setTitleTransitionPair(sourceTitle, targetTitle) {
    if (!sourceTitle || !targetTitle || !sourceTitle.dataset.titleTransitionName) {
      return false;
    }
    if (sourceTitle.dataset.titleTransitionName !== targetTitle.dataset.titleTransitionName) {
      return false;
    }
    sourceTitle.style.viewTransitionName = sourceTitle.dataset.titleTransitionName;
    targetTitle.style.viewTransitionName = targetTitle.dataset.titleTransitionName;
    return true;
  }

  function setMetaTransitionPair(sourceMeta, targetMeta) {
    if (!sourceMeta || !targetMeta || !sourceMeta.dataset.metaTransitionName) {
      return false;
    }
    if (sourceMeta.dataset.metaTransitionName !== targetMeta.dataset.metaTransitionName) {
      return false;
    }
    sourceMeta.style.viewTransitionName = sourceMeta.dataset.metaTransitionName;
    targetMeta.style.viewTransitionName = targetMeta.dataset.metaTransitionName;
    targetMeta.classList.add("meta-shared-target");
    document.documentElement.classList.add("meta-shared-transition");
    return true;
  }

  function lineHeightFor(element) {
    var style = window.getComputedStyle(element);
    var lineHeight = Number.parseFloat(style.lineHeight);
    if (Number.isFinite(lineHeight) && lineHeight > 0) {
      return lineHeight;
    }

    var fontSize = Number.parseFloat(style.fontSize);
    if (Number.isFinite(fontSize) && fontSize > 0) {
      return fontSize * 1.2;
    }
    return 0;
  }

  function titleLineCount(title) {
    if (!title) {
      return 0;
    }

    var lineHeight = lineHeightFor(title);
    var height = title.getBoundingClientRect().height;
    if (!lineHeight || height <= 0) {
      return 0;
    }
    return Math.max(1, Math.round(height / lineHeight));
  }

  function clonedTitleLineCount(nextDocument, title) {
    if (!title) {
      return 0;
    }
    if (title.ownerDocument === document) {
      return titleLineCount(title);
    }

    var transitionName = title.dataset.titleTransitionName;
    var targetPage = title.closest(".notes-page") || title.closest(".article-stage");
    if (!targetPage) {
      return 0;
    }

    var probe = targetPage.cloneNode(true);
    var pageMain = document.querySelector(".page-main") || document.body;
    var pageMainRect = pageMain.getBoundingClientRect();

    probe.style.position = "fixed";
    probe.style.left = pageMainRect.left + "px";
    probe.style.top = pageMainRect.top + "px";
    probe.style.width = pageMainRect.width + "px";
    probe.style.visibility = "hidden";
    probe.style.pointerEvents = "none";
    probe.style.zIndex = "-1";

    pageMain.appendChild(probe);
    try {
      return titleLineCount(findTitleByTransitionName(probe, transitionName));
    } finally {
      probe.remove();
    }
  }

  function titleLineCountsMatch(sourceTitle, targetTitle, nextDocument) {
    var sourceLines = titleLineCount(sourceTitle);
    var targetLines = clonedTitleLineCount(nextDocument, targetTitle);
    return sourceLines > 0 && targetLines > 0 && sourceLines === targetLines;
  }

  function prepareArticleSharedTransition(nextDocument, url, sourceLink) {
    var currentURL = new URL(currentPageKey);
    var sourceTitle = null;
    var targetTitle = null;
    var sourceMeta = null;
    var targetMeta = null;

    clearArticleSharedTransitions(document);
    clearArticleSharedTransitions(nextDocument);

    if (isNotesIndex(currentURL) && isNoteDetail(url)) {
      if (sourceLink && sourceLink.matches("[data-title-transition-name]") && linkMatchesURL(sourceLink, url)) {
        sourceTitle = sourceLink;
      } else {
        sourceTitle = findListTitleForURL(document, url);
      }
      targetTitle = findArticleTitle(nextDocument);
      sourceMeta = findMetaForListTitle(sourceTitle) || findListMetaForURL(document, url);
      targetMeta = findArticleMeta(nextDocument);
    } else if (isNoteDetail(currentURL) && isNotesIndex(url)) {
      sourceTitle = findArticleTitle(document);
      targetTitle = findListTitleForURL(nextDocument, currentURL);
      sourceMeta = findArticleMeta(document);
      targetMeta = findMetaForListTitle(targetTitle) || findListMetaForURL(nextDocument, currentURL);
    } else {
      return;
    }

    if (titleLineCountsMatch(sourceTitle, targetTitle, nextDocument) && setTitleTransitionPair(sourceTitle, targetTitle)) {
      return;
    }
    setMetaTransitionPair(sourceMeta, targetMeta);
  }

  function hasSiteIdentity(root) {
    return Boolean(root.querySelector(".hero-identity, .notes-aside-identity"));
  }

  function shouldAnimateIdentityExit(nextDocument) {
    return hasSiteIdentity(document) && !hasSiteIdentity(nextDocument);
  }

  function isPlainLeftClick(event) {
    return event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
  }

  function looksLikeHTMLPage(url) {
    var lastPart = url.pathname.split("/").pop();
    if (url.pathname.endsWith("/") || lastPart === "") {
      return true;
    }
    if (url.pathname.endsWith(".html")) {
      return true;
    }
    return !lastPart.includes(".");
  }

  function shouldHandleLink(link, event) {
    if (!link || !isPlainLeftClick(event)) {
      return false;
    }
    if (link.target && link.target !== "_self") {
      return false;
    }
    if (link.hasAttribute("download")) {
      return false;
    }

    var href = link.getAttribute("href") || "";
    if (href === "" || href === "#" || href.startsWith("mailto:") || href.startsWith("tel:")) {
      return false;
    }

    var url = new URL(link.href, window.location.href);
    if (url.origin !== window.location.origin || url.hash || !looksLikeHTMLPage(url)) {
      return false;
    }
    if (pageKey(url.href) === currentPageKey) {
      return false;
    }

    return true;
  }

  function exitClassName() {
    if (document.body.classList.contains("home-body")) {
      return "home-exiting";
    }
    return "page-exiting";
  }

  function enterClassName() {
    if (document.body.classList.contains("home-body")) {
      return "home-entering";
    }
    return "page-entering";
  }

  function cancelCleanupTimer() {
    if (!cleanupTimer) {
      return;
    }
    window.clearTimeout(cleanupTimer);
    cleanupTimer = 0;
  }

  function clearTransitionClasses() {
    document.documentElement.classList.remove(
      "is-transitioning",
      "article-transition",
      "identity-exit-down",
      "meta-shared-transition",
    );
    if (!document.body) {
      return;
    }
    document.body.classList.remove("home-exiting", "page-exiting", "home-entering", "page-entering");
  }

  function scheduleClearTransitionClasses(delay) {
    cancelCleanupTimer();
    if (delay <= 0) {
      clearTransitionClasses();
      return;
    }

    cleanupTimer = window.setTimeout(function () {
      cleanupTimer = 0;
      clearTransitionClasses();
    }, delay);
  }

  async function fetchPage(url) {
    var response = await fetch(url.href, {
      credentials: "same-origin",
      headers: { Accept: "text/html" },
    });
    var contentType = response.headers.get("content-type") || "";
    if (!response.ok || !contentType.includes("text/html")) {
      throw new Error("目标不是可切换的 HTML 页面");
    }

    var html = await response.text();
    var nextDocument = new DOMParser().parseFromString(html, "text/html");
    if (!nextDocument.body) {
      throw new Error("目标页面缺少 body");
    }
    return nextDocument;
  }

  function syncThemeButtons() {
    if (window.daybookSyncThemeButtons) {
      window.daybookSyncThemeButtons();
    }
  }

  function syncNoteTocs() {
    if (window.daybookSyncNoteTocs) {
      window.daybookSyncNoteTocs();
    }
  }

  function syncHeadingAnchors() {
    if (window.daybookSyncHeadingAnchors) {
      window.daybookSyncHeadingAnchors();
    }
  }

  function syncNoteFilters() {
    if (window.daybookSyncNoteFilters) {
      window.daybookSyncNoteFilters();
    }
  }

  function syncEmbeds() {
    if (window.daybookSyncEmbeds) {
      window.daybookSyncEmbeds();
    }
  }

  function syncMermaid() {
    if (window.DaybookMermaid && typeof window.DaybookMermaid.init === "function") {
      window.DaybookMermaid.init();
    }
  }

  function swapArticleStage(nextDocument) {
    var currentStage = document.querySelector(".article-stage");
    var nextStage = nextDocument.querySelector(".article-stage");
    var currentNotesPage = currentStage && currentStage.closest(".notes-page");
    var nextNotesPage = nextStage && nextStage.closest(".notes-page");

    if (!currentStage || !nextStage || !currentNotesPage || !nextNotesPage) {
      return false;
    }

    currentNotesPage.className = nextNotesPage.className;
    currentStage.replaceWith(nextStage);
    return true;
  }

  function swapPage(nextDocument, url, updateHistory, articleTransition) {
    var currentFrame = document.querySelector(".page-frame");
    var nextFrame = nextDocument.querySelector(".page-frame");

    document.title = nextDocument.title;
    document.body.className = nextDocument.body.className;

    if (articleTransition && swapArticleStage(nextDocument)) {
      // Keep persistent side content mounted; only the article/list stage changes.
    } else if (currentFrame && nextFrame) {
      currentFrame.innerHTML = nextFrame.innerHTML;
    } else {
      document.body.innerHTML = nextDocument.body.innerHTML;
    }

    if (!articleTransition) {
      document.body.classList.add(enterClassName());
    }

    if (updateHistory) {
      history.pushState({ daybook: true }, "", url.href);
    }
    currentPageKey = pageKey(url.href);

    syncThemeButtons();
    syncNoteTocs();
    syncHeadingAnchors();
    syncNoteFilters();
    syncMermaid();
    syncEmbeds();
    syncKatex();
    window.scrollTo(0, 0);
  }

  async function runSwap(nextDocument, url, updateHistory, sourceLink) {
    var useMotion = !reducedMotion();
    var articleTransition = isArticleTransition(url);
    var animateIdentityExit = !articleTransition && shouldAnimateIdentityExit(nextDocument);
    cancelCleanupTimer();
    clearTransitionClasses();

    if (useMotion) {
      document.documentElement.classList.add("is-transitioning");
      if (articleTransition) {
        document.documentElement.classList.add("article-transition");
        prepareArticleSharedTransition(nextDocument, url, sourceLink);
      } else {
        document.body.classList.add(exitClassName());
        if (animateIdentityExit) {
          document.documentElement.classList.add("identity-exit-down");
        }
        await wait(cssDuration("--transition-exit-delay", 260));
      }
    }

    if (useMotion && document.startViewTransition) {
      var transition = document.startViewTransition(function () {
        swapPage(nextDocument, url, updateHistory, articleTransition);
      });
      try {
        await transition.finished;
      } catch (error) {
        // A canceled transition still leaves the swapped page usable.
      }
    } else {
      swapPage(nextDocument, url, updateHistory, articleTransition);
    }

    if (articleTransition) {
      clearTransitionClasses();
      clearArticleSharedTransitions(document);
      return;
    }

    document.documentElement.classList.remove("is-transitioning");
    document.body.classList.remove("home-exiting", "page-exiting");
    scheduleClearTransitionClasses(useMotion ? cssDuration("--transition-cleanup-delay", 900) : 0);
  }

  async function navigateTo(url, updateHistory, sourceLink) {
    if (isNavigating) {
      return;
    }
    if (!window.fetch || !window.DOMParser) {
      if (updateHistory) {
        window.location.href = url.href;
      } else {
        window.location.reload();
      }
      return;
    }

    isNavigating = true;
    try {
      var nextDocument = await fetchPage(url);
      await runSwap(nextDocument, url, updateHistory, sourceLink);
    } catch (error) {
      clearArticleSharedTransitions(document);
      if (updateHistory) {
        window.location.href = url.href;
      } else {
        window.location.reload();
      }
    } finally {
      isNavigating = false;
    }
  }

  window.daybookNavigateTo = function (href) {
    return navigateTo(new URL(href, window.location.href), true);
  };

  window.daybookSyncPageKey = function (href) {
    currentPageKey = pageKey(href || window.location.href);
  };

  document.addEventListener("click", function (event) {
    var link = event.target.closest("a");
    if (!shouldHandleLink(link, event)) {
      return;
    }

    event.preventDefault();
    navigateTo(new URL(link.href, window.location.href), true, link);
  });

  window.addEventListener("popstate", function () {
    var nextKey = pageKey(window.location.href);
    if (nextKey === currentPageKey) {
      return;
    }
    navigateTo(new URL(window.location.href), false);
  });

  window.addEventListener("pageshow", function () {
    cancelCleanupTimer();
    clearTransitionClasses();
    currentPageKey = pageKey(window.location.href);
    syncThemeButtons();
    syncNoteTocs();
    syncHeadingAnchors();
    syncNoteFilters();
    syncMermaid();
    syncEmbeds();
    syncKatex();
  });

  function syncKatex() {
    if (window.DaybookMath && typeof window.DaybookMath.init === "function") {
      window.DaybookMath.init();
    }
  }

  syncNoteTocs();
  syncHeadingAnchors();
  syncNoteFilters();
  syncMermaid();
  syncEmbeds();
  syncKatex();
})();
