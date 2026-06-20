interface SearchItem {
  title: string;
  url: string;
  date: string;
  readingTime: string;
  summary?: string;
  tags?: string[];
}

(function() {
  const indexURL = document.body.dataset['searchIndexUrl'] || "/search.json";
  const searchInput = document.getElementById("mobile-search-input") as HTMLInputElement | null;
  const resultsContainer = document.getElementById("mobile-search-results");
  const emptyState = document.getElementById("mobile-search-empty");
  const loadingState = document.getElementById("mobile-search-loading");
  
  let searchData: SearchItem[] | null = null;
  let isFetching = false;

  function cleanText(value: string | null | undefined): string {
    return (value || "").trim();
  }

  function lower(value: string | null | undefined): string {
    return cleanText(value).toLowerCase();
  }

  function fetchSearchIndex() {
    if (searchData || isFetching) return;
    isFetching = true;
    if (loadingState) loadingState.hidden = false;
    
    fetch(indexURL)
      .then(function(res) {
         if (!res.ok) throw new Error("Failed to fetch search index");
         return res.json();
      })
      .then(function(data: SearchItem[]) {
         searchData = data;
         if (loadingState) loadingState.hidden = true;
         if (searchInput) renderResults(searchInput.value);
      })
      .catch(function(err) {
         console.error(err);
         if (loadingState) loadingState.hidden = true;
         isFetching = false;
      });
  }

  function renderResults(query: string) {
    const keyword = lower(query);
    if (!keyword) {
      if (resultsContainer) resultsContainer.innerHTML = "";
      if (emptyState) emptyState.hidden = true;
      return;
    }

    if (!searchData) {
      fetchSearchIndex();
      return;
    }

    const matches: SearchItem[] = [];
    for (let i = 0; i < searchData.length; i++) {
      const item = searchData[i];
      if (!item) continue;
      const text = [item.title, item.summary, (item.tags || []).join(" ")].join(" ");
      if (lower(text).includes(keyword)) {
         matches.push(item);
      }
    }

    if (matches.length === 0) {
      if (resultsContainer) resultsContainer.innerHTML = "";
      if (emptyState) emptyState.hidden = false;
      return;
    }

    if (emptyState) emptyState.hidden = true;
    let html = "";
    for (let i = 0; i < matches.length; i++) {
      const item = matches[i];
      if (!item) continue;
      const summaryHtml = item.summary ? '<p class="notes-item-summary">' + escapeHtml(item.summary) + '</p>' : '';
      
      html += '<article class="notes-item">' +
                '<div class="notes-item-header">' +
                  '<h1 class="notes-item-title">' +
                    '<a href="' + escapeHtml(item.url) + '">' + escapeHtml(item.title) + '</a>' +
                  '</h1>' +
                  '<p class="notes-item-meta">' +
                    '<time datetime="' + escapeHtml(item.date) + '">' + escapeHtml(item.date) + '</time>' +
                    '<span>' + escapeHtml(item.readingTime) + '</span>' +
                  '</p>' +
                '</div>' +
                summaryHtml +
              '</article>';
    }
    if (resultsContainer) resultsContainer.innerHTML = html;
  }

  function escapeHtml(unsafe: string | null | undefined): string {
    if (!unsafe) return "";
    return unsafe
         .replace(/&/g, "&amp;")
         .replace(/</g, "&lt;")
         .replace(/>/g, "&gt;")
         .replace(/"/g, "&quot;")
         .replace(/'/g, "&#039;");
  }

  if (searchInput) {
    searchInput.addEventListener("input", function() {
      renderResults(searchInput.value);
    });
    searchInput.addEventListener("focus", fetchSearchIndex);
  }

  document.addEventListener("click", function(event) {
    const target = event.target as HTMLElement | null;
    if (!target) return;
    const btn = target.closest('[data-mobile-overlay-target="search"]');
    if (btn) {
      fetchSearchIndex();
    }
  });

})();
