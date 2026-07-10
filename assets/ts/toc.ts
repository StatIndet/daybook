(function () {
  function syncNoteToc(toc: HTMLElement) {
    var button = toc.querySelector(".note-toc-toggle");
    var icon = button && button.querySelector(".material-symbol");
    var isOpen = toc.classList.contains("is-open");

    if (button) {
      button.setAttribute("aria-expanded", isOpen ? "true" : "false");
    }
    if (icon) {
      icon.textContent = isOpen ? "menu_open" : "menu";
    }
  }

  let currentObserver: IntersectionObserver | null = null;
  let initialFrame = 0;
  const desktopTocQuery = window.matchMedia("(min-width: 1281px)");

  function stopTocObserver() {
    if (currentObserver) {
      currentObserver.disconnect();
      currentObserver = null;
    }
    if (initialFrame) {
      window.cancelAnimationFrame(initialFrame);
      initialFrame = 0;
    }
  }

  function ensureTocIndicator(tocPanel: HTMLElement) {
    let indicator = tocPanel.querySelector(".note-toc-indicator") as HTMLElement | null;
    if (!indicator) {
      indicator = document.createElement("div");
      indicator.className = "note-toc-indicator";
    }
    indicator.setAttribute("aria-hidden", "true");

    if (indicator.parentElement !== tocPanel) {
      tocPanel.insertBefore(indicator, tocPanel.firstChild);
    }

    return indicator;
  }

  function initTocObserver() {
    stopTocObserver();

    if (!desktopTocQuery.matches) return;

    const postContent = document.querySelector(".post-content");
    const tocPanel = document.querySelector(".note-toc-panel") as HTMLElement | null;
    const tocList = tocPanel?.querySelector("ol") as HTMLOListElement | null;

    if (!postContent || !tocPanel || !tocList) return;

    const activeTocPanel = tocPanel;
    const activeTocList = tocList;
    const tocIndicator = ensureTocIndicator(activeTocPanel);
    const tocLinks = Array.from(tocPanel.querySelectorAll<HTMLAnchorElement>("a"));
    const tocIds = new Set<string>();

    tocLinks.forEach(function (link) {
      const href = link.getAttribute("href");
      if (href && href.startsWith("#")) {
        tocIds.add(href.slice(1));
      }
    });

    const headings = Array.from(postContent.querySelectorAll<HTMLElement>("h1, h2, h3, h4, h5, h6")).filter(function (heading) {
      return heading.id && tocIds.has(heading.id);
    });
    if (headings.length === 0) return;

    let activeIds: string[] = [];

    tocIndicator.style.height = "1px";

    function updateIndicator(ids: string[], forceUpdate = false) {
      if (ids.length === 0) return;

      if (!forceUpdate && ids.length === activeIds.length && ids.every((val, index) => val === activeIds[index])) {
        return;
      }

      const firstId = ids[0];
      const lastId = ids[ids.length - 1];
      if (!firstId || !lastId) return;

      const firstLink = tocLinks.find(link => link.getAttribute("href") === `#${firstId}`);
      const lastLink = tocLinks.find(link => link.getAttribute("href") === `#${lastId}`);

      const firstLi = firstLink?.parentElement;
      const lastLi = lastLink?.parentElement;

      if (firstLi && lastLi) {
        activeIds = ids;
        tocLinks.forEach(link => link.classList.remove("is-active"));
        firstLink.classList.add("is-active");

        const offsetTop = activeTocList.offsetTop + firstLi.offsetTop;
        const spanHeight = Math.max(1, lastLi.offsetTop + lastLi.offsetHeight - firstLi.offsetTop);

        tocIndicator.style.opacity = "1";
        tocIndicator.style.transform = `translateY(${offsetTop}px) scaleY(${spanHeight})`;
      }
    }

    function visibleHeadingIds() {
      const viewportBottom = window.innerHeight;
      const visibleIds = headings.filter(function (heading) {
        const rect = heading.getBoundingClientRect();
        return rect.bottom >= 0 && rect.top <= viewportBottom;
      }).map(function (heading) {
        return heading.id;
      });

      if (visibleIds.length > 0) {
        return visibleIds;
      }

      const currentId = currentHeadingId();
      return currentId ? [currentId] : [];
    }

    function currentHeadingId() {
      const activationLine = 96;
      let currentId = headings[0]?.id || "";

      headings.forEach(function (heading) {
        if (heading.getBoundingClientRect().top <= activationLine) {
          currentId = heading.id;
        }
      });

      return currentId;
    }

    function showInitialIndicator() {
      updateIndicator(visibleHeadingIds(), true);
    }

    initialFrame = window.requestAnimationFrame(function () {
      initialFrame = window.requestAnimationFrame(function () {
        initialFrame = 0;
        showInitialIndicator();
      });
    });

    if (!("IntersectionObserver" in window)) {
      return;
    }

    const visibleHeadings = new Set<string>();

    currentObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        const id = entry.target.id;
        if (entry.isIntersecting) {
          visibleHeadings.add(id);
        } else {
          visibleHeadings.delete(id);
        }
      });

      if (visibleHeadings.size > 0) {
        const visibleInDom = headings.filter(h => visibleHeadings.has(h.id)).map(h => h.id);
        if (visibleInDom.length > 0) {
          updateIndicator(visibleInDom);
        }
      } else if (activeIds.length === 0) {
        const currentId = currentHeadingId();
        if (currentId) {
          updateIndicator([currentId]);
        }
      }
    }, {
      rootMargin: "0px",
    });

    headings.forEach(h => currentObserver!.observe(h));
  }

  function syncNoteTocs() {
    document.querySelectorAll(".note-toc").forEach(function (tocEl) {
      syncNoteToc(tocEl as HTMLElement);
    });
    initTocObserver();
  }

  window.daybookSyncNoteTocs = syncNoteTocs;
  document.addEventListener("daybook:page-load", syncNoteTocs);
  document.addEventListener("daybook:article-content-swapped", syncNoteTocs);
  desktopTocQuery.addEventListener("change", function () {
    syncNoteTocs();
  });

  document.addEventListener("click", function (event: MouseEvent) {
    var target = event.target as HTMLElement;
    var tocToggle = target.closest(".note-toc-toggle");
    if (!tocToggle) {
      return;
    }

    var toc = tocToggle.closest(".note-toc") as HTMLElement | null;
    if (!toc) {
      return;
    }

    toc.classList.toggle("is-open");
    syncNoteToc(toc);
  });

  syncNoteTocs();
})();
