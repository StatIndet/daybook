function setupNeteasePlayers() {
  var players = document.querySelectorAll(".netease-custom-player");
  if (players.length === 0) return;

  function formatTime(seconds) {
    if (isNaN(seconds)) return "0:00";
    var m = Math.floor(seconds / 60);
    var s = Math.floor(seconds % 60);
    return m + ":" + (s < 10 ? "0" : "") + s;
  }

  players.forEach(async function(container) {
    var id = container.getAttribute("data-id");
    if (!id) return;

    try {
      var urlRes = await fetch("https://nmapi.dontpanic.fun/song/url?id=" + id + "&realIP=116.25.146.177");
      var urlData = await urlRes.json();
      var songUrl = urlData.data && urlData.data[0] && urlData.data[0].url;

      var detailRes = await fetch("https://nmapi.dontpanic.fun/song/detail?ids=" + id);
      var detailData = await detailRes.json();
      var songDetail = detailData.songs && detailData.songs[0];

      if (!songUrl || !songDetail) {
        container.innerHTML = "<div class='nm-error'>Failed to load song data</div>";
        return;
      }

      var title = songDetail.name;
      var artist = songDetail.ar && songDetail.ar[0] && songDetail.ar[0].name;
      var cover = songDetail.al && songDetail.al.picUrl;

      container.innerHTML = `
        <div class="nm-player">
          <div class="nm-bg" style="background-image: url('${cover}?param=500y500')"></div>
          <div class="nm-overlay"></div>
          <div class="nm-inner">
            <img class="nm-cover" src="${cover}?param=200y200" alt="Cover" crossorigin="anonymous" />
            <div class="nm-body">
              <div class="nm-text">
                <div class="nm-title">${title}</div>
                <div class="nm-artist">${artist}</div>
              </div>
              <div class="nm-time">0:00 / 0:00</div>
              <div class="nm-bottom">
                <canvas class="nm-canvas"></canvas>
              </div>
            </div>
            <button class="nm-playbtn" aria-label="Play">
              <svg class="nm-icon-play" viewBox="0 0 24 24"><path fill="currentColor" d="M8 5v14l11-7z"/></svg>
              <svg class="nm-icon-pause" viewBox="0 0 24 24" style="display:none;"><path fill="currentColor" d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
            </button>
          </div>
          <audio src="${songUrl}" crossorigin="anonymous"></audio>
        </div>
      `;

      var playerWrapper = container.querySelector(".nm-player");
      var audio = container.querySelector("audio");
      var playBtn = container.querySelector(".nm-playbtn");
      var iconPlay = container.querySelector(".nm-icon-play");
      var iconPause = container.querySelector(".nm-icon-pause");
      var timeDiv = container.querySelector(".nm-time");
      var canvas = container.querySelector(".nm-canvas");
      var ctx = canvas.getContext("2d");

      var isPlaying = false;
      var reqId;
      var drag = false;
      var smoothedProgress = 0;

      playBtn.addEventListener("click", function() {
        if (audio.paused) audio.play();
        else audio.pause();
      });

      audio.addEventListener("play", function() {
        isPlaying = true;
        playerWrapper.classList.add("is-playing");
        iconPlay.style.display = "none";
        iconPause.style.display = "block";
        loop();
      });

      audio.addEventListener("pause", function() {
        isPlaying = false;
        playerWrapper.classList.remove("is-playing");
        iconPlay.style.display = "block";
        iconPause.style.display = "none";
      });

      audio.addEventListener("timeupdate", function() {
        if (!drag) timeDiv.textContent = formatTime(audio.currentTime) + " / " + formatTime(audio.duration);
      });

      audio.addEventListener("loadedmetadata", function() {
        timeDiv.textContent = "0:00 / " + formatTime(audio.duration);
        drawWave(0, performance.now());
      });

      canvas.addEventListener("pointerdown", function(e) {
        drag = true;
        updateSeek(e);
      });
      window.addEventListener("pointermove", function(e) {
        if (drag) updateSeek(e);
      });
      window.addEventListener("pointerup", function(e) {
        if (drag) {
          drag = false;
          var rect = canvas.getBoundingClientRect();
          var p = Math.max(0, Math.min(e.clientX - rect.left, rect.width)) / rect.width;
          if (audio.duration) audio.currentTime = p * audio.duration;
        }
      });

      function updateSeek(e) {
        var rect = canvas.getBoundingClientRect();
        var p = Math.max(0, Math.min(e.clientX - rect.left, rect.width)) / rect.width;
        if (audio.duration) timeDiv.textContent = formatTime(p * audio.duration) + " / " + formatTime(audio.duration);
        smoothedProgress = p;
        drawWave(p, performance.now());
      }

      function drawWave(progress, time) {
        var rect = canvas.getBoundingClientRect();
        var w = rect.width * 2;
        var h = rect.height * 2;
        if (w === 0 || h === 0) return; 
        if (canvas.width !== w) canvas.width = w;
        if (canvas.height !== h) canvas.height = h;

        ctx.clearRect(0, 0, w, h);

        var gap = 8;
        var lineWidth = 12;
        var waveAmp = isPlaying ? 5 : 0; 
        var waveFreq = 0.06; 
        var phase = -(time % 1200) / 1200 * Math.PI * 2;
        var progressX = w * progress;

        ctx.beginPath();
        ctx.lineWidth = lineWidth; 
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.strokeStyle = "rgba(255, 255, 255, 1)";

        var startX = lineWidth / 2;
        var endX = Math.max(startX, progressX - (gap + lineWidth / 2));

        if (endX > startX) {
          for (var x = startX; x <= endX; x++) {
            var y = h/2 + Math.sin((x - startX) * waveFreq + phase) * waveAmp;
            if (x === startX) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          ctx.stroke();
        }

        var trackStartX = Math.min(w - lineWidth / 2, progressX + gap);
        ctx.beginPath();
        ctx.moveTo(trackStartX, h/2);
        ctx.lineTo(w - lineWidth / 2, h/2);
        ctx.strokeStyle = "rgba(255, 255, 255, 0.3)";
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(w - lineWidth / 2, h/2, 3, 0, Math.PI * 2); 
        ctx.fillStyle = "rgba(255, 255, 255, 1)";
        ctx.fill();
      }

      function loop(t) {
        var targetProgress = audio.duration ? audio.currentTime / audio.duration : 0;
        if (!drag) {
          smoothedProgress += (targetProgress - smoothedProgress) * 0.15;
        } else {
          smoothedProgress = targetProgress;
        }
        drawWave(smoothedProgress, t || performance.now());

        if (isPlaying || Math.abs(smoothedProgress - targetProgress) > 0.001) {
          reqId = requestAnimationFrame(loop);
        }
      }
    } catch (err) {
      console.error("Netease player error:", err);
      container.innerHTML = "<div class='nm-error'>Failed to load song data</div>";
    }
  });
}
