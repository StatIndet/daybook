interface Env {
  DB: D1Database;
  STATS_SALT: string;
  ASSETS: { fetch: (req: Request | string) => Promise<Response> };
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  try {
    const body = await request.json() as { path?: string };
    if (!body.path) {
      return new Response("Bad Request", { status: 400 });
    }

    const normalizedPath = normalizePath(body.path);
    if (!await isWhitelisted(env, request, normalizedPath)) {
      return new Response("Forbidden", { status: 403 });
    }

    if (!env.STATS_SALT) {
      return new Response("Server Config Error", { status: 500 });
    }

    // Basic origin check
    const origin = request.headers.get("origin");
    if (origin) {
      const u = new URL(request.url);
      if (origin !== u.origin) {
        return new Response("Forbidden Origin", { status: 403 });
      }
    }

    // Bot check
    const ua = request.headers.get("user-agent")?.toLowerCase() || "";
    if (ua.includes("bot") || ua.includes("crawler") || ua.includes("spider") || ua.includes("headless")) {
      return new Response("OK", { status: 200 }); // fake success for bots
    }

    // Visitor cookie logic
    let visitorToken = "";
    const cookieHeader = request.headers.get("Cookie") || "";
    const cookies = cookieHeader.split(";").map(c => c.trim());
    for (const c of cookies) {
      if (c.startsWith("daybook_visitor=")) {
        visitorToken = c.substring("daybook_visitor=".length);
        break;
      }
    }

    let isNewVisitor = false;
    if (!visitorToken) {
      visitorToken = crypto.randomUUID();
      isNewVisitor = true;
    }

    const visitorHash = await hashVisitorToken(visitorToken, env.STATS_SALT);

    // Prepare D1 batch
    const updatePage = env.DB.prepare(
      `INSERT INTO page_stats (path, views, updated_at) VALUES (?, 1, CURRENT_TIMESTAMP)
       ON CONFLICT(path) DO UPDATE SET views = views + 1, updated_at = CURRENT_TIMESTAMP`
    ).bind(normalizedPath);

    const updateSite = env.DB.prepare(
      `UPDATE site_stats SET value = value + 1, updated_at = CURRENT_TIMESTAMP WHERE key = 'total_views'`
    );

    const updateVisitor = env.DB.prepare(
      `INSERT INTO visitors (visitor_hash, first_seen_at, last_seen_at) VALUES (?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       ON CONFLICT(visitor_hash) DO UPDATE SET last_seen_at = CURRENT_TIMESTAMP`
    ).bind(visitorHash);

    await env.DB.batch([updatePage, updateSite, updateVisitor]);

    // Fetch the new stats to return
    const getPage = env.DB.prepare(`SELECT views FROM page_stats WHERE path = ?`).bind(normalizedPath);
    const getSite = env.DB.prepare(`SELECT value FROM site_stats WHERE key = 'total_views'`);
    const getVisitors = env.DB.prepare(`SELECT count(*) as count FROM visitors`);

    const results = await env.DB.batch([getPage, getSite, getVisitors]);
    const pageViews = (results[0].results?.[0] as any)?.views || 1;
    const totalViews = (results[1].results?.[0] as any)?.value || 1;
    const visitors = (results[2].results?.[0] as any)?.count || 1;

    const res = new Response(JSON.stringify({
      path: normalizedPath,
      pageViews,
      totalViews,
      visitors
    }), {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store"
      }
    });

    if (isNewVisitor) {
      // Set-Cookie
      res.headers.set("Set-Cookie", `daybook_visitor=${visitorToken}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${365 * 24 * 60 * 60}`);
    }

    return res;

  } catch (err) {
    console.error("hit api error", err);
    return new Response("Internal Server Error", { status: 500 });
  }
};

function normalizePath(p: string): string {
  try {
    const url = new URL(p, "http://localhost");
    let pathname = decodeURI(url.pathname);
    pathname = pathname.replace(/\/+/g, '/');
    if (pathname !== '/' && !pathname.endsWith('/')) {
      pathname += '/';
    }
    return pathname;
  } catch {
    let pathname = decodeURI(p.split('?')[0].split('#')[0]);
    pathname = pathname.replace(/\/+/g, '/');
    if (!pathname.startsWith('/')) pathname = '/' + pathname;
    if (pathname !== '/' && !pathname.endsWith('/')) {
      pathname += '/';
    }
    return pathname;
  }
}

let cachedRoutes: string[] | null = null;
let routesCacheTime = 0;

async function isWhitelisted(env: Env, request: Request, p: string): Promise<boolean> {
  if (p === '/') return true;
  if (p === '/notes/') return true;
  if (p === '/archive/') return true;
  if (p === '/graph/') return true;
  if (p === '/about/') return true;
  if (p === '/en/') return true;
  if (p === '/en/notes/') return true;
  if (p === '/en/archive/') return true;
  if (p === '/en/graph/') return true;
  if (p === '/en/about/') return true;
  
  if (Date.now() - routesCacheTime > 60000 || !cachedRoutes) {
    try {
      const url = new URL(request.url);
      const res = await env.ASSETS.fetch(new URL('/routes.json', url.origin));
      if (res.ok) {
        cachedRoutes = await res.json() as string[];
        routesCacheTime = Date.now();
      }
    } catch {
      // fallback
    }
  }

  if (cachedRoutes && cachedRoutes.length > 0) {
    if (cachedRoutes.includes(p)) return true;
    
    // tags
    if (p.startsWith('/tags/') || p.startsWith('/en/tags/')) return true;
    
    return false;
  }

  // Fallback if routes.json fails
  if (p.startsWith('/notes/') && p.length > '/notes/'.length) return true;
  if (p.startsWith('/en/notes/') && p.length > '/en/notes/'.length) return true;
  if (p.startsWith('/tags/') && p.length > '/tags/'.length) return true;
  if (p.startsWith('/en/tags/') && p.length > '/en/tags/'.length) return true;
  
  return false;
}

async function hashVisitorToken(token: string, salt: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(salt),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, enc.encode(token));
  const hashArray = Array.from(new Uint8Array(signature));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}
