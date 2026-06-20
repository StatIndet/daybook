interface RouterState {
  __daybook: boolean;
  index: number;
  url: string;
  fromUrl: string | null;
  scrollX: number;
  scrollY: number;
}

type DaybookNavigationType = "initial" | "push" | "traverse";

interface DaybookBeforeSwapDetail {
  oldUrl: string;
  newUrl: string;
}

interface DaybookPageLoadDetail {
  url: URL;
  navigationType: DaybookNavigationType;
  oldUrl: string;
  newUrl: string;
}

interface DaybookTransitionFinishedDetail {
  oldUrl: string;
  newUrl: string;
}



(() => {
  const ROUTER_STATE_KEY = "daybook-router";
  let currentIndex = 0;
  let isNavigating = false;
  let abortController: AbortController | null = null;
  let currentRouterUrl = location.href;

  function isRouterState(state: any): state is RouterState {
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
      } as RouterState, "");
    } else {
      currentIndex = history.state.index;
    }

    history.scrollRestoration = "manual";

    document.addEventListener("click", handleGlobalClick);
    window.addEventListener("popstate", handlePopState);

    // Trigger initial load event after all deferred scripts attach listeners
    window.addEventListener("DOMContentLoaded", () => {
      setTimeout(() => {
        emitPageLoad("initial", location.href, location.href);
      }, 0);
    });
  }

  function isNotesUrl(urlStr: string): boolean {
    try {
      const u = new URL(urlStr, location.origin);
      return u.pathname === "/notes/" || u.pathname === "/notes";
    } catch {
      return false;
    }
  }

  function handleGlobalClick(event: MouseEvent) {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return;
    }

    const target = (event.target as HTMLElement).closest("a");
    if (!target) return;

    if (target.classList.contains("note-back-link")) {
      event.preventDefault();
      const state = history.state;
      if (
        state && 
        state.__daybook === true && 
        state.fromUrl && 
        state.index > 0
      ) {
        try {
          const fromUrl = new URL(state.fromUrl, location.origin);
          const currentUrl = new URL(location.href);
          
          const extMatch = fromUrl.pathname.match(/\.([a-z0-9]+)$/i);
          let isResource = false;
          if (extMatch && extMatch[1]) {
            const excluded = ["pdf", "zip", "mp3", "png", "jpg", "jpeg", "webp", "svg", "gif", "xml", "json"];
            isResource = excluded.includes(extMatch[1].toLowerCase());
          }

          if (
            fromUrl.origin === currentUrl.origin &&
            fromUrl.pathname !== currentUrl.pathname &&
            !isResource
          ) {
            history.back();
            return;
          }
        } catch (e) {
          // silent fallback
        }
      }
      navigate(target.href, false, null, target);
      return;
    }

    if (!shouldInterceptLink(target)) return;

    event.preventDefault();
    navigate(target.href, false, null, target);
  }

  function shouldInterceptLink(link: HTMLAnchorElement): boolean {
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

    // Extension check for resources
    const extMatch = url.pathname.match(/\.([a-z0-9]+)$/i);
    if (extMatch && extMatch[1]) {
      const ext = extMatch[1].toLowerCase();
      const excluded = ["pdf", "zip", "mp3", "png", "jpg", "jpeg", "webp", "svg", "gif", "xml", "json"];
      if (excluded.includes(ext)) return false;
    }

    // Pure hash jump on same page
    if (url.pathname === location.pathname && url.search === location.search && url.hash !== location.hash) {
      return false;
    }

    return true;
  }

  function saveCurrentScroll() {
    if (isRouterState(history.state)) {
      history.replaceState({
        ...history.state,
        scrollX: window.scrollX,
        scrollY: window.scrollY
      } as RouterState, "");
    }
  }

  function closeOverlays() {
    document.body.classList.remove("is-mobile-drawer-open");
    document.body.classList.remove("is-search-overlay-open");
    document.body.classList.remove("is-tags-overlay-open");
    document.body.classList.remove("is-mobile-scroll-locked");
  }

  async function navigate(urlStr: string, isTraverse = false, targetState: RouterState | null = null, sourceLink: HTMLElement | null = null) {
    if (isNavigating) {
      if (abortController) abortController.abort();
    }

    const targetUrl = new URL(urlStr, location.origin);

    // If pure hash jump on same page handled programmatically
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

      if (!currentContainer || !newContainer) {
        throw new Error("Missing data-daybook-page");
      }

      // Prepare state
      let newState: RouterState;
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
        newState = targetState!;
        currentIndex = targetState!.index;
      }

      const doSwap = () => {
        emitBeforeSwap(oldUrl, targetUrl.href);
        updateHead(newDocument);
        swapPage(currentContainer, newContainer, newDocument.body);

        if (!isTraverse) {
          history.pushState(newState, "", targetUrl.href);
        }

        if (isTraverse) {
          window.scrollTo(newState.scrollX, newState.scrollY);
        } else if (targetUrl.hash) {
          const el = document.getElementById(targetUrl.hash.slice(1));
          if (el) el.scrollIntoView();
          else window.scrollTo(0, 0);
        } else {
          window.scrollTo(0, 0);
        }

        // Force layout calculation to ensure synchronous scroll and layout are applied before view transition snapshots
        void document.body.offsetHeight;

        requestAnimationFrame(() => {
          currentRouterUrl = targetUrl.href;
          emitPageLoad(isTraverse ? "traverse" : "push", oldUrl, targetUrl.href);
        });
      };

      const engine = window.DaybookTransitionEngine;
      const useMotion = engine && !engine.reducedMotion();
      const articleTransition = engine && engine.isArticleTransition(oldUrl, targetUrl.href);
      let articleMorph: any = null;

      if (engine) {
        engine.clearTransitionClasses();
        engine.clearArticleSharedTransitions(document);
      }

      if (useMotion) {
        document.documentElement.classList.add("is-transitioning");
        if (articleTransition) {
          document.documentElement.classList.add("article-transition");
          articleMorph = engine.prepareArticleMorph
            ? engine.prepareArticleMorph(newDocument, oldUrl, targetUrl.href, sourceLink)
            : engine.prepareArticleSharedTransition(newDocument, oldUrl, targetUrl.href, sourceLink);
        } else if (!isTraverse) { // Push transition
          document.body.classList.add(engine.exitClassName(document.body));
          if (engine.shouldAnimateIdentityExit(newDocument)) {
            document.documentElement.classList.add("identity-exit-down");
          }
          await new Promise(r => setTimeout(r, engine.cssDuration("--transition-exit-delay", 260)));
        }
      }

      if (useMotion && articleTransition) {
        doSwap();

        const morphFinished = articleMorph && engine.playArticleMorph
          ? engine.playArticleMorph(articleMorph)
          : Promise.resolve();

        morphFinished.catch(() => {}).finally(() => {
          if (engine) {
            engine.clearTransitionClasses();
            engine.clearArticleSharedTransitions(document);
          }
          emitTransitionFinished(oldUrl, targetUrl.href);
        });
      } else if (useMotion && document.startViewTransition) {
        const transition = document.startViewTransition(() => {
          doSwap();
          if (!articleTransition && !isTraverse && engine) {
            document.body.classList.add(engine.enterClassName(document.body));
          }
        });
        
        transition.finished.catch(() => {}).finally(() => {
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

    } catch (err: any) {
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

  function fallbackToNative(url: URL) {
    window.location.href = url.href;
  }

  function swapPage(currentContainer: Element, newContainer: Element, newBody: HTMLElement) {
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
      currentBody.setAttribute("data-page-kind", newBody.getAttribute("data-page-kind")!);
    } else {
      currentBody.removeAttribute("data-page-kind");
    }

    const oldClasses = Array.from(currentBody.classList);
    const newClasses = Array.from(newBody.classList);

    oldClasses.forEach(c => {
      if (c.endsWith("-body") || c === "page-body") {
        currentBody.classList.remove(c);
      }
    });

    newClasses.forEach(c => {
      if (c.endsWith("-body") || c === "page-body") {
        currentBody.classList.add(c);
      }
    });
  }

  function updateHead(newDocument: Document) {
    if (newDocument.title) document.title = newDocument.title;

    const headSelectors = [
      'meta[name="description"]',
      'link[rel="canonical"]',
      'meta[property^="og:"]',
      'meta[name^="twitter:"]'
    ];

    headSelectors.forEach(selector => {
      const oldEls = document.head.querySelectorAll(selector);
      oldEls.forEach(el => el.remove());

      const newEls = newDocument.head.querySelectorAll(selector);
      newEls.forEach(el => {
        document.head.appendChild(el.cloneNode(true));
      });
    });

    const newStylesheets = newDocument.head.querySelectorAll('link[rel="stylesheet"]');
    newStylesheets.forEach(newLink => {
      const href = newLink.getAttribute("href");
      if (href && !document.head.querySelector(`link[rel="stylesheet"][href="${href}"]`)) {
        document.head.appendChild(newLink.cloneNode(true));
      }
    });
  }

  async function handlePopState(event: PopStateEvent) {
    if (!isRouterState(event.state)) {
      fallbackToNative(new URL(location.href));
      return;
    }
    await navigate(location.href, true, event.state);
  }

  function emitBeforeSwap(oldUrl: string, newUrl: string) {
    document.dispatchEvent(new CustomEvent<DaybookBeforeSwapDetail>("daybook:before-swap", {
      detail: { oldUrl, newUrl }
    }));
  }

  function emitPageLoad(navigationType: DaybookNavigationType, oldUrl: string, newUrl: string) {
    document.dispatchEvent(new CustomEvent<DaybookPageLoadDetail>("daybook:page-load", {
      detail: {
        url: new URL(location.href),
        navigationType,
        oldUrl,
        newUrl
      }
    }));
  }

  function emitTransitionFinished(oldUrl: string, newUrl: string) {
    document.dispatchEvent(new CustomEvent<DaybookTransitionFinishedDetail>("daybook:transition-finished", {
      detail: { oldUrl, newUrl }
    }));
  }

  (window as any).daybookNavigate = (url: string) => navigate(url);
  (window as any).daybookNavigateTo = (url: string) => navigate(url);

  initRouter();
})();
