// assets/ts/note-filters.ts
(function() {
  var pendingSearchFocus = false;
  var pendingTagsOpen = false;
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
    var tag = cleanText(params.get("tag"));
    if (query) {
      return { type: "search", value: query };
    }
    if (tag) {
      return { type: "tag", value: tag };
    }
    return { type: "", value: "" };
  }
  function isNotesPage() {
    return Boolean(document.querySelector(".notes-list"));
  }
  function notesURL() {
    return new URL("/notes/", window.location.origin);
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
    if (!input) {
      return;
    }
    window.setTimeout(function() {
      if (input) input.focus();
      var end = input ? input.value.length : 0;
      if (input) input.setSelectionRange(end, end);
    }, 0);
  }
  function syncToolsState(searchOpen, tagsOpen, focusSearch) {
    var toolsList = document.querySelectorAll("[data-notes-tools]");
    if (!toolsList.length) {
      return;
    }
    toolsList.forEach(function(tools) {
      tools.classList.toggle("has-open-panel", searchOpen || tagsOpen);
      tools.classList.toggle("is-search-open", searchOpen);
      tools.classList.toggle("is-tags-open", tagsOpen);
      tools.querySelectorAll("[data-notes-panel]").forEach(function(panelEl) {
        var panel = panelEl;
        var isActive = panel.dataset.notesPanel === "search" && searchOpen || panel.dataset.notesPanel === "tags" && tagsOpen;
        panel.setAttribute("aria-hidden", isActive ? "false" : "true");
      });
    });
    document.querySelectorAll("[data-notes-tool]").forEach(function(buttonEl) {
      var button = buttonEl;
      var isActive = button.dataset.notesTool === "search" && searchOpen || button.dataset.notesTool === "tags" && tagsOpen;
      button.setAttribute("aria-expanded", isActive ? "true" : "false");
    });
    if (searchOpen && focusSearch) {
      focusSearchInput();
    }
  }
  function setToolOpen(toolName, isOpen, focusSearch) {
    var firstTools = document.querySelector("[data-notes-tools]");
    var searchOpen = firstTools && firstTools.classList.contains("is-search-open");
    var tagsOpen = firstTools && firstTools.classList.contains("is-tags-open");
    if (toolName === "search") {
      searchOpen = isOpen;
    }
    if (toolName === "tags") {
      tagsOpen = isOpen;
    }
    syncToolsState(searchOpen || false, tagsOpen || false, focusSearch);
  }
  function noteTags(card) {
    return (card.dataset.tags || "").split(/\n/).map(cleanText).filter(Boolean);
  }
  function matchesFilter(card, filter) {
    if (!filter.type) {
      return true;
    }
    var tags = (card.dataset.tagIds || "").split(/\n/).map(cleanText).filter(Boolean);
    if (filter.type === "tag") {
      var activeTag = lower(filter.value);
      return tags.some(function(tag) {
        return lower(tag) === activeTag;
      });
    }
    var textTags = noteTags(card);
    var keyword = lower(filter.value);
    var text = [
      card.dataset.searchTitle || "",
      card.dataset.searchSummary || "",
      textTags.join(" ")
    ].join(" ");
    return lower(text).includes(keyword);
  }
  function applyNoteFilters(filter) {
    var cards = document.querySelectorAll("[data-note-card]");
    var visibleCount = 0;
    var keyword = filter.type === "search" ? filter.value : "";
    cards.forEach(function(cardEl) {
      var card = cardEl;
      var isVisible = matchesFilter(card, filter);
      card.hidden = !isVisible;
      if (isVisible) {
        visibleCount++;
        var titleA = card.querySelector(".notes-item-title a");
        if (titleA) {
          if (!titleA.hasAttribute("data-original-html")) {
            titleA.setAttribute("data-original-html", titleA.innerHTML);
          }
          if (keyword) {
            titleA.innerHTML = highlightMatches(card.dataset.searchTitle || "", keyword);
          } else {
            titleA.innerHTML = titleA.getAttribute("data-original-html") || "";
          }
        }
        var summary = card.querySelector(".notes-item-summary");
        if (summary) {
          if (!summary.hasAttribute("data-original-html")) {
            summary.setAttribute("data-original-html", summary.innerHTML);
          }
          if (keyword) {
            summary.innerHTML = highlightMatches(card.dataset.searchSummary || "", keyword);
          } else {
            summary.innerHTML = summary.getAttribute("data-original-html") || "";
          }
        }
      }
    });
    document.querySelectorAll(".notes-pinned").forEach(function(pinnedEl) {
      var pinned = pinnedEl;
      var hasVisibleNote = Array.from(pinned.querySelectorAll("[data-note-card]")).some(function(cardEl) {
        var card = cardEl;
        return !card.hidden;
      });
      pinned.hidden = !hasVisibleNote;
      var divider = document.querySelector(".notes-divider");
      if (divider) {
        divider.hidden = !hasVisibleNote;
      }
    });
    document.querySelectorAll(".notes-month").forEach(function(monthEl) {
      var month = monthEl;
      var hasVisibleNote = Array.from(month.querySelectorAll("[data-note-card]")).some(function(cardEl) {
        var card = cardEl;
        return !card.hidden;
      });
      month.hidden = !hasVisibleNote;
    });
    var empty = document.querySelector(".notes-filter-empty");
    if (empty) {
      empty.hidden = !filter.type || visibleCount > 0;
    }
  }
  function updateActiveTags(filter) {
    var activeTag = filter.type === "tag" ? lower(filter.value) : "";
    document.querySelectorAll("[data-notes-tag]").forEach(function(linkEl) {
      var link = linkEl;
      var linkTag = link.dataset.notesTag || "";
      var isActive = activeTag !== "" && lower(linkTag) === activeTag;
      link.classList.toggle("is-active", isActive);
      if (isActive) {
        link.setAttribute("aria-current", "page");
      } else {
        link.removeAttribute("aria-current");
      }
    });
  }
  function updateMobileTagReturn(filter) {
    var returnBtn = document.getElementById("mobile-tag-return");
    if (returnBtn) {
      returnBtn.hidden = filter.type !== "tag";
    }
    var tagBackContainer = document.getElementById("tag-back-container");
    var tagBackTitle = document.getElementById("tag-back-title");
    if (tagBackContainer && tagBackTitle) {
      if (filter.type === "tag") {
        tagBackContainer.hidden = false;
        tagBackTitle.textContent = "#" + filter.value;
      } else {
        tagBackContainer.hidden = true;
      }
    }
  }
  function syncSearchInput(filter) {
    var input = document.querySelector("[data-notes-search]");
    if (!input) {
      return;
    }
    var value = filter.type === "search" ? filter.value : "";
    if (input.value !== value) {
      input.value = value;
    }
  }
  function syncNoteFilters() {
    var filter = currentFilter();
    syncSearchInput(filter);
    updateActiveTags(filter);
    updateMobileTagReturn(filter);
    if (isNotesPage()) {
      applyNoteFilters(filter);
    }
    if (filter.type === "search") {
      syncToolsState(true, pendingTagsOpen, pendingSearchFocus);
    } else if (filter.type === "tag") {
      syncToolsState(false, true, false);
    } else {
      syncToolsState(false, false, false);
    }
    pendingSearchFocus = false;
    pendingTagsOpen = false;
  }
  function updateNotesSearch(query) {
    var url = notesURL();
    if (query) {
      url.searchParams.set("q", query);
    }
    replaceURL(url);
    applyNoteFilters(query ? { type: "search", value: query } : { type: "", value: "" });
    updateActiveTags({ type: "", value: "" });
  }
  function handleSearchInput(input) {
    var query = cleanText(input.value);
    if (isNotesPage()) {
      updateNotesSearch(query);
    }
  }
  function handleTagClick(link, event) {
    if (!link.classList.contains("is-active")) {
      return;
    }
    event.preventDefault();
    pendingTagsOpen = true;
    navigateTo(notesURL());
  }
  document.addEventListener("click", function(event) {
    var target = event.target;
    var tagLink = target.closest("[data-notes-tag]");
    if (tagLink) {
      handleTagClick(tagLink, event);
      return;
    }
    var toolButton = target.closest("[data-notes-tool]");
    if (!toolButton) {
      return;
    }
    var toolName = toolButton.dataset.notesTool;
    if (!toolName) return;
    var firstTools = document.querySelector("[data-notes-tools]");
    var isOpen = firstTools && firstTools.classList.contains("is-" + toolName + "-open");
    setToolOpen(toolName, !isOpen, toolName === "search" && !isOpen);
  });
  document.addEventListener("click", function(event) {
    var target = event.target;
    var backBtn = target.closest("#tag-back-btn");
    if (backBtn) {
      event.preventDefault();
      var url = notesURL();
      navigateTo(url);
    }
  });
  document.addEventListener("input", function(event) {
    var target = event.target;
    var input = target.closest("[data-notes-search]");
    if (!input) {
      return;
    }
    handleSearchInput(input);
  });
  document.addEventListener("keydown", function(event) {
    var target = event.target;
    if (event.key !== "Escape" || !target.closest("[data-notes-tools]")) {
      return;
    }
    syncToolsState(false, false, false);
  });
  function syncTagsScrollbar() {
    const panels = document.querySelectorAll(".notes-tags-panel:not(.mobile-tags-panel)");
    panels.forEach((panel) => {
      if (panel.hasAttribute("data-scrollbar-initialized")) return;
      panel.setAttribute("data-scrollbar-initialized", "true");
      const viewport = panel.querySelector(".notes-tags-scroll-viewport");
      const scrollbar = panel.querySelector(".notes-tags-scrollbar");
      const thumb = panel.querySelector(".notes-tags-scrollbar-thumb");
      if (!viewport || !scrollbar || !thumb) return;
      let hideTimer = null;
      const updateTagsScrollbarGeometry = () => {
        const clientHeight = viewport.clientHeight;
        const scrollHeight = viewport.scrollHeight;
        const scrollTop = viewport.scrollTop;
        if (scrollHeight <= clientHeight || clientHeight === 0) {
          scrollbar.classList.remove("is-visible");
          return;
        }
        const minThumb = 30;
        const ratio = clientHeight / scrollHeight;
        const thumbHeight = Math.max(minThumb, clientHeight * ratio);
        const scrollRange = scrollHeight - clientHeight;
        const thumbRange = clientHeight - thumbHeight;
        const progress = scrollRange > 0 ? scrollTop / scrollRange : 0;
        const thumbTop = progress * thumbRange;
        thumb.style.height = `${thumbHeight}px`;
        thumb.style.transform = `translateY(${thumbTop}px)`;
      };
      const showTagsScrollbarTemporarily = () => {
        const clientHeight = viewport.clientHeight;
        const scrollHeight = viewport.scrollHeight;
        if (scrollHeight <= clientHeight || clientHeight === 0) return;
        scrollbar.classList.add("is-visible");
        if (hideTimer !== null) {
          window.clearTimeout(hideTimer);
        }
        hideTimer = window.setTimeout(() => {
          scrollbar.classList.remove("is-visible");
        }, 800);
      };
      viewport.addEventListener("scroll", () => {
        updateTagsScrollbarGeometry();
        showTagsScrollbarTemporarily();
      }, { passive: true });
      const observer = new ResizeObserver(() => {
        updateTagsScrollbarGeometry();
      });
      observer.observe(viewport);
      const tagList = viewport.querySelector(".notes-tag-list");
      if (tagList) observer.observe(tagList);
      updateTagsScrollbarGeometry();
    });
  }
  document.addEventListener("daybook:page-load", syncTagsScrollbar);
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", syncTagsScrollbar);
  } else {
    syncTagsScrollbar();
  }
  window.daybookSyncNoteFilters = syncNoteFilters;
  document.addEventListener("daybook:page-load", syncNoteFilters);
  syncNoteFilters();
})();
//# sourceMappingURL=note-filters.js.map
