(function () {
  var pendingSearchFocus = false;
  var pendingTagsOpen = false;

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

    window.setTimeout(function () {
      input.focus();
      var end = input.value.length;
      input.setSelectionRange(end, end);
    }, 0);
  }

  function syncToolsState(searchOpen, tagsOpen, focusSearch) {
    var tools = document.querySelector("[data-notes-tools]");
    if (!tools) {
      return;
    }

    tools.classList.toggle("has-open-panel", searchOpen || tagsOpen);
    tools.classList.toggle("is-search-open", searchOpen);
    tools.classList.toggle("is-tags-open", tagsOpen);

    tools.querySelectorAll("[data-notes-panel]").forEach(function (panel) {
      var isActive = (panel.dataset.notesPanel === "search" && searchOpen) || (panel.dataset.notesPanel === "tags" && tagsOpen);
      panel.setAttribute("aria-hidden", isActive ? "false" : "true");
    });

    document.querySelectorAll("[data-notes-tool]").forEach(function (button) {
      var isActive = (button.dataset.notesTool === "search" && searchOpen) || (button.dataset.notesTool === "tags" && tagsOpen);
      button.setAttribute("aria-expanded", isActive ? "true" : "false");
    });

    if (searchOpen && focusSearch) {
      focusSearchInput();
    }
  }

  function setToolOpen(toolName, isOpen, focusSearch) {
    var tools = document.querySelector("[data-notes-tools]");
    var searchOpen = tools && tools.classList.contains("is-search-open");
    var tagsOpen = tools && tools.classList.contains("is-tags-open");

    if (toolName === "search") {
      searchOpen = isOpen;
    }
    if (toolName === "tags") {
      tagsOpen = isOpen;
    }

    syncToolsState(searchOpen, tagsOpen, focusSearch);
  }

  function noteTags(card) {
    return (card.dataset.tags || "")
      .split(/\n/)
      .map(cleanText)
      .filter(Boolean);
  }

  function matchesFilter(card, filter) {
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
      card.dataset.searchTitle,
      card.dataset.searchSummary,
      tags.join(" "),
    ].join(" ");

    return lower(text).includes(keyword);
  }

  function applyNoteFilters(filter) {
    var cards = document.querySelectorAll("[data-note-card]");
    var visibleCount = 0;

    cards.forEach(function (card) {
      var isVisible = matchesFilter(card, filter);
      card.hidden = !isVisible;
      if (isVisible) {
        visibleCount++;
      }
    });

    document.querySelectorAll(".notes-month").forEach(function (month) {
      var hasVisibleNote = Array.from(month.querySelectorAll("[data-note-card]")).some(function (card) {
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

    document.querySelectorAll("[data-notes-tag]").forEach(function (link) {
      var isActive = activeTag !== "" && lower(link.dataset.notesTag) === activeTag;
      link.classList.toggle("is-active", isActive);
      if (isActive) {
        link.setAttribute("aria-current", "page");
      } else {
        link.removeAttribute("aria-current");
      }
    });
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
      return;
    }

    if (!query) {
      return;
    }

    var url = notesURL();
    url.searchParams.set("q", query);
    pendingSearchFocus = true;
    pendingTagsOpen = Boolean(document.querySelector("[data-notes-tools].is-tags-open"));
    navigateTo(url);
  }

  function handleTagClick(link, event) {
    if (!link.classList.contains("is-active")) {
      return;
    }

    event.preventDefault();
    pendingTagsOpen = true;
    navigateTo(notesURL());
  }

  document.addEventListener("click", function (event) {
    var tagLink = event.target.closest("[data-notes-tag]");
    if (tagLink) {
      handleTagClick(tagLink, event);
      return;
    }

    var toolButton = event.target.closest("[data-notes-tool]");
    if (!toolButton) {
      return;
    }

    var toolName = toolButton.dataset.notesTool;
    var tools = document.querySelector("[data-notes-tools]");
    var isOpen = tools && tools.classList.contains("is-" + toolName + "-open");
    setToolOpen(toolName, !isOpen, toolName === "search" && !isOpen);
  });

  document.addEventListener("input", function (event) {
    var input = event.target.closest("[data-notes-search]");
    if (!input) {
      return;
    }
    handleSearchInput(input);
  });

  document.addEventListener("keydown", function (event) {
    if (event.key !== "Escape" || !event.target.closest("[data-notes-tools]")) {
      return;
    }
    syncToolsState(false, false, false);
  });

  window.daybookSyncNoteFilters = syncNoteFilters;
  syncNoteFilters();
})();
