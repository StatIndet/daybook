(function () {
  const root = document.documentElement;

  function savedTheme(): string {
    try {
      return localStorage.getItem("theme") || "";
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

  function storeEyeCare(enabled: boolean) {
    try {
      localStorage.setItem("eyeCare", enabled ? "true" : "false");
    } catch (error) {
      // Ignore storage failures so theme switching still works for this page.
    }
  }

  function preferredTheme(): string {
    if (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) {
      return "dark";
    }
    return "light";
  }

  function preferredEyeCare(): boolean {
    return savedEyeCare() !== "false";
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

  function applyEyeCare(enabled: boolean, remember: boolean) {
    const nextEyeCare = enabled !== false;
    root.dataset['eyeCare'] = nextEyeCare ? "true" : "false";

    if (remember) {
      storeEyeCare(nextEyeCare);
    }

    document.querySelectorAll(".eye-care-toggle").forEach(function (button) {
      button.setAttribute("aria-pressed", nextEyeCare ? "true" : "false");
      if (button.getAttribute("role") === "switch") {
        button.setAttribute("aria-checked", nextEyeCare ? "true" : "false");
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

  applyTheme(savedTheme() || preferredTheme(), false);
  applyEyeCare(preferredEyeCare(), false);

  window.daybookSyncThemeButtons = function () {
    applyTheme(root.dataset['theme'] || "", false);
    applyEyeCare(root.dataset['eyeCare'] !== "false", false);
  };

  window.daybookSetTheme = applyTheme;
  window.daybookSetEyeCare = applyEyeCare;
  window.daybookShouldAnimateTheme = shouldAnimateTheme;
  window.daybookClearThemeTransition = clearThemeTransition;

  document.addEventListener("daybook:page-load", function () {
    applyTheme(root.dataset['theme'] || "", false);
    applyEyeCare(root.dataset['eyeCare'] !== "false", false);
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
    const eyeCareButton = target.closest(".eye-care-toggle");

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

    if (!eyeCareButton) {
      return;
    }

    const currentEyeCare = root.dataset['eyeCare'] !== "false";
    const nextEyeCare = !currentEyeCare;

    if (!shouldAnimateTheme()) {
      applyEyeCare(nextEyeCare, true);
      return;
    }

    isTransitioning = true;
    if (eyeCareButton.getAttribute("role") === "switch") {
      eyeCareButton.setAttribute("aria-checked", nextEyeCare ? "true" : "false");
    }

    setTimeout(function () {
      root.style.setProperty("view-transition-name", "eye-care-toggle-transition");
      root.dataset['eyeCareChanging'] = nextEyeCare ? "to-eye-care" : "from-eye-care";

      const eyeCareTransition = document.startViewTransition!(function () {
        applyEyeCare(nextEyeCare, true);
      });

      eyeCareTransition.finished.then(function () {
        clearThemeTransition("eyeCareChanging");
        isTransitioning = false;
      }, function () {
        clearThemeTransition("eyeCareChanging");
        isTransitioning = false;
      });
    }, 350);
  });
})();
