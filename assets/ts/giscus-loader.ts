// A lifecycle-managed adapter for giscus's official widget protocol. Keeping the
// iframe here avoids client.js installing a new permanent listener on every SPA
// visit. Protocol: https://github.com/giscus/giscus/blob/main/ADVANCED-USAGE.md
const GISCUS_ORIGIN = 'https://giscus.app';
const SESSION_KEY = 'giscus-session';

type Appearance = { theme: string; lang: 'en' | 'zh-CN' };
type GiscusMessage = { resizeHeight?: unknown; signOut?: unknown; error?: unknown; discussion?: unknown };

function clearSavedSession(): void {
  try { localStorage.removeItem(SESSION_KEY); } catch {}
}

function acceptSession(): string {
  const url = new URL(location.href);
  const callbackSession = url.searchParams.get('giscus');
  let session = callbackSession || '';
  if (session) {
    try { localStorage.setItem(SESSION_KEY, JSON.stringify(session)); } catch {}
  } else {
    try {
      const saved = localStorage.getItem(SESSION_KEY);
      if (saved) {
        const parsed: unknown = JSON.parse(saved);
        if (typeof parsed === 'string') session = parsed;
        else clearSavedSession();
      }
    } catch { clearSavedSession(); }
  }
  if (url.searchParams.has('giscus')) {
    url.searchParams.delete('giscus');
    // Preserve the router's state and the reader's existing fragment.
    if (window.daybookReplaceURL) window.daybookReplaceURL(url.href);
    else history.replaceState(history.state, '', url.href);
  }
  return session;
}

let session = acceptSession();
let current: GiscusController | null = null;
let swapping = false;

function commentsDisabled(): boolean {
  return document.documentElement.dataset.commentsDisabled === 'true';
}

class GiscusController {
  private readonly lifetime = new AbortController();
  private intersection: IntersectionObserver | null = null;
  private readonly attributes: MutationObserver;
  private frame: HTMLIFrameElement | null = null;
  private loaded = false;
  private acknowledged = false;
  private sentAppearance = '';

