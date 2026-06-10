(function () {
  var root = document.documentElement;

  function savedTheme() {
    try {
      return localStorage.getItem("theme");
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

  function preferredTheme() {
    if (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) {
      return "dark";
    }
    return "light";
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

  applyTheme(savedTheme() || preferredTheme(), false);
  window.daybookSyncThemeButtons = function () {
    applyTheme(root.dataset.theme, false);
  };

  document.addEventListener("DOMContentLoaded", function () {
    applyTheme(root.dataset.theme, false);
  });

  document.addEventListener("click", function (event) {
    var button = event.target.closest(".theme-toggle");
    if (!button) {
      return;
    }

    var current = root.dataset.theme === "dark" ? "dark" : "light";
    applyTheme(current === "dark" ? "light" : "dark", true);
  });
})();
