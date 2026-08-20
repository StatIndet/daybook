(function () {
  const root = document.documentElement;

  function savedTheme(): string {
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

  function storeTheme(theme: string) {
    try {
      localStorage.setItem("theme", theme);
    } catch (error) {
      // Ignore storage failures so theme switching still works for this page.
    }
  }

  function storePalette(palette: string) {
    try {
      localStorage.setItem("palette", palette);
    } catch (error) {}
  }

  function preferredTheme(): string {
    if (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) {
      return "dark";
    }
    return "light";
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
  function applyTheme(theme: string, remember: boolean) {
    const nextTheme = theme === "dark" ? "dark" : "light";
    root.dataset['theme'] = nextTheme;

    if (remember) {
      storeTheme(nextTheme);
    }

    document.querySelectorAll(".theme-toggle").forEach(function (button) {
      if (button.getAttribute("role") === "switch") {
        button.setAttribute("aria-checked", nextTheme === "dark" ? "true" : "false");
      }
      const icon = button.querySelector(".material-symbol");
      if (icon) {
        icon.textContent = nextTheme === "dark" ? "light_mode" : "dark_mode";
      }
    });

    document.querySelectorAll(".drawer-theme-icon").forEach(function (icon) {
      icon.textContent = nextTheme === "dark" ? "light_mode" : "dark_mode";
    });

    document.querySelectorAll(".theme-switch-text").forEach(function (el) {
      el.textContent = nextTheme === "dark" ? "亮色模式" : "暗色模式";
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

  
  const resolvedTheme = savedTheme() || preferredTheme();
  applyTheme(resolvedTheme, false);
  
  const resolvedPalette = preferredPalette();
  applyPalette(resolvedPalette, false);

  window.daybookSyncThemeButtons = function () {
    applyTheme(root.dataset['theme'] || "", false);
    applyPalette(root.dataset['palette'] || "default", false);
  };

  window.daybookSetTheme = applyTheme;
  window.daybookSetPalette = applyPalette;
  window.daybookShouldAnimateTheme = shouldAnimateTheme;
  window.daybookClearThemeTransition = clearThemeTransition;

  document.addEventListener("daybook:page-load", function () {
    applyTheme(root.dataset['theme'] || "", false);
    applyPalette(root.dataset['palette'] || "default", false);
  });

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

    const themeButton = target.closest(".theme-toggle");
    const paletteButton = target.closest(".palette-toggle");

    if (themeButton) {
      const current = root.dataset['theme'] === "dark" ? "dark" : "light";
      const next = current === "dark" ? "light" : "dark";

      if (!shouldAnimateTheme()) {
        applyTheme(next, true);
        return;
      }

      isTransitioning = true;
      if (themeButton.getAttribute("role") === "switch") {
        themeButton.setAttribute("aria-checked", next === "dark" ? "true" : "false");
      }

      setTimeout(function () {
        root.style.setProperty("view-transition-name", "theme-toggle-transition");
        root.dataset['themeChanging'] = "true";

        const themeTransition = document.startViewTransition!(function () {
          applyTheme(next, true);
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

    if (!paletteButton) {
      return;
    }

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
  });
})();
