(function() {
  var indexURL = document.body.dataset.searchIndexUrl || "/search.json";
  var searchInput = document.getElementById("mobile-search-input");
  var resultsContainer = document.getElementById("mobile-search-results");
  var emptyState = document.getElementById("mobile-search-empty");
  var loadingState = document.getElementById("mobile-search-loading");
  
  var searchData = null;
  var isFetching = false;

  function cleanText(value) {
    return (value || "").trim();
  }

  function lower(value) {
    return cleanText(value).toLowerCase();
  }

  function fetchSearchIndex() {
    if (searchData || isFetching) return;
    isFetching = true;
    loadingState.hidden = false;
    
    fetch(indexURL)
      .then(function(res) {
         if (!res.ok) throw new Error("Failed to fetch search index");
         return res.json();
      })
      .then(function(data) {
         searchData = data;
         loadingState.hidden = true;
         renderResults(searchInput.value);
      })
      .catch(function(err) {
         console.error(err);
         loadingState.hidden = true;
         isFetching = false;
      });
  }

  function renderResults(query) {
    var keyword = lower(query);
    if (!keyword) {
      if (resultsContainer) resultsContainer.innerHTML = "";
      if (emptyState) emptyState.hidden = true;
      return;
    }

    if (!searchData) {
      fetchSearchIndex();
      return;
    }

    var matches = [];
    for (var i = 0; i < searchData.length; i++) {
      var item = searchData[i];
      var text = [item.title, item.summary, (item.tags || []).join(" ")].join(" ");
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
    var html = "";
    for (var i = 0; i < matches.length; i++) {
      var item = matches[i];
      var summaryHtml = item.summary ? '<p class="notes-item-summary">' + escapeHtml(item.summary) + '</p>' : '';
      
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

  function escapeHtml(unsafe) {
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
    var btn = event.target.closest('[data-mobile-overlay-target="search"]');
    if (btn) {
      fetchSearchIndex();
    }
  });

})();
