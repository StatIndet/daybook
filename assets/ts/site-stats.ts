interface StatsResponse {
  path: string;
  pageViews: number;
  totalViews: number;
  visitors: number;
}

function getVisitorId(): string {
  let vid = localStorage.getItem("daybook:visitor-id");
  if (!vid) {
    vid = crypto.randomUUID();
    localStorage.setItem("daybook:visitor-id", vid);
  }
  return vid;
}

function getTodayString(): string {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function normalizePath(p: string): string {
  try {
    const url = new URL(p, window.location.origin);
    let pathname = url.pathname;
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

async function hitPath(path: string): Promise<StatsResponse | null> {
  const visitorId = getVisitorId();
  const normalized = normalizePath(path);
  const dateStr = getTodayString();
  const dedupeKey = `daybook:hit:${normalized}:${dateStr}`;

  if (localStorage.getItem(dedupeKey)) {
    // Already hit today, just GET
    try {
      const res = await fetch(`/api/stats?path=${encodeURIComponent(normalized)}`);
      if (res.ok) {
        return (await res.json()) as StatsResponse;
      }
    } catch (e) {
      console.error("[Site Stats] Fetch stats failed", e);
    }
    return null;
  }

  // Need to POST hit
  try {
    const res = await fetch(`/api/hit`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ path: normalized, visitorId })
    });
    if (res.ok) {
      // Only write to localStorage after success
      localStorage.setItem(dedupeKey, "1");
      return (await res.json()) as StatsResponse;
    }
  } catch (e) {
    console.error("[Site Stats] Post hit failed", e);
  }
  return null;
}

export function initSiteStats(root: Document | HTMLElement = document) {
  hitPath(window.location.pathname).then(stats => {
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
  });
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
