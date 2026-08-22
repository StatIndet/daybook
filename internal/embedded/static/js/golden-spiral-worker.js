// assets/ts/golden-spiral-worker.ts
var easePage = cubicBezier(0.165, 0.84, 0.44, 1);
function cubicBezier(p1x, p1y, p2x, p2y) {
  function calcB(aT, aA1, aA2) {
    return (1 - 3 * aA2 + 3 * aA1) * aT * aT * aT + (3 * aA2 - 6 * aA1) * aT * aT + 3 * aA1 * aT;
  }
  function getTForX(aX) {
    let aGuessT = aX;
    for (let i = 0; i < 4; ++i) {
      const currentSlope = 3 * (1 - 3 * p2x + 3 * p1x) * aGuessT * aGuessT + 2 * (3 * p2x - 6 * p1x) * aGuessT + 3 * p1x;
      if (currentSlope === 0) return aGuessT;
      const currentX = calcB(aGuessT, p1x, p2x) - aX;
      aGuessT -= currentX / currentSlope;
    }
    return aGuessT;
  }
  return function(x) {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    return calcB(getTForX(x), p1y, p2y);
  };
}
var canvas = null;
var ctx = null;
var data = null;
var theme = { rectColor: "rgba(255,255,255,0.1)", diagonalColor: "rgba(255,255,255,0.05)" };
var isRunning = false;
var dpr = 1;
var loopDuration = 1;
var guides = [];
var maxRadius = 1;
onmessage = function(e) {
  const msg = e.data;
  if (msg.type === "init") {
    canvas = msg.canvas;
    ctx = canvas.getContext("2d");
    data = msg.data;
    theme = msg.theme;
    dpr = msg.dpr;
    loopDuration = data.loopDuration;
    maxRadius = data.maxRadius;
    guides = data.guides;
    for (const g of guides) {
      g.totalLength = 0;
      g.segments = [];
      for (let i = 0; i < g.points.length - 1; i++) {
        const p1 = g.points[i];
        const p2 = g.points[i + 1];
        const dx = p2[0] - p1[0];
        const dy = p2[1] - p1[1];
        const len = Math.sqrt(dx * dx + dy * dy);
        g.segments.push({ p1, p2, len });
        g.totalLength += len;
      }
    }
    resizeCanvas(msg.width, msg.height);
    if (msg.reducedMotion) {
      drawReducedMotion();
    } else {
      isRunning = true;
      requestAnimationFrame(drawLoop);
    }
  } else if (msg.type === "resize") {
    dpr = msg.dpr;
    resizeCanvas(msg.width, msg.height);
    if (!isRunning && msg.reducedMotion) {
      drawReducedMotion();
    }
  } else if (msg.type === "theme") {
    theme = msg.theme;
    if (!isRunning && msg.reducedMotion) {
      drawReducedMotion();
    }
  } else if (msg.type === "pause") {
    isRunning = false;
  } else if (msg.type === "resume") {
    if (!isRunning) {
      isRunning = true;
      requestAnimationFrame(drawLoop);
    }
  } else if (msg.type === "destroy") {
    isRunning = false;
    canvas = null;
    ctx = null;
    close();
  }
};
var scale = 1;
function resizeCanvas(w, h) {
  if (!canvas || !ctx) return;
  scale = Math.max(w / 1600, h / 900);
  const canvasWidth = 2 * maxRadius * scale;
  const canvasHeight = 2 * maxRadius * scale;
  canvas.width = canvasWidth * dpr;
  canvas.height = canvasHeight * dpr;
}
function drawPrefix(g, visibleLength) {
  if (visibleLength <= 0 || !ctx) return;
  ctx.beginPath();
  ctx.moveTo(g.points[0][0], g.points[0][1]);
  let remaining = visibleLength;
  for (const seg of g.segments) {
    if (remaining >= seg.len) {
      ctx.lineTo(seg.p2[0], seg.p2[1]);
      remaining -= seg.len;
    } else {
      const ratio = remaining / seg.len;
      ctx.lineTo(
        seg.p1[0] + (seg.p2[0] - seg.p1[0]) * ratio,
        seg.p1[1] + (seg.p2[1] - seg.p1[1]) * ratio
      );
      break;
    }
  }
  ctx.stroke();
}
function drawReducedMotion() {
  if (!ctx || !canvas) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.save();
  ctx.scale(scale * dpr, scale * dpr);
  ctx.translate(maxRadius - data.spinCenterX, maxRadius - data.spinCenterY);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const g of guides) {
    ctx.lineWidth = g.kind === "rect" ? 1 : 0.8;
    ctx.strokeStyle = g.kind === "rect" ? theme.rectColor : theme.diagonalColor;
    ctx.globalAlpha = 1;
    drawPrefix(g, g.totalLength);
  }
  ctx.restore();
}
function drawLoop(time) {
  if (!isRunning || !ctx || !canvas) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const t = time / 1e3 % loopDuration;
  ctx.save();
  ctx.scale(scale * dpr, scale * dpr);
  ctx.translate(maxRadius - data.spinCenterX, maxRadius - data.spinCenterY);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const g of guides) {
    let opacity = 0;
    let progress = 0;
    if (t >= g.growStart && t < g.growFade) {
      const p = (t - g.growStart) / (g.growFade - g.growStart);
      opacity = easePage(p);
      progress = 0;
    } else if (t >= g.growFade && t < g.growEnd) {
      opacity = 1;
      const p = (t - g.growFade) / (g.growEnd - g.growFade);
      progress = easePage(p);
    } else if (t >= g.growEnd && t < g.shrinkStart) {
      opacity = 1;
      progress = 1;
    } else if (t >= g.shrinkStart && t < g.shrinkEnd) {
      opacity = 1;
      const p = (t - g.shrinkStart) / (g.shrinkEnd - g.shrinkStart);
      progress = 1 - easePage(p);
    } else if (t >= g.shrinkEnd && t < g.hideAt) {
      const p = (t - g.shrinkEnd) / (g.hideAt - g.shrinkEnd);
      opacity = 1 - easePage(p);
      progress = 0;
    }
    if (opacity > 0 && progress > 0) {
      ctx.globalAlpha = opacity;
      ctx.lineWidth = g.kind === "rect" ? 1 : 0.8;
      ctx.strokeStyle = g.kind === "rect" ? theme.rectColor : theme.diagonalColor;
      drawPrefix(g, g.totalLength * progress);
    }
  }
  ctx.restore();
  requestAnimationFrame(drawLoop);
}
//# sourceMappingURL=golden-spiral-worker.js.map
