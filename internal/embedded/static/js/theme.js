// assets/ts/theme.ts
(function() {
  const root = document.documentElement;
  function savedTheme() {
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
  function storeTheme(theme) {
    try {
      localStorage.setItem("theme", theme);
    } catch (error) {
    }
  }
  function storePalette(palette) {
    try {
      localStorage.setItem("palette", palette);
    } catch (error) {
    }
  }
  function preferredTheme() {
    if (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) {
      return "dark";
    }
    return "light";
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
  function applyTheme(theme, remember) {
    const nextTheme = theme === "dark" ? "dark" : "light";
    root.dataset["theme"] = nextTheme;
    if (remember) {
      storeTheme(nextTheme);
    }
    document.querySelectorAll(".theme-toggle").forEach(function(button) {
      if (button.getAttribute("role") === "switch") {
        button.setAttribute("aria-checked", nextTheme === "dark" ? "true" : "false");
      }
      const icon = button.querySelector(".material-symbol");
      if (icon) {
        icon.textContent = nextTheme === "dark" ? "light_mode" : "dark_mode";
      }
    });
    document.querySelectorAll(".drawer-theme-icon").forEach(function(icon) {
      icon.textContent = nextTheme === "dark" ? "light_mode" : "dark_mode";
    });
    document.querySelectorAll(".theme-switch-text").forEach(function(el) {
      el.textContent = nextTheme === "dark" ? "\u4EAE\u8272\u6A21\u5F0F" : "\u6697\u8272\u6A21\u5F0F";
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
    const themeButton = target.closest(".theme-toggle");
    const paletteButton = target.closest(".palette-toggle");
    if (themeButton) {
      const current = root.dataset["theme"] === "dark" ? "dark" : "light";
      const next = current === "dark" ? "light" : "dark";
      if (!shouldAnimateTheme()) {
        applyTheme(next, true);
        return;
      }
      isTransitioning = true;
      if (themeButton.getAttribute("role") === "switch") {
        themeButton.setAttribute("aria-checked", next === "dark" ? "true" : "false");
      }
      setTimeout(function() {
        root.style.setProperty("view-transition-name", "theme-toggle-transition");
        root.dataset["themeChanging"] = "true";
        const themeTransition = document.startViewTransition(function() {
          applyTheme(next, true);
        });
        themeTransition.finished.then(function() {
          clearThemeTransition("themeChanging");
          isTransitioning = false;
        }, function() {
          clearThemeTransition("themeChanging");
          isTransitioning = false;
        });
      }, 350);
      return;
    }
    if (!paletteButton) {
      return;
    }
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
  });
})();
//# sourceMappingURL=theme.js.map
