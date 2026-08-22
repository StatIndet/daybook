// assets/ts/golden-spiral-controller.ts
var currentWorker = null;
var currentCanvas = null;
function getThemeColors() {
  const dummy = document.createElement("div");
  dummy.className = "golden-rect";
  dummy.style.display = "none";
  document.body.appendChild(dummy);
  const dummy2 = document.createElement("div");
  dummy2.className = "golden-diagonal";
  dummy2.style.display = "none";
  document.body.appendChild(dummy2);
  const rectColor = getComputedStyle(dummy).stroke || "rgba(255,255,255,0.1)";
  const diagonalColor = getComputedStyle(dummy2).stroke || "rgba(255,255,255,0.05)";
  document.body.removeChild(dummy);
  document.body.removeChild(dummy2);
  return { rectColor, diagonalColor };
}
function initGoldenSpiral() {
  const canvas = document.getElementById("golden-guides-canvas");
  if (currentWorker) {
    if (canvas && currentCanvas === canvas) {
      return;
    }
    currentWorker.postMessage({ type: "destroy" });
    currentWorker = null;
    currentCanvas = null;
  }
  if (!canvas) return;
  const stage = document.getElementById("golden-guides-stage");
  if (stage && getComputedStyle(stage).display === "none") {
    return;
  }
  const dataScript = document.getElementById("golden-spiral-data");
  if (!dataScript) return;
  const data = JSON.parse(dataScript.textContent || "{}");
  const workerURL = canvas.dataset.workerUrl;
  if (!workerURL) return;
  const worker = new Worker(workerURL);
  currentWorker = worker;
  currentCanvas = canvas;
  const offscreen = canvas.transferControlToOffscreen();
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const stageRect = stage.getBoundingClientRect();
  worker.postMessage({
    type: "init",
    canvas: offscreen,
    data,
    theme: getThemeColors(),
    dpr: Math.min(window.devicePixelRatio || 1, 2),
    width: stageRect.width,
    height: stageRect.height,
    reducedMotion
  }, [offscreen]);
  function updateCanvasCSS(rect) {
    const scale = Math.max(rect.width / 1600, rect.height / 900);
    const canvasWidth = 2 * data.maxRadius * scale;
    const canvasHeight = 2 * data.maxRadius * scale;
    canvas.style.width = `${canvasWidth}px`;
    canvas.style.height = `${canvasHeight}px`;
    const spinX_screen = (rect.width - 1600 * scale) / 2 + data.spinCenterX * scale;
    const spinY_screen = (rect.height - 900 * scale) / 2 + data.spinCenterY * scale;
    canvas.style.left = `${spinX_screen - canvasWidth / 2}px`;
    canvas.style.top = `${spinY_screen - canvasHeight / 2}px`;
  }
  updateCanvasCSS(stageRect);
  function onResize() {
    if (!currentWorker || !stage) return;
    const rect = stage.getBoundingClientRect();
    updateCanvasCSS(rect);
    currentWorker.postMessage({
      type: "resize",
      width: rect.width,
      height: rect.height,
      dpr: Math.min(window.devicePixelRatio || 1, 2),
      reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches
    });
  }
  function onVisibilityChange() {
    if (!currentWorker) return;
    if (document.hidden) {
      currentWorker.postMessage({ type: "pause" });
    } else {
      currentWorker.postMessage({ type: "resume" });
    }
  }
  window.addEventListener("resize", onResize);
  document.addEventListener("visibilitychange", onVisibilityChange);
  const themeObserver = new MutationObserver(() => {
    if (currentWorker) {
      currentWorker.postMessage({
        type: "theme",
        theme: getThemeColors(),
        reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches
      });
    }
  });
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "class"] });
  const cleanup = () => {
    window.removeEventListener("resize", onResize);
    document.removeEventListener("visibilitychange", onVisibilityChange);
    themeObserver.disconnect();
    if (currentWorker) {
      currentWorker.postMessage({ type: "destroy" });
      currentWorker = null;
      currentCanvas = null;
    }
    document.removeEventListener("daybook:before-swap", cleanup);
  };
  document.addEventListener("daybook:before-swap", cleanup);
}
export {
  initGoldenSpiral
};
//# sourceMappingURL=golden-spiral-controller.js.map
