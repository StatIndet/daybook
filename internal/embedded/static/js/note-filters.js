"use strict";
(() => {
  // assets/ts/note-filters.ts
  (function() {
    var pendingSearchFocus = false;
    let searchDataCache = null;
    let isFetching = false;
    function escapeHtml(str) {
      return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
    }
    function highlightMatches(text, keyword) {
      if (!keyword) return escapeHtml(text);
      var escapedText = escapeHtml(text);
      var escapedKeyword = escapeHtml(keyword);
      escapedKeyword = escapedKeyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      var regex = new RegExp("(" + escapedKeyword + ")", "gi");
      return escapedText.replace(regex, '<mark class="search-highlight">$1</mark>');
    }
    function cleanText(value) {
      return (value || "").trim();
    }
    function lower(value) {
      return cleanText(value).toLowerCase();
    }
    function currentFilter() {
      var params = new URLSearchParams(window.location.search);
      var query = cleanText(params.get("q"));
      if (query) {
        return { type: "search", value: query };
      }
      return { type: "", value: "" };
    }
    function isNotesPage() {
      return Boolean(document.querySelector(".notes-list"));
    }
    function getBaseCollectionURL() {
      var path = window.location.pathname;
      path = path.replace(/\/page\/\d+\/?$/, "/");
      return new URL(path, window.location.origin);
    }
    function replaceURL(url) {
      history.replaceState({ daybook: true }, "", url.href);
      if (window.daybookSyncPageKey) {
        window.daybookSyncPageKey(url.href);
      }
    }
    function navigateTo(url) {
      if (window.daybookNavigateTo) {
        window.daybookNavigateTo(url.href);
        return;
      }
      window.location.href = url.href;
    }
    function focusSearchInput() {
      var input = document.querySelector("[data-notes-search]");
      if (!input) return;
      window.setTimeout(function() {
        if (input) input.focus();
        var end = input ? input.value.length : 0;
        if (input) input.setSelectionRange(end, end);
      }, 0);
    }
    function syncToolsState(searchOpen, focusSearch) {
      var toolsList = document.querySelectorAll("[data-notes-tools]");
      if (!toolsList.length) return;
      toolsList.forEach(function(tools) {
        tools.classList.toggle("has-open-panel", searchOpen);
        tools.classList.toggle("is-search-open", searchOpen);
        tools.querySelectorAll("[data-notes-panel]").forEach(function(panelEl) {
          var panel = panelEl;
          var isActive = panel.dataset.notesPanel === "search" && searchOpen;
          if (isActive) {
            panel.hidden = false;
            window.setTimeout(function() {
              panel.classList.add("is-active");
            }, 10);
          } else {
            panel.classList.remove("is-active");
            window.setTimeout(function() {
              if (!panel.classList.contains("is-active")) {
                panel.hidden = true;
              }
            }, 200);
          }
        });
      });
      if (focusSearch) {
        focusSearchInput();
      }
    }
    function setToolOpen(toolName, isOpen, focusSearch) {
      var filter = currentFilter();
      var isSearchActive = filter.type === "search";
      var searchOpen = toolName === "search" ? isOpen : isSearchActive;
      syncToolsState(searchOpen, focusSearch);
    }
    function normalizeURL() {
      var params = new URLSearchParams(window.location.search);
      if (params.has("q") && window.location.pathname.includes("/page/")) {
        var url = getBaseCollectionURL();
        url.search = params.toString();
        replaceURL(url);
      }
      if (params.has("tag") && window.location.pathname.includes("/notes/")) {
        var tag = params.get("tag");
        var newPath = window.location.pathname.replace("/notes/", "/tags/" + encodeURIComponent(tag || "") + "/");
        var url = new URL(newPath, window.location.origin);
        replaceURL(url);
      }
    }
    async function loadSearchData() {
      if (searchDataCache) return searchDataCache;
      if (isFetching) return new Promise((resolve) => {
        const interval = setInterval(() => {
          if (searchDataCache) {
            clearInterval(interval);
            resolve(searchDataCache);
          }
        }, 50);
      });
      isFetching = true;
      const indexURL = document.body.dataset["searchIndexUrl"] || "/search.json";
      try {
        const res = await fetch(indexURL);
        const data = await res.json();
        const flattened = [];
        const currentLang = document.documentElement.lang || "en";
        for (const item of data) {
          let ver = item.versions[currentLang];
          if (!ver) {
            ver = item.versions["zh-CN"] || item.versions["en"];
          }
          if (ver) {
            flattened.push(ver);
          }
        }
        searchDataCache = flattened;
        isFetching = false;
        return searchDataCache;
      } catch (e) {
        console.error("Failed to load search index", e);
        isFetching = false;
        return [];
      }
    }
    function renderNoteCard(item, keyword) {
      const titleHtml = highlightMatches(item.title, keyword);
      const summaryHtml = item.summary ? `<p class="notes-item-summary">${highlightMatches(item.summary, keyword)}</p>` : "";
      let indicators = "";
      if (item.pin) indicators += `<span class="notes-item-pin" aria-hidden="true" title="\u5DF2\u56FA\u5B9A" data-article-shared="pin"></span>`;
      if (item.hasMusic) indicators += `<span class="material-symbol notes-item-music" aria-hidden="true" title="\u5305\u542B\u97F3\u4E50" data-article-shared="music">music_note_2</span>`;
      if (item.hasTranslation) indicators += `<span class="material-symbol notes-item-bilingual" aria-hidden="true" title="\u53CC\u8BED" data-article-shared="bilingual">translate</span>`;
      let meta = `<time datetime="${item.date}" data-article-shared="published">${item.date}</time>
      <span class="reading-time" data-article-shared="reading">${item.readingMinutes} min</span>`;
      if (item.updated) {
        meta += ` <span class="updated-time" data-article-shared="updated">&bull; updated <time datetime="${item.updated}">${item.updated}</time></span>`;
      }
      const titleLayout = item.titleLayout || titleHtml;
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
    async function applyNoteFilters(filter) {
      var keyword = filter.type === "search" ? filter.value : "";
      var staticElements = document.querySelectorAll(".notes-pinned, .notes-divider, .notes-month, .pagination, .notes-empty:not(.notes-filter-empty)");
      var resultsContainer = document.querySelector(".notes-search-results");
      var emptyMessage = document.querySelector(".notes-filter-empty");
      if (!keyword) {
        staticElements.forEach((el) => el.hidden = false);
        if (resultsContainer) {
          resultsContainer.innerHTML = "";
          resultsContainer.hidden = true;
        }
        if (emptyMessage) emptyMessage.hidden = true;
        return;
      }
      staticElements.forEach((el) => el.hidden = true);
      const data = await loadSearchData();
      const kw = lower(keyword);
      let path = window.location.pathname;
      let currentTagSlug = "";
      if (path.includes("/tags/")) {
        const parts = path.split("/");
        const idx = parts.indexOf("tags");
        if (idx !== -1 && idx + 1 < parts.length) {
          currentTagSlug = decodeURIComponent(parts[idx + 1] || "");
        }
      }
      const results = data.filter((item) => {
        if (currentTagSlug) {
          let hasTag = false;
          for (const tag of item.tags) {
            if (tag.toLowerCase().replace(/\s+/g, "-") === currentTagSlug.toLowerCase()) {
              hasTag = true;
              break;
            }
          }
          if (!hasTag && !item.tagIDs.includes(currentTagSlug)) {
            return false;
          }
        }
        const text = lower(item.title + " " + item.summary + " " + item.tags.join(" "));
        return text.includes(kw);
      });
      if (resultsContainer) {
        resultsContainer.hidden = false;
        resultsContainer.innerHTML = results.map((item) => renderNoteCard(item, keyword)).join("");
      }
      if (emptyMessage) {
        emptyMessage.hidden = results.length === 0;
      }
    }
    function updateNotesSearch(query) {
      var url = getBaseCollectionURL();
      if (query) {
        url.searchParams.set("q", query);
      }
      replaceURL(url);
      applyNoteFilters(query ? { type: "search", value: query } : { type: "", value: "" });
    }
    let debounceTimer;
    function handleSearchInput(input) {
      clearTimeout(debounceTimer);
      debounceTimer = window.setTimeout(() => {
        var query = cleanText(input.value);
        if (isNotesPage()) {
          updateNotesSearch(query);
        }
      }, 150);
    }
    function syncSearchInput(filter) {
      var input = document.querySelector("[data-notes-search]");
      if (input) {
        input.value = filter.type === "search" ? filter.value : "";
      }
    }
    function syncNoteFilters() {
      normalizeURL();
      var filter = currentFilter();
      syncSearchInput(filter);
      applyNoteFilters(filter);
      var isSearchActive = filter.type === "search";
      var shouldFocus = pendingSearchFocus;
      pendingSearchFocus = false;
      syncToolsState(isSearchActive, shouldFocus);
    }
    document.addEventListener("click", function(event) {
      var target = event.target;
      var toolButton = target.closest("[data-notes-tool]");
      if (!toolButton) {
        return;
      }
      var toolName = toolButton.dataset.notesTool;
      var toolsContainer = toolButton.closest("[data-notes-tools]");
      if (!toolName || !toolsContainer) return;
      var isCurrentlyOpen = toolsContainer.classList.contains("is-" + toolName + "-open");
      var willOpen = !isCurrentlyOpen;
      if (toolName === "search") {
        if (willOpen) {
          pendingSearchFocus = true;
          setToolOpen(toolName, true, true);
        } else {
          updateNotesSearch("");
        }
      }
    });
    document.addEventListener("input", function(event) {
      var target = event.target;
      if (target.matches("[data-notes-search]")) {
        handleSearchInput(target);
      }
    });
    document.addEventListener("keydown", function(event) {
      if (event.key === "Escape") {
        var tools = document.querySelector("[data-notes-tools]");
        if (tools && (tools.classList.contains("is-search-open") || tools.classList.contains("is-tags-open"))) {
          updateNotesSearch("");
        }
      }
    });
    document.addEventListener("daybook:page-load", function() {
      if (isNotesPage()) {
        syncNoteFilters();
      }
    });
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", function() {
        if (isNotesPage()) {
          syncNoteFilters();
        }
      });
    } else {
      if (isNotesPage()) {
        syncNoteFilters();
      }
    }
    if (document.readyState !== "loading" && isNotesPage()) {
      setTimeout(loadSearchData, 500);
    } else if (isNotesPage()) {
      document.addEventListener("DOMContentLoaded", () => setTimeout(loadSearchData, 500));
    }
  })();
})();
