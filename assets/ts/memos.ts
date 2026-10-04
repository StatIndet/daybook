(() => {
  interface Memo {
    element: HTMLElement;
    date: string;
    search: string;
    tags: string[];
  }
  interface Filters { q: string; tag: string[]; date: string[]; month: string; }
  let page: HTMLElement | null = null;
  let memos: Memo[] = [];
  let filters: Filters = { q: '', tag: [], date: [], month: '' };
  let calendarMonth = '';
  let inputTimer = 0;
  const english = () => document.documentElement.lang.startsWith('en');
  const storageKey = () => `daybook:memos:${location.pathname}`;
  const monthOf = (date: string) => date.slice(0, 7);
  const monthDate = (month: string) => new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1, 1);
  const monthString = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  const normalize = (text: string) => text.toLocaleLowerCase();

  function readFilters(): Filters {
    const params = new URLSearchParams(location.search);
    return { q: params.get('q') || '', tag: [...new Set(params.getAll('tag').filter(Boolean))], date: [...new Set(params.getAll('date').filter(Boolean))], month: params.get('month') || '' };
  }
  function saveFilters() {
    const url = new URL(location.href);
    Object.entries(filters).forEach(([key, value]) => {
      url.searchParams.delete(key);
      (Array.isArray(value) ? value : [value]).filter(Boolean).forEach(item => url.searchParams.append(key, item));
    });
    if (window.daybookReplaceURL) window.daybookReplaceURL(url.href);
    else history.replaceState(history.state, '', url);
    try { sessionStorage.setItem(storageKey(), JSON.stringify({ ...filters, calendarMonth })); } catch { /* Storage may be unavailable. */ }
  }
  function includesQuery(memo: Memo) {
    return !filters.q || memo.search.includes(normalize(filters.q.trim()));
  }
  function matches(memo: Memo, includeDate = true) {
    return includesQuery(memo) && (!filters.tag.length || filters.tag.some(tag => memo.tags.includes(tag))) &&
      (!includeDate || ((!filters.date.length || filters.date.includes(memo.date)) && (!filters.month || monthOf(memo.date) === filters.month)));
  }

  // Ranges highlight text in place, preserving embeds, links, and Markdown DOM.
  function highlightMatches() {
    document.querySelectorAll('mark.memo-search-highlight').forEach(mark => {
      const parent = mark.parentNode;
      mark.replaceWith(document.createTextNode(mark.textContent || ''));
      parent?.normalize();
    });
    const css = CSS as unknown as { highlights?: Map<string, unknown> };
    css.highlights?.delete('memo-search');
    const query = normalize(filters.q.trim());
    if (!query) return;
    const ranges: Range[] = [];
    const fallbacks: { node: Text; start: number; end: number }[] = [];
    memos.filter(memo => !memo.element.hidden).forEach(memo => {
      const walker = document.createTreeWalker(memo.element, NodeFilter.SHOW_TEXT, {
        acceptNode(node) {
          const parent = node.parentElement;
          return parent && !parent.closest('script, style, textarea, [hidden], [data-memo-overflow], .katex, .mermaid-block, svg')
            ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
        }
      });
      const nodes: { node: Text; offset: number }[] = [];
      let text = '';
      while (walker.nextNode()) {
        const node = walker.currentNode as Text;
        nodes.push({ node, offset: text.length });
        text += node.data;
      }
      const lowerText = normalize(text);
      let start = lowerText.indexOf(query);
      while (start !== -1) {
        const end = start + query.length;
        const first = nodes.find(item => item.offset + item.node.length > start);
        const last = nodes.find(item => item.offset + item.node.length >= end);
        if (first && last) {
          const range = document.createRange();
          range.setStart(first.node, start - first.offset);
          range.setEnd(last.node, end - last.offset);
          ranges.push(range);
          nodes.filter(item => item.offset < end && item.offset + item.node.length > start).forEach(item => {
            fallbacks.push({ node: item.node, start: Math.max(0, start - item.offset), end: Math.min(item.node.length, end - item.offset) });
          });
        }
        start = lowerText.indexOf(query, end);
      }
    });
    const HighlightConstructor = (window as unknown as { Highlight?: new (...ranges: Range[]) => unknown }).Highlight;
    if (css.highlights && HighlightConstructor) css.highlights.set('memo-search', new HighlightConstructor(...ranges));
    else fallbacks.reverse().forEach(({ node, start, end }) => {
      const text = node.splitText(start);
      text.splitText(end - start);
      const mark = document.createElement('mark');
      mark.className = 'memo-search-highlight';
      text.replaceWith(mark);
      mark.append(text);
    });
  }

  function numberText(element: HTMLElement, value: string) {
    element.replaceChildren(...value.split(/(\d+)/).filter(Boolean).map(part => {
      if (!/^\d+$/.test(part)) return document.createTextNode(part);
      const span = document.createElement('span'); span.className = 'memo-number'; span.textContent = part; return span;
    }));
  }

  function renderCalendar() {
    if (!calendarMonth) return;
    const date = monthDate(calendarMonth);
    const counts = new Map<string, number>();
    memos.filter(memo => matches(memo, false)).forEach(memo => counts.set(memo.date, (counts.get(memo.date) || 0) + 1));
    const allMonths = memos.map(memo => monthOf(memo.date)).filter(Boolean).sort();
    const firstMonth = allMonths[0] || calendarMonth;
    const lastMonth = allMonths[allMonths.length - 1] || calendarMonth;
    document.querySelectorAll<HTMLElement>('[data-memos-filters]').forEach(panel => {
      const label = panel.querySelector<HTMLElement>('[data-memos-month-label]');
      if (label) {
        label.textContent = date.toLocaleDateString(english() ? 'en-US' : 'zh-CN', { year: 'numeric', month: 'long' });
        label.setAttribute('aria-pressed', String(filters.month === calendarMonth));
      }
      panel.querySelectorAll<HTMLButtonElement>('[data-memos-month]').forEach(button => {
        button.disabled = Number(button.dataset.memosMonth) < 0 ? calendarMonth <= firstMonth : calendarMonth >= lastMonth;
      });
      const grid = panel.querySelector<HTMLElement>('[data-memos-calendar]');
      if (!grid) return;
      grid.replaceChildren();
      const weekdays = english() ? ['S', 'M', 'T', 'W', 'T', 'F', 'S'] : ['日', '一', '二', '三', '四', '五', '六'];
      weekdays.forEach(day => { const el = document.createElement('span'); el.className = 'memos-weekday'; el.textContent = day; grid.append(el); });
      for (let i = 0; i < date.getDay(); i++) { const el = document.createElement('span'); el.setAttribute('aria-hidden', 'true'); grid.append(el); }
      const days = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
      for (let day = 1; day <= days; day++) {
        const key = `${calendarMonth}-${String(day).padStart(2, '0')}`;
        const count = counts.get(key) || 0;
        const el = document.createElement(count ? 'button' : 'span');
        el.textContent = String(day);
        if (el instanceof HTMLButtonElement) {
          el.type = 'button';
          el.dataset.memosDate = key;
          el.setAttribute('aria-pressed', String(filters.date.includes(key)));
          el.setAttribute('aria-label', english() ? `${key}, ${count} memos` : `${key}，${count} 条随记`);
          el.title = el.getAttribute('aria-label') || '';
        }
        grid.append(el);
      }
    });
  }
  function renderTags() {
    const counts = new Map<string, number>();
    memos.forEach(memo => memo.tags.forEach(tag => counts.set(tag, (counts.get(tag) || 0) + 1)));
    document.querySelectorAll<HTMLElement>('[data-memos-tags]').forEach(container => {
      container.replaceChildren();
      if (!counts.size) { container.textContent = english() ? 'No tags' : '暂无标签'; return; }
      [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).forEach(([tag, count]) => {
        const button = document.createElement('button');
        button.type = 'button'; button.dataset.memoTag = tag; button.setAttribute('aria-pressed', String(filters.tag.includes(tag)));
        const label = document.createElement('span'); label.textContent = `#${tag}`;
        const number = document.createElement('small'); number.textContent = String(count);
        button.append(label, number); container.append(button);
      });
    });
  }
  function applyFilters(persist = true) {
    if (!page) return;
    const focused = document.activeElement as HTMLElement | null;
    const focusPanel = focused?.closest<HTMLElement>('[data-memos-filters]');
    const focusAttribute = focused?.hasAttribute('data-memo-tag') ? 'data-memo-tag' : focused?.hasAttribute('data-memos-date') ? 'data-memos-date' : '';
    const focusValue = focusAttribute ? focused?.getAttribute(focusAttribute) : null;
    let visible = 0;
    memos.forEach(memo => { memo.element.hidden = !matches(memo); if (!memo.element.hidden) visible++; });
    const count = page.querySelector<HTMLElement>('[data-memos-count]');
    if (count) numberText(count, english() ? `${visible} memos` : `${visible} 条`);
    const empty = page.querySelector<HTMLElement>('[data-memos-empty]');
    if (empty) empty.hidden = visible > 0 || memos.length === 0;
    const active = page.querySelector<HTMLElement>('[data-memos-active]');
    if (active) active.hidden = !(filters.q || filters.tag.length || filters.date.length || filters.month);
    const label = page.querySelector<HTMLElement>('[data-memos-active-label]');
    if (label) label.textContent = [filters.q ? `“${filters.q}”` : '', ...filters.tag.map(tag => `#${tag}`), ...filters.date, filters.month].filter(Boolean).join(' / ');
    page.querySelectorAll<HTMLInputElement>('[data-memos-search]').forEach(input => { if (input.value !== filters.q) input.value = filters.q; });
    document.querySelectorAll<HTMLButtonElement>('.memo-card [data-memo-tag]').forEach(button => button.setAttribute('aria-pressed', String(filters.tag.includes(button.dataset.memoTag || ''))));
    page.querySelectorAll<HTMLElement>('[data-memo-more-count]').forEach(link => {
      const count = link.dataset.memoMoreCount;
      const label = english() ? `View ${count} more photos` : `查看其余 ${count} 张图片`;
      if (link.textContent !== label) numberText(link, label);
    });
    renderCalendar(); renderTags(); highlightMatches();
    if (focusPanel && focusAttribute && focusValue) focusPanel.querySelector<HTMLElement>(`[${focusAttribute}="${CSS.escape(focusValue)}"]`)?.focus({ preventScroll: true });
    if (persist) saveFilters();
  }

  function prepareImages(memo: HTMLElement) {
    const content = memo.querySelector<HTMLElement>('.memo-content');
    if (!content || content.dataset.memoImagesReady) return;
    content.dataset.memoImagesReady = 'true';
    const images = Array.from(content.querySelectorAll<HTMLImageElement>('img')).filter(image => !image.closest('.embed-card, .music-custom-player, .katex'));
    images.slice(4).forEach(image => {
      const wrapper = image.closest<HTMLElement>('figure, picture');
      const parent = image.parentElement;
      const target = wrapper && wrapper.querySelectorAll('img').length === 1 ? wrapper : parent?.tagName === 'P' && parent.querySelectorAll('img').length === 1 && !parent.textContent?.trim() ? parent : image;
      target.setAttribute('data-memo-overflow', '');
      target.setAttribute('hidden', '');
    });
    content.querySelectorAll<HTMLElement>('.md-gallery').forEach(gallery => gallery.classList.add('memo-photo-grid'));
    content.querySelectorAll<HTMLElement>('p').forEach(paragraph => {
      if (!paragraph.textContent?.trim() && paragraph.querySelectorAll('img').length > 1) paragraph.classList.add('memo-photo-grid');
    });
    // Group only adjacent image-only paragraphs/figures; leave prose in its authored order.
    let group: HTMLElement[] = [];
    const flush = () => {
      if (group.length > 1) { const grid = document.createElement('div'); grid.className = 'memo-photo-grid'; group[0]?.before(grid); group.forEach(item => grid.append(item)); }
      group = [];
    };
    Array.from(content.children).forEach(child => {
      if (child instanceof HTMLElement && child.matches('p, figure') && child.querySelectorAll('img').length === 1 && (child.tagName === 'FIGURE' || !child.textContent?.trim())) group.push(child);
      else flush();
    });
    flush();
    if (images.length > 4) {
      const link = document.createElement('a'); link.className = 'memo-more-photos'; link.href = memo.dataset.memoUrl || '#'; link.dataset.memoMoreCount = String(images.length - 4);
      link.textContent = english() ? `View ${images.length - 4} more photos` : `查看其余 ${images.length - 4} 张图片`;
      content.append(link);
    }
  }
  function init() {
    clearTimeout(inputTimer);
    page = document.querySelector('[data-memos-page]');
    if (!page) { memos = []; (CSS as unknown as { highlights?: Map<string, unknown> }).highlights?.delete('memo-search'); return; }
    memos = Array.from(page.querySelectorAll<HTMLElement>('[data-memo-card]')).map(element => {
      prepareImages(element);
      return { element, date: element.dataset.memoDate || '', search: normalize(element.dataset.memoSearch || ''), tags: Array.from(element.querySelectorAll<HTMLElement>('[data-memo-tag]')).map(tag => tag.dataset.memoTag || '') };
    });
    filters = readFilters();
    calendarMonth = filters.month || monthOf(filters.date[0] || '') || memos.map(memo => monthOf(memo.date)).filter(Boolean).sort().pop() || monthString(new Date());
    if (!location.search) {
      try {
        const cached = JSON.parse(sessionStorage.getItem(storageKey()) || 'null');
        if (cached && typeof cached.q === 'string' && typeof cached.month === 'string') {
          const list = (value: unknown): string[] => Array.isArray(value) ? [...new Set(value.filter((item): item is string => typeof item === 'string' && !!item))] : typeof value === 'string' && value ? [value] : [];
          filters = { q: cached.q, tag: list(cached.tag), date: list(cached.date), month: cached.month };
          if (/^\d{4}-\d{2}$/.test(cached.calendarMonth)) calendarMonth = cached.calendarMonth;
        }
      } catch { /* Invalid or unavailable persisted filters are ignored. */ }
    }
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(calendarMonth)) calendarMonth = monthString(new Date());
    applyFilters();
  }
  function selectFilter(target: HTMLElement, additive: boolean) {
    const type = target.hasAttribute('data-memo-tag') ? 'tag' : 'date';
    const value = type === 'tag' ? target.dataset.memoTag! : target.dataset.memosDate!;
    const selected = filters[type];
    filters[type] = additive
      ? selected.includes(value) ? selected.filter(item => item !== value) : [...selected, value]
      : selected.length === 1 && selected[0] === value ? [] : [value];
    if (type === 'date') filters.month = '';
    applyFilters();
  }

  let hold: { id: number; x: number; y: number; timer: number; target: HTMLElement } | null = null;
  let suppressTouchClickUntil = 0;
  const cancelHold = () => { if (hold) clearTimeout(hold.timer); hold = null; };
  document.addEventListener('pointerdown', event => {
    cancelHold();
    suppressTouchClickUntil = 0;
    if (!page || event.pointerType !== 'touch' || !event.isPrimary) return;
    const target = (event.target as Element).closest<HTMLElement>('button[data-memo-tag], button[data-memos-date]');
    if (!target) return;
    hold = { id: event.pointerId, x: event.clientX, y: event.clientY, target, timer: window.setTimeout(() => {
      suppressTouchClickUntil = Date.now() + 60000;
      selectFilter(target, true);
    }, 500) };
  });
  document.addEventListener('pointermove', event => {
    if (hold?.id === event.pointerId && Math.hypot(event.clientX - hold.x, event.clientY - hold.y) > 10) cancelHold();
  }, { passive: true });
  document.addEventListener('pointerup', () => {
    if (suppressTouchClickUntil) suppressTouchClickUntil = Date.now() + 800;
    cancelHold();
  });
  document.addEventListener('pointercancel', cancelHold);
  document.addEventListener('contextmenu', event => {
    if (hold || Date.now() < suppressTouchClickUntil) event.preventDefault();
  });
  document.addEventListener('daybook:before-swap', () => { cancelHold(); suppressTouchClickUntil = 0; });
  document.addEventListener('input', event => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement) || !target.matches('[data-memos-search]')) return;
    clearTimeout(inputTimer);
    inputTimer = window.setTimeout(() => { filters.q = target.value; applyFilters(); }, 100);
  });
  document.addEventListener('click', event => {
    if (!page) return;
    if (Date.now() < suppressTouchClickUntil) { event.preventDefault(); return; }
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;
    const tag = target.closest<HTMLElement>('[data-memo-tag]');
    const day = target.closest<HTMLElement>('[data-memos-date]');
    const month = target.closest<HTMLElement>('[data-memos-month]');
    if (tag || day) { event.preventDefault(); selectFilter((tag || day)!, event.ctrlKey || event.metaKey); }
    else if (month) { const date = monthDate(calendarMonth); date.setMonth(date.getMonth() + Number(month.dataset.memosMonth)); calendarMonth = monthString(date); renderCalendar(); saveFilters(); }
    else if (target.closest('[data-memos-select-month]')) { filters.month = filters.month === calendarMonth ? '' : calendarMonth; filters.date = []; applyFilters(); }
    else if (target.closest('[data-memos-clear-date]')) { filters.date = []; filters.month = ''; applyFilters(); }
    else if (target.closest('[data-memos-reset]')) { filters = { q: '', tag: [], date: [], month: '' }; applyFilters(); }
    else {
      const card = target.closest<HTMLElement>('[data-memo-card]');
      if (card && event.button === 0 && !target.closest('a, button, input, textarea, select, label, summary, audio, video, iframe, img, [contenteditable], [role="button"], .memo-actions, .mermaid-block, .music-custom-player, .media-embed') && !window.getSelection()?.toString() && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey) {
        const url = card.dataset.memoUrl;
        if (url) window.daybookNavigateTo ? window.daybookNavigateTo(url) : location.assign(url);
      }
    }
  });
  window.addEventListener('popstate', () => { if (page) { filters = readFilters(); calendarMonth = filters.month || monthOf(filters.date[0] || '') || calendarMonth; applyFilters(false); } });
  document.addEventListener('daybook:page-load', init);
  document.addEventListener('daybook:lang-change', () => { if (page) applyFilters(false); });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
