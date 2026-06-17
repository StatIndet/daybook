function drawWave(progress, time) {
  var rect = canvas.getBoundingClientRect();
  // Match internal resolution to display size for sharp rendering (2x for retina)
  var w = rect.width * 2;
  var h = rect.height * 2;
  if (w === 0 || h === 0) return; // Not visible yet
  if (canvas.width !== w) canvas.width = w;
  if (canvas.height !== h) canvas.height = h;

  ctx.clearRect(0, 0, w, h);

  var waveAmp = isPlaying ? 8 : 0; // 2x scaled
  var wavelength = 48; // 2x scaled
  var phase = time / 150;
  var progressX = w * progress;

  ctx.beginPath();
  ctx.moveTo(0, h/2);
  ctx.lineWidth = 4; // 2x scaled
  ctx.lineCap = "round";
  ctx.strokeStyle = "rgba(255, 255, 255, 1)";

  for (var x = 0; x <= progressX; x++) {
    var dampening = Math.min(1, (progressX - x) / wavelength);
    ctx.lineTo(x, h/2 + Math.sin(x / wavelength * Math.PI * 2 - phase) * waveAmp * dampening);
  }
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(progressX, h/2);
  ctx.lineTo(w, h/2);
  ctx.strokeStyle = "rgba(255, 255, 255, 0.4)";
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(progressX, h/2, 8, 0, Math.PI * 2); // 2x scaled thumb
  ctx.fillStyle = "#fff";
  ctx.fill();
}
