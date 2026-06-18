(function () {
  var katexCssPath = "/vendor/katex/katex.min.css";
  var katexJsPath = "/vendor/katex/katex.min.js";
  var renderPromise = null;

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      if (document.querySelector('script[src="' + src + '"]')) {
        resolve();
        return;
      }
      var script = document.createElement("script");
      script.src = src;
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }

  function loadStyle(href) {
    if (!document.querySelector('link[href="' + href + '"]')) {
      var link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = href;
      document.head.appendChild(link);
    }
  }

  function init() {
    var article = document.querySelector("article.note[data-has-math='true']");
    if (!article) {
      return;
    }

    var mathNodes = article.querySelectorAll(".math[data-tex-b64]");
    if (mathNodes.length === 0) {
      return;
    }

    if (!renderPromise) {
      loadStyle(katexCssPath);
      renderPromise = loadScript(katexJsPath);
    }

    renderPromise.then(function () {
      if (typeof window.katex !== "undefined") {
        mathNodes.forEach(function (node) {
          if (node.classList.contains("math-rendered")) {
            return;
          }
          var b64 = node.getAttribute("data-tex-b64");
          if (!b64) return;
          
          var tex = atob(b64);
          var isDisplay = node.classList.contains("math-display");
          
          try {
            window.katex.render(tex, node, {
              displayMode: isDisplay,
              throwOnError: false,
              strict: "warn",
              trust: false
            });
            node.classList.add("math-rendered");
          } catch (e) {
            console.error("KaTeX render error:", e);
          }
        });
      }
    }).catch(function (err) {
      console.error("Failed to load KaTeX", err);
    });
  }

  window.DaybookMath = {
    init: init
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
