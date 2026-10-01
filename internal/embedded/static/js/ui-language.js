"use strict";
(() => {
  // assets/ts/ui-language.ts
  (() => {
    const preferenceKey = "daybook-ui-language";
    function normalizeLanguage(value) {
      if (!value) return null;
      const language = value.replace("-", "_").toLowerCase();
      if (language === "en_us") return "en_US";
      if (language === "zh_cn") return "zh_CN";
      return null;
    }
    function savedLanguage() {
      try {
        return normalizeLanguage(sessionStorage.getItem(preferenceKey));
      } catch {
        return null;
      }
    }
    function rememberLanguage(language) {
      try {
        sessionStorage.setItem(preferenceKey, language);
      } catch {
      }
    }
    function isArticle() {
      return document.body.dataset.pageKind === "note";
    }
    function applyLanguage(language) {
      const previousLang = document.documentElement.lang;
      const translations = document.getElementById("daybook-ui-translations");
      let dictionary = {};
      try {
        dictionary = JSON.parse(translations?.textContent || "{}")[language] || {};
      } catch {
      }
      document.documentElement.lang = language.replace("_", "-");
      document.documentElement.dataset.uiLanguage = language;
      const attributes = {
        "data-ui-aria": "aria-label",
        "data-ui-tooltip": "data-tooltip",
        "data-ui-placeholder": "placeholder"
      };
      document.querySelectorAll("[data-ui-text]").forEach((element) => {
        const text = dictionary[element.dataset.uiText || ""];
        if (text) element.textContent = text;
      });
      for (const [marker, attribute] of Object.entries(attributes)) {
        document.querySelectorAll(`[${marker}]`).forEach((element) => {
          const text = dictionary[element.getAttribute(marker) || ""];
          if (text) element.setAttribute(attribute, text);
        });
      }
      const prefix = language === "en_US" ? "/en_US" : "";
      document.querySelectorAll(
        ".side-nav a:not(.lang-toggle), .site-nav a:not(.lang-toggle), .mobile-drawer-nav a:not(.lang-toggle), .side-avatar-link, .note-back-link, .tag-back-btn, .notes-tag-link, .note-tag-capsule"
      ).forEach((link) => {
        const url = new URL(link.href, location.href);
        if (url.origin !== location.origin) return;
        const path = url.pathname.replace(/^\/en_US(?=\/)/, "");
        link.href = prefix + path + url.search + url.hash;
      });
      if (isArticle()) {
        const nextLanguage = language === "en_US" ? "zh_CN" : "en_US";
        const url = new URL(location.href);
        url.searchParams.set("ui", nextLanguage);
        document.querySelectorAll(".lang-toggle").forEach((link) => {
          link.href = url.pathname + url.search + url.hash;
        });
      }
      rememberLanguage(language);
      window.daybookSyncThemeButtons?.();
      document.dispatchEvent(new CustomEvent("daybook:lang-change", {
        detail: { lang: document.documentElement.lang, previousLang }
      }));
    }
    function syncLanguage() {
      const explicit = normalizeLanguage(new URL(location.href).searchParams.get("ui"));
      const routeLanguage = location.pathname.startsWith("/en_US/") ? "en_US" : "zh_CN";
      applyLanguage(isArticle() ? explicit || savedLanguage() || routeLanguage : routeLanguage);
    }
    document.addEventListener("click", (event) => {
      const target = event.target;
      const link = target?.closest(".lang-toggle");
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
})();
