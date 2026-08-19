interface Env {
  DB: D1Database;
  ASSETS: { fetch: (req: Request | string) => Promise<Response> };
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const url = new URL(request.url);
  const rawPath = url.searchParams.get("path");
  if (!rawPath) {
    return new Response("Bad Request", { status: 400 });
  }

  const normalizedPath = normalizePath(rawPath);
  if (!await isWhitelisted(env, request, normalizedPath)) {
    return new Response("Forbidden", { status: 403 });
  }

  try {
    const getPage = env.DB.prepare(`SELECT views FROM page_stats WHERE path = ?`).bind(normalizedPath);
    const getSite = env.DB.prepare(`SELECT value FROM site_stats WHERE key = 'total_views'`);
    const getVisitors = env.DB.prepare(`SELECT count(*) as count FROM visitors`);

    const results = await env.DB.batch([getPage, getSite, getVisitors]);
    const pageViews = (results[0].results?.[0] as any)?.views || 0;
    const totalViews = (results[1].results?.[0] as any)?.value || 0;
    const visitors = (results[2].results?.[0] as any)?.count || 0;

    return new Response(JSON.stringify({
      path: normalizedPath,
      pageViews,
      totalViews,
      visitors
    }), {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=60"
      }
    });
  } catch (err) {
    console.error("stats api error", err);
    return new Response("Internal Server Error", { status: 500 });
  }
};

function normalizePath(p: string): string {
  let pathname = decodeURI(p.split('?')[0].split('#')[0]);
  pathname = pathname.replace(/\/+/g, '/');
  if (!pathname.startsWith('/')) pathname = '/' + pathname;
  if (pathname !== '/' && !pathname.endsWith('/')) {
    pathname += '/';
  }
  return pathname;
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
