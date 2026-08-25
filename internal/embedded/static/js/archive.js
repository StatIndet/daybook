"use strict";
(() => {
  // assets/ts/archive.ts
  (function() {
    let observer = null;
    let isFetching = false;
    let loadedChunks = [];
    if (history.state && history.state.archiveChunks) {
      loadedChunks = history.state.archiveChunks;
    }
    function initArchiveObserver() {
      const sentinel = document.getElementById("archive-sentinel");
      if (!sentinel) return;
      if (observer) {
        observer.disconnect();
      }
      observer = new IntersectionObserver((entries) => {
        const entry = entries[0];
        if (entry && entry.isIntersecting && !isFetching) {
          const nextUrl = sentinel.dataset.nextChunk;
          if (nextUrl) {
            loadChunk(nextUrl, sentinel);
          }
        }
      }, { rootMargin: "600px 0px" });
      observer.observe(sentinel);
    }
    async function loadChunk(url, sentinel, restoreMode = false) {
      if (isFetching) return;
      isFetching = true;
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error("Chunk not found");
        const data = await res.json();
        appendChunk(data);
        if (!restoreMode) {
          loadedChunks.push(url);
          const newState = Object.assign({}, history.state || {}, { archiveChunks: loadedChunks });
          history.replaceState(newState, "");
        }
        if (data.nextChunk) {
          sentinel.dataset.nextChunk = data.nextChunk;
        } else {
          sentinel.dataset.nextChunk = "";
          if (observer) observer.disconnect();
        }
      } catch (err) {
        console.error("Failed to load archive chunk:", err);
        if (observer) observer.disconnect();
      } finally {
        isFetching = false;
      }
    }
    function appendChunk(data) {
      const timeline = document.querySelector(".archive-timeline");
      const sentinel = document.getElementById("archive-sentinel");
      if (!timeline || !sentinel) return;
      let staggerIdx = 0;
      for (const group of data.groups) {
        let yearSection = document.getElementById(`archive-year-${group.Year}`);
        let list = null;
        if (!yearSection) {
          yearSection = document.createElement("section");
          yearSection.className = "archive-year";
          yearSection.id = `archive-year-${group.Year}`;
          yearSection.setAttribute("aria-labelledby", `archive-year-${group.Year}`);
          const h2 = document.createElement("h2");
          h2.textContent = group.Year;
          yearSection.appendChild(h2);
          list = document.createElement("ol");
          list.className = "archive-list";
          yearSection.appendChild(list);
          timeline.insertBefore(yearSection, sentinel);
        } else {
          list = yearSection.querySelector(".archive-list");
        }
        if (!list) continue;
        for (const note of group.Notes) {
          const li = document.createElement("li");
          li.className = "archive-item";
          li.style.setProperty("--stagger-index", String(staggerIdx++));
          let readingTimeHtml = note.ReadingTime ? `<span class="archive-reading-time">${note.ReadingTime}</span>` : "";
          let summaryHtml = note.Summary ? `<p>${escapeHtml(note.Summary)}</p>` : "";
          li.innerHTML = `
                  <time datetime="${note.Date}">${note.DateShort}</time>
                  <div class="archive-entry">
                    <a href="${note.URL}">${escapeHtml(note.Title)}</a>
                    ${readingTimeHtml}
                    ${summaryHtml}
                  </div>
                `;
          list.appendChild(li);
        }
      }
    }
    function escapeHtml(str) {
      return (str || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
    }
    async function restoreState() {
      const sentinel = document.getElementById("archive-sentinel");
      if (!sentinel) return;
      if (loadedChunks.length > 0) {
        for (const url of loadedChunks) {
          await loadChunk(url, sentinel, true);
        }
        if (history.state && history.state.scrollY) {
          window.scrollTo(0, history.state.scrollY);
        }
      }
      initArchiveObserver();
    }
    function isArchivePage() {
      return Boolean(document.querySelector(".archive-page"));
    }
    function init() {
      if (!isArchivePage()) {
        if (observer) {
          observer.disconnect();
          observer = null;
        }
        return;
      }
      if (loadedChunks.length > 0 && document.querySelectorAll(".archive-item").length <= 10) {
        restoreState();
      } else {
        initArchiveObserver();
      }
    }
    window.addEventListener("pagehide", () => {
      if (isArchivePage()) {
        const newState = Object.assign({}, history.state || {}, { scrollY: window.scrollY });
        history.replaceState(newState, "");
      }
    });
    document.addEventListener("daybook:page-load", init);
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", init);
    } else {
      init();
    }
  })();
})();
