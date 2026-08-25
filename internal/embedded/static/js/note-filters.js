"use strict";
(() => {
  // assets/ts/note-filters.ts
  (() => {
    let currentDesktopTool = null;
    let pendingSearchFocus = false;
    function isNotesPage() {
      return Boolean(document.querySelector("[data-notes-tools]"));
    }
    function setDesktopTool(tool, shouldFocus = false) {
      const toolsContainer = document.querySelector("[data-notes-tools]");
      if (!toolsContainer) return;
      currentDesktopTool = tool;
      document.querySelectorAll("[data-notes-tool]").forEach((btn) => {
        btn.setAttribute("aria-expanded", "false");
      });
      document.querySelectorAll("[data-notes-panel]").forEach((panel) => {
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
          const input = document.querySelector("[data-notes-search]");
          if (input) input.focus();
        }
      }
    }
    function renderNoteCard(item, keyword) {
      const engine = window.daybookSearchEngine;
      const titleHtml = engine.highlightMatches(item.title, keyword);
      const summaryHtml = item.summary ? `<p class="notes-item-summary">${engine.highlightMatches(item.summary, keyword)}</p>` : "";
      let indicators = "";
      if (item.pin) indicators += `<span class="notes-item-pin" aria-hidden="true" title="\u5DF2\u56FA\u5B9A" data-article-shared="pin"></span>`;
      if (item.hasMusic) indicators += `<span class="material-symbol notes-item-music" aria-hidden="true" title="\u5305\u542B\u97F3\u4E50" data-article-shared="music">music_note_2</span>`;
      if (item.hasTranslation) indicators += `<span class="material-symbol notes-item-bilingual" aria-hidden="true" title="\u53CC\u8BED" data-article-shared="bilingual">translate</span>`;
      let meta = `<time datetime="${item.date}" data-article-shared="published">${item.date}</time>
      <span class="reading-time" data-article-shared="reading">${item.readingMinutes} min</span>`;
      if (item.updated) {
        meta += ` <span class="updated-time" data-article-shared="updated">&bull; updated <time datetime="${item.updated}">${item.updated}</time></span>`;
      }
      const hasTitleMatch = keyword && titleHtml !== engine.escapeHTML(item.title);
      const titleLayout = keyword && hasTitleMatch ? titleHtml : item.titleLayout || titleHtml;
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
      const input = document.querySelector("[data-notes-search]");
      if (input) {
        input.value = query;
      }
      const staticElements = document.querySelectorAll(".notes-pinned, .notes-divider, .notes-month, .pagination, .notes-empty:not(.notes-filter-empty)");
      const resultsContainer = document.querySelector(".notes-search-results");
      const emptyMessage = document.querySelector(".notes-filter-empty");
      if (!query) {
        staticElements.forEach((el) => el.hidden = false);
        if (resultsContainer) {
          resultsContainer.innerHTML = "";
          resultsContainer.hidden = true;
        }
        if (emptyMessage) emptyMessage.hidden = true;
        return;
      }
      staticElements.forEach((el) => el.hidden = true);
      if (currentDesktopTool !== "search") {
        setDesktopTool("search", false);
      }
      const results = await engine.searchNotes(query, ctx.tagSlug);
      if (resultsContainer) {
        resultsContainer.hidden = false;
        resultsContainer.innerHTML = results.map((item) => renderNoteCard(item, query)).join("");
      }
      if (emptyMessage) {
        emptyMessage.hidden = results.length === 0;
      }
    }
    let debounceTimer;
    function handleSearchInput(input) {
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
    document.addEventListener("click", function(event) {
      const target = event.target;
      const toolButton = target.closest("[data-notes-tool]");
      if (toolButton) {
        const toolName = toolButton.dataset.notesTool;
        if (toolName) {
          if (currentDesktopTool === toolName) {
            setDesktopTool(null);
          } else {
            setDesktopTool(toolName, toolName === "search");
          }
        }
      }
    });
    document.addEventListener("input", function(event) {
      const target = event.target;
      if (target.matches("[data-notes-search]")) {
        handleSearchInput(target);
      }
    });
    document.addEventListener("keydown", function(event) {
      if (event.key === "Escape") {
        if (currentDesktopTool === "search" || currentDesktopTool === "tags") {
          setDesktopTool(null);
        }
      }
    });
    document.addEventListener("daybook:page-load", function() {
      if (isNotesPage()) {
        applySearchUI();
      }
    });
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", function() {
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
})();
