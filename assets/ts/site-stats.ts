interface StatsResponse {
  path: string;
  pageViews: number;
  totalViews: number;
  visitors: number;
}

function normalizePath(p: string): string {
  try {
    const url = new URL(p, window.location.origin);
    let pathname = decodeURI(url.pathname);
    
    pathname = pathname.replace(/\/+/g, '/');
    if (!pathname.startsWith('/')) pathname = '/' + pathname;
    if (pathname !== '/' && !pathname.endsWith('/')) {
      pathname += '/';
    }
    return pathname;
  } catch {
    return '/';
  }
}

let hitPromise: Promise<StatsResponse | null> | null = null;
let lastHitPath = "";

async function hitPath(path: string): Promise<StatsResponse | null> {
  const normalized = normalizePath(path);

  const statsEnabled = document.body.dataset.statsEnabled === "true";
  if (!statsEnabled) {
    return null;
  }
  const apiBase = "/api";

  // Prevent multiple simultaneous hits for the same navigation (e.g. strict mode or duplicate events)
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
        return (await res.json()) as StatsResponse;
      }
    } catch (e) {
      console.error("[Site Stats] Post hit failed", e);
    }
    return null;
  })();

  return hitPromise;
}

export function initSiteStats(root: Document | HTMLElement = document): Promise<StatsResponse | null> | null {
  const promise = hitPath(window.location.pathname);
  if (!promise) return null;

  promise.then(stats => {
    if (!stats) return;

    // Update DOM
    const visitorsEls = root.querySelectorAll("[data-site-visitors]");
    visitorsEls.forEach(el => {
      el.textContent = stats.visitors.toLocaleString();
    });

    const viewsEls = root.querySelectorAll("[data-site-views]");
    viewsEls.forEach(el => {
      el.textContent = stats.totalViews.toLocaleString();
    });

    const pageViewsEls = root.querySelectorAll("[data-page-views]");
    pageViewsEls.forEach(el => {
      const pathAttr = el.getAttribute("data-path");
      if (pathAttr && normalizePath(pathAttr) === stats.path) {
        el.textContent = stats.pageViews.toLocaleString();
      }
    });

    const pageViewsLabelEls = root.querySelectorAll("[data-page-views-label]");
    pageViewsLabelEls.forEach(el => {
      const pathAttr = el.getAttribute("data-path");
      if (pathAttr && normalizePath(pathAttr) === stats.path) {
        el.textContent = stats.pageViews === 1 ? "view" : "views";
      }
    });
    
    // For archive page stats animation
    const uvAnimEls = root.querySelectorAll("[data-site-visitors-anim]");
    uvAnimEls.forEach(el => {
      el.setAttribute("data-target", stats.visitors.toString());
    });
    const uvLabelEls = root.querySelectorAll("[data-site-visitors-label]");
    uvLabelEls.forEach(el => {
      el.textContent = stats.visitors === 1 ? "visitor" : "visitors";
    });

    const pvAnimEls = root.querySelectorAll("[data-site-views-anim]");
    pvAnimEls.forEach(el => {
      el.setAttribute("data-target", stats.totalViews.toString());
    });
    const pvLabelEls = root.querySelectorAll("[data-site-views-label]");
    pvLabelEls.forEach(el => {
      el.textContent = stats.totalViews === 1 ? "k view" : "k views";
    });
    
    document.dispatchEvent(new CustomEvent("daybook:stats-loaded"));
  });

  return promise;
}

export function initSiteUptime(root: Document | HTMLElement = document) {
  const uptimeEls = root.querySelectorAll("[data-site-uptime]");
  uptimeEls.forEach(el => {
    const startedAt = el.getAttribute("data-started-at");
    if (!startedAt) return;
    
    const startTime = new Date(startedAt).getTime();
    const now = new Date().getTime();
    if (isNaN(startTime) || startTime > now) {
      el.textContent = "--";
      return;
    }

    const diffDays = Math.floor((now - startTime) / (1000 * 60 * 60 * 24));
    el.textContent = `${diffDays} 天`;
  });
}
