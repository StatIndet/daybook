// assets/ts/note-bilingual.ts
(function() {
  let originalState = null;
  let cachedAltFragment = null;
  let isFetching = false;
  function dispatchSwapEvent() {
    document.dispatchEvent(new CustomEvent("daybook:article-content-swapped"));
  }
  function getHeadingIndex(id, headings) {
    return headings.findIndex((h) => h.ID === id);
  }
  function swapContent(state, isAlt) {
    const postContent = document.querySelector(".post-content");
    const noteSummary = document.querySelector(".note-summary");
    let newHash = "";
    if (window.location.hash) {
      let currentHashId = window.location.hash.slice(1);
      try {
        currentHashId = decodeURIComponent(currentHashId);
      } catch {
      }
      const sourceHeadings = isAlt ? originalState?.headings : cachedAltFragment?.headings;
      const targetHeadings = state.headings;
      if (sourceHeadings && targetHeadings) {
        const index = getHeadingIndex(currentHashId, sourceHeadings);
        if (index !== -1 && index < targetHeadings.length) {
          newHash = "#" + targetHeadings[index].ID;
        }
      }
    }
    if (postContent) {
      postContent.setAttribute("lang", state.lang);
      postContent.innerHTML = state.html;
    }
    if (noteSummary) {
      noteSummary.innerHTML = state.summary || "";
      noteSummary.style.display = state.summary ? "block" : "none";
    }
    const desktopTocList = document.querySelector(".note-toc-panel ol");
    const mobileTocList = document.querySelector(".mobile-toc-nav ol");
    const tocHtml = state.headings ? state.headings.map((h) => `<li class="note-toc-depth-${h.Level}"><a href="#${h.ID}">${h.Text}</a></li>`).join("") : "";
    if (desktopTocList) {
      desktopTocList.innerHTML = tocHtml;
    }
    if (mobileTocList) {
      mobileTocList.innerHTML = tocHtml;
    }
    if (newHash && newHash !== window.location.hash) {
      const newUrl = new URL(window.location.href);
      newUrl.hash = newHash;
      history.replaceState(history.state, "", newUrl.href);
    }
    dispatchSwapEvent();
  }
  function initBilingualToggle() {
    const toggleBtn = document.querySelector(".bilingual-toggle-btn");
    if (!toggleBtn) return;
    toggleBtn.addEventListener("click", async (event) => {
      event.preventDefault();
      if (isFetching) return;
      if (!originalState) {
        const postContent = document.querySelector(".post-content");
        const noteSummary = document.querySelector(".note-summary");
        const tocList = document.querySelector(".note-toc-panel ol");
        let originalHeadings = [];
        if (tocList) {
          originalHeadings = Array.from(tocList.querySelectorAll("li")).map((li) => {
            const a = li.querySelector("a");
            const cls = li.className;
            const levelMatch = cls.match(/note-toc-depth-(\d+)/);
            return {
              ID: a ? a.getAttribute("href")?.substring(1) || "" : "",
              Text: a ? a.textContent || "" : "",
              Level: levelMatch ? parseInt(levelMatch[1] || "1", 10) : 1
            };
          });
        }
        originalState = {
          lang: toggleBtn.dataset.currentLang || document.documentElement.lang,
          html: postContent ? postContent.innerHTML : "",
          summary: noteSummary ? noteSummary.innerHTML : "",
          headings: originalHeadings
        };
      }
      const currentLang = toggleBtn.dataset.currentLang;
      const isAlt = currentLang !== originalState.lang;
      if (isAlt) {
        swapContent(originalState, true);
        toggleBtn.dataset.currentLang = originalState.lang;
        toggleBtn.setAttribute("aria-pressed", "false");
      } else {
        if (!cachedAltFragment) {
          isFetching = true;
          try {
            toggleBtn.style.pointerEvents = "none";
            const jsonUrl = toggleBtn.dataset.altFragmentUrl;
            if (!jsonUrl) throw new Error("Missing alt fragment URL");
            const res = await fetch(jsonUrl);
            if (!res.ok) throw new Error("Failed to fetch translation fragment");
            const data = await res.json();
            if (data && data.html) {
              cachedAltFragment = data;
            } else {
              throw new Error("Invalid fragment structure");
            }
          } catch (e) {
            console.error(e);
            isFetching = false;
            toggleBtn.style.pointerEvents = "";
            return;
          } finally {
            isFetching = false;
            toggleBtn.style.pointerEvents = "";
          }
        }
        if (cachedAltFragment) {
          swapContent({
            lang: cachedAltFragment.lang,
            summary: cachedAltFragment.summary,
            html: cachedAltFragment.html,
            headings: cachedAltFragment.headings || []
          }, false);
          toggleBtn.dataset.currentLang = cachedAltFragment.lang;
          toggleBtn.setAttribute("aria-pressed", "true");
        }
      }
    });
  }
  document.addEventListener("daybook:page-load", () => {
    originalState = null;
    cachedAltFragment = null;
    isFetching = false;
    initBilingualToggle();
  });
})();
//# sourceMappingURL=note-bilingual.js.map
