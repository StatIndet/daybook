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

let ws: WebSocket | null = null;
let isConnecting = false;
let reconnectTimer: any = null;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 10;
let currentPresencePath = "";
let isStatsEnabled = true;

function updatePresenceDOM(path: string, pageViewers: number, siteViewers: number) {
  const siteEls = document.querySelectorAll("[data-site-viewers]");
  siteEls.forEach(el => {
    if (!el.classList.contains("anim-done") && el.classList.contains("archive-stat-num")) {
      el.setAttribute("data-target", siteViewers.toString());
      document.dispatchEvent(new CustomEvent("daybook:stats-loaded"));
    } else {
      el.textContent = siteViewers.toString();
    }
  });

  const pageEls = document.querySelectorAll("[data-page-viewers]");
  pageEls.forEach(el => {
    const pathAttr = el.getAttribute("data-path");
    if (pathAttr && normalizePath(pathAttr) === path) {
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
  currentPresencePath = normalizePath(window.location.pathname);

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
    } catch (e) {}
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
  const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 30000);
  reconnectTimer = setTimeout(() => {
    connectWebSocket();
  }, delay);
}

export function initSitePresence() {
  const statsEnabledAttr = document.body.dataset.statsEnabled;
  isStatsEnabled = statsEnabledAttr === "true";

  if (!isStatsEnabled) {
    if (ws) {
      ws.close();
      ws = null;
    }
    return;
  }

  const newPath = normalizePath(window.location.pathname);

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
