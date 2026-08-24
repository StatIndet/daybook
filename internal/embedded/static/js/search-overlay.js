// assets/ts/search-overlay.ts
(function() {
  const indexURL = document.body.dataset["searchIndexUrl"] || "/search.json";
  let searchData = null;
  let isFetching = false;
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
  function getDesktopContainer() {
    let container = document.getElementById("global-search-results-container");
    if (!container) {
      container = document.createElement("div");
      container.id = "global-search-results-container";
      container.className = "global-search-results-container notes-list article-stage";
      container.hidden = true;
      const original = getOriginalContent();
      if (original && original.parentNode) {
        original.parentNode.insertBefore(container, original);
      } else {
        const mainWrapper = document.getElementById("main-content-wrapper");
        if (mainWrapper) mainWrapper.appendChild(container);
      }
    }
    return container;
  }
  function getOriginalContent() {
    return document.querySelector(".note-detail, .archive-page, .about-page, .home-hero");
  }
  function cleanText(value) {
    return (value || "").trim();
  }
  function lower(value) {
    return cleanText(value).toLowerCase();
  }
  function isNotesPage() {
    return Boolean(document.querySelector(".notes-list:not(.global-search-results-container)"));
  }
  function isGraphPage() {
    return window.location.pathname.startsWith("/graph");
  }
  function escapeHtml(unsafe) {
    if (!unsafe) return "";
    return unsafe.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
  }
  function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
  function highlightMatches(text, keyword) {
    if (!text) return "";
    if (!keyword) return escapeHtml(text);
    const regex = new RegExp(`(${escapeRegExp(keyword)})`, "gi");
    const parts = text.split(regex);
    let html = "";
    for (let i = 0; i < parts.length; i++) {
      if (lower(parts[i]) === lower(keyword)) {
        html += '<mark class="search-highlight">' + escapeHtml(parts[i]) + "</mark>";
      } else {
        html += escapeHtml(parts[i]);
      }
    }
    return html;
  }
  function fetchSearchIndex() {
    if (searchData || isFetching) return;
    isFetching = true;
    const loadingState = getMobileLoading();
    if (loadingState) loadingState.hidden = false;
    fetch(indexURL).then(function(res) {
      if (!res.ok) throw new Error("Failed to fetch search index");
      return res.json();
    }).then(function(data) {
      const currentLang = document.documentElement.lang || "zh-CN";
      searchData = [];
      for (let i = 0; i < data.length; i++) {
        const group = data[i];
        if (!group) continue;
        const version = group.versions[currentLang] || group.versions["zh-CN"];
        if (version) {
          searchData.push(version);
        }
      }
      if (loadingState) loadingState.hidden = true;
      const searchInput = getMobileInput();
      if (searchInput) renderMobileResults(searchInput.value);
      syncDesktopSearchFromURL();
    }).catch(function(err) {
      console.error(err);
      if (loadingState) loadingState.hidden = true;
      isFetching = false;
    });
  }
  function generateResultsHTML(query) {
    const keyword = lower(query);
    if (!keyword) return { html: "", count: 0, pending: false };
    if (!searchData) {
      fetchSearchIndex();
      return { html: "", count: 0, pending: true };
    }
    const matches = [];
    for (let i = 0; i < searchData.length; i++) {
      const item = searchData[i];
      if (!item) continue;
      const text = [item.title, item.summary, (item.tags || []).join(" ")].join(" ");
      if (lower(text).includes(keyword)) {
        matches.push(item);
      }
    }
    if (matches.length === 0) return { html: "", count: 0, pending: false };
    let html = "";
    for (let i = 0; i < matches.length; i++) {
      const item = matches[i];
      if (!item) continue;
      const summaryHtml = item.summary ? '<p class="notes-item-summary">' + highlightMatches(item.summary, keyword) + "</p>" : "";
      html += '<article class="notes-item"><div class="notes-item-header"><h1 class="notes-item-title"><a href="' + escapeHtml(item.url) + '">' + highlightMatches(item.title, keyword) + '</a></h1><p class="notes-item-meta"><time datetime="' + escapeHtml(item.date) + '">' + escapeHtml(item.date) + "</time><span>" + escapeHtml(item.readingTime) + "</span></p></div>" + summaryHtml + "</article>";
    }
    return { html, count: matches.length, pending: false };
  }
  function renderMobileResults(query) {
    const result = generateResultsHTML(query);
    if (result.pending) return;
    const resultsContainer = getMobileResults();
    const emptyState = getMobileEmpty();
    if (result.count === 0) {
      if (resultsContainer) resultsContainer.innerHTML = "";
      if (emptyState) emptyState.hidden = !cleanText(query);
      return;
    }
    if (emptyState) emptyState.hidden = true;
    if (resultsContainer) resultsContainer.innerHTML = result.html;
  }
  function renderDesktopResults(query) {
    const result = generateResultsHTML(query);
    if (result.pending) return;
    const desktopContainer = getDesktopContainer();
    if (!desktopContainer) return;
    if (result.count === 0) {
      const emptyText = document.documentElement.lang === "en" ? "No results found" : "\u6CA1\u6709\u627E\u5230\u5339\u914D\u7684\u6587\u7AE0\u3002";
      const emptyMsg = cleanText(query) ? '<p class="notes-empty">' + emptyText + "</p>" : "";
      desktopContainer.innerHTML = '<div class="notes-month"><div class="notes-month-list">' + emptyMsg + "</div></div>";
      return;
    }
    desktopContainer.innerHTML = '<div class="notes-month"><div class="notes-month-list">' + result.html + "</div></div>";
  }
  function syncDesktopSearchFromURL() {
    if (isNotesPage() || isGraphPage()) return;
    const params = new URLSearchParams(window.location.search);
    const query = cleanText(params.get("q"));
    document.querySelectorAll("[data-notes-search]:not(.mobile-search-input)").forEach((inputEl) => {
      const input = inputEl;
      if (input.value !== query) input.value = query;
    });
    const originalContent = getOriginalContent();
    const desktopContainer = getDesktopContainer();
    if (query) {
      if (originalContent) originalContent.hidden = true;
      if (desktopContainer) {
        desktopContainer.hidden = false;
        renderDesktopResults(query);
      }
    } else {
      if (originalContent) originalContent.hidden = false;
      if (desktopContainer) {
        desktopContainer.hidden = true;
        desktopContainer.innerHTML = "";
      }
    }
  }
  function handleDesktopSearchInput(input) {
    if (isNotesPage() || isGraphPage()) return;
    const query = cleanText(input.value);
    const url = new URL(window.location.href);
    if (query) {
      url.searchParams.set("q", query);
    } else {
      url.searchParams.delete("q");
    }
    history.replaceState({ daybookSearch: true }, "", url.href);
    syncDesktopSearchFromURL();
  }
  document.addEventListener("input", function(event) {
    const target = event.target;
    if (!target) return;
    if (target.id === "mobile-search-input") {
      renderMobileResults(target.value);
    } else {
      const input = target.closest("[data-notes-search]:not(.mobile-search-input)");
      if (input) {
        handleDesktopSearchInput(input);
      }
    }
  });
  document.addEventListener("focusin", function(event) {
    const target = event.target;
    if (!target) return;
    if (target.closest("[data-notes-search]")) {
      fetchSearchIndex();
    }
  });
  document.addEventListener("click", function(event) {
    const target = event.target;
    if (!target) return;
    const btn = target.closest('[data-mobile-overlay-target="search"]');
    if (btn) {
      fetchSearchIndex();
    }
  });
  window.addEventListener("popstate", syncDesktopSearchFromURL);
  document.addEventListener("daybook:page-load", syncDesktopSearchFromURL);
  syncDesktopSearchFromURL();
})();
//# sourceMappingURL=search-overlay.js.map
