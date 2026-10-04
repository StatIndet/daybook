import { updateNumber } from "./number-flip";
// Read-only counts for visible posts. Likes remain independent of giscus.
type CommentCount = { count: number; expires: number };
const comments = new Map<string, CommentCount>();
let lifetime: AbortController | null = null;
let observer: IntersectionObserver | null = null;
const normalize = (path: string) => decodeURI(new URL(path, location.origin).pathname);
const keyFor = (link: HTMLElement) => JSON.stringify([link.dataset.commentRepo, link.dataset.commentCategory, link.dataset.commentPath]);
const validCount = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) >= 0;

async function loadComments(link: HTMLElement, signal: AbortSignal): Promise<void> {
  if (document.documentElement.dataset.commentsDisabled === 'true') return;
  const key = keyFor(link);
  let cached = comments.get(key);
  if (!cached || cached.expires <= Date.now()) {
    // This is giscus's public read endpoint, using the same strict path mapping
    // as the widget. No session, credentials, reactions or write calls are sent.
    const query = new URLSearchParams({
      repo: link.dataset.commentRepo || '', category: link.dataset.commentCategory || '',
      term: link.dataset.commentPath || '', strict: 'true', number: '0', first: '1',
    });
    const response = await fetch(`https://giscus.app/api/discussions?${query}`, {
      credentials: 'omit', signal: AbortSignal.any([signal, AbortSignal.timeout(8000)]),
    });
    const data = await response.json();
    let count;
    if (response.status === 404 && data.error === 'Discussion not found') count = 0;
    else if (response.ok && validCount(data.discussion?.totalCommentCount) && validCount(data.discussion?.totalReplyCount)) {
      count = data.discussion.totalCommentCount + data.discussion.totalReplyCount;
    } else return; // Unknown is displayed as a dash, never a fabricated zero.
    if (signal.aborted) return;
    // Metadata from the live widget may be newer than this in-flight read.
    cached = comments.get(key) !== cached ? comments.get(key) : { count, expires: Date.now() + 60000 };
    if (!cached) cached = { count, expires: Date.now() + 60000 };
    if (comments.size >= 500) comments.clear();
    comments.set(key, cached);
  }
  if (!signal.aborted && link.isConnected) updateNumber(link.querySelector('[data-comment-count]')!, cached.count.toLocaleString());
}

async function loadViews(element: HTMLElement, signal: AbortSignal): Promise<void> {
  const query = new URLSearchParams({ path: element.dataset.path || '' });
  const response = await fetch(`/api/stats?${query}`, { signal: AbortSignal.any([signal, AbortSignal.timeout(8000)]) });
  if (!response.ok) return;
  const data = await response.json();
  if (!signal.aborted && element.isConnected && validCount(data.pageViews) && normalize(data.path) === normalize(element.dataset.path!)) {
    updateNumber(element, data.pageViews.toLocaleString());
  }
}

export function initMemoEngagement(): void {
  lifetime?.abort();
  observer?.disconnect();
  const controller = new AbortController();
  lifetime = controller;
  const tasks: (() => Promise<void>)[] = [];
  let active = 0;
  const drain = () => {
    if (controller.signal.aborted) return;
    while (active < 3 && tasks.length) {
      const task = tasks.shift()!;
      active++;
      void task().catch(() => {}).finally(() => { active--; drain(); });
    }
  };
  const schedule = (post: Element) => {
    const link = post.querySelector<HTMLElement>('[data-comment-path]');
    if (link) tasks.push(() => loadComments(link, controller.signal));
    // Detail views are populated by the existing page-hit response. Reading
    // timeline counts must not record a hit on every visible memo.
    if (post.hasAttribute('data-memo-card')) {
      const views = post.querySelector<HTMLElement>('[data-memo-views]');
      if (views) tasks.push(() => loadViews(views, controller.signal));
    }
    drain();
  };
  observer = new IntersectionObserver(entries => {
    for (const entry of entries) if (entry.isIntersecting) { observer?.unobserve(entry.target); schedule(entry.target); }
  }, { rootMargin: '160px' });
  document.querySelectorAll('.memo-card').forEach(post => observer!.observe(post));
}

document.addEventListener('daybook:before-swap', () => { lifetime?.abort(); observer?.disconnect(); });
document.addEventListener('daybook:settings-change', initMemoEngagement);
document.addEventListener('daybook:comments-loaded', event => {
  const { path, count } = (event as CustomEvent<{ path: string; count: number }>).detail;
  if (!validCount(count)) return;
  for (const link of document.querySelectorAll<HTMLElement>('[data-comment-path]')) {
    if (link.dataset.commentPath !== path) continue;
    comments.set(keyFor(link), { count, expires: Date.now() + 60000 });
    updateNumber(link.querySelector('[data-comment-count]')!, count.toLocaleString());
  }
});

// On the detail page, jump to comments without creating a native hash history
// entry outside the SPA router (the same convention as the mobile TOC).
document.addEventListener('click', event => {
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  const link = (event.target as Element).closest<HTMLAnchorElement>('.memo-comment-action');
  if (!link) return;
  const url = new URL(link.href);
  if (url.pathname !== location.pathname || url.search !== location.search) return;
  const section = document.getElementById('comments');
  if (!section) return;
  event.preventDefault();
  if (window.daybookReplaceURL) window.daybookReplaceURL(url.href);
  else history.replaceState(history.state, '', url.href);
  section.scrollIntoView({ behavior: 'instant' });
  section.focus({ preventScroll: true });
});
