// Worker for rendering Golden Spiral guides on OffscreenCanvas

const easePage = cubicBezier(0.165, 0.84, 0.44, 1);

function cubicBezier(p1x: number, p1y: number, p2x: number, p2y: number) {
  function calcB(aT: number, aA1: number, aA2: number) {
    return ((1.0 - 3.0 * aA2 + 3.0 * aA1) * aT * aT * aT) + (3.0 * aA2 - 6.0 * aA1) * aT * aT + (3.0 * aA1) * aT;
  }
  function getTForX(aX: number) {
    let aGuessT = aX;
    for (let i = 0; i < 4; ++i) {
      const currentSlope = 3.0 * (1.0 - 3.0 * p2x + 3.0 * p1x) * aGuessT * aGuessT + 2.0 * (3.0 * p2x - 6.0 * p1x) * aGuessT + (3.0 * p1x);
      if (currentSlope === 0.0) return aGuessT;
      const currentX = calcB(aGuessT, p1x, p2x) - aX;
      aGuessT -= currentX / currentSlope;
    }
    return aGuessT;
  }
  return function(x: number) {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    return calcB(getTForX(x), p1y, p2y);
  };
}

let canvas: OffscreenCanvas | null = null;
let ctx: OffscreenCanvasRenderingContext2D | null = null;
let data: any = null;
let theme = { rectColor: 'rgba(255,255,255,0.1)', diagonalColor: 'rgba(255,255,255,0.05)' };
let isRunning = false;
let dpr = 1;

let loopDuration = 1;
let guides: any[] = [];
let maxRadius = 1;

onmessage = function(e) {
  const msg = e.data;
  
  if (msg.type === 'init') {
    canvas = msg.canvas;
    ctx = canvas!.getContext('2d') as OffscreenCanvasRenderingContext2D;
    data = msg.data;
    theme = msg.theme;
    dpr = msg.dpr;
    
    loopDuration = data.loopDuration;
    maxRadius = data.maxRadius;
    guides = data.guides;
    
    // Precompute lengths
    for (const g of guides) {
      g.totalLength = 0;
      g.segments = [];
      for (let i = 0; i < g.points.length - 1; i++) {
        const p1 = g.points[i];
        const p2 = g.points[i+1];
        const dx = p2[0] - p1[0];
        const dy = p2[1] - p1[1];
        const len = Math.sqrt(dx*dx + dy*dy);
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
  } else if (msg.type === 'resize') {
    dpr = msg.dpr;
    resizeCanvas(msg.width, msg.height);
    if (!isRunning && msg.reducedMotion) {
      drawReducedMotion();
    }
  } else if (msg.type === 'theme') {
    theme = msg.theme;
    if (!isRunning && msg.reducedMotion) {
      drawReducedMotion();
    }
  } else if (msg.type === 'pause') {
    isRunning = false;
  } else if (msg.type === 'resume') {
    if (!isRunning) {
      isRunning = true;
      requestAnimationFrame(drawLoop);
    }
  } else if (msg.type === 'destroy') {
    isRunning = false;
    canvas = null;
    ctx = null;
    close();
  }
};

let scale = 1;

function resizeCanvas(w: number, h: number) {
  if (!canvas || !ctx) return;
  
  scale = Math.max(w / 1600, h / 900);
  
  const canvasWidth = 2 * maxRadius * scale;
  const canvasHeight = 2 * maxRadius * scale;
  
  canvas.width = canvasWidth * dpr;
  canvas.height = canvasHeight * dpr;
}

function drawPrefix(g: any, visibleLength: number) {
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
  // Map virtual coordinate system to canvas
  // Canvas size is 2*R*scale. Its center is R*scale.
  // We want SpinCenter in virtual coords to map to the center of the canvas.
  // So: screenX = (virtX - SpinCenterX)*scale + R*scale
  // scale and translate:
  ctx.scale(scale * dpr, scale * dpr);
  ctx.translate(maxRadius - data.spinCenterX, maxRadius - data.spinCenterY);
  
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  
  for (const g of guides) {
    ctx.lineWidth = g.kind === 'rect' ? 1.0 : 0.8;
    ctx.strokeStyle = g.kind === 'rect' ? theme.rectColor : theme.diagonalColor;
    
    ctx.globalAlpha = 1.0;
    drawPrefix(g, g.totalLength);
  }
  
  ctx.restore();
}

function drawLoop(time: number) {
  if (!isRunning || !ctx || !canvas) return;
  
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  
  const t = (time / 1000) % loopDuration;
  
  ctx.save();
  ctx.scale(scale * dpr, scale * dpr);
  ctx.translate(maxRadius - data.spinCenterX, maxRadius - data.spinCenterY);
  
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  
  for (const g of guides) {
    let opacity = 0;
    let progress = 0;
    
    if (t >= g.growStart && t < g.growFade) {
      // Fade in
      const p = (t - g.growStart) / (g.growFade - g.growStart);
      opacity = easePage(p);
      progress = 0;
    } else if (t >= g.growFade && t < g.growEnd) {
      // Grow
      opacity = 1;
      const p = (t - g.growFade) / (g.growEnd - g.growFade);
      progress = easePage(p);
    } else if (t >= g.growEnd && t < g.shrinkStart) {
      // Hold
      opacity = 1;
      progress = 1;
    } else if (t >= g.shrinkStart && t < g.shrinkEnd) {
      // Shrink (from end to start)
      opacity = 1;
      const p = (t - g.shrinkStart) / (g.shrinkEnd - g.shrinkStart);
      progress = 1.0 - easePage(p);
    } else if (t >= g.shrinkEnd && t < g.hideAt) {
      // Fade out
      // Wait, is it fading out the empty path?
      // When it's empty, progress is 0. Opacity doesn't matter much.
      // But let's follow the keyframes:
      const p = (t - g.shrinkEnd) / (g.hideAt - g.shrinkEnd);
      opacity = 1.0 - easePage(p);
      progress = 0;
    }
    
    if (opacity > 0 && progress > 0) {
      ctx.globalAlpha = opacity;
      ctx.lineWidth = g.kind === 'rect' ? 1.0 : 0.8;
      ctx.strokeStyle = g.kind === 'rect' ? theme.rectColor : theme.diagonalColor;
      
      drawPrefix(g, g.totalLength * progress);
    }
  }
  
  ctx.restore();
  
  requestAnimationFrame(drawLoop);
}
