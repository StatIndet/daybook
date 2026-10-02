(() => {
  function getMobileInput(): HTMLInputElement | null {
    return document.getElementById("mobile-search-input") as HTMLInputElement | null;
  }
  
  function getMobileResults(): HTMLElement | null {
    return document.getElementById("mobile-search-results");
  }

  function getMobileEmpty(): HTMLElement | null {
    return document.getElementById("mobile-search-empty");
  }

  function getMobileLoading(): HTMLElement | null {
    return document.getElementById("mobile-search-loading");
  }

  function renderNoteCard(item: any, keyword: string): string {
    const engine = window.daybookSearchEngine;
    if (!engine) return "";

    const titleHtml = engine.highlightMatches(item.title, keyword);
    const summaryHtml = item.summary ? `<p class="notes-item-summary">${engine.highlightMatches(item.summary, keyword)}</p>` : '';
    
    let indicators = '';
    if (item.pin) indicators += `<span class="notes-item-pin" aria-hidden="true" title="已固定" data-article-shared="pin"></span>`;
    if (item.hasMusic) indicators += `<span class="material-symbol notes-item-music" aria-hidden="true" title="包含音乐" data-article-shared="music">music_note_2</span>`;
    if (item.hasTranslation) indicators += `<span class="material-symbol notes-item-bilingual" aria-hidden="true" title="双语" data-article-shared="bilingual">translate</span>`;

    let meta = `<time datetime="${item.date}" data-article-shared="published">${item.date}</time>
      <span class="reading-time" data-article-shared="reading">${item.readingMinutes} min</span>`;
    if (item.updated) {
        meta += ` <span class="updated-time" data-article-shared="updated">&bull; updated <time datetime="${item.updated}">${item.updated}</time></span>`;
    }

        const hasTitleMatch = keyword && titleHtml !== engine.escapeHTML(item.title);
    const titleLayout = (keyword && hasTitleMatch) ? titleHtml : (item.titleLayout || titleHtml);

    return `
<article class="notes-item" data-note-card>
  <div class="notes-item-header" data-transition-scope="${engine.escapeHTML(item.url)}">
    <h1 class="notes-item-title">
      <a href="${item.url}" data-title-transition-key="${engine.escapeHTML(item.url)}">
        ${titleLayout}
      </a>
    </h1>
    <div class="notes-item-indicators">
      ${indicators}
    </div>
    <p class="notes-item-meta">
      ${meta}
    </p>
  </div>
  ${summaryHtml}
</article>`;
  }

  async function applyGlobalSearchUI() {
    const engine = window.daybookSearchEngine;
    if (!engine) return;

    const query = engine.getCurrentQuery();

    // 1. Sync Mobile Input and Render Mobile Results
    const mobileInput = getMobileInput();
    if (mobileInput && mobileInput.value !== query) {
      mobileInput.value = query;
    }

    if (query && mobileInput) {
      // Mobile Overlay rendering
      const ctx = engine.getCollectionContext();
      const results = await engine.searchNotes(query, ctx.tagSlug);
      const resultsContainer = getMobileResults();
      const emptyState = getMobileEmpty();
      
      if (resultsContainer) {
        resultsContainer.innerHTML = results.map((item: any) => renderNoteCard(item, query)).join("");
      }
      
      if (emptyState) {
        emptyState.hidden = results.length > 0;
      }
    } else {
      const resultsContainer = getMobileResults();
      const emptyState = getMobileEmpty();
      if (resultsContainer) resultsContainer.innerHTML = "";
      if (emptyState) emptyState.hidden = true;
    }

  }

  let debounceTimer: number;
  function handleInputEvent(input: HTMLInputElement) {
    const engine = window.daybookSearchEngine;
    if (!engine) return;

    clearTimeout(debounceTimer);
    debounceTimer = window.setTimeout(() => {
        const query = input.value.trim();
        engine.updateSearchURL(query);
        applyGlobalSearchUI();
    }, 150);
  }

  document.addEventListener("input", function(event) {
    const target = event.target as HTMLElement;
    if (!target) return;
    
    if (target.id === "mobile-search-input") {
      handleInputEvent(target as HTMLInputElement);
    }
  });

  document.addEventListener("focusin", function(event) {
    const target = event.target as HTMLElement;
    if (!target) return;
    if (target.closest("[data-notes-search]")) {
      const engine = window.daybookSearchEngine;
      if (engine) engine.loadSearchIndex();
    }
  });

  document.addEventListener("click", function(event) {
    const target = event.target as HTMLElement | null;
    if (!target) return;
    const btn = target.closest('[data-mobile-overlay-target="search"]');
    if (btn) {
      const engine = window.daybookSearchEngine;
      if (engine) engine.loadSearchIndex();
    }
  });

  document.addEventListener("daybook:page-load", () => {
    clearTimeout(debounceTimer);
    applyGlobalSearchUI();
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", applyGlobalSearchUI);
  } else {
    applyGlobalSearchUI();
  }
})();
