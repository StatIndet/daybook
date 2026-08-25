"use strict";
(() => {
  // assets/ts/site-stats.ts
  function normalizePath(p) {
    try {
      const url = new URL(p, window.location.origin);
      let pathname = decodeURI(url.pathname);
      pathname = pathname.replace(/\/+/g, "/");
      if (!pathname.startsWith("/")) pathname = "/" + pathname;
      if (pathname !== "/" && !pathname.endsWith("/")) {
        pathname += "/";
      }
      return pathname;
    } catch {
      return "/";
    }
  }
  var hitPromise = null;
  var lastHitPath = "";
  async function hitPath(path) {
    const normalized = normalizePath(path);
    const statsEnabled = document.body.dataset.statsEnabled === "true";
    if (!statsEnabled) {
      return null;
    }
    const apiBase = "/api";
    if (hitPromise && lastHitPath === normalized) {
      return hitPromise;
    }
    lastHitPath = normalized;
    hitPromise = (async () => {
      try {
        const res = await fetch(`${apiBase}/hit`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ path: normalized })
        });
        if (res.ok) {
          return await res.json();
        }
      } catch (e) {
        console.error("[Site Stats] Post hit failed", e);
      }
      return null;
    })();
    return hitPromise;
  }
  function initSiteStats(root = document) {
    const promise = hitPath(window.location.pathname);
    if (!promise) return null;
    promise.then((stats) => {
      if (!stats) return;
      const visitorsEls = root.querySelectorAll("[data-site-visitors]");
      visitorsEls.forEach((el) => {
        el.textContent = stats.visitors.toLocaleString();
      });
      const viewsEls = root.querySelectorAll("[data-site-views]");
      viewsEls.forEach((el) => {
        el.textContent = stats.totalViews.toLocaleString();
      });
      const pageViewsEls = root.querySelectorAll("[data-page-views]");
      pageViewsEls.forEach((el) => {
        const pathAttr = el.getAttribute("data-path");
        if (pathAttr && normalizePath(pathAttr) === stats.path) {
          el.textContent = stats.pageViews.toLocaleString();
        }
      });
      const pageViewsLabelEls = root.querySelectorAll("[data-page-views-label]");
      pageViewsLabelEls.forEach((el) => {
        const pathAttr = el.getAttribute("data-path");
        if (pathAttr && normalizePath(pathAttr) === stats.path) {
          el.textContent = stats.pageViews === 1 ? "view" : "views";
        }
      });
      const uvAnimEls = root.querySelectorAll("[data-site-visitors-anim]");
      uvAnimEls.forEach((el) => {
        el.setAttribute("data-target", stats.visitors.toString());
      });
      const uvLabelEls = root.querySelectorAll("[data-site-visitors-label]");
      uvLabelEls.forEach((el) => {
        el.textContent = stats.visitors === 1 ? "visitor" : "visitors";
      });
      const pvAnimEls = root.querySelectorAll("[data-site-views-anim]");
      pvAnimEls.forEach((el) => {
        el.setAttribute("data-target", stats.totalViews.toString());
      });
      const pvLabelEls = root.querySelectorAll("[data-site-views-label]");
      pvLabelEls.forEach((el) => {
        el.textContent = stats.totalViews === 1 ? "k view" : "k views";
      });
      document.dispatchEvent(new CustomEvent("daybook:stats-loaded"));
    });
    return promise;
  }
  function initSiteUptime(root = document) {
    const uptimeEls = root.querySelectorAll("[data-site-uptime]");
    uptimeEls.forEach((el) => {
      const startedAt = el.getAttribute("data-started-at");
      if (!startedAt) return;
      const startTime = new Date(startedAt).getTime();
      const now = (/* @__PURE__ */ new Date()).getTime();
      if (isNaN(startTime) || startTime > now) {
        el.textContent = "--";
        return;
      }
      const diffDays = Math.floor((now - startTime) / (1e3 * 60 * 60 * 24));
      el.textContent = `${diffDays} \u5929`;
    });
  }

  // assets/ts/site-presence.ts
  function normalizePath2(p) {
    try {
      const url = new URL(p, window.location.origin);
      let pathname = decodeURI(url.pathname);
      pathname = pathname.replace(/\/+/g, "/");
      if (!pathname.startsWith("/")) pathname = "/" + pathname;
      if (pathname !== "/" && !pathname.endsWith("/")) {
        pathname += "/";
      }
      return pathname;
    } catch {
      return "/";
    }
  }
  var ws = null;
  var isConnecting = false;
  var reconnectTimer = null;
  var reconnectAttempts = 0;
  var MAX_RECONNECT_ATTEMPTS = 10;
  var currentPresencePath = "";
  var isStatsEnabled = true;
  function updatePresenceDOM(path, pageViewers, siteViewers) {
    const siteEls = document.querySelectorAll("[data-site-viewers]");
    siteEls.forEach((el) => {
      if (!el.classList.contains("anim-done") && el.classList.contains("archive-stat-num")) {
        el.setAttribute("data-target", siteViewers.toString());
        document.dispatchEvent(new CustomEvent("daybook:stats-loaded"));
      } else {
        el.textContent = siteViewers.toString();
      }
    });
    const pageEls = document.querySelectorAll("[data-page-viewers]");
    pageEls.forEach((el) => {
      const pathAttr = el.getAttribute("data-path");
      if (pathAttr && normalizePath2(pathAttr) === path) {
        el.textContent = pageViewers.toString();
      }
    });
  }
  function connectWebSocket() {
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
      return;
    }
    if (reconnectAttempts > MAX_RECONNECT_ATTEMPTS) {
      return;
    }
    isConnecting = true;
    currentPresencePath = normalizePath2(window.location.pathname);
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/api/presence?path=${encodeURIComponent(currentPresencePath)}`;
    try {
      ws = new WebSocket(wsUrl);
    } catch (e) {
      isConnecting = false;
      scheduleReconnect();
      return;
    }
    ws.onopen = () => {
      isConnecting = false;
      reconnectAttempts = 0;
    };
    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "presence") {
          updatePresenceDOM(data.path, data.pageViewers, data.siteViewers);
        }
      } catch (e) {
      }
    };
    ws.onclose = () => {
      ws = null;
      isConnecting = false;
      scheduleReconnect();
    };
  }
  function scheduleReconnect() {
    if (!isStatsEnabled) return;
    if (reconnectTimer) clearTimeout(reconnectTimer);
    reconnectAttempts++;
    const delay = Math.min(1e3 * Math.pow(2, reconnectAttempts), 3e4);
    reconnectTimer = setTimeout(() => {
      connectWebSocket();
    }, delay);
  }
  function initSitePresence() {
    const statsEnabledAttr = document.body.dataset.statsEnabled;
    isStatsEnabled = statsEnabledAttr === "true";
    if (!isStatsEnabled) {
      if (ws) {
        ws.close();
        ws = null;
      }
      return;
    }
    const newPath = normalizePath2(window.location.pathname);
    if (!ws || ws.readyState === WebSocket.CLOSED || ws.readyState === WebSocket.CLOSING) {
      currentPresencePath = newPath;
      reconnectAttempts = 0;
      connectWebSocket();
    } else if (ws.readyState === WebSocket.OPEN) {
      if (currentPresencePath !== newPath) {
        currentPresencePath = newPath;
        ws.send(JSON.stringify({ type: "navigate", path: currentPresencePath }));
      }
    } else {
      currentPresencePath = newPath;
    }
  }

  // assets/ts/daybook-router.ts
  (() => {
    const ROUTER_STATE_KEY = "daybook-router";
    let currentIndex = 0;
    let isNavigating = false;
    let abortController = null;
    let currentRouterUrl = location.href;
    function isRouterState(state) {
      return state && state.__daybook === true;
    }
    function initRouter() {
      if (!isRouterState(history.state)) {
        history.replaceState({
          __daybook: true,
          index: currentIndex,
          url: location.href,
          fromUrl: null,
          scrollX: window.scrollX,
          scrollY: window.scrollY
        }, "");
      } else {
        currentIndex = history.state.index;
      }
      history.scrollRestoration = "manual";
      document.addEventListener("click", handleGlobalClick);
      window.addEventListener("popstate", handlePopState);
      const triggerInitialLoad = () => {
        setTimeout(() => {
          emitPageLoad("initial", location.href, location.href);
          const hitPromise2 = initSiteStats();
          if (hitPromise2) {
            hitPromise2.finally(() => initSitePresence());
          } else {
            initSitePresence();
          }
          initSiteUptime();
        }, 0);
      };
      if (document.readyState === "loading") {
        window.addEventListener("DOMContentLoaded", triggerInitialLoad);
      } else {
        triggerInitialLoad();
      }
    }
    function isNotesUrl(urlStr) {
      try {
        const u = new URL(urlStr, location.origin);
        return u.pathname === "/notes/" || u.pathname === "/notes";
      } catch {
        return false;
      }
    }
    function handleGlobalClick(event) {
      if (event.defaultPrevented) return;
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
        return;
      }
      const target = event.target.closest("a");
      if (!target) return;
      if (target.classList.contains("note-back-link")) {
        event.preventDefault();
        const state = history.state;
        if (state && state.__daybook === true && state.fromUrl && state.index > 0) {
          try {
            const fromUrl = new URL(state.fromUrl, location.origin);
            const currentUrl = new URL(location.href);
            const extMatch = fromUrl.pathname.match(/\.([a-z0-9]+)$/i);
            let isResource = false;
            if (extMatch && extMatch[1]) {
              const excluded = ["pdf", "zip", "mp3", "png", "jpg", "jpeg", "webp", "svg", "gif", "xml", "json"];
              isResource = excluded.includes(extMatch[1].toLowerCase());
            }
            if (fromUrl.origin === currentUrl.origin && fromUrl.pathname !== currentUrl.pathname && !isResource) {
              history.back();
              return;
            }
          } catch (e) {
          }
        }
        navigate(target.href, false, null, target);
        return;
      }
      if (!shouldInterceptLink(target)) return;
      event.preventDefault();
      navigate(target.href, false, null, target);
    }
    function shouldInterceptLink(link) {
      if (!link.href) return false;
      if (link.target && link.target !== "_self") return false;
      if (link.hasAttribute("download")) return false;
      if (link.rel && link.rel.includes("external")) return false;
      if (link.hasAttribute("data-daybook-reload")) return false;
      if (link.href.startsWith("mailto:")) return false;
      if (link.href.startsWith("tel:")) return false;
      if (link.href.startsWith("javascript:")) return false;
      const url = new URL(link.href, location.href);
      if (url.origin !== location.origin) return false;
      if (url.protocol !== "http:" && url.protocol !== "https:") return false;
      const extMatch = url.pathname.match(/\.([a-z0-9]+)$/i);
      if (extMatch && extMatch[1]) {
        const ext = extMatch[1].toLowerCase();
        const excluded = ["pdf", "zip", "mp3", "png", "jpg", "jpeg", "webp", "svg", "gif", "xml", "json"];
        if (excluded.includes(ext)) return false;
      }
      if (url.pathname === location.pathname && url.search === location.search && url.hash) {
        return false;
      }
      return true;
    }
    function getElementByHash(hash) {
      if (!hash || hash === "#") return null;
      let id = hash.slice(1);
      try {
        id = decodeURIComponent(id);
      } catch {
      }
      return document.getElementById(id);
    }
    function saveCurrentScroll() {
      if (isRouterState(history.state)) {
        history.replaceState({
          ...history.state,
          scrollX: window.scrollX,
          scrollY: window.scrollY
        }, "");
      }
    }
    function closeOverlays() {
      document.body.classList.remove("is-mobile-drawer-open");
      document.body.classList.remove("is-search-overlay-open");
      document.body.classList.remove("is-tags-overlay-open");
      document.body.classList.remove("is-media-overlay-open");
      document.body.classList.remove("is-mobile-scroll-locked");
      document.getElementById("daybook-media-manager")?.classList.remove("is-mobile-active");
    }
    async function navigate(urlStr, isTraverse = false, targetState = null, sourceLink = null) {
      if (isNavigating) {
        if (abortController) abortController.abort();
      }
      const targetUrl = new URL(urlStr, location.origin);
      if (!isTraverse && targetUrl.pathname === location.pathname && targetUrl.search === location.search) {
        window.location.hash = targetUrl.hash;
        return;
      }
      isNavigating = true;
      abortController = new AbortController();
      const signal = abortController.signal;
      const oldUrl = isTraverse ? currentRouterUrl : location.href;
      try {
        if (!isTraverse) {
          saveCurrentScroll();
        }
        closeOverlays();
        const response = await fetch(targetUrl.href, { signal });
        if (!response.ok) throw new Error("Fetch failed");
        const contentType = response.headers.get("content-type") || "";
        if (!contentType.includes("text/html")) {
          throw new Error("Not HTML");
        }
        const html = await response.text();
        const parser = new DOMParser();
        const newDocument = parser.parseFromString(html, "text/html");
        const currentContainer = document.querySelector("[data-daybook-page]");
        const newContainer = newDocument.querySelector("[data-daybook-page]");
        await preloadStylesheets(newDocument);
        if (!currentContainer || !newContainer) {
          throw new Error("Missing data-daybook-page");
        }
        let newState;
        if (!isTraverse) {
          currentIndex++;
          newState = {
            __daybook: true,
            index: currentIndex,
            url: targetUrl.href,
            fromUrl: oldUrl,
            scrollX: 0,
            scrollY: 0
          };
        } else {
          newState = targetState;
          currentIndex = targetState.index;
        }
        const doSwap = () => {
          emitBeforeSwap(oldUrl, targetUrl.href);
          updateHead(newDocument);
          syncShellFragments(newDocument);
          swapPage(currentContainer, newContainer, newDocument.body);
          if (!isTraverse) {
            history.pushState(newState, "", targetUrl.href);
          }
          if (isTraverse) {
            window.scrollTo({ left: newState.scrollX, top: newState.scrollY, behavior: "instant" });
          } else if (targetUrl.hash) {
            const el = getElementByHash(targetUrl.hash);
            if (el) el.scrollIntoView({ behavior: "instant" });
            else window.scrollTo({ left: 0, top: 0, behavior: "instant" });
          } else {
            window.scrollTo({ left: 0, top: 0, behavior: "instant" });
          }
          void document.body.offsetHeight;
          currentRouterUrl = targetUrl.href;
          emitPageLoad(isTraverse ? "traverse" : "push", oldUrl, targetUrl.href);
          const hitPromise2 = initSiteStats();
          if (hitPromise2) {
            hitPromise2.finally(() => initSitePresence());
          } else {
            initSitePresence();
          }
          initSiteUptime();
        };
        const engine = window.DaybookTransitionEngine;
        const useMotion = engine && !engine.reducedMotion();
        const articleTransition = engine && engine.isArticleTransition(oldUrl, targetUrl.href);
        if (engine) {
          engine.clearTransitionClasses();
          engine.clearArticleSharedTransitions(document);
        }
        let transitionInfo = null;
        if (useMotion) {
          document.documentElement.classList.add("is-transitioning");
          if (articleTransition) {
            document.documentElement.classList.add("article-transition");
            transitionInfo = engine.prepareArticleTransitionSource(oldUrl, targetUrl.href, sourceLink);
          } else if (!isTraverse) {
            engine.resolveStableRegions(document, newDocument);
            document.body.classList.add(engine.exitClassName(document.body));
            await new Promise((r) => setTimeout(r, engine.cssDuration("--transition-exit-delay", 260)));
          }
        }
        if (useMotion && document.startViewTransition) {
          const transition = document.startViewTransition(() => {
            doSwap();
            if (articleTransition && transitionInfo) {
              engine.prepareArticleTransitionTarget(transitionInfo);
            }
            if (!articleTransition && !isTraverse && engine) {
              document.body.classList.add(engine.enterClassName(document.body));
            }
          });
          transition.finished.catch(() => {
          }).finally(() => {
            if (engine) {
              engine.clearTransitionClasses();
              engine.clearArticleSharedTransitions(document);
            }
            emitTransitionFinished(oldUrl, targetUrl.href);
          });
        } else {
          doSwap();
          if (engine) {
            engine.clearTransitionClasses();
            engine.clearArticleSharedTransitions(document);
          }
          emitTransitionFinished(oldUrl, targetUrl.href);
        }
      } catch (err) {
        if (err && err.name === "AbortError") return;
        console.error("Router navigation failed:", err);
        if (window.DaybookTransitionEngine) {
          window.DaybookTransitionEngine.clearTransitionClasses();
          window.DaybookTransitionEngine.clearArticleSharedTransitions(document);
        }
        fallbackToNative(targetUrl);
      } finally {
        if (abortController && abortController.signal === signal) {
          isNavigating = false;
          abortController = null;
        }
      }
    }
    function fallbackToNative(url) {
      window.location.href = url.href;
    }
    function swapPage(currentContainer, newContainer, newBody) {
      for (const attr of Array.from(currentContainer.attributes)) {
        if (attr.name !== "id" && attr.name !== "data-daybook-page") {
          currentContainer.removeAttribute(attr.name);
        }
      }
      for (const attr of Array.from(newContainer.attributes)) {
        if (attr.name !== "id" && attr.name !== "data-daybook-page") {
          currentContainer.setAttribute(attr.name, attr.value);
        }
      }
      currentContainer.innerHTML = newContainer.innerHTML;
      const currentBody = document.body;
      if (newBody.hasAttribute("data-page-kind")) {
        currentBody.setAttribute("data-page-kind", newBody.getAttribute("data-page-kind"));
      } else {
        currentBody.removeAttribute("data-page-kind");
      }
      const oldClasses = Array.from(currentBody.classList);
      const newClasses = Array.from(newBody.classList);
      oldClasses.forEach((c) => {
        if (c.endsWith("-body") || c === "page-body") {
          currentBody.classList.remove(c);
        }
      });
      newClasses.forEach((c) => {
        if (c.endsWith("-body") || c === "page-body") {
          currentBody.classList.add(c);
        }
      });
    }
    function syncShellFragments(newDocument) {
      const fragmentsToSync = ["#mobile-drawer", "#mobile-overlay", "#mobile-drawer-mask", "#mobile-overlay-mask"];
      for (const selector of fragmentsToSync) {
        const oldEl = document.querySelector(selector);
        const newEl = newDocument.querySelector(selector);
        if (oldEl && newEl) {
          oldEl.replaceWith(newEl.cloneNode(true));
        }
      }
    }
    function preloadStylesheets(newDocument) {
      const newLinks = Array.from(newDocument.head.querySelectorAll('link[rel="stylesheet"]'));
      const promises = [];
      newLinks.forEach((newLink) => {
        const href = newLink.getAttribute("href");
        if (!href) return;
        const newUrl = new URL(href, location.href).href;
        const exists = Array.from(document.head.querySelectorAll('link[rel="stylesheet"]')).some((link) => link.href && new URL(link.href, location.href).href === newUrl);
        if (!exists) {
          const promise = new Promise((resolve) => {
            const preload = document.createElement("link");
            preload.rel = "preload";
            preload.as = "style";
            preload.href = href;
            if (newLink.crossOrigin) preload.crossOrigin = newLink.crossOrigin;
            if (newLink.integrity) preload.integrity = newLink.integrity;
            if (newLink.referrerPolicy) preload.referrerPolicy = newLink.referrerPolicy;
            let timeout = setTimeout(() => {
              console.warn("Timeout preloading stylesheet:", href);
              resolve();
            }, 3e3);
            preload.onload = () => {
              clearTimeout(timeout);
              resolve();
            };
            preload.onerror = () => {
              clearTimeout(timeout);
              console.warn("Failed to preload stylesheet:", href);
              resolve();
            };
            document.head.appendChild(preload);
          });
          promises.push(promise);
        }
      });
      return Promise.all(promises).then(() => {
      });
    }
    function updateHead(newDocument) {
      if (newDocument.title) document.title = newDocument.title;
      const newLang = newDocument.documentElement.lang;
      const oldLang = document.documentElement.lang;
      if (newLang && newLang !== oldLang) {
        document.documentElement.lang = newLang;
        document.dispatchEvent(new CustomEvent("daybook:lang-change", {
          detail: {
            lang: newLang,
            previousLang: oldLang
          }
        }));
      }
      const headSelectors = [
        'meta[name="description"]',
        'link[rel="canonical"]',
        'meta[property^="og:"]',
        'meta[name^="twitter:"]'
      ];
      headSelectors.forEach((selector) => {
        const oldEls = document.head.querySelectorAll(selector);
        oldEls.forEach((el) => el.remove());
        const newEls = newDocument.head.querySelectorAll(selector);
        newEls.forEach((el) => {
          document.head.appendChild(el.cloneNode(true));
        });
      });
      const newStylesheets = Array.from(newDocument.head.querySelectorAll('link[rel="stylesheet"]'));
      newStylesheets.forEach((newLink) => {
        const href = newLink.getAttribute("href");
        if (!href) return;
        const newUrl = new URL(href, location.href).href;
        const exists = Array.from(document.head.querySelectorAll('link[rel="stylesheet"]')).some((link) => link.href && new URL(link.href, location.href).href === newUrl);
        if (!exists) {
          document.head.appendChild(newLink.cloneNode(true));
        }
      });
    }
    async function handlePopState(event) {
      if (!isRouterState(event.state)) {
        fallbackToNative(new URL(location.href));
        return;
      }
      await navigate(location.href, true, event.state);
    }
    function emitBeforeSwap(oldUrl, newUrl) {
      document.dispatchEvent(new CustomEvent("daybook:before-swap", {
        detail: { oldUrl, newUrl }
      }));
    }
    function emitPageLoad(navigationType, oldUrl, newUrl) {
      document.dispatchEvent(new CustomEvent("daybook:page-load", {
        detail: {
          url: new URL(location.href),
          navigationType,
          oldUrl,
          newUrl
        }
      }));
    }
    function emitTransitionFinished(oldUrl, newUrl) {
      document.dispatchEvent(new CustomEvent("daybook:transition-finished", {
        detail: { oldUrl, newUrl }
      }));
    }
    window.daybookNavigate = (url) => navigate(url);
    window.daybookNavigateTo = (url) => navigate(url);
    window.daybookReplaceURL = (urlStr) => {
      const url = new URL(urlStr, location.origin);
      const current = history.state;
      if (isRouterState(current)) {
        history.replaceState(
          {
            ...current,
            url: url.href
          },
          "",
          url.href
        );
      } else {
        history.replaceState({
          __daybook: true,
          index: currentIndex,
          url: url.href,
          fromUrl: null,
          scrollX: window.scrollX,
          scrollY: window.scrollY
        }, "", url.href);
      }
      currentRouterUrl = url.href;
    };
    initRouter();
  })();
})();
