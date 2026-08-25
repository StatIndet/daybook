"use strict";
(() => {
  // assets/ts/archive.ts
  (() => {
    const dataCache = /* @__PURE__ */ new Map();
    function resolveArchiveDataURL() {
      const langStr = document.documentElement.lang;
      if (langStr && langStr !== "zh-CN") {
        const pathParts = window.location.pathname.split("/");
        if (pathParts.length > 1 && pathParts[1] !== "archive") {
          return `/${pathParts[1]}/archive/data.json`;
        }
      }
      return "/archive/data.json";
    }
    function loadArchiveDataset(url) {
      if (dataCache.has(url)) {
        return dataCache.get(url);
      }
      const promise = fetch(url).then((res) => {
        if (!res.ok) throw new Error("Fetch failed");
        return res.json();
      }).then((data) => {
        const rows = data.rows || [];
        const rowById = /* @__PURE__ */ new Map();
        const rowIndexById = /* @__PURE__ */ new Map();
        rows.forEach((r, idx) => {
          rowById.set(r.id, r);
          rowIndexById.set(r.id, idx);
        });
        return { rows, rowById, rowIndexById };
      }).catch((err) => {
        console.error("Failed to load archive data:", err);
        return { rows: [], rowById: /* @__PURE__ */ new Map(), rowIndexById: /* @__PURE__ */ new Map() };
      });
      dataCache.set(url, promise);
      return promise;
    }
    const sessionSeenRows = /* @__PURE__ */ new Set();
    const sessionMeasurements = /* @__PURE__ */ new Map();
    function createArchiveInstance(navType) {
      let destroyed = false;
      let revealEnabled = false;
      let framePending = false;
      let frameId = null;
      let scrollGroupResetTimeout = null;
      let saveTimeout = null;
      let scrollGroupIndex = 0;
      let anchorCorrectionPending = false;
      const MAX_INTRO_STAGGER_INDEX = 15;
      const MAX_SCROLL_STAGGER_INDEX = 10;
      const OVERSCAN_BEFORE = 800;
      const OVERSCAN_AFTER = 1200;
      let isMobile = window.innerWidth <= 640;
      let defaultYearHeight = isMobile ? 50 : 80;
      let defaultNoteHeight = isMobile ? 90 : 130;
      let dataset = null;
      let prefixSums = [];
      let totalHeight = 0;
      const mountedNodes = /* @__PURE__ */ new Map();
      let resizeObserver = null;
      let revealObserver = null;
      const listEl = document.querySelector(".archive-virtual-list");
      const windowEl = document.querySelector(".archive-virtual-window");
      const topSpacer = document.querySelector(".archive-virtual-spacer-top");
      const bottomSpacer = document.querySelector(".archive-virtual-spacer-bottom");
      function getScrollY() {
        return window.scrollY;
      }
      function getListTop() {
        if (!listEl) return 0;
        return listEl.getBoundingClientRect().top + getScrollY();
      }
      function estimateHeight(row) {
        if (sessionMeasurements.has(row.id)) {
          return sessionMeasurements.get(row.id);
        }
        return row.type === "year" ? defaultYearHeight : defaultNoteHeight;
      }
      function calculatePrefixSums() {
        if (!dataset) return;
        const rows = dataset.rows;
        prefixSums = new Array(rows.length + 1);
        prefixSums[0] = 0;
        let sum = 0;
        for (let i = 0; i < rows.length; i++) {
          sum += estimateHeight(rows[i]);
          prefixSums[i + 1] = sum;
        }
        totalHeight = sum;
      }
      function findRowIndex(offset) {
        if (!dataset || dataset.rows.length === 0) return 0;
        let low = 0;
        let high = dataset.rows.length;
        while (low < high) {
          let mid = Math.floor((low + high) / 2);
          if (prefixSums[mid] <= offset && prefixSums[mid + 1] > offset) {
            return mid;
          }
          if (prefixSums[mid] > offset) {
            high = mid;
          } else {
            low = mid + 1;
          }
        }
        return Math.min(low, dataset.rows.length - 1);
      }
      function createRowElement(row) {
        const div = document.createElement("div");
        div.className = row.type === "year" ? "archive-virtual-row archive-year-row" : "archive-virtual-row archive-item-row";
        if (row.isFirstYear) div.classList.add("is-first-year");
        div.dataset.archiveRowId = row.id;
        div.dataset.archiveRowType = row.type;
        if (row.type === "year") {
          const h2 = document.createElement("h2");
          h2.id = `archive-year-${row.year}`;
          h2.textContent = row.year || "";
          div.appendChild(h2);
          const empty = document.createElement("div");
          div.appendChild(empty);
        } else {
          const empty = document.createElement("div");
          empty.setAttribute("aria-hidden", "true");
          div.appendChild(empty);
          const track = document.createElement("div");
          track.className = "archive-item-track";
          const item = document.createElement("div");
          item.className = "archive-item";
          const time = document.createElement("time");
          if (row.date) time.setAttribute("datetime", row.date);
          time.textContent = row.dateShort || "";
          item.appendChild(time);
          const entry = document.createElement("div");
          entry.className = "archive-entry";
          const a = document.createElement("a");
          if (row.url) a.href = row.url;
          a.textContent = row.title || "";
          entry.appendChild(a);
          if (row.readingTime) {
            const rt = document.createElement("span");
            rt.className = "archive-reading-time";
            rt.textContent = row.readingTime;
            entry.appendChild(rt);
          }
          if (row.summary) {
            const p = document.createElement("p");
            p.textContent = row.summary;
            entry.appendChild(p);
          }
          item.appendChild(entry);
          track.appendChild(item);
          div.appendChild(track);
        }
        return div;
      }
      function syncRevealState(el, row) {
        if (row.type !== "note") return;
        if (el.classList.contains("is-intro-revealing") || el.classList.contains("reveal-trigger") || el.classList.contains("is-seen")) {
          return;
        }
        if (sessionSeenRows.has(row.id)) {
          el.classList.add("is-seen");
          el.classList.remove("is-pending-reveal");
          revealObserver?.unobserve(el);
          return;
        }
        el.classList.add("is-pending-reveal");
        el.classList.remove("is-seen");
        if (revealEnabled) {
          revealObserver?.observe(el);
        }
      }
      function triggerReveal(el, staggerIndex, mode) {
        const id = el.dataset.archiveRowId;
        if (!id) return;
        if (el.classList.contains("is-intro-revealing") || el.classList.contains("reveal-trigger") || el.classList.contains("is-seen")) {
          return;
        }
        sessionSeenRows.add(id);
        el.classList.remove("is-pending-reveal");
        revealObserver?.unobserve(el);
        if (document.documentElement.dataset.reducedMotion === "true") {
          el.classList.add("is-seen");
          return;
        }
        const animClass = mode === "intro" ? "is-intro-revealing" : "reveal-trigger";
        el.classList.add(animClass);
        el.style.setProperty("--stagger-index", String(staggerIndex));
        el.addEventListener("animationend", function handler(e) {
          if (destroyed) return;
          if (e.target !== el && !e.target.classList.contains("archive-item")) return;
          el.classList.remove(animClass);
          el.classList.add("is-seen");
          el.removeEventListener("animationend", handler);
        }, { once: true });
      }
      function updateVirtualWindow() {
        if (destroyed || !listEl || !windowEl || !topSpacer || !bottomSpacer || !dataset) return;
        const viewportHeight = window.innerHeight;
        const scrollY = getScrollY();
        const listTop = getListTop();
        const localTop = scrollY - listTop;
        const renderStartY = Math.max(0, localTop - OVERSCAN_BEFORE);
        const renderEndY = localTop + viewportHeight + OVERSCAN_AFTER;
        const startIdx = findRowIndex(renderStartY);
        const endIdx = findRowIndex(renderEndY);
        const topHeight = prefixSums[startIdx];
        const bottomHeight = totalHeight - prefixSums[endIdx + 1];
        topSpacer.style.height = `${topHeight}px`;
        bottomSpacer.style.height = `${bottomHeight}px`;
        const toKeep = /* @__PURE__ */ new Set();
        const requiredIds = [];
        for (let i = startIdx; i <= endIdx; i++) {
          if (i < 0 || i >= dataset.rows.length) continue;
          toKeep.add(dataset.rows[i].id);
          requiredIds.push(dataset.rows[i].id);
        }
        for (const [id, el] of mountedNodes.entries()) {
          if (!toKeep.has(id)) {
            if (resizeObserver) resizeObserver.unobserve(el);
            if (revealObserver) revealObserver.unobserve(el);
            el.remove();
            mountedNodes.delete(id);
          }
        }
        let currentDomNode = windowEl.firstElementChild;
        for (let i = 0; i < requiredIds.length; i++) {
          const id = requiredIds[i];
          const row = dataset.rowById.get(id);
          if (!row) continue;
          let el = mountedNodes.get(id);
          let isNew = false;
          if (!el) {
            el = createRowElement(row);
            mountedNodes.set(id, el);
            isNew = true;
          }
          if (currentDomNode === el) {
            currentDomNode = currentDomNode.nextElementSibling;
          } else {
            windowEl.insertBefore(el, currentDomNode);
          }
          syncRevealState(el, row);
          if (isNew && resizeObserver) {
            resizeObserver.observe(el);
          }
        }
        while (currentDomNode) {
          const next = currentDomNode.nextElementSibling;
          if (currentDomNode.classList.contains("archive-virtual-row")) {
            currentDomNode.remove();
          }
          currentDomNode = next;
        }
      }
      function initRevealObserver() {
        revealObserver = new IntersectionObserver((entries) => {
          let anyRevealed = false;
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              const el = entry.target;
              const id = el.dataset.archiveRowId;
              if (id && !sessionSeenRows.has(id)) {
                const stagger = Math.min(scrollGroupIndex, MAX_SCROLL_STAGGER_INDEX);
                scrollGroupIndex++;
                anyRevealed = true;
                triggerReveal(el, stagger, "scroll");
              }
            }
          });
          if (anyRevealed) {
            if (scrollGroupResetTimeout !== null) clearTimeout(scrollGroupResetTimeout);
            scrollGroupResetTimeout = window.setTimeout(() => {
              scrollGroupIndex = 0;
            }, 300);
          }
        }, { rootMargin: "-40px 0px" });
      }
      function initResizeObserver() {
        resizeObserver = new ResizeObserver((entries) => {
          let changed = false;
          let anchorIdx = -1;
          let anchorOffset = 0;
          if (dataset && listEl) {
            const localTop = getScrollY() - getListTop();
            anchorIdx = findRowIndex(localTop);
            if (anchorIdx >= 0) {
              anchorOffset = localTop - prefixSums[anchorIdx];
            }
          }
          for (const entry of entries) {
            const el = entry.target;
            const id = el.dataset.archiveRowId;
            if (!id) continue;
            const currentHeight = entry.borderBoxSize?.[0]?.blockSize || entry.contentRect.height;
            const prevHeight = sessionMeasurements.get(id);
            if (prevHeight === void 0 || Math.abs(prevHeight - currentHeight) > 0.5) {
              if (currentHeight > 0) {
                sessionMeasurements.set(id, currentHeight);
                changed = true;
              }
            }
          }
          if (changed) {
            calculatePrefixSums();
            if (anchorIdx >= 0 && !anchorCorrectionPending) {
              const newLocalTop = prefixSums[anchorIdx] + anchorOffset;
              const newScrollY = newLocalTop + getListTop();
              const diff = newScrollY - getScrollY();
              if (Math.abs(diff) > 1) {
                anchorCorrectionPending = true;
                window.scrollBy(0, diff);
                requestAnimationFrame(() => {
                  anchorCorrectionPending = false;
                });
              }
            }
            if (!framePending) {
              framePending = true;
              frameId = requestAnimationFrame(() => {
                if (destroyed) return;
                updateVirtualWindow();
                framePending = false;
              });
            }
          }
        });
      }
      function measureGlobalResize() {
        const wasMobile = window.innerWidth <= 640;
        if (wasMobile !== isMobile) {
          isMobile = wasMobile;
          defaultYearHeight = isMobile ? 50 : 80;
          defaultNoteHeight = isMobile ? 90 : 130;
          sessionMeasurements.clear();
          calculatePrefixSums();
          if (!framePending) {
            framePending = true;
            frameId = requestAnimationFrame(() => {
              if (destroyed) return;
              updateVirtualWindow();
              framePending = false;
            });
          }
        }
      }
      function onScroll() {
        if (!framePending) {
          framePending = true;
          frameId = requestAnimationFrame(() => {
            if (destroyed) return;
            updateVirtualWindow();
            framePending = false;
          });
        }
        debouncedSaveAnchor();
      }
      function saveAnchor() {
        if (destroyed || !dataset || !listEl) return;
        const localTop = getScrollY() - getListTop();
        const idx = findRowIndex(localTop);
        if (idx >= 0 && idx < dataset.rows.length) {
          const row = dataset.rows[idx];
          const offset = localTop - prefixSums[idx];
          const currentState = history.state || {};
          const newArchiveState = { anchorId: row.id, anchorOffset: offset };
          if (!currentState.daybookArchive || currentState.daybookArchive.anchorId !== row.id || Math.abs(currentState.daybookArchive.anchorOffset - offset) > 10) {
            history.replaceState({ ...currentState, daybookArchive: newArchiveState }, "");
          }
        }
      }
      function debouncedSaveAnchor() {
        if (saveTimeout !== null) clearTimeout(saveTimeout);
        saveTimeout = window.setTimeout(saveAnchor, 200);
      }
      function syncAllMountedRevealStates() {
        if (!dataset || destroyed) return;
        for (const [id, el] of mountedNodes.entries()) {
          const row = dataset.rowById.get(id);
          if (row) syncRevealState(el, row);
        }
      }
      function runInitialIntro() {
        if (!dataset || destroyed || !windowEl) return;
        let introIndex = 0;
        const vh = window.innerHeight;
        const rows = Array.from(windowEl.children);
        for (const el of rows) {
          const htmlEl = el;
          const id = htmlEl.dataset.archiveRowId;
          if (!id) continue;
          const row = dataset.rowById.get(id);
          if (!row || row.type !== "note") continue;
          if (sessionSeenRows.has(id)) continue;
          const rect = htmlEl.getBoundingClientRect();
          if (rect.bottom > 0 && rect.top < vh) {
            const stagger = Math.min(introIndex, MAX_INTRO_STAGGER_INDEX);
            triggerReveal(htmlEl, stagger, "intro");
            introIndex++;
          }
        }
      }
      async function init() {
        if (!listEl || !windowEl) return;
        if (navType === "initial" || navType === "push") {
          sessionSeenRows.clear();
        }
        let isReload = false;
        let isNavigate = false;
        if (navType === "initial") {
          const navEntries = performance.getEntriesByType("navigation");
          if (navEntries.length > 0) {
            const navTiming = navEntries[0];
            if (navTiming.type === "reload") isReload = true;
            if (navTiming.type === "navigate") isNavigate = true;
          }
        }
        const preMounted = windowEl.querySelectorAll(".archive-virtual-row");
        preMounted.forEach((el) => {
          const htmlEl = el;
          const id = htmlEl.dataset.archiveRowId;
          if (id) mountedNodes.set(id, htmlEl);
        });
        const dataUrl = resolveArchiveDataURL();
        dataset = await loadArchiveDataset(dataUrl);
        if (destroyed) return;
        if (!dataset || dataset.rows.length === 0) return;
        calculatePrefixSums();
        initRevealObserver();
        initResizeObserver();
        window.addEventListener("resize", measureGlobalResize);
        window.addEventListener("scroll", onScroll, { passive: true });
        preMounted.forEach((el) => {
          const htmlEl = el;
          const id = htmlEl.dataset.archiveRowId;
          if (id) {
            sessionMeasurements.set(id, htmlEl.getBoundingClientRect().height);
            resizeObserver?.observe(htmlEl);
          }
        });
        calculatePrefixSums();
        let willRestore = false;
        if (isReload || navType === "initial" && isNavigate) {
          if (history.state && history.state.daybookArchive) {
            const newState = Object.assign({}, history.state);
            delete newState.daybookArchive;
            history.replaceState(newState, "");
          }
          window.scrollTo(0, 0);
        } else if (navType === "traverse" && history.state && history.state.daybookArchive) {
          const state = history.state.daybookArchive;
          if (state.anchorId) {
            const idx = dataset.rowIndexById.get(state.anchorId);
            if (idx !== void 0) {
              const estimatedLocalTop = prefixSums[idx] + (state.anchorOffset || 0);
              topSpacer.style.height = `${estimatedLocalTop}px`;
              bottomSpacer.style.height = `${totalHeight - estimatedLocalTop}px`;
              window.scrollTo(0, getListTop() + estimatedLocalTop);
              willRestore = true;
            }
          }
        }
        updateVirtualWindow();
        if (willRestore) {
          revealEnabled = true;
          syncAllMountedRevealStates();
        } else {
          frameId = requestAnimationFrame(() => {
            if (destroyed) return;
            runInitialIntro();
            revealEnabled = true;
            syncAllMountedRevealStates();
          });
        }
      }
      function destroy() {
        destroyed = true;
        window.removeEventListener("scroll", onScroll);
        window.removeEventListener("resize", measureGlobalResize);
        if (resizeObserver) resizeObserver.disconnect();
        if (revealObserver) revealObserver.disconnect();
        if (frameId !== null) cancelAnimationFrame(frameId);
        if (scrollGroupResetTimeout !== null) clearTimeout(scrollGroupResetTimeout);
        if (saveTimeout !== null) clearTimeout(saveTimeout);
        mountedNodes.clear();
      }
      return { init, destroy };
    }
    let activeArchiveInstance = null;
    function initStatsAnimation() {
      const nums = document.querySelectorAll(".archive-stat-num:not(.anim-done)");
      nums.forEach((el) => {
        const targetAttr = el.getAttribute("data-target");
        if (!targetAttr) return;
        const target = parseInt(targetAttr, 10);
        if (isNaN(target)) return;
        el.classList.add("anim-done");
        const isKFormat = el.getAttribute("data-format") === "k";
        const displayTarget = isKFormat ? target / 1e3 : target;
        const duration = 1200;
        const startTime = performance.now();
        const update = (currentTime) => {
          const elapsed = currentTime - startTime;
          let progress = Math.min(elapsed / duration, 1);
          progress = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
          const current = progress * displayTarget;
          if (isKFormat) {
            el.textContent = current.toFixed(1);
          } else {
            el.textContent = Math.floor(current).toLocaleString();
          }
          if (progress < 1) {
            requestAnimationFrame(update);
          } else {
            el.textContent = isKFormat ? displayTarget.toFixed(1) : displayTarget.toLocaleString();
          }
        };
        requestAnimationFrame(update);
      });
    }
    document.addEventListener("daybook:page-load", (e) => {
      if (activeArchiveInstance) {
        activeArchiveInstance.destroy();
        activeArchiveInstance = null;
      }
      if (!document.querySelector(".archive-page")) {
        return;
      }
      const detail = e.detail || {};
      const navigationType = detail.navigationType || "initial";
      activeArchiveInstance = createArchiveInstance(navigationType);
      activeArchiveInstance.init();
      initStatsAnimation();
    });
    document.addEventListener("daybook:stats-loaded", () => {
      initStatsAnimation();
    });
  })();
})();
