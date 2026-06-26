(function () {
  interface NoteFragment {
    lang: string;
    summary: string;
    html: string;
    headings: { ID: string; Text: string; Level: number }[];
  }

  interface OriginalState {
    lang: string;
    summary: string;
    html: string;
    headings: { ID: string; Text: string; Level: number }[];
  }

  let originalState: OriginalState | null = null;
  let cachedAltFragment: NoteFragment | null = null;
  let isFetching = false;

  function dispatchSwapEvent() {
    document.dispatchEvent(new CustomEvent("daybook:article-content-swapped"));
  }

  function swapContent(state: { lang: string; summary: string; html: string; headings: any[] }) {
    const postContent = document.querySelector(".post-content") as HTMLElement;
    const noteSummary = document.querySelector(".note-summary") as HTMLElement;
    const tocList = document.querySelector(".note-toc-panel ol");

    if (postContent) {
      postContent.setAttribute("lang", state.lang);
      postContent.innerHTML = state.html;
    }
    
    if (noteSummary) {
      noteSummary.innerHTML = state.summary || "";
      noteSummary.style.display = state.summary ? "block" : "none";
    }

    if (tocList && state.headings) {
      tocList.innerHTML = state.headings.map(h => `<li class="note-toc-depth-${h.Level}"><a href="#${h.ID}">${h.Text}</a></li>`).join("");
    }

    dispatchSwapEvent();
  }

  function initBilingualToggle() {
    const toggleBtn = document.querySelector(".bilingual-toggle-btn") as HTMLButtonElement;
    if (!toggleBtn) return;

    toggleBtn.addEventListener("click", async (event) => {
      event.preventDefault();

      if (isFetching) return;

      if (!originalState) {
        const postContent = document.querySelector(".post-content") as HTMLElement;
        const noteSummary = document.querySelector(".note-summary") as HTMLElement;
        const tocList = document.querySelector(".note-toc-panel ol");
        
        let originalHeadings: { ID: string; Text: string; Level: number }[] = [];
        if (tocList) {
           originalHeadings = Array.from(tocList.querySelectorAll("li")).map(li => {
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
        // Revert to original
        swapContent(originalState);
        toggleBtn.dataset.currentLang = originalState.lang;
        toggleBtn.setAttribute("aria-pressed", "false");
      } else {
        // Fetch or use cached
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
            return; // Abort silently
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
          });
          
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
