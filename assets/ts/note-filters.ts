(function () {
  var pendingSearchFocus = false;
  var pendingTagsOpen = false;

  interface NoteFilter {
    type: string;
    value: string;
  }

  function escapeHtml(str: string): string {
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function highlightMatches(text: string, keyword: string): string {
    if (!keyword) return escapeHtml(text);
    var escapedText = escapeHtml(text);
    var escapedKeyword = escapeHtml(keyword);
    // Replace special regex characters in keyword
    escapedKeyword = escapedKeyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    var regex = new RegExp("(" + escapedKeyword + ")", "gi");
    return escapedText.replace(regex, '<mark class="search-highlight">$1</mark>');
  }

  function cleanText(value: string | null): string {
    return (value || "").trim();
  }

  function lower(value: string | null): string {
    return cleanText(value).toLowerCase();
  }

  function currentFilter(): NoteFilter {
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

  function replaceURL(url: URL) {
    history.replaceState({ daybook: true }, "", url.href);
    if (window.daybookSyncPageKey) {
      window.daybookSyncPageKey(url.href);
    }
  }

  function navigateTo(url: URL) {
    if (window.daybookNavigateTo) {
      window.daybookNavigateTo(url.href);
      return;
    }
    window.location.href = url.href;
  }

  function focusSearchInput() {
    var input = document.querySelector("[data-notes-search]") as HTMLInputElement | null;
    if (!input) {
      return;
    }

    window.setTimeout(function () {
      if(input) input.focus();
      var end = input ? input.value.length : 0;
      if(input) input.setSelectionRange(end, end);
    }, 0);
  }

  function syncToolsState(searchOpen: boolean, tagsOpen: boolean, focusSearch: boolean) {
    var toolsList = document.querySelectorAll("[data-notes-tools]");
    if (!toolsList.length) {
      return;
    }

    toolsList.forEach(function (tools) {
      tools.classList.toggle("has-open-panel", searchOpen || tagsOpen);
      tools.classList.toggle("is-search-open", searchOpen);
      tools.classList.toggle("is-tags-open", tagsOpen);

      tools.querySelectorAll("[data-notes-panel]").forEach(function (panelEl) {
        var panel = panelEl as HTMLElement;
        var isActive = (panel.dataset.notesPanel === "search" && searchOpen) || (panel.dataset.notesPanel === "tags" && tagsOpen);
        panel.setAttribute("aria-hidden", isActive ? "false" : "true");
      });
    });

    document.querySelectorAll("[data-notes-tool]").forEach(function (buttonEl) {
      var button = buttonEl as HTMLElement;
      var isActive = (button.dataset.notesTool === "search" && searchOpen) || (button.dataset.notesTool === "tags" && tagsOpen);
      button.setAttribute("aria-expanded", isActive ? "true" : "false");
    });

    if (searchOpen && focusSearch) {
      focusSearchInput();
    }
  }

  function setToolOpen(toolName: string, isOpen: boolean, focusSearch: boolean) {
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

  function noteTags(card: HTMLElement): string[] {
    return (card.dataset.tags || "")
      .split(/\n/)
      .map(cleanText)
      .filter(Boolean);
  }

  function matchesFilter(card: HTMLElement, filter: NoteFilter): boolean {
    if (!filter.type) {
      return true;
    }

    var tags = noteTags(card);
    if (filter.type === "tag") {
      var activeTag = lower(filter.value);
      return tags.some(function (tag) {
        return lower(tag) === activeTag;
      });
    }

    var keyword = lower(filter.value);
    var text = [
      card.dataset.searchTitle || "",
      card.dataset.searchSummary || "",
      tags.join(" "),
    ].join(" ");

    return lower(text).includes(keyword);
  }

  function applyNoteFilters(filter: NoteFilter) {
    var cards = document.querySelectorAll("[data-note-card]");
    var visibleCount = 0;
    var keyword = filter.type === "search" ? filter.value : "";

    cards.forEach(function (cardEl) {
      var card = cardEl as HTMLElement;
      var isVisible = matchesFilter(card, filter);
      card.hidden = !isVisible;
      if (isVisible) {
        visibleCount++;
        
        var titleA = card.querySelector(".notes-item-title a");
        if (titleA) {
          titleA.innerHTML = highlightMatches(card.dataset.searchTitle || "", keyword);
        }
        var summary = card.querySelector(".notes-item-summary");
        if (summary) {
          summary.innerHTML = highlightMatches(card.dataset.searchSummary || "", keyword);
        }
      }
    });

    document.querySelectorAll(".notes-pinned").forEach(function (pinnedEl) {
      var pinned = pinnedEl as HTMLElement;
      var hasVisibleNote = Array.from(pinned.querySelectorAll("[data-note-card]")).some(function (cardEl) {
        var card = cardEl as HTMLElement;
        return !card.hidden;
      });
      pinned.hidden = !hasVisibleNote;

      var divider = document.querySelector(".notes-divider");
      if (divider) {
        (divider as HTMLElement).hidden = !hasVisibleNote;
      }
    });

    document.querySelectorAll(".notes-month").forEach(function (monthEl) {
      var month = monthEl as HTMLElement;
      var hasVisibleNote = Array.from(month.querySelectorAll("[data-note-card]")).some(function (cardEl) {
        var card = cardEl as HTMLElement;
        return !card.hidden;
      });
      month.hidden = !hasVisibleNote;
    });

    var empty = document.querySelector(".notes-filter-empty") as HTMLElement | null;
    if (empty) {
      empty.hidden = !filter.type || visibleCount > 0;
    }
  }

  function updateActiveTags(filter: NoteFilter) {
    var activeTag = filter.type === "tag" ? lower(filter.value) : "";

    document.querySelectorAll("[data-notes-tag]").forEach(function (linkEl) {
      var link = linkEl as HTMLElement;
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

  function updateMobileTagReturn(filter: NoteFilter) {
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

  function syncSearchInput(filter: NoteFilter) {
    var input = document.querySelector("[data-notes-search]") as HTMLInputElement | null;
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

  function updateNotesSearch(query: string) {
    var url = notesURL();
    if (query) {
      url.searchParams.set("q", query);
    }
    replaceURL(url);
    applyNoteFilters(query ? { type: "search", value: query } : { type: "", value: "" });
    updateActiveTags({ type: "", value: "" });
  }

  function handleSearchInput(input: HTMLInputElement) {
    var query = cleanText(input.value);

    if (isNotesPage()) {
      updateNotesSearch(query);
    }
  }

  function handleTagClick(link: HTMLElement, event: MouseEvent) {
    if (!link.classList.contains("is-active")) {
      return;
    }

    event.preventDefault();
    pendingTagsOpen = true;
    navigateTo(notesURL());
  }

  document.addEventListener("click", function (event: MouseEvent) {
    var target = event.target as HTMLElement;
    var tagLink = target.closest("[data-notes-tag]") as HTMLElement | null;
    if (tagLink) {
      handleTagClick(tagLink, event);
      return;
    }

    var toolButton = target.closest("[data-notes-tool]") as HTMLElement | null;
    if (!toolButton) {
      return;
    }

    var toolName = toolButton.dataset.notesTool;
    if (!toolName) return;
    var firstTools = document.querySelector("[data-notes-tools]");
    var isOpen = firstTools && firstTools.classList.contains("is-" + toolName + "-open");
    setToolOpen(toolName, !isOpen, toolName === "search" && !isOpen);
  });

  document.addEventListener("click", function (event: MouseEvent) {
    var target = event.target as HTMLElement;
    var backBtn = target.closest("#tag-back-btn");
    if (backBtn) {
      event.preventDefault();
      var url = notesURL();
      navigateTo(url);
    }
  });

  document.addEventListener("input", function (event: Event) {
    var target = event.target as HTMLElement;
    var input = target.closest("[data-notes-search]") as HTMLInputElement | null;
    if (!input) {
      return;
    }
    handleSearchInput(input);
  });

  document.addEventListener("keydown", function (event: KeyboardEvent) {
    var target = event.target as HTMLElement;
    if (event.key !== "Escape" || !target.closest("[data-notes-tools]")) {
      return;
    }
    syncToolsState(false, false, false);
  });

  window.daybookSyncNoteFilters = syncNoteFilters;
  document.addEventListener("daybook:page-load", syncNoteFilters);
  syncNoteFilters();
})();
