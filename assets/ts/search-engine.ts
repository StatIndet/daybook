(() => {
    interface SearchDataset {
        flattened: any[];
    }

    let searchPromise: Promise<SearchDataset> | null = null;

    function lower(str: string): string {
        return (str || "").toLowerCase();
    }

    function loadSearchIndex(): Promise<SearchDataset> {
        if (searchPromise) return searchPromise;

        searchPromise = fetch("/search.json")
            .then(res => {
                if (!res.ok) throw new Error("Search index fetch failed");
                return res.json();
            })
            .then(data => {
                const flattened: any[] = [];
                const currentLang = document.documentElement.lang || "en";
                for (const item of data) {
                    let ver = item.versions[currentLang];
                    if (!ver) {
                        ver = item.versions["zh-CN"] || item.versions["en"];
                    }
                    if (ver) {
                        flattened.push(ver);
                    }
                }
                return { flattened };
            })
            .catch(err => {
                console.error("Failed to load search index:", err);
                searchPromise = null; // allow retry
                return { flattened: [] };
            });

        return searchPromise;
    }

    function searchNotes(query: string, tagSlug?: string): Promise<any[]> {
        return loadSearchIndex().then(dataset => {
            if (!query && !tagSlug) return dataset.flattened;
            const kw = lower(query);
            return dataset.flattened.filter((item: any) => {
                if (tagSlug) {
                    let hasTag = false;
                    for (const tag of (item.tags || [])) {
                        if (tag.toLowerCase().replace(/\s+/g, '-') === tagSlug.toLowerCase()) {
                            hasTag = true;
                            break;
                        }
                    }
                    if (!hasTag && (!item.tagIDs || !item.tagIDs.includes(tagSlug))) {
                        return false;
                    }
                }
                if (kw) {
                    const text = lower(item.title + " " + (item.summary || "") + " " + (item.tags || []).join(" "));
                    if (!text.includes(kw)) {
                        return false;
                    }
                }
                return true;
            });
        });
    }

    interface CollectionContext {
        kind: "notes" | "tag" | "global";
        rootURL: URL;
        tagSlug?: string;
    }

    function getCollectionContext(pathname: string = window.location.pathname): CollectionContext {
        const url = new URL(pathname, window.location.origin);
        let path = url.pathname;
        
        // Normalize pagination
        path = path.replace(/\/page\/\d+\/?$/, '/');

        const parts = path.split("/").filter(Boolean);
        const tagIdx = parts.indexOf("tags");
        if (tagIdx !== -1 && tagIdx + 1 < parts.length) {
            const tagSlug = decodeURIComponent(parts[tagIdx + 1] || '');
            const rootPath = path.substring(0, path.indexOf(`/tags/${parts[tagIdx + 1]}`)) + `/tags/${parts[tagIdx + 1]}/`;
            return {
                kind: "tag",
                tagSlug,
                rootURL: new URL(rootPath, window.location.origin)
            };
        }

        const notesIdx = parts.indexOf("notes");
        if (notesIdx !== -1) {
            const rootPath = path.substring(0, path.indexOf("/notes/")) + "/notes/";
            return {
                kind: "notes",
                rootURL: new URL(rootPath, window.location.origin)
            };
        }

        return {
            kind: "global",
            rootURL: new URL("/", window.location.origin)
        };
    }

    function buildSearchURL(query: string): URL {
        const ctx = getCollectionContext();
        let targetURL: URL;
        
        if (ctx.kind === "global") {
            targetURL = new URL(window.location.pathname, window.location.origin);
        } else {
            targetURL = new URL(ctx.rootURL.href);
        }

        const params = new URLSearchParams(window.location.search);
        if (query) {
            params.set("q", query);
        } else {
            params.delete("q");
        }
        
        const paramsStr = params.toString();
        if (paramsStr) {
            targetURL.search = paramsStr;
        }

        return targetURL;
    }

    function getCurrentQuery(): string {
        return new URLSearchParams(window.location.search).get("q") || "";
    }

    function updateSearchURL(query: string) {
        if (window.daybookReplaceURL) {
            window.daybookReplaceURL(buildSearchURL(query).href);
        }
    }

    function escapeHTML(str: string): string {
        if (!str) return "";
        return str.replace(/[&<>'"]/g, 
            tag => ({
                '&': '&amp;',
                '<': '&lt;',
                '>': '&gt;',
                "'": '&#39;',
                '"': '&quot;'
            }[tag] || tag)
        );
    }

    function highlightMatches(text: string, kw: string): string {
        if (!kw || !text) return escapeHTML(text);
        const lowerText = text.toLowerCase();
        const lowerKw = kw.toLowerCase();
        const idx = lowerText.indexOf(lowerKw);
        if (idx === -1) return escapeHTML(text);
        
        const before = escapeHTML(text.substring(0, idx));
        const match = escapeHTML(text.substring(idx, idx + kw.length));
        const after = escapeHTML(text.substring(idx + kw.length));
        return `${before}<mark class="search-highlight">${match}</mark>${after}`;
    }

    window.daybookSearchEngine = {
        loadSearchIndex,
        searchNotes,
        getCollectionContext,
        buildSearchURL,
        getCurrentQuery,
        updateSearchURL,
        escapeHTML,
        highlightMatches
    };

    function normalizeURL() {
        const params = new URLSearchParams(window.location.search);
        if (params.has("tag") && window.location.pathname.includes("/notes/")) {
            const tag = params.get("tag");
            const newPath = window.location.pathname.replace("/notes/", `/tags/${encodeURIComponent(tag || "")}/`);
            if (window.daybookNavigateTo) {
                window.daybookNavigateTo(newPath);
            }
        }
    }
    
    document.addEventListener("daybook:page-load", () => {
        normalizeURL();
    });
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", normalizeURL);
    } else {
        normalizeURL();
    }
})();
