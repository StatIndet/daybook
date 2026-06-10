(function () {
  var isNavigating = false;
  var currentPageKey = pageKey(window.location.href);

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

  function clearTransitionClasses() {
    document.documentElement.classList.remove("is-transitioning");
    if (!document.body) {
      return;
    }
    document.body.classList.remove("home-exiting", "page-exiting", "home-entering", "page-entering");
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

  function swapPage(nextDocument, url, updateHistory) {
    document.title = nextDocument.title;
    document.body.className = nextDocument.body.className;
    document.body.innerHTML = nextDocument.body.innerHTML;
    document.body.classList.add(enterClassName());

    if (updateHistory) {
      history.pushState({ daybook: true }, "", url.href);
    }
    currentPageKey = pageKey(url.href);

    syncThemeButtons();
    window.scrollTo(0, 0);
  }

  async function runSwap(nextDocument, url, updateHistory) {
    var useMotion = !reducedMotion();
    clearTransitionClasses();

    if (useMotion) {
      document.documentElement.classList.add("is-transitioning");
      document.body.classList.add(exitClassName());
      await wait(cssDuration("--transition-exit-delay", 260));
    }

    if (useMotion && document.startViewTransition) {
      var transition = document.startViewTransition(function () {
        swapPage(nextDocument, url, updateHistory);
      });
      try {
        await transition.finished;
      } catch (error) {
        // A canceled transition still leaves the swapped page usable.
      }
    } else {
      swapPage(nextDocument, url, updateHistory);
    }

    document.documentElement.classList.remove("is-transitioning");
    document.body.classList.remove("home-exiting", "page-exiting");
    window.setTimeout(clearTransitionClasses, useMotion ? cssDuration("--transition-cleanup-delay", 900) : 0);
  }

  async function navigateTo(url, updateHistory) {
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
      await runSwap(nextDocument, url, updateHistory);
    } catch (error) {
      if (updateHistory) {
        window.location.href = url.href;
      } else {
        window.location.reload();
      }
    } finally {
      isNavigating = false;
    }
  }

  document.addEventListener("click", function (event) {
    var link = event.target.closest("a");
    if (!shouldHandleLink(link, event)) {
      return;
    }

    event.preventDefault();
    navigateTo(new URL(link.href, window.location.href), true);
  });

  window.addEventListener("popstate", function () {
    var nextKey = pageKey(window.location.href);
    if (nextKey === currentPageKey) {
      return;
    }
    navigateTo(new URL(window.location.href), false);
  });

  window.addEventListener("pageshow", function () {
    clearTransitionClasses();
    currentPageKey = pageKey(window.location.href);
    syncThemeButtons();
  });
})();
