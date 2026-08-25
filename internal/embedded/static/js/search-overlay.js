"use strict";
(() => {
  // assets/ts/search-overlay.ts
  (() => {
    function getMobileInput() {
      return document.getElementById("mobile-search-input");
    }
    function getMobileResults() {
      return document.getElementById("mobile-search-results");
    }
    function getMobileEmpty() {
      return document.getElementById("mobile-search-empty");
    }
    function getMobileLoading() {
      return document.getElementById("mobile-search-loading");
    }
    function getOriginalContent() {
      return document.querySelector(".page-content") || document.querySelector(".archive-virtual-list");
    }
    function getDesktopContainer() {
      return document.querySelector(".global-search-results-container");
    }
    function isNotesPage() {
      return Boolean(document.querySelector(".notes-list:not(.global-search-results-container)"));
    }
    function isGraphPage() {
      return window.location.pathname.startsWith("/graph");
    }
    function renderNoteCard(item, keyword) {
      const engine = window.daybookSearchEngine;
      if (!engine) return "";
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
    async function applyGlobalSearchUI() {
      const engine = window.daybookSearchEngine;
      if (!engine) return;
      const query = engine.getCurrentQuery();
      const mobileInput = getMobileInput();
      if (mobileInput && mobileInput.value !== query) {
        mobileInput.value = query;
      }
      if (query && mobileInput) {
        const ctx = engine.getCollectionContext();
        const results = await engine.searchNotes(query, ctx.tagSlug);
        const resultsContainer = getMobileResults();
        const emptyState = getMobileEmpty();
        if (resultsContainer) {
          resultsContainer.innerHTML = results.map((item) => renderNoteCard(item, query)).join("");
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
      if (isNotesPage() || isGraphPage()) return;
      const originalContent = getOriginalContent();
      const desktopContainer = getDesktopContainer();
      document.querySelectorAll("[data-notes-search]:not(.mobile-search-input)").forEach((inputEl) => {
        const input = inputEl;
        if (input.value !== query) input.value = query;
      });
      if (query) {
        if (originalContent) originalContent.hidden = true;
        if (desktopContainer) {
          desktopContainer.hidden = false;
          const ctx = engine.getCollectionContext();
          const results = await engine.searchNotes(query, ctx.tagSlug);
          if (results.length === 0) {
            const emptyText = document.documentElement.lang === "en" ? "No results found" : "\u6CA1\u6709\u627E\u5230\u5339\u914D\u7684\u6587\u7AE0\u3002";
            desktopContainer.innerHTML = '<div class="notes-month"><div class="notes-month-list"><p class="notes-empty">' + emptyText + "</p></div></div>";
          } else {
            desktopContainer.innerHTML = '<div class="notes-month"><div class="notes-month-list">' + results.map((item) => renderNoteCard(item, query)).join("") + "</div></div>";
          }
        }
      } else {
        if (originalContent) originalContent.hidden = false;
        if (desktopContainer) {
          desktopContainer.hidden = true;
          desktopContainer.innerHTML = "";
        }
      }
    }
    let debounceTimer;
    function handleInputEvent(input, isMobile) {
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
      const target = event.target;
      if (!target) return;
      if (target.id === "mobile-search-input") {
        handleInputEvent(target, true);
      } else {
        const input = target.closest("[data-notes-search]:not(.mobile-search-input)");
        if (input) {
          if (!isNotesPage()) {
            handleInputEvent(input, false);
          }
        }
      }
    });
    document.addEventListener("focusin", function(event) {
      const target = event.target;
      if (!target) return;
      if (target.closest("[data-notes-search]")) {
        const engine = window.daybookSearchEngine;
        if (engine) engine.loadSearchIndex();
      }
    });
    document.addEventListener("click", function(event) {
      const target = event.target;
      if (!target) return;
      const btn = target.closest('[data-mobile-overlay-target="search"]');
      if (btn) {
        const engine = window.daybookSearchEngine;
        if (engine) engine.loadSearchIndex();
      }
    });
    document.addEventListener("daybook:page-load", applyGlobalSearchUI);
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", applyGlobalSearchUI);
    } else {
      applyGlobalSearchUI();
    }
  })();
})();
