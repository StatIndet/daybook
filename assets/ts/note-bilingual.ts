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
  let isTranslationActive = false;
  let cachedAltFragment: NoteFragment | null = null;

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
    const toggleLink = document.querySelector(".note-bilingual-link a") as HTMLAnchorElement;
    if (!toggleLink) return;

    toggleLink.addEventListener("click", async (event) => {
      event.preventDefault();

      const btnContainer = toggleLink.closest(".note-bilingual-link");
      if (!btnContainer) return;

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
          lang: postContent ? (postContent.getAttribute("lang") || document.documentElement.lang) : document.documentElement.lang,
          html: postContent ? postContent.innerHTML : "",
          summary: noteSummary ? noteSummary.innerHTML : "",
          headings: originalHeadings
        };
      }

      if (isTranslationActive) {
        // Revert to original
        swapContent(originalState);
        isTranslationActive = false;
        
        toggleLink.classList.remove("is-translation-active");
        toggleLink.setAttribute("aria-pressed", "false");
        toggleLink.removeAttribute("title");
      } else {
        // Fetch or use cached
        if (!cachedAltFragment) {
          try {
            toggleLink.style.pointerEvents = "none";
            toggleLink.style.opacity = "0.5";
            
            const href = toggleLink.getAttribute("href") || "";
            const jsonUrl = href.replace(/\/$/, '') + '/fragment.json';
            
            const res = await fetch(jsonUrl);
            if (!res.ok) throw new Error("Failed to fetch translation fragment");
            
            cachedAltFragment = await res.json();
          } catch (e) {
            console.error(e);
            toggleLink.style.pointerEvents = "";
            toggleLink.style.opacity = "";
            return; // Abort
          } finally {
            toggleLink.style.pointerEvents = "";
            toggleLink.style.opacity = "";
          }
        }

        if (cachedAltFragment) {
          swapContent({
             lang: cachedAltFragment.lang,
             summary: cachedAltFragment.summary,
             html: cachedAltFragment.html,
             headings: cachedAltFragment.headings || []
          });
          isTranslationActive = true;
          
          toggleLink.classList.add("is-translation-active");
          toggleLink.setAttribute("aria-pressed", "true");
          
          const backText = document.documentElement.lang === "en" ? "Back to page language" : "返回当前页面语言";
          toggleLink.setAttribute("title", backText);
        }
      }
    });
  }

  document.addEventListener("daybook:page-load", () => {
    // Reset state on actual navigation
    originalState = null;
    isTranslationActive = false;
    cachedAltFragment = null;
    initBilingualToggle();
  });

})();
