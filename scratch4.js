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
            <div class="nm-playbtn-wrapper">
              <button class="nm-playbtn" aria-label="Play">
                <span class="material-symbols-rounded nm-icon">play_arrow</span>
              </button>
            </div>
          </div>
          <audio src="${songUrl}" crossorigin="anonymous"></audio>
        </div>
      `;

      var playerWrapper = container.querySelector(".nm-player");
      var audio = container.querySelector("audio");
      var playBtn = container.querySelector(".nm-playbtn");
      var iconSpan = container.querySelector(".nm-icon");
      var timeDiv = container.querySelector(".nm-time");
      var canvas = container.querySelector(".nm-canvas");
      var ctx = canvas.getContext("2d");

      var isPlaying = false;
      var reqId;
      var drag = false;
      var smoothedProgress = 0;

      function swapIcon(name) {
        if (iconSpan.textContent === name) return;
        iconSpan.style.transition = "transform 200ms cubic-bezier(0.3, 0, 1, 1), color 400ms cubic-bezier(0.2, 0, 0, 1)";
        iconSpan.style.transform = "scale(0)";
        setTimeout(function() {
          iconSpan.textContent = name;
          iconSpan.style.transition = "transform 200ms cubic-bezier(0, 0, 0, 1), color 400ms cubic-bezier(0.2, 0, 0, 1)";
          iconSpan.style.transform = "scale(1)";
        }, 200);
      }

      playBtn.addEventListener("click", function() {
        if (audio.paused) audio.play();
        else audio.pause();
      });

      audio.addEventListener("play", function() {
        isPlaying = true;
        playerWrapper.classList.add("is-playing");
        swapIcon("pause");
        loop();
      });

      audio.addEventListener("pause", function() {
        isPlaying = false;
        playerWrapper.classList.remove("is-playing");
        swapIcon("play_arrow");
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
        var lineWidth = 8;
        var waveAmp = 5; 
        var waveFreq = 0.06; 
        var phase = (time % 1200) / 1200 * Math.PI * 2;
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
        } else {
          // Even if paused, we need to animate the wave since the wave never stops!
          reqId = requestAnimationFrame(loop);
        }
      }
    } catch (err) {
      console.error("Netease player error:", err);
      container.innerHTML = "<div class='nm-error'>Failed to load song data</div>";
    }
  });
}
