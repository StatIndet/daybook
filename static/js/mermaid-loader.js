(function () {
  var mermaidAssetPath = "/js/vendor/mermaid.min.js";
  var manifestPath = "/assets-manifest.json";
  var manifestPromise = null;
  var mermaidPromise = null;
  var renderRun = 0;
  var observedTheme = currentTheme();

  function mermaidBlocks(root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(".mermaid-block"));
  }

  function currentTheme() {
    return document.documentElement.dataset.theme === "dark" ? "dark" : "default";
  }

  function loadManifest() {
    if (!manifestPromise) {
      manifestPromise = fetch(manifestPath, { credentials: "same-origin" })
        .then(function (response) {
          if (!response.ok) {
            throw new Error("assets manifest not found");
          }
          return response.json();
        })
        .catch(function () {
          return {};
        });
    }
    return manifestPromise;
  }

  function assetPath(originalPath) {
    return loadManifest().then(function (manifest) {
      return manifest[originalPath] || originalPath;
    });
  }

  function loadMermaid() {
    if (window.mermaid) {
      return Promise.resolve(window.mermaid);
    }
    if (mermaidPromise) {
      return mermaidPromise;
    }

    mermaidPromise = assetPath(mermaidAssetPath).then(function (src) {
      return new Promise(function (resolve, reject) {
        var existing = document.querySelector("script[data-daybook-mermaid-lib]");
        if (existing) {
          if (window.mermaid) {
            resolve(window.mermaid);
            return;
          }
          existing.addEventListener(
            "load",
            function () {
              if (window.mermaid) {
                resolve(window.mermaid);
              } else {
                reject(new Error("Mermaid library did not initialize."));
              }
            },
            { once: true },
          );
          existing.addEventListener(
            "error",
            function () {
              reject(new Error("Mermaid library failed to load."));
            },
            { once: true },
          );
          return;
        }

        var script = document.createElement("script");
        script.async = true;
        script.src = src;
        script.dataset.daybookMermaidLib = "true";
        script.addEventListener(
          "load",
          function () {
            if (window.mermaid) {
              resolve(window.mermaid);
            } else {
              reject(new Error("Mermaid library did not initialize."));
            }
          },
          { once: true },
        );
        script.addEventListener(
          "error",
          function () {
            reject(new Error("Mermaid library failed to load."));
          },
          { once: true },
        );
        document.head.appendChild(script);
      });
    });

    mermaidPromise = mermaidPromise.catch(function (error) {
      mermaidPromise = null;
      throw error;
    });
    return mermaidPromise;
  }

  function blockSource(block) {
    var code = block.querySelector(".mermaid-source code");
    return code ? code.textContent : "";
  }

  function markError(block, message) {
    var diagram = block.querySelector(".mermaid-diagram");
    var error = block.querySelector(".mermaid-error");

    block.classList.remove("is-rendered");
    block.classList.add("is-error");
    block.dataset.mermaidStatus = "error";

    if (diagram) {
      diagram.innerHTML = "";
      diagram.setAttribute("aria-hidden", "true");
    }
    if (error) {
      error.hidden = false;
      error.textContent = message;
    }
  }

  function clearError(block) {
    var error = block.querySelector(".mermaid-error");
    block.classList.remove("is-error");
    if (error) {
      error.hidden = true;
      error.textContent = "";
    }
  }

  function renderBlock(mermaid, block, index, theme, force) {
    if (!force && block.dataset.mermaidStatus === "rendered" && block.dataset.mermaidTheme === theme) {
      return Promise.resolve();
    }

    var source = blockSource(block);
    if (source.trim() === "") {
      markError(block, "Mermaid source is empty.");
      return Promise.resolve();
    }

    var diagram = block.querySelector(".mermaid-diagram");
    if (!diagram) {
      markError(block, "Mermaid diagram container is missing.");
      return Promise.resolve();
    }

    var token = String(renderRun) + "-" + String(index);
    var id = "daybook-mermaid-" + token;
    block.dataset.mermaidToken = token;
    block.dataset.mermaidStatus = "rendering";
    block.classList.remove("is-rendered");
    clearError(block);
    diagram.innerHTML = "";
    diagram.setAttribute("aria-hidden", "true");

    return Promise.resolve(mermaid.render(id, source))
      .then(function (result) {
        if (block.dataset.mermaidToken !== token) {
          return;
        }

        diagram.innerHTML = result.svg || "";
        if (typeof result.bindFunctions === "function") {
          result.bindFunctions(diagram);
        }
        diagram.removeAttribute("aria-hidden");
        block.classList.add("is-rendered");
        block.dataset.mermaidStatus = "rendered";
        block.dataset.mermaidTheme = theme;
      })
      .catch(function (error) {
        var message = error && error.message ? error.message : "Mermaid render failed.";
        markError(block, message);
      });
  }

  function init(options) {
    var blocks = mermaidBlocks(document);
    if (blocks.length === 0) {
      return Promise.resolve();
    }

    var theme = currentTheme();
    var force = Boolean(options && options.force);
    renderRun += 1;

    return loadMermaid()
      .then(function (mermaid) {
        if (!mermaid || typeof mermaid.initialize !== "function" || typeof mermaid.render !== "function") {
          throw new Error("Mermaid library is not available.");
        }

        mermaid.initialize({
          startOnLoad: false,
          theme: theme,
          securityLevel: "strict",
        });

        return Promise.all(
          blocks.map(function (block, index) {
            return renderBlock(mermaid, block, index, theme, force);
          }),
        );
      })
      .catch(function (error) {
        var message = error && error.message ? error.message : "Mermaid failed to load.";
        blocks.forEach(function (block) {
          markError(block, message);
        });
      });
  }

  function scheduleInit(options) {
    var run = function () {
      init(options);
    };
    if (window.requestAnimationFrame) {
      window.requestAnimationFrame(run);
      return;
    }
    window.setTimeout(run, 0);
  }

  window.DaybookMermaid = {
    init: init,
  };

  if (window.MutationObserver) {
    new MutationObserver(function () {
      var nextTheme = currentTheme();
      if (nextTheme === observedTheme) {
        return;
      }
      observedTheme = nextTheme;
      scheduleInit({ force: true });
    }).observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener(
      "DOMContentLoaded",
      function () {
        scheduleInit();
      },
      { once: true },
    );
  } else {
    scheduleInit();
  }
})();
