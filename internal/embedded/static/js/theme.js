// assets/ts/theme.ts
(function() {
  const root = document.documentElement;
  const isEn = window.location.pathname.startsWith("/en");
  const translations = {
    "zh-CN": {
      "theme.light": "\u6D45\u8272",
      "theme.dark": "\u6DF1\u8272",
      "theme.system": "\u8DDF\u968F\u7CFB\u7EDF",
      "theme.system_light": "\u8DDF\u968F\u7CFB\u7EDF\uFF08\u6D45\u8272\uFF09",
      "theme.system_dark": "\u8DDF\u968F\u7CFB\u7EDF\uFF08\u6DF1\u8272\uFF09",
      "palette.cool": "\u51B7\u8272",
      "palette.warm": "\u6696\u8272"
    },
    "en": {
      "theme.light": "Light",
      "theme.dark": "Dark",
      "theme.system": "System",
      "theme.system_light": "System (Light)",
      "theme.system_dark": "System (Dark)",
      "palette.cool": "Cool",
      "palette.warm": "Warm"
    }
  };
  function T(key) {
    const lang = isEn ? "en" : "zh-CN";
    return translations[lang][key] || key;
  }
  function savedThemeMode() {
    try {
      return localStorage.getItem("theme-mode") || "";
    } catch (error) {
      return "";
    }
  }
  function savedLegacyTheme() {
    try {
      return localStorage.getItem("theme") || "";
    } catch (error) {
      return "";
    }
  }
  function savedPalette() {
    try {
      return localStorage.getItem("palette") || "";
    } catch (error) {
      return "";
    }
  }
  function savedEyeCare() {
    try {
      return localStorage.getItem("eyeCare") || "";
    } catch (error) {
      return "";
    }
  }
  function storeThemeMode(mode) {
    try {
      localStorage.setItem("theme-mode", mode);
    } catch (error) {
    }
  }
  function storePalette(palette) {
    try {
      localStorage.setItem("palette", palette);
    } catch (error) {
    }
  }
  function getSystemPreferredTheme() {
    if (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) {
      return "dark";
    }
    return "light";
  }
  function resolveInitialThemeMode() {
    const mode = savedThemeMode();
    if (mode === "system" || mode === "light" || mode === "dark") {
      return mode;
    }
    const legacy = savedLegacyTheme();
    if (legacy === "light" || legacy === "dark") {
      storeThemeMode(legacy);
      try {
        localStorage.removeItem("theme");
      } catch (e) {
      }
      return legacy;
    }
    return "system";
  }
  function preferredPalette() {
    const palette = savedPalette();
    if (palette === "warm" || palette === "default") return palette;
    const legacy = savedEyeCare();
    if (legacy === "true") {
      storePalette("warm");
      try {
        localStorage.removeItem("eyeCare");
      } catch (e) {
      }
      return "warm";
    } else if (legacy === "false") {
      storePalette("default");
      try {
        localStorage.removeItem("eyeCare");
      } catch (e) {
      }
      return "default";
    }
    return "default";
  }
  function applyThemeMode(mode, remember) {
    const resolvedTheme = mode === "system" ? getSystemPreferredTheme() : mode;
    root.dataset["themeMode"] = mode;
    root.dataset["theme"] = resolvedTheme;
    if (remember) {
      storeThemeMode(mode);
    }
    syncThemeButtons();
  }
  function syncThemeButtons() {
    const mode = root.dataset["themeMode"] || "system";
    const resolved = root.dataset["theme"] || "light";
    document.querySelectorAll(".theme-toggle").forEach(function(button) {
      if (button.tagName.toLowerCase() === "button") {
        if (mode === "system") {
          button.setAttribute("aria-label", T(`theme.system_${resolved}`));
          if (button.hasAttribute("data-tooltip")) {
            button.setAttribute("data-tooltip", T(`theme.system_${resolved}`));
          }
        } else {
          button.setAttribute("aria-label", T(`theme.${mode}`));
          if (button.hasAttribute("data-tooltip")) {
            button.setAttribute("data-tooltip", T(`theme.${mode}`));
          }
        }
      }
    });
    document.querySelectorAll(".theme-selector-btn").forEach(function(btn) {
      if (btn.getAttribute("data-mode") === mode) {
        btn.setAttribute("aria-checked", "true");
      } else {
        btn.setAttribute("aria-checked", "false");
      }
    });
  }
  function applyPalette(palette, remember) {
    const nextPalette = palette === "warm" ? "warm" : "default";
    root.dataset["palette"] = nextPalette;
    if (remember) {
      storePalette(nextPalette);
    }
    document.querySelectorAll(".palette-toggle").forEach(function(button) {
      button.setAttribute("aria-pressed", nextPalette === "warm" ? "true" : "false");
      if (button.hasAttribute("data-tooltip")) {
        button.setAttribute("data-tooltip", T(nextPalette === "warm" ? "palette.warm" : "palette.cool"));
      }
      button.setAttribute("aria-label", T(nextPalette === "warm" ? "palette.warm" : "palette.cool"));
      if (button.getAttribute("role") === "switch") {
        button.setAttribute("aria-checked", nextPalette === "warm" ? "true" : "false");
      }
    });
  }
  function shouldAnimateTheme() {
    if (!document.startViewTransition) {
      return false;
    }
    if (!window.matchMedia) {
      return true;
    }
    return !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }
  function clearThemeTransition(attributeName) {
    root.style.removeProperty("view-transition-name");
    delete root.dataset[attributeName];
  }
  const initialThemeMode = resolveInitialThemeMode();
  applyThemeMode(initialThemeMode, false);
  const resolvedPalette = preferredPalette();
  applyPalette(resolvedPalette, false);
  window.daybookSyncThemeButtons = function() {
    syncThemeButtons();
    applyPalette(root.dataset["palette"] || "default", false);
  };
  window.daybookSetTheme = function(theme, remember) {
    applyThemeMode(theme, remember);
  };
  window.daybookSetPalette = applyPalette;
  window.daybookShouldAnimateTheme = shouldAnimateTheme;
  window.daybookClearThemeTransition = clearThemeTransition;
  document.addEventListener("daybook:page-load", function() {
    applyThemeMode(root.dataset["themeMode"] || "system", false);
    applyPalette(root.dataset["palette"] || "default", false);
  });
  if (window.matchMedia) {
    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", function(e) {
      if (root.dataset["themeMode"] === "system") {
        const newResolved = e.matches ? "dark" : "light";
        if (!shouldAnimateTheme()) {
          root.dataset["theme"] = newResolved;
          syncThemeButtons();
          return;
        }
        root.style.setProperty("view-transition-name", "theme-toggle-transition");
        root.dataset["themeChanging"] = "true";
        const transition = document.startViewTransition(function() {
          root.dataset["theme"] = newResolved;
          syncThemeButtons();
        });
        transition.finished.then(function() {
          clearThemeTransition("themeChanging");
        }, function() {
          clearThemeTransition("themeChanging");
        });
      }
    });
  }
  document.addEventListener("pointerdown", function(event) {
    const target = event.target;
    if (!target) return;
    const switchEl = target.closest(".material-switch");
    if (switchEl) {
      switchEl.classList.add("is-pressed");
    }
  });
  function removePressedState() {
    document.querySelectorAll(".material-switch.is-pressed").forEach(function(el) {
      el.classList.remove("is-pressed");
    });
  }
  document.addEventListener("pointerup", removePressedState);
  document.addEventListener("pointercancel", removePressedState);
  let isTransitioning = false;
  document.addEventListener("click", function(event) {
    if (isTransitioning) return;
    const target = event.target;
    if (!target) return;
    const selectorBtn = target.closest(".theme-selector-btn");
    if (selectorBtn) {
      const mode = selectorBtn.getAttribute("data-mode");
      if (mode && mode !== root.dataset["themeMode"]) {
        const nextResolved = mode === "system" ? getSystemPreferredTheme() : mode;
        const currentResolved = root.dataset["theme"];
        if (nextResolved === currentResolved || !shouldAnimateTheme()) {
          applyThemeMode(mode, true);
          return;
        }
        isTransitioning = true;
        root.dataset["themeMode"] = mode;
        storeThemeMode(mode);
        syncThemeButtons();
        setTimeout(function() {
          root.style.setProperty("view-transition-name", "theme-toggle-transition");
          root.dataset["themeChanging"] = "true";
          const transition = document.startViewTransition(function() {
            root.dataset["theme"] = nextResolved;
            syncThemeButtons();
          });
          transition.finished.then(function() {
            clearThemeTransition("themeChanging");
            isTransitioning = false;
          }, function() {
            clearThemeTransition("themeChanging");
            isTransitioning = false;
          });
        }, 350);
      }
      return;
    }
    const themeButton = target.closest(".theme-toggle");
    if (themeButton) {
      const currentMode = root.dataset["themeMode"] || "system";
      const nextMode = currentMode === "system" ? "light" : currentMode === "light" ? "dark" : "system";
      const nextResolved = nextMode === "system" ? getSystemPreferredTheme() : nextMode;
      const currentResolved = root.dataset["theme"];
      if (nextResolved === currentResolved || !shouldAnimateTheme()) {
        applyThemeMode(nextMode, true);
        return;
      }
      isTransitioning = true;
      root.style.setProperty("view-transition-name", "theme-toggle-transition");
      root.dataset["themeChanging"] = "true";
      const themeTransition = document.startViewTransition(function() {
        applyThemeMode(nextMode, true);
      });
      themeTransition.finished.then(function() {
        clearThemeTransition("themeChanging");
        isTransitioning = false;
      }, function() {
        clearThemeTransition("themeChanging");
        isTransitioning = false;
      });
      return;
    }
    const paletteButton = target.closest(".palette-toggle");
    if (paletteButton) {
      const currentPalette = root.dataset["palette"] === "warm" ? "warm" : "default";
      const nextPalette = currentPalette === "warm" ? "default" : "warm";
      if (!shouldAnimateTheme()) {
        applyPalette(nextPalette, true);
        return;
      }
      isTransitioning = true;
      if (paletteButton.getAttribute("role") === "switch") {
        paletteButton.setAttribute("aria-checked", nextPalette === "warm" ? "true" : "false");
      }
      setTimeout(function() {
        root.style.setProperty("view-transition-name", "palette-toggle-transition");
        root.dataset["paletteChanging"] = nextPalette === "warm" ? "to-warm" : "from-warm";
        const paletteTransition = document.startViewTransition(function() {
          applyPalette(nextPalette, true);
        });
        paletteTransition.finished.then(function() {
          clearThemeTransition("paletteChanging");
          isTransitioning = false;
        }, function() {
          clearThemeTransition("paletteChanging");
          isTransitioning = false;
        });
      }, 350);
    }
  });
})();
//# sourceMappingURL=theme.js.map
