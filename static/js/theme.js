(function () {
  var root = document.documentElement;

  function savedTheme() {
    try {
      return localStorage.getItem("theme");
    } catch (error) {
      return "";
    }
  }

  function savedEyeCare() {
    try {
      return localStorage.getItem("eyeCare");
    } catch (error) {
      return "";
    }
  }

  function storeTheme(theme) {
    try {
      localStorage.setItem("theme", theme);
    } catch (error) {
      // Ignore storage failures so theme switching still works for this page.
    }
  }

  function storeEyeCare(enabled) {
    try {
      localStorage.setItem("eyeCare", enabled ? "true" : "false");
    } catch (error) {
      // Ignore storage failures so theme switching still works for this page.
    }
  }

  function preferredTheme() {
    if (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) {
      return "dark";
    }
    return "light";
  }

  function preferredEyeCare() {
    return savedEyeCare() !== "false";
  }

  function applyTheme(theme, remember) {
    var nextTheme = theme === "dark" ? "dark" : "light";
    root.dataset.theme = nextTheme;

    if (remember) {
      storeTheme(nextTheme);
    }

    document.querySelectorAll(".theme-toggle .material-symbol").forEach(function (icon) {
      icon.textContent = nextTheme === "dark" ? "light_mode" : "dark_mode";
    });
  }

  function applyEyeCare(enabled, remember) {
    var nextEyeCare = enabled !== false;
    root.dataset.eyeCare = nextEyeCare ? "true" : "false";

    if (remember) {
      storeEyeCare(nextEyeCare);
    }

    document.querySelectorAll(".eye-care-toggle").forEach(function (button) {
      button.setAttribute("aria-pressed", nextEyeCare ? "true" : "false");
    });

    document.querySelectorAll(".eye-care-toggle .material-symbol").forEach(function (icon) {
      icon.textContent = nextEyeCare ? "visibility" : "visibility_off";
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

  applyTheme(savedTheme() || preferredTheme(), false);
  applyEyeCare(preferredEyeCare(), false);

  window.daybookSyncThemeButtons = function () {
    applyTheme(root.dataset.theme, false);
    applyEyeCare(root.dataset.eyeCare !== "false", false);
  };

  document.addEventListener("DOMContentLoaded", function () {
    applyTheme(root.dataset.theme, false);
    applyEyeCare(root.dataset.eyeCare !== "false", false);
  });

  document.addEventListener("click", function (event) {
    var themeButton = event.target.closest(".theme-toggle");
    var eyeCareButton = event.target.closest(".eye-care-toggle");

    if (themeButton) {
      var current = root.dataset.theme === "dark" ? "dark" : "light";
      var next = current === "dark" ? "light" : "dark";

      if (!shouldAnimateTheme()) {
        applyTheme(next, true);
        return;
      }

      root.style.setProperty("view-transition-name", "theme-toggle-transition");
      root.dataset.themeChanging = "true";

      var themeTransition = document.startViewTransition(function () {
        applyTheme(next, true);
      });

      themeTransition.finished.then(function () {
        clearThemeTransition("themeChanging");
      }, function () {
        clearThemeTransition("themeChanging");
      });

      return;
    }

    if (!eyeCareButton) {
      return;
    }

    var currentEyeCare = root.dataset.eyeCare !== "false";
    var nextEyeCare = !currentEyeCare;

    if (!shouldAnimateTheme()) {
      applyEyeCare(nextEyeCare, true);
      return;
    }

    root.style.setProperty("view-transition-name", "eye-care-toggle-transition");
    root.dataset.eyeCareChanging = nextEyeCare ? "to-eye-care" : "from-eye-care";

    var eyeCareTransition = document.startViewTransition(function () {
      applyEyeCare(nextEyeCare, true);
    });

    eyeCareTransition.finished.then(function () {
      clearThemeTransition("eyeCareChanging");
    }, function () {
      clearThemeTransition("eyeCareChanging");
    });
  });
})();
