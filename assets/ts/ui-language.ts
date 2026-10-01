(() => {
  type UILanguage = "zh_CN" | "en_US";
  const preferenceKey = "daybook-ui-language";

  function normalizeLanguage(value: string | null): UILanguage | null {
    if (!value) return null;
    const language = value.replace("-", "_").toLowerCase();
    if (language === "en_us") return "en_US";
    if (language === "zh_cn") return "zh_CN";
    return null;
  }

  function savedLanguage(): UILanguage | null {
    try { return normalizeLanguage(sessionStorage.getItem(preferenceKey)); }
    catch { return null; }
  }

  function rememberLanguage(language: UILanguage): void {
    try { sessionStorage.setItem(preferenceKey, language); } catch {}
  }

  function isArticle(): boolean {
    return document.body.dataset.pageKind === "note";
  }

  function applyLanguage(language: UILanguage): void {
    const previousLang = document.documentElement.lang;
    const translations = document.getElementById("daybook-ui-translations");
    let dictionary: Record<string, string> = {};
    try {
      dictionary = JSON.parse(translations?.textContent || "{}")[language] || {};
    } catch {}

    document.documentElement.lang = language.replace("_", "-");
    document.documentElement.dataset.uiLanguage = language;
    const attributes: Record<string, string> = {
      "data-ui-aria": "aria-label",
      "data-ui-tooltip": "data-tooltip",
      "data-ui-placeholder": "placeholder",
    };
    document.querySelectorAll<HTMLElement>("[data-ui-text]").forEach(element => {
      const text = dictionary[element.dataset.uiText || ""];
      if (text) element.textContent = text;
    });
    for (const [marker, attribute] of Object.entries(attributes)) {
      document.querySelectorAll<HTMLElement>(`[${marker}]`).forEach(element => {
        const text = dictionary[element.getAttribute(marker) || ""];
        if (text) element.setAttribute(attribute, text);
      });
    }

    const prefix = language === "en_US" ? "/en_US" : "";
    document.querySelectorAll<HTMLAnchorElement>(
      ".side-nav a:not(.lang-toggle), .site-nav a:not(.lang-toggle), .mobile-drawer-nav a:not(.lang-toggle), .side-avatar-link, .note-back-link, .tag-back-btn, .notes-tag-link, .note-tag-capsule",
    ).forEach(link => {
      const url = new URL(link.href, location.href);
      if (url.origin !== location.origin) return;
      const path = url.pathname.replace(/^\/en_US(?=\/)/, "");
      link.href = prefix + path + url.search + url.hash;
    });

    if (isArticle()) {
      const nextLanguage = language === "en_US" ? "zh_CN" : "en_US";
      const url = new URL(location.href);
      url.searchParams.set("ui", nextLanguage);
      document.querySelectorAll<HTMLAnchorElement>(".lang-toggle").forEach(link => {
        link.href = url.pathname + url.search + url.hash;
      });
    }
    rememberLanguage(language);
    window.daybookSyncThemeButtons?.();
    document.dispatchEvent(new CustomEvent("daybook:lang-change", {
      detail: { lang: document.documentElement.lang, previousLang },
    }));
  }

  function syncLanguage(): void {
    const explicit = normalizeLanguage(new URL(location.href).searchParams.get("ui"));
    const routeLanguage: UILanguage = location.pathname.startsWith("/en_US/") ? "en_US" : "zh_CN";
    applyLanguage(isArticle() ? (explicit || savedLanguage() || routeLanguage) : routeLanguage);
  }

  // Capture the interface switch before the SPA router sees it. Translation
  // links in article metadata remain ordinary links to the counterpart article.
  document.addEventListener("click", event => {
    const target = event.target as Element | null;
    const link = target?.closest<HTMLAnchorElement>(".lang-toggle");
    if (!link || !isArticle() || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const language = normalizeLanguage(document.documentElement.lang) === "en_US" ? "zh_CN" : "en_US";
    const url = new URL(location.href);
    url.searchParams.set("ui", language);
    if (window.daybookReplaceURL) window.daybookReplaceURL(url.href);
    else history.replaceState(history.state, "", url.href);
    applyLanguage(language);
  }, true);

  document.addEventListener("daybook:page-load", syncLanguage);
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", syncLanguage, { once: true });
  else syncLanguage();
})();