  constructor(readonly container: HTMLElement) {
    this.attributes = new MutationObserver(() => {
      if (commentsDisabled()) setupGiscus();
      else this.syncAppearance();
    });
    this.attributes.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme', 'data-palette', 'lang', 'data-comments-disabled'],
    });

    if ('IntersectionObserver' in window) {
      this.intersection = new IntersectionObserver(entries => {
        if (entries.some(entry => entry.isIntersecting)) this.mount();
      });
      this.intersection.observe(container);
    } else {
      this.mount();
    }
  }

  private active(): boolean {
    return !this.lifetime.signal.aborted && !swapping &&
      !commentsDisabled() && this.container.isConnected &&
      document.getElementById('giscus') === this.container;
  }

  private appearance(): Appearance {
    const root = document.documentElement;
    const dark = root.dataset.theme === 'dark';
    const palette = root.dataset.palette === 'warm' ? 'Warm' : 'Default';
    const customTheme = this.container.dataset[`theme${palette}${dark ? 'Dark' : 'Light'}`];
    return {
      theme: customTheme ? new URL(customTheme, location.href).href : (dark ? 'dark' : 'light'),
      lang: root.lang.toLowerCase().startsWith('en') ? 'en' : 'zh-CN',
    };
  }

  private source(): string {
    const data = this.container.dataset;
    const { theme, lang } = this.appearance();
    const page = new URL(location.href);
    page.searchParams.delete('giscus');
    page.hash = '';
    const params = new URLSearchParams({
      origin: `${page.href}#${this.container.id}`,
      session,
      repo: data.repo || '',
      repoId: data.repoId || '',
      category: data.category || '',
      categoryId: data.categoryId || '',
      // The generator supplies a stable Note.CommentPath shared by UI languages.
      term: data.path || '',
      strict: '1',
      reactionsEnabled: '0',
      emitMetadata: data.commentCounts === 'true' ? '1' : '0',
      inputPosition: 'top',
      theme,
      description: document.querySelector<HTMLMetaElement>('meta[name="description"]')?.content || '',
      backLink: page.href,
    });
    return `${GISCUS_ORIGIN}/${lang}/widget?${params}`;
  }

  private mount(): void {
    if (!this.active() || this.frame) return;
    this.intersection?.disconnect();
    this.intersection = null;
    const frame = document.createElement('iframe');
    this.frame = frame;
    frame.className = 'giscus-frame giscus-frame--loading';
    frame.title = this.appearance().lang === 'en' ? 'Comments' : '评论';
    frame.setAttribute('scrolling', 'no');
    // Chromium needs delegation to fetch the preview's custom CSS and fonts
    // from inside a public-origin iframe. Production pages need no delegation.
    const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
    frame.setAttribute('allow', loopback
      ? 'clipboard-write; local-network-access; loopback-network'
      : 'clipboard-write');
    frame.addEventListener('load', () => {
      if (!this.active()) return;
      frame.classList.remove('giscus-frame--loading');
      this.loaded = true;
      // Replay changes made while the widget was still loading.
      this.syncAppearance(true);
    }, { signal: this.lifetime.signal });
    window.addEventListener('message', this.handleMessage, { signal: this.lifetime.signal });
    frame.src = this.source();
    this.container.appendChild(frame);
  }

  syncAppearance(force = false): void {
    if (!this.active() || !this.frame) return;
    const appearance = this.appearance();
    this.frame.title = appearance.lang === 'en' ? 'Comments' : '评论';
    const key = JSON.stringify(appearance);
    if (!this.loaded || (!force && key === this.sentAppearance)) return;
    this.frame.contentWindow?.postMessage({ giscus: { setConfig: appearance } }, GISCUS_ORIGIN);
    this.sentAppearance = key;
  }

  private signOut(): void {
    if (!session || !this.frame) return;
    session = '';
    clearSavedSession();
    this.loaded = false;
    this.acknowledged = false;
    this.sentAppearance = '';
    // Authentication is established by the widget URL, so logout needs a reload.
    this.frame.src = this.source();
  }

  private handleMessage = (event: MessageEvent): void => {
    if (!this.active() || event.origin !== GISCUS_ORIGIN ||
      event.source !== this.frame?.contentWindow) return;
    const data: unknown = event.data;
    if (!data || typeof data !== 'object' || !('giscus' in data) ||
      !data.giscus || typeof data.giscus !== 'object') return;
    const message = data.giscus as GiscusMessage;
    if (typeof message.resizeHeight === 'number' && Number.isFinite(message.resizeHeight) &&
      message.resizeHeight > 0) {
      this.frame!.style.height = `${Math.ceil(message.resizeHeight)}px`;
      // The widget's first resize is emitted after it mounts. Replay once here
      // too, because its message receiver can become ready after iframe load.
      if (!this.acknowledged) {
        this.acknowledged = true;
        this.loaded = true;
        this.syncAppearance(true);
      }
    }
    if (message.discussion && typeof message.discussion === 'object') {
      const discussion = message.discussion as { totalCommentCount?: unknown; totalReplyCount?: unknown };
      const { totalCommentCount: count, totalReplyCount: replies } = discussion;
      if (typeof count === 'number' && Number.isSafeInteger(count) && count >= 0 &&
          typeof replies === 'number' && Number.isSafeInteger(replies) && replies >= 0) {
        document.dispatchEvent(new CustomEvent('daybook:comments-loaded', {
          detail: { path: this.container.dataset.path, count: count + replies },
        }));
      }
    }
    if (message.signOut === true) {
      this.signOut();
      return;
    }
    if (typeof message.error !== 'string') return;
    if (/Bad credentials|Invalid state value|State has expired/.test(message.error) && session) {
      this.signOut();
      console.warn('[giscus] Session has expired and was cleared.');
    } else if (message.error.includes('Discussion not found')) {
      console.info('[giscus] A discussion will be created when the first comment is submitted.');
    } else {
      console.error('[giscus]', message.error);
    }
  };

  destroy(): void {
    this.lifetime.abort();
    this.intersection?.disconnect();
    this.attributes.disconnect();
    this.frame?.remove();
    this.frame = null;
  }
}

export function setupGiscus(): void {
  const container = document.getElementById('giscus');
  const disabled = commentsDisabled();
  if (container) container.hidden = disabled;
  if (swapping || !container || disabled) {
    current?.destroy();
    current = null;
    return;
  }
  if (current?.container === container) {
    current.syncAppearance();
    return;
  }
  current?.destroy();
  current = new GiscusController(container);
}

document.addEventListener('daybook:before-swap', () => {
  swapping = true;
  current?.destroy();
  current = null;
});
document.addEventListener('daybook:page-load', () => {
  swapping = false;
  if (new URL(location.href).searchParams.has('giscus')) session = acceptSession();
  setupGiscus();
});
document.addEventListener('daybook:settings-change', setupGiscus);
document.addEventListener('daybook:lang-change', () => current?.syncAppearance());
setupGiscus();
