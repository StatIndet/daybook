// assets/ts/graph-loader.ts
(function() {
  const d3AssetPath = "/js/vendor/d3.min.js";
  const graphAssetPath = "/js/graph.js";
  const manifestPath = "/assets-manifest.json";
  let manifestPromise = null;
  let d3Promise = null;
  let graphPromise = null;
  function loadManifest() {
    if (!manifestPromise) {
      manifestPromise = fetch(manifestPath, { credentials: "same-origin" }).then(function(response) {
        if (!response.ok) {
          throw new Error("assets manifest not found");
        }
        return response.json();
      }).catch(function() {
        return {};
      });
    }
    return manifestPromise;
  }
  function assetPath(originalPath) {
    return loadManifest().then(function(manifest) {
      return manifest[originalPath] || originalPath;
    });
  }
  function loadScript(assetPathKey, dataAttr, globalCheck) {
    return assetPath(assetPathKey).then(function(src) {
      return new Promise(function(resolve, reject) {
        const existing = document.querySelector("script[" + dataAttr + "]");
        if (existing) {
          if (globalCheck()) {
            resolve();
            return;
          }
          existing.addEventListener("load", function() {
            if (globalCheck()) {
              resolve();
            } else {
              reject(new Error("Script did not initialize: " + src));
            }
          }, { once: true });
          existing.addEventListener("error", function() {
            reject(new Error("Script failed to load: " + src));
          }, { once: true });
          return;
        }
        const script = document.createElement("script");
        script.async = true;
        script.src = src;
        script.setAttribute(dataAttr, "true");
        script.addEventListener("load", function() {
          if (globalCheck()) {
            resolve();
          } else {
            reject(new Error("Script did not initialize: " + src));
          }
        }, { once: true });
        script.addEventListener("error", function() {
          reject(new Error("Script failed to load: " + src));
        }, { once: true });
        document.head.appendChild(script);
      });
    });
  }
  function loadD3() {
    if (window.d3) return Promise.resolve();
    if (!d3Promise) {
      d3Promise = loadScript(d3AssetPath, "data-daybook-d3", function() {
        return !!window.d3;
      }).catch(function(err) {
        d3Promise = null;
        throw err;
      });
    }
    return d3Promise;
  }
  function loadGraph() {
    if (window.DaybookGraph) return Promise.resolve();
    if (!graphPromise) {
      graphPromise = loadScript(graphAssetPath, "data-daybook-graph", function() {
        return !!window.DaybookGraph;
      }).catch(function(err) {
        graphPromise = null;
        throw err;
      });
    }
    return graphPromise;
  }
  function checkAndInit() {
    const graphShell = document.querySelector(".graph-shell");
    if (!graphShell) {
      if (window.DaybookGraph && typeof window.DaybookGraph.destroy === "function") {
        window.DaybookGraph.destroy();
      }
      return;
    }
    if (graphShell.dataset["graphInitialized"] === "true") {
      return;
    }
    Promise.all([loadD3(), loadGraph()]).then(function() {
      if (window.DaybookGraph && typeof window.DaybookGraph.init === "function") {
        window.DaybookGraph.init(document);
        graphShell.dataset["graphInitialized"] = "true";
      }
    }).catch(function(error) {
      console.error("Failed to load graph dependencies", error);
    });
  }
  let initTimer = 0;
  function scheduleCheck() {
    if (initTimer) window.clearTimeout(initTimer);
    initTimer = window.setTimeout(function() {
      initTimer = 0;
      checkAndInit();
    }, 10);
  }
  document.addEventListener("daybook:page-load", scheduleCheck);
  document.addEventListener("daybook:before-swap", function() {
    if (window.DaybookGraph && typeof window.DaybookGraph.destroy === "function") {
      window.DaybookGraph.destroy();
    }
  });
})();
//# sourceMappingURL=graph-loader.js.map
