interface Env {
  DB: D1Database;
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const url = new URL(request.url);
  const rawPath = url.searchParams.get("path");
  if (!rawPath) {
    return new Response("Bad Request", { status: 400 });
  }

  const normalizedPath = normalizePath(rawPath);
  if (!isWhitelisted(normalizedPath)) {
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
  let pathname = p.split('?')[0].split('#')[0];
  pathname = pathname.replace(/\/+/g, '/');
  if (!pathname.startsWith('/')) pathname = '/' + pathname;
  if (pathname !== '/' && !pathname.endsWith('/')) {
    pathname += '/';
  }
  return pathname;
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
