(() => {
  type DesktopTool = "search" | "tags" | null;
  
  let currentDesktopTool: DesktopTool = null;
  let pendingSearchFocus = false;

  function isNotesPage() {
    // Both notes and tags page have notes-page class usually, but let's just check for notes-tools
    return Boolean(document.querySelector("[data-notes-tools]"));
  }

  function setDesktopTool(tool: DesktopTool, shouldFocus: boolean = false) {
    const toolsContainer = document.querySelector("[data-notes-tools]");
    if (!toolsContainer) return;
    
    currentDesktopTool = tool;

    // Reset all tool buttons and panels
    document.querySelectorAll("[data-notes-tool]").forEach(btn => {
      btn.setAttribute("aria-expanded", "false");
    });
    
    document.querySelectorAll("[data-notes-panel]").forEach(panel => {
      panel.setAttribute("aria-hidden", "true");
      panel.classList.remove("is-active");
    });
    
    toolsContainer.classList.remove("is-search-open", "is-tags-open", "has-open-panel");
    
    if (tool) {
      toolsContainer.classList.add(`is-${tool}-open`, "has-open-panel");
      
      const btn = document.querySelector(`[data-notes-tool="${tool}"]`);
      if (btn) btn.setAttribute("aria-expanded", "true");
      
      const panel = document.querySelector(`[data-notes-panel="${tool}"]`);
      if (panel) {
        panel.setAttribute("aria-hidden", "false");
        panel.classList.add("is-active");
      }
      
      if (tool === "search" && shouldFocus) {
        const input = document.querySelector("[data-notes-search]") as HTMLInputElement;
        if (input) input.focus();
      }
    }
  }

  function renderNoteCard(item: any, keyword: string): string {
    const engine = window.daybookSearchEngine;
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
  <div class="notes-item-header" data-transition-scope="${item.slug}">
    <h1 class="notes-item-title">
      <a href="${item.url}" data-title-transition-key="${item.slug}">
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

  async function applySearchUI() {
    const engine = window.daybookSearchEngine;
    if (!engine) return;
    
    const ctx = engine.getCollectionContext();
    if (ctx.kind !== "notes" && ctx.kind !== "tag") return;

    const query = engine.getCurrentQuery();
    
    // Sync input value
    const input = document.querySelector("[data-notes-search]") as HTMLInputElement | null;
    if (input) {
      input.value = query;
    }

    const staticElements = document.querySelectorAll(".notes-pinned, .notes-divider, .notes-month, .pagination, .notes-empty:not(.notes-filter-empty)");
    const resultsContainer = document.querySelector(".notes-search-results");
    const emptyMessage = document.querySelector(".notes-filter-empty");

    if (!query) {
      staticElements.forEach(el => (el as HTMLElement).hidden = false);
      if (resultsContainer) {
        resultsContainer.innerHTML = "";
        (resultsContainer as HTMLElement).hidden = true;
      }
      if (emptyMessage) (emptyMessage as HTMLElement).hidden = true;
      
      // Do NOT auto-close the search panel just because query is empty.
      return;
    }

    staticElements.forEach(el => (el as HTMLElement).hidden = true);
    
    // Auto-open panel if we have a query
    if (currentDesktopTool !== "search") {
      setDesktopTool("search", false);
    }
    
    const results = await engine.searchNotes(query, ctx.tagSlug);
    
    if (resultsContainer) {
      (resultsContainer as HTMLElement).hidden = false;
      resultsContainer.innerHTML = results.map((item: any) => renderNoteCard(item, query)).join("");
    }

    if (emptyMessage) {
      (emptyMessage as HTMLElement).hidden = results.length === 0;
    }
  }

  let debounceTimer: number;
  function handleSearchInput(input: HTMLInputElement) {
    clearTimeout(debounceTimer);
    debounceTimer = window.setTimeout(() => {
        const query = input.value.trim();
        const engine = window.daybookSearchEngine;
        if (engine && isNotesPage()) {
          engine.updateSearchURL(query);
          applySearchUI();
        }
    }, 150);
  }

  document.addEventListener("click", function (event: MouseEvent) {
    const target = event.target as HTMLElement;

    // Desktop Buttons fix
    const toolButton = target.closest("[data-notes-tool]") as HTMLElement | null;
    if (toolButton) {
      const toolName = toolButton.dataset.notesTool as DesktopTool;
      if (toolName) {
        if (currentDesktopTool === toolName) {
          // Toggle off
          setDesktopTool(null);
        } else {
          // Toggle on
          setDesktopTool(toolName, toolName === "search");
        }
      }
    }
  });

  document.addEventListener("input", function (event: Event) {
    const target = event.target as HTMLElement;
    if (target.matches("[data-notes-search]")) {
      handleSearchInput(target as HTMLInputElement);
    }
  });

  document.addEventListener("keydown", function (event: KeyboardEvent) {
    if (event.key === "Escape") {
      if (currentDesktopTool === "search" || currentDesktopTool === "tags") {
        setDesktopTool(null);
      }
    }
  });

  document.addEventListener("daybook:page-load", function () {
    if (isNotesPage()) {
      applySearchUI();
    }
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      if (isNotesPage()) {
        applySearchUI();
      }
    });
  } else {
    if (isNotesPage()) {
      applySearchUI();
    }
  }

})();
