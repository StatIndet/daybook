import { updateNumber } from "./number-flip";
type LikeState = { path: string; count: number; liked: boolean };

function text(key: string): string {
  const language = document.documentElement.lang.toLowerCase().startsWith('en') ? 'en_US' : 'zh_CN';
  const dictionary = JSON.parse(document.getElementById('daybook-ui-translations')?.textContent || '{}');
  return dictionary[language]?.[key] || key;
}

function likeButtons(path?: string): HTMLButtonElement[] {
  return [...document.querySelectorAll<HTMLButtonElement>('[data-like-path]')]
    .filter(button => !path || button.dataset.likePath === path);
}

function paint(state: LikeState): void {
  for (const button of likeButtons(state.path)) {
    button.dataset.likeReady = 'true';
    button.setAttribute('aria-pressed', String(state.liked));
    updateNumber(button.querySelector('[data-like-count]')!, state.count.toLocaleString());
    button.dataset.uiAria = state.liked ? 'likes.unlike' : 'likes.like';
    button.dataset.uiTooltip = button.dataset.uiAria;
    button.setAttribute('aria-label', text(button.dataset.uiAria));
    button.dataset.tooltip = text(button.dataset.uiAria);
  }
}

const feedbackTimers = new WeakMap<HTMLButtonElement, ReturnType<typeof setTimeout>>();

function clearFeedback(button: HTMLButtonElement): void {
  clearTimeout(feedbackTimers.get(button));
  feedbackTimers.delete(button);
  delete button.dataset.likeFeedback;
  button.dataset.uiAria = button.getAttribute('aria-pressed') === 'true' ? 'likes.unlike' : 'likes.like';
  button.setAttribute('aria-label', text(button.dataset.uiAria));
}

function feedback(path: string, result: 'success' | 'error'): void {
  for (const button of likeButtons(path)) {
    clearFeedback(button);
    // Restart feedback even when another response arrives during the animation.
    const icon = button.querySelector<HTMLElement>('.material-symbol');
    if (icon) void icon.offsetWidth;
    button.dataset.likeFeedback = result;
    if (result === 'error') {
      // Keep the failure available to assistive technology without adding text
      // to the metadata row or changing the button's confirmed liked state.
      button.dataset.uiAria = 'likes.failed';
      button.setAttribute('aria-label', text('likes.failed'));
    }
    feedbackTimers.set(button, setTimeout(() => clearFeedback(button), 700));
  }
}

async function requestLikes(paths: string[], desired?: boolean): Promise<LikeState[]> {
  const query = new URLSearchParams();
  for (const path of paths) query.append('path', path);
  const response = await fetch(desired === undefined ? `/api/likes?${query}` : '/api/likes', {
    method: desired === undefined ? 'GET' : 'PUT',
    credentials: 'same-origin', cache: 'no-store', signal: AbortSignal.timeout(12000),
    ...(desired === undefined ? {} : {
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: paths[0], liked: desired }),
    }),
  });
  if (!response.ok) throw new Error('Likes unavailable');
  const data = await response.json();
  if (!Array.isArray(data.items) || data.items.length !== paths.length || data.items.some((item: LikeState) =>
    !paths.includes(item.path) || typeof item.liked !== 'boolean' || !Number.isSafeInteger(item.count) || item.count < 0)) {
    throw new Error('Invalid likes response');
  }
  return data.items;
}

// Serialize requests so a first visit establishes its Cookie before another
// batch or click. Mutation requests finish even when SPA navigation replaces UI.
let queue: Promise<unknown> = Promise.resolve();
function enqueue(work: () => Promise<void>): void {
  queue = queue.then(work).catch(() => {});
}
const pending = new Set<string>();

function busy(path: string, value: boolean): void {
  for (const button of likeButtons(path)) {
    button.disabled = value;
    button.setAttribute('aria-busy', String(value));
  }
}

export function initLikes(visitorReady: Promise<unknown> | null): void {
  const buttons = likeButtons();
  for (const button of buttons) {
    try { button.dataset.likePath = decodeURI(new URL(button.dataset.likePath!, location.origin).pathname).replace(/\/+$/, '') + '/'; } catch {}
  }
  if (!buttons.length || document.body.dataset.statsEnabled !== 'true') return;
  const paths = [...new Set(buttons.map(button => button.dataset.likePath!))];
  enqueue(async () => {
    // The existing page-view request may be creating the same visitor Cookie.
    await visitorReady?.catch(() => {});
    if (!buttons.some(button => button.isConnected)) return;
    for (let i = 0; i < paths.length; i += 10) {
      const batch = paths.slice(i, i + 10);
      try { (await requestLikes(batch)).forEach(paint); }
      catch {
        for (const path of batch) for (const button of likeButtons(path)) {
          button.dataset.tooltip = text('likes.unavailable');
        }
      } finally {
        batch.forEach(path => busy(path, pending.has(path)));
      }
    }
  });
}

document.addEventListener('click', event => {
  const button = (event.target as Element | null)?.closest<HTMLButtonElement>('[data-like-path]');
  if (!button || button.disabled) return;
  const path = button.dataset.likePath!;
  if (pending.has(path)) return;
  pending.add(path);
  likeButtons(path).forEach(clearFeedback);
  busy(path, true);
  enqueue(async () => {
    try {
      let liked = button.getAttribute('aria-pressed') === 'true';
      if (button.dataset.likeReady !== 'true') {
        const [state] = await requestLikes([path]);
        if (!state) throw new Error("Missing like state");
        paint(state);
        liked = state.liked;
      }
      const desired = !liked;
      (await requestLikes([path], desired)).forEach(paint);
      feedback(path, 'success');
    } catch {
      feedback(path, 'error');
    } finally {
      pending.delete(path);
      busy(path, false);
    }
  });
});

function setupRSS(): void {
  const dialog = document.querySelector<HTMLDialogElement>('#rss-dialog');
  if (!dialog || dialog.dataset.bound) return;
  dialog.dataset.bound = 'true';
  const address = dialog.querySelector<HTMLInputElement>('[data-rss-address]')!;
  const open = dialog.querySelector<HTMLAnchorElement>('[data-rss-feed]')!;
  const status = dialog.querySelector<HTMLElement>('[role="status"]')!;
  document.addEventListener('click', event => {
    const link = (event.target as Element | null)?.closest<HTMLAnchorElement>('[data-rss-open]');
    if (!link || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    address.value = link.href;
    open.href = link.href;
    status.textContent = '';
    if (!dialog.open) dialog.showModal();
  }, true);
  dialog.querySelector('[data-rss-copy]')!.addEventListener('click', async () => {
    const value = address.value;
    try {
      await navigator.clipboard.writeText(value);
      if (dialog.open && address.value === value) status.textContent = text('action.copied');
    } catch {
      address.focus();
      address.select();
      status.textContent = text('rss.copy_fallback');
    }
  });
  dialog.addEventListener('keydown', event => { if (event.key === 'Escape') event.stopPropagation(); });
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const rect = dialog.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
  });
  document.addEventListener('daybook:before-swap', () => dialog.close());
  document.addEventListener('daybook:lang-change', () => { status.textContent = ''; });
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', setupRSS, { once: true });
else setupRSS();
