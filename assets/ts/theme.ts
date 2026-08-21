(function () {
  const root = document.documentElement;

  // Polyfill translation lookup on client-side for dynamic updates
  // Since we don't have a JS i18n bundle, we'll derive translation from language
  const isEn = window.location.pathname.startsWith('/en');
  
  const translations = {
    'zh-CN': {
      'theme.light': '浅色',
      'theme.dark': '深色',
      'theme.system': '跟随系统',
      'theme.system_light': '跟随系统（浅色）',
      'theme.system_dark': '跟随系统（深色）',
      'palette.cool': '冷色',
      'palette.warm': '暖色',
    },
    'en': {
      'theme.light': 'Light',
      'theme.dark': 'Dark',
      'theme.system': 'System',
      'theme.system_light': 'System (Light)',
      'theme.system_dark': 'System (Dark)',
      'palette.cool': 'Cool',
      'palette.warm': 'Warm',
    }
  };
  
  function T(key: keyof typeof translations['en']): string {
    const lang = isEn ? 'en' : 'zh-CN';
    return translations[lang][key] || key;
  }

  function savedThemeMode(): string {
    try {
      return localStorage.getItem("theme-mode") || "";
    } catch (error) {
      return "";
    }
  }

  function savedLegacyTheme(): string {
    try {
      return localStorage.getItem("theme") || "";
    } catch (error) {
      return "";
    }
  }

  function savedPalette(): string {
    try {
      return localStorage.getItem("palette") || "";
    } catch (error) {
      return "";
    }
  }

  function savedEyeCare(): string {
    try {
      return localStorage.getItem("eyeCare") || "";
    } catch (error) {
      return "";
    }
  }

  function storeThemeMode(mode: string) {
    try {
      localStorage.setItem("theme-mode", mode);
    } catch (error) {
    }
  }

  function storePalette(palette: string) {
    try {
      localStorage.setItem("palette", palette);
    } catch (error) {}
  }

  function getSystemPreferredTheme(): string {
    if (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) {
      return "dark";
    }
    return "light";
  }

  function resolveInitialThemeMode(): string {
    const mode = savedThemeMode();
    if (mode === "system" || mode === "light" || mode === "dark") {
      return mode;
    }
    
    // Legacy migration
    const legacy = savedLegacyTheme();
    if (legacy === "light" || legacy === "dark") {
      storeThemeMode(legacy);
      try { localStorage.removeItem("theme"); } catch(e) {}
      return legacy;
    }
    
    return "system";
  }

  function preferredPalette(): string {
    const palette = savedPalette();
    if (palette === "warm" || palette === "default") return palette;
    
    // Legacy migration
    const legacy = savedEyeCare();
    if (legacy === "true") {
      storePalette("warm");
      try { localStorage.removeItem("eyeCare"); } catch(e) {}
      return "warm";
    } else if (legacy === "false") {
      storePalette("default");
      try { localStorage.removeItem("eyeCare"); } catch(e) {}
      return "default";
    }
    return "default";
  }

  function applyThemeMode(mode: string, remember: boolean) {
    const resolvedTheme = mode === "system" ? getSystemPreferredTheme() : mode;
    
    root.dataset['themeMode'] = mode;
    root.dataset['theme'] = resolvedTheme;

    if (remember) {
      storeThemeMode(mode);
    }
    
    syncThemeButtons();
  }

  function syncThemeButtons() {
    const mode = root.dataset['themeMode'] || "system";
    const resolved = root.dataset['theme'] || "light";

    // Desktop Buttons
    document.querySelectorAll(".theme-toggle").forEach(function (button) {
      if (button.tagName.toLowerCase() === "button") {
        if (mode === "system") {
          button.setAttribute("aria-label", T(`theme.system_${resolved}` as any));
          if (button.hasAttribute("data-tooltip")) {
             button.setAttribute("data-tooltip", T(`theme.system_${resolved}` as any));
          }
        } else {
          button.setAttribute("aria-label", T(`theme.${mode}` as any));
          if (button.hasAttribute("data-tooltip")) {
             button.setAttribute("data-tooltip", T(`theme.${mode}` as any));
          }
        }
      }
    });

    // Mobile Radiogroup
    document.querySelectorAll(".theme-selector-btn").forEach(function(btn) {
      if (btn.getAttribute("data-mode") === mode) {
        btn.setAttribute("aria-checked", "true");
      } else {
        btn.setAttribute("aria-checked", "false");
      }
    });
  }

  function applyPalette(palette: string, remember: boolean) {
    const nextPalette = palette === "warm" ? "warm" : "default";
    root.dataset['palette'] = nextPalette;

    if (remember) {
      storePalette(nextPalette);
    }

    document.querySelectorAll(".palette-toggle").forEach(function (button) {
      button.setAttribute("aria-pressed", nextPalette === "warm" ? "true" : "false");
      
      if (button.hasAttribute("data-tooltip")) {
        button.setAttribute("data-tooltip", T(nextPalette === "warm" ? 'palette.warm' : 'palette.cool'));
      }
      button.setAttribute("aria-label", T(nextPalette === "warm" ? 'palette.warm' : 'palette.cool'));

      if (button.getAttribute("role") === "switch") {
        button.setAttribute("aria-checked", nextPalette === "warm" ? "true" : "false");
      }
    });
  }

  function shouldAnimateTheme(): boolean {
    if (!document.startViewTransition) {
      return false;
    }
    if (!window.matchMedia) {
      return true;
    }
    return !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  function clearThemeTransition(attributeName: string) {
    root.style.removeProperty("view-transition-name");
    delete root.dataset[attributeName];
  }
  
  const initialThemeMode = resolveInitialThemeMode();
  applyThemeMode(initialThemeMode, false);
  
  const resolvedPalette = preferredPalette();
  applyPalette(resolvedPalette, false);

  window.daybookSyncThemeButtons = function () {
    syncThemeButtons();
    applyPalette(root.dataset['palette'] || "default", false);
  };

  // Deprecated usage, but mapping for legacy callers
  window.daybookSetTheme = function(theme: string, remember: boolean) {
    applyThemeMode(theme, remember);
  };
  window.daybookSetPalette = applyPalette;
  window.daybookShouldAnimateTheme = shouldAnimateTheme;
  window.daybookClearThemeTransition = clearThemeTransition;

  document.addEventListener("daybook:page-load", function () {
    applyThemeMode(root.dataset['themeMode'] || "system", false);
    applyPalette(root.dataset['palette'] || "default", false);
  });

  if (window.matchMedia) {
    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", function(e) {
      if (root.dataset['themeMode'] === "system") {
        const newResolved = e.matches ? "dark" : "light";
        if (!shouldAnimateTheme()) {
           root.dataset['theme'] = newResolved;
           syncThemeButtons();
           return;
        }
        
        root.style.setProperty("view-transition-name", "theme-toggle-transition");
        root.dataset['themeChanging'] = "true";
        
        const transition = document.startViewTransition!(function() {
           root.dataset['theme'] = newResolved;
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

  document.addEventListener("pointerdown", function (event: PointerEvent) {
    const target = event.target as HTMLElement | null;
    if (!target) return;
    const switchEl = target.closest(".material-switch");
    if (switchEl) {
      switchEl.classList.add("is-pressed");
    }
  });

  function removePressedState() {
    document.querySelectorAll(".material-switch.is-pressed").forEach(function (el) {
      el.classList.remove("is-pressed");
    });
  }

  document.addEventListener("pointerup", removePressedState);
  document.addEventListener("pointercancel", removePressedState);

  let isTransitioning = false;

  document.addEventListener("click", function (event: MouseEvent) {
    if (isTransitioning) return;

    const target = event.target as HTMLElement | null;
    if (!target) return;

    // Mobile radio buttons
    const selectorBtn = target.closest(".theme-selector-btn");
    if (selectorBtn) {
      const mode = selectorBtn.getAttribute("data-mode");
      if (mode && mode !== root.dataset['themeMode']) {
        const nextResolved = mode === "system" ? getSystemPreferredTheme() : mode;
        const currentResolved = root.dataset['theme'];
        
        if (nextResolved === currentResolved || !shouldAnimateTheme()) {
          applyThemeMode(mode, true);
          return;
        }

        isTransitioning = true;
        setTimeout(function() {
          root.style.setProperty("view-transition-name", "theme-toggle-transition");
          root.dataset['themeChanging'] = "true";
          const transition = document.startViewTransition!(function() {
            applyThemeMode(mode, true);
          });
          transition.finished.then(function() {
            clearThemeTransition("themeChanging");
            isTransitioning = false;
          }, function() {
            clearThemeTransition("themeChanging");
            isTransitioning = false;
          });
        }, 150); // Small delay for mobile indicator visual to move
      }
      return;
    }

    // Desktop toggle button
    const themeButton = target.closest(".theme-toggle");
    if (themeButton) {
      const currentMode = root.dataset['themeMode'] || "system";
      // cycle logic: system -> light -> dark -> system
      const nextMode = currentMode === "system" ? "light" : (currentMode === "light" ? "dark" : "system");
      const nextResolved = nextMode === "system" ? getSystemPreferredTheme() : nextMode;
      const currentResolved = root.dataset['theme'];
      
      if (themeButton) {
         themeButton.classList.remove("clicked");
         // Trigger reflow
         void (themeButton as HTMLElement).offsetWidth;
         themeButton.classList.add("clicked");
      }

      if (nextResolved === currentResolved || !shouldAnimateTheme()) {
        applyThemeMode(nextMode, true);
        return;
      }

      isTransitioning = true;
      setTimeout(function () {
        root.style.setProperty("view-transition-name", "theme-toggle-transition");
        root.dataset['themeChanging'] = "true";

        const themeTransition = document.startViewTransition!(function () {
          applyThemeMode(nextMode, true);
        });

        themeTransition.finished.then(function () {
          clearThemeTransition("themeChanging");
          isTransitioning = false;
        }, function () {
          clearThemeTransition("themeChanging");
          isTransitioning = false;
        });
      }, 350);

      return;
    }

    const paletteButton = target.closest(".palette-toggle");
    if (paletteButton) {
      const currentPalette = root.dataset['palette'] === "warm" ? "warm" : "default";
      const nextPalette = currentPalette === "warm" ? "default" : "warm";

      if (!shouldAnimateTheme()) {
        applyPalette(nextPalette, true);
        return;
      }

      isTransitioning = true;
      if (paletteButton.getAttribute("role") === "switch") {
        paletteButton.setAttribute("aria-checked", nextPalette === "warm" ? "true" : "false");
      }

      setTimeout(function () {
        root.style.setProperty("view-transition-name", "palette-toggle-transition");
        root.dataset['paletteChanging'] = nextPalette === "warm" ? "to-warm" : "from-warm";

        const paletteTransition = document.startViewTransition!(function () {
          applyPalette(nextPalette, true);
        });

        paletteTransition.finished.then(function () {
          clearThemeTransition("paletteChanging");
          isTransitioning = false;
        }, function () {
          clearThemeTransition("paletteChanging");
          isTransitioning = false;
        });
      }, 350);
    }
  });
})();
