"use strict";
(() => {
  // assets/ts/archive.ts
  (function() {
    const OVERSCAN_BEFORE = 800;
    const OVERSCAN_AFTER = 1200;
    let dataRows = [];
    let measurements = /* @__PURE__ */ new Map();
    let prefixSums = [];
    let totalHeight = 0;
    let isMobile = window.innerWidth <= 640;
    let defaultYearHeight = isMobile ? 50 : 80;
    let defaultNoteHeight = isMobile ? 90 : 130;
    let mountedNodes = /* @__PURE__ */ new Map();
    let seenRows = /* @__PURE__ */ new Set();
    let listEl = null;
    let windowEl = null;
    let topSpacer = null;
    let bottomSpacer = null;
    let framePending = false;
    let isVirtualMode = false;
    let dataPromise = null;
    let revealObserver = null;
    let resizeObserver = null;
    let anchorCorrectionPending = false;
    function escapeHtml(str) {
      return (str || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
    }
    function isArchivePage() {
      return Boolean(document.querySelector(".archive-page"));
    }
    function initDOM() {
      listEl = document.querySelector(".archive-virtual-list");
      windowEl = document.querySelector(".archive-virtual-window");
      topSpacer = document.querySelector(".archive-virtual-spacer-top");
      bottomSpacer = document.querySelector(".archive-virtual-spacer-bottom");
    }
    async function loadData() {
      if (dataRows.length > 0) return;
      if (dataPromise) return dataPromise;
      let url = "/archive/data.json";
      const langStr = document.documentElement.lang;
      if (langStr && langStr !== "zh-CN") {
        const pathParts = window.location.pathname.split("/");
        if (pathParts.length > 1 && pathParts[1] !== "archive") {
          url = `/${pathParts[1]}/archive/data.json`;
        }
      }
      dataPromise = fetch(url).then((res) => {
        if (!res.ok) throw new Error("Fetch failed");
        return res.json();
      }).then((data) => {
        dataRows = data.rows || [];
      }).catch((err) => {
        console.error("Failed to load archive data:", err);
      });
      return dataPromise;
    }
    function estimateHeight(row) {
      if (measurements.has(row.id)) {
        return measurements.get(row.id);
      }
      return row.type === "year" ? defaultYearHeight : defaultNoteHeight;
    }
    function calculatePrefixSums() {
      prefixSums = new Array(dataRows.length + 1);
      prefixSums[0] = 0;
      let sum = 0;
      for (let i = 0; i < dataRows.length; i++) {
        sum += estimateHeight(dataRows[i]);
        prefixSums[i + 1] = sum;
      }
      totalHeight = sum;
    }
    function getScrollY() {
      return window.scrollY;
    }
    function getListTop() {
      if (!listEl) return 0;
      return listEl.getBoundingClientRect().top + getScrollY();
    }
    function findRowIndex(offset) {
      let low = 0;
      let high = dataRows.length;
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
      return Math.min(low, dataRows.length - 1);
    }
    function createRowElement(row) {
      const div = document.createElement("div");
      div.className = row.type === "year" ? "archive-virtual-row archive-year-row" : `archive-virtual-row archive-item-row ${row.isLastInYear ? "is-last-in-year" : ""}`;
      div.dataset.archiveRowId = row.id;
      div.dataset.archiveRowType = row.type;
      if (row.type === "year") {
        const h2 = document.createElement("h2");
        h2.id = `archive-year-${row.year}`;
        h2.textContent = row.year;
        div.appendChild(h2);
        const empty = document.createElement("div");
        div.appendChild(empty);
      } else {
        div.style.setProperty("--stagger-index", String(row.index));
        const empty = document.createElement("div");
        empty.setAttribute("aria-hidden", "true");
        div.appendChild(empty);
        const track = document.createElement("div");
        track.className = "archive-item-track";
        const item = document.createElement("div");
        item.className = "archive-item";
        const time = document.createElement("time");
        time.setAttribute("datetime", row.date);
        time.textContent = row.dateShort;
        item.appendChild(time);
        const entry = document.createElement("div");
        entry.className = "archive-entry";
        const a = document.createElement("a");
        a.href = row.url;
        a.textContent = row.title;
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
    function onScroll() {
      if (!isVirtualMode) return;
      if (!framePending) {
        framePending = true;
        requestAnimationFrame(() => {
          updateVirtualWindow();
          framePending = false;
        });
      }
      debouncedSaveAnchor();
    }
    let saveTimeout;
    function debouncedSaveAnchor() {
      clearTimeout(saveTimeout);
      saveTimeout = window.setTimeout(saveAnchor, 150);
    }
    function saveAnchor() {
      if (!isVirtualMode || !listEl || dataRows.length === 0) return;
      const localTop = getScrollY() - getListTop();
      if (localTop < 0) return;
      const idx = findRowIndex(localTop);
      if (idx >= 0 && idx < dataRows.length) {
        const row = dataRows[idx];
        const offsetInRow = localTop - prefixSums[idx];
        const state = Object.assign({}, history.state || {}, {
          daybookArchive: {
            anchorId: row.id,
            anchorOffset: offsetInRow,
            scrollY: getScrollY()
          }
        });
        history.replaceState(state, "");
      }
    }
    function updateVirtualWindow() {
      if (!listEl || !windowEl || !topSpacer || !bottomSpacer) return;
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
      let focusedId = null;
      if (document.activeElement && windowEl.contains(document.activeElement)) {
        const rowEl = document.activeElement.closest(".archive-virtual-row");
        if (rowEl && rowEl.dataset.archiveRowId) {
          focusedId = rowEl.dataset.archiveRowId;
          toKeep.add(focusedId);
        }
      }
      for (let i = startIdx; i <= endIdx; i++) {
        if (i < 0 || i >= dataRows.length) continue;
        toKeep.add(dataRows[i].id);
      }
      for (const [id, el] of mountedNodes.entries()) {
        if (!toKeep.has(id)) {
          if (resizeObserver) resizeObserver.unobserve(el);
          if (revealObserver) revealObserver.unobserve(el);
          el.remove();
          mountedNodes.delete(id);
        }
      }
      let nextSibling = null;
      for (let i = startIdx; i <= endIdx; i++) {
        if (i < 0 || i >= dataRows.length) continue;
        const row = dataRows[i];
        let el = mountedNodes.get(row.id);
        if (!el) {
          el = createRowElement(row);
          mountedNodes.set(row.id, el);
          if (resizeObserver) resizeObserver.observe(el);
          if (revealObserver && row.type === "note") {
            if (seenRows.has(row.id)) {
              el.classList.add("is-seen");
            } else {
              revealObserver.observe(el);
            }
          }
        }
        windowEl.appendChild(el);
      }
    }
    function initRevealObserver() {
      if (revealObserver) revealObserver.disconnect();
      revealObserver = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const el = entry.target;
            const id = el.dataset.archiveRowId;
            if (id && !seenRows.has(id)) {
              seenRows.add(id);
              el.classList.add("reveal-trigger");
              revealObserver?.unobserve(el);
            }
          }
        });
      }, { rootMargin: "-40px 0px" });
    }
    function initResizeObserver() {
      if (resizeObserver) resizeObserver.disconnect();
      resizeObserver = new ResizeObserver((entries) => {
        let changed = false;
        let anchorIdx = -1;
        let anchorOffset = 0;
        if (isVirtualMode && listEl) {
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
          const prevHeight = measurements.get(id);
          if (prevHeight !== currentHeight && currentHeight > 0) {
            measurements.set(id, currentHeight);
            changed = true;
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
              setTimeout(() => {
                anchorCorrectionPending = false;
              }, 0);
            }
          }
          if (!framePending) {
            framePending = true;
            requestAnimationFrame(() => {
              updateVirtualWindow();
              framePending = false;
            });
          }
        }
      });
    }
    function measureGlobalResize() {
      const wasMobile = isMobile;
      isMobile = window.innerWidth <= 640;
      if (wasMobile !== isMobile) {
        defaultYearHeight = isMobile ? 50 : 80;
        defaultNoteHeight = isMobile ? 90 : 130;
        measurements.clear();
        calculatePrefixSums();
        if (!framePending) {
          framePending = true;
          requestAnimationFrame(() => {
            updateVirtualWindow();
            framePending = false;
          });
        }
      }
    }
    async function bootstrap() {
      initDOM();
      if (!listEl || !windowEl) return;
      const preMounted = windowEl.querySelectorAll(".archive-virtual-row");
      preMounted.forEach((el) => {
        const htmlEl = el;
        const id = htmlEl.dataset.archiveRowId;
        if (id) {
          mountedNodes.set(id, htmlEl);
          if (htmlEl.dataset.archiveRowType === "note") {
            seenRows.add(id);
          }
        }
      });
      await loadData();
      if (!dataRows || dataRows.length === 0) return;
      calculatePrefixSums();
      initRevealObserver();
      initResizeObserver();
      window.addEventListener("resize", measureGlobalResize);
      preMounted.forEach((el) => {
        const htmlEl = el;
        const id = htmlEl.dataset.archiveRowId;
        if (id) {
          measurements.set(id, htmlEl.getBoundingClientRect().height);
          resizeObserver?.observe(htmlEl);
        }
      });
      calculatePrefixSums();
      isVirtualMode = true;
      let restored = false;
      if (history.state && history.state.daybookArchive) {
        const state = history.state.daybookArchive;
        if (state.anchorId) {
          const idx = dataRows.findIndex((r) => r.id === state.anchorId);
          if (idx >= 0) {
            const localTop = prefixSums[idx] + (state.anchorOffset || 0);
            window.scrollTo(0, getListTop() + localTop);
            restored = true;
          }
        }
      }
      updateVirtualWindow();
      window.addEventListener("scroll", onScroll, { passive: true });
    }
    function cleanup() {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", measureGlobalResize);
      if (resizeObserver) resizeObserver.disconnect();
      if (revealObserver) revealObserver.disconnect();
      mountedNodes.clear();
      isVirtualMode = false;
      framePending = false;
    }
    function init() {
      if (!isArchivePage()) {
        cleanup();
        return;
      }
      bootstrap();
    }
    document.addEventListener("daybook:page-load", init);
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", init);
    } else {
      init();
    }
  })();
})();
