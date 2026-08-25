(function () {
    const OVERSCAN_BEFORE = 800;
    const OVERSCAN_AFTER = 1200;
    const MAX_STAGGER_DELAY = 15; // wrap at 15 items

    let dataRows: any[] = [];
    let measurements = new Map<string, number>();
    let prefixSums: number[] = [];
    let totalHeight = 0;

    let isMobile = window.innerWidth <= 640;
    let defaultYearHeight = isMobile ? 50 : 80;
    let defaultNoteHeight = isMobile ? 90 : 130;

    let mountedNodes = new Map<string, HTMLElement>();
    let seenRows = new Set<string>();
    
    let listEl: HTMLElement | null = null;
    let windowEl: HTMLElement | null = null;
    let topSpacer: HTMLElement | null = null;
    let bottomSpacer: HTMLElement | null = null;

    let framePending = false;
    let isVirtualMode = false;
    let dataPromise: Promise<void> | null = null;

    let revealObserver: IntersectionObserver | null = null;
    let resizeObserver: ResizeObserver | null = null;

    let anchorCorrectionPending = false;
    
    // Stagger grouping
    let revealGroupIndex = 0;
    let revealGroupResetTimeout: number;

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
        
        dataPromise = fetch(url)
            .then(res => {
                if (!res.ok) throw new Error("Fetch failed");
                return res.json();
            })
            .then(data => {
                dataRows = data.rows || [];
            })
            .catch(err => {
                console.error("Failed to load archive data:", err);
            });
            
        return dataPromise;
    }

    function estimateHeight(row: any) {
        if (measurements.has(row.id)) {
            return measurements.get(row.id)!;
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

    function findRowIndex(offset: number): number {
        if (dataRows.length === 0) return 0;
        let low = 0;
        let high = dataRows.length;
        while (low < high) {
            let mid = Math.floor((low + high) / 2);
            if (prefixSums[mid]! <= offset && prefixSums[mid + 1]! > offset) {
                return mid;
            }
            if (prefixSums[mid]! > offset) {
                high = mid;
            } else {
                low = mid + 1;
            }
        }
        return Math.min(low, dataRows.length - 1);
    }

    function createRowElement(row: any): HTMLElement {
        const div = document.createElement("div");
        div.className = row.type === "year" ? "archive-virtual-row archive-year-row" : "archive-virtual-row archive-item-row";
        if (row.type === "year" && row.isFirstYear) {
            div.classList.add("is-first-year");
        }
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
    
    let saveTimeout: number;
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
            const offsetInRow = localTop - prefixSums[idx]!;
            
            const state = Object.assign({}, history.state || {}, {
                daybookArchive: {
                    anchorId: row.id,
                    anchorOffset: offsetInRow
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
        
        const topHeight = prefixSums[startIdx]!;
        const bottomHeight = totalHeight - prefixSums[endIdx + 1]!;
        
        topSpacer.style.height = `${topHeight}px`;
        bottomSpacer.style.height = `${bottomHeight}px`;
        
        const toKeep = new Set<string>();
        
        // Pin focused element
        let focusedId: string | null = null;
        if (document.activeElement && windowEl.contains(document.activeElement)) {
            const rowEl = document.activeElement.closest(".archive-virtual-row") as HTMLElement;
            if (rowEl && rowEl.dataset.archiveRowId) {
                focusedId = rowEl.dataset.archiveRowId;
                toKeep.add(focusedId);
            }
        }
        
        for (let i = startIdx; i <= endIdx; i++) {
            if (i < 0 || i >= dataRows.length) continue;
            toKeep.add(dataRows[i].id);
        }
        
        // 1. Unmount nodes not in range
        for (const [id, el] of mountedNodes.entries()) {
            if (!toKeep.has(id)) {
                if (resizeObserver) resizeObserver.unobserve(el);
                if (revealObserver) revealObserver.unobserve(el);
                el.remove();
                mountedNodes.delete(id);
            }
        }
        
        // 2. Keyed Reconciliation
        // We append elements in order, using nextSibling to insert cleanly
        const frag = document.createDocumentFragment();
        
        let previousNode: Node | null = null; // We'll trace the list of required elements
        // Wait, simpler approach: we know what order they must be in.
        // We can just iterate the required IDs, and insert them before the next available sibling.
        // If an element is already in the right place, we do nothing.
        
        // Create an array of required IDs in correct order
        const requiredIds: string[] = [];
        if (focusedId && !toKeep.has(focusedId)) {
            // It should be part of toKeep if focused. Wait, we added it to toKeep above.
            // But where does it belong in the sequence if it's outside startIdx..endIdx?
            // To be safe, we just let it be anywhere. Actually, if we just iterate from 0 to dataRows.length and pick the ones in toKeep...
        }
        
        for (let i = 0; i < dataRows.length; i++) {
            if (toKeep.has(dataRows[i].id)) {
                requiredIds.push(dataRows[i].id);
            }
        }
        
        let currentDomNode = windowEl.firstElementChild;
        
        for (let i = 0; i < requiredIds.length; i++) {
            const id = requiredIds[i]!;
            const row = dataRows.find(r => r.id === id);
            if (!row) continue;
            
            let el = mountedNodes.get(id);
            let isNew = false;
            
            if (!el) {
                el = createRowElement(row);
                mountedNodes.set(id, el);
                isNew = true;
                
                if (row.type === "note") {
                    if (seenRows.has(id)) {
                        el.classList.add("is-seen");
                    } else if (document.documentElement.dataset.reducedMotion === "true") {
                        seenRows.add(id);
                        el.classList.add("is-seen");
                    } else {
                        el.classList.add("is-pending-reveal");
                        if (revealObserver) revealObserver.observe(el);
                    }
                }
            }
            
            if (currentDomNode === el) {
                // Already in the right place
                currentDomNode = currentDomNode.nextElementSibling;
            } else {
                // Needs insertion
                windowEl.insertBefore(el, currentDomNode);
                // currentDomNode remains the same, because we inserted BEFORE it
            }
            
            if (isNew && resizeObserver) {
                resizeObserver.observe(el);
            }
        }
        
        // Remove any remaining DOM nodes that somehow aren't in requiredIds (though they should have been removed above)
        while (currentDomNode) {
            const next = currentDomNode.nextElementSibling;
            if (currentDomNode.classList.contains("archive-virtual-row")) {
                currentDomNode.remove(); // Cleanup stray elements just in case
            }
            currentDomNode = next;
        }
    }

    function initRevealObserver() {
        if (revealObserver) revealObserver.disconnect();
        
        revealObserver = new IntersectionObserver((entries) => {
            let anyRevealed = false;
            
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const el = entry.target as HTMLElement;
                    const id = el.dataset.archiveRowId;
                    if (id && !seenRows.has(id)) {
                        seenRows.add(id);
                        el.classList.remove("is-pending-reveal");
                        el.classList.add("reveal-trigger");
                        el.style.setProperty("--stagger-index", String(revealGroupIndex % MAX_STAGGER_DELAY));
                        revealGroupIndex++;
                        anyRevealed = true;
                        revealObserver?.unobserve(el);
                    }
                }
            });
            
            if (anyRevealed) {
                clearTimeout(revealGroupResetTimeout);
                revealGroupResetTimeout = window.setTimeout(() => {
                    revealGroupIndex = 0;
                }, 300);
            }
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
                    anchorOffset = localTop - prefixSums[anchorIdx]!;
                }
            }
            
            for (const entry of entries) {
                const el = entry.target as HTMLElement;
                const id = el.dataset.archiveRowId;
                if (!id) continue;
                
                const currentHeight = entry.borderBoxSize?.[0]?.blockSize || entry.contentRect.height;
                const prevHeight = measurements.get(id);
                // 0.5 epsilon for subpixel noise
                if (prevHeight === undefined || Math.abs(prevHeight - currentHeight) > 0.5) {
                    if (currentHeight > 0) {
                        measurements.set(id, currentHeight);
                        changed = true;
                    }
                }
            }
            
            if (changed) {
                calculatePrefixSums();
                if (anchorIdx >= 0 && !anchorCorrectionPending) {
                    const newLocalTop = prefixSums[anchorIdx]! + anchorOffset;
                    const newScrollY = newLocalTop + getListTop();
                    const diff = newScrollY - getScrollY();
                    
                    if (Math.abs(diff) > 1) {
                        anchorCorrectionPending = true;
                        window.scrollBy(0, diff);
                        // Only clear after frame
                        requestAnimationFrame(() => {
                            anchorCorrectionPending = false;
                        });
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
        
        // 1. Detect if this is a hard reload
        let isReload = false;
        const navEntries = performance.getEntriesByType("navigation");
        if (navEntries.length > 0) {
            const navTiming = navEntries[0] as PerformanceNavigationTiming;
            if (navTiming.type === "reload" || navTiming.type === "navigate") {
                isReload = true;
            }
        }

        // 2. Identify bootstrap elements
        const preMounted = windowEl.querySelectorAll(".archive-virtual-row");
        preMounted.forEach((el) => {
            const htmlEl = el as HTMLElement;
            const id = htmlEl.dataset.archiveRowId;
            if (id) {
                mountedNodes.set(id, htmlEl);
                if (htmlEl.dataset.archiveRowType === "note") {
                    seenRows.add(id);
                }
            }
        });

        // 3. Load Data
        await loadData();
        if (!dataRows || dataRows.length === 0) return;
        
        calculatePrefixSums();

        // 4. Initialize observers
        initRevealObserver();
        initResizeObserver();
        window.addEventListener("resize", measureGlobalResize);

        // 5. Measure pre-mounted
        preMounted.forEach((el) => {
            const htmlEl = el as HTMLElement;
            const id = htmlEl.dataset.archiveRowId;
            if (id) {
                measurements.set(id, htmlEl.getBoundingClientRect().height);
                resizeObserver?.observe(htmlEl);
            }
        });
        calculatePrefixSums();
        
        isVirtualMode = true;
        
        // 6. Handle history restoration
        if (isReload) {
            // Clean up old history state if present
            if (history.state && history.state.daybookArchive) {
                const newState = Object.assign({}, history.state);
                delete newState.daybookArchive;
                history.replaceState(newState, "");
            }
            window.scrollTo(0, 0);
        } else if (history.state && history.state.daybookArchive) {
            const state = history.state.daybookArchive;
            if (state.anchorId) {
                const idx = dataRows.findIndex(r => r.id === state.anchorId);
                if (idx >= 0) {
                    const estimatedLocalTop = prefixSums[idx]! + (state.anchorOffset || 0);
                    // Temporarily set spacers so browser knows scrollHeight
                    topSpacer!.style.height = `${estimatedLocalTop}px`;
                    bottomSpacer!.style.height = `${totalHeight - estimatedLocalTop}px`;
                    
                    window.scrollTo(0, getListTop() + estimatedLocalTop);
                }
            }
        }
        
        // 7. Initial window update and scroll listener
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

    function isArchivePage() {
        return Boolean(document.querySelector(".archive-page"));
    }

    // Protect against double execution if both trigger
    let isInitialized = false;
    function safeInit() {
        if (!isInitialized) {
            isInitialized = true;
            init();
            // Allow re-init on SPA navigation
            document.addEventListener("daybook:page-load", () => {
                cleanup();
                init();
            });
        }
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", safeInit);
    } else {
        safeInit();
    }
})();
