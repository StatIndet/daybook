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
  hitPath(window.location.pathname).then((stats) => {
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
  });
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
export {
  initSiteStats,
  initSiteUptime
};
//# sourceMappingURL=site-stats.js.map
