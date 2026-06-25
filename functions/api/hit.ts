interface Env {
  DB: D1Database;
  STATS_SALT: string;
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  try {
    const body = await request.json() as { path?: string, visitorId?: string };
    if (!body.path || !body.visitorId) {
      return new Response("Bad Request", { status: 400 });
    }

    const normalizedPath = normalizePath(body.path);
    if (!isWhitelisted(normalizedPath)) {
      return new Response("Forbidden", { status: 403 });
    }

    if (!env.STATS_SALT) {
      return new Response("Server Config Error", { status: 500 });
    }

    const visitorHash = await hashVisitorId(body.visitorId, env.STATS_SALT);

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

    return new Response(JSON.stringify({
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

  } catch (err) {
    console.error("hit api error", err);
    return new Response("Internal Server Error", { status: 500 });
  }
};

function normalizePath(p: string): string {
  try {
    const url = new URL(p, "http://localhost");
    let pathname = url.pathname;
    pathname = pathname.replace(/\/+/g, '/');
    if (pathname !== '/' && !pathname.endsWith('/')) {
      pathname += '/';
    }
    return pathname;
  } catch {
    let pathname = p.split('?')[0].split('#')[0];
    pathname = pathname.replace(/\/+/g, '/');
    if (!pathname.startsWith('/')) pathname = '/' + pathname;
    if (pathname !== '/' && !pathname.endsWith('/')) {
      pathname += '/';
    }
    return pathname;
  }
}

function isWhitelisted(p: string): boolean {
  if (p === '/') return true;
  if (p === '/notes/') return true;
  if (p === '/archive/') return true;
  if (p === '/graph/') return true;
  if (p === '/about/') return true;
  if (p.startsWith('/notes/') && p.length > '/notes/'.length) return true;
  return false;
}

async function hashVisitorId(id: string, salt: string): Promise<string> {
  const msgUint8 = new TextEncoder().encode(id + salt);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}
