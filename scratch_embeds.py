import re

with open("assets/ts/embeds.ts", "r") as f:
    content = f.read()

setup_netease_players_start = content.find("function setupNeteasePlayers()")
setup_netease_players_end = content.find("window.daybookSyncEmbeds = function () {", setup_netease_players_start)

replacement = """  function setupNeteasePlayers() {
    var players = document.querySelectorAll(".netease-custom-player");
    if (players.length === 0) return;

    function formatTime(seconds: number) {
      if (isNaN(seconds)) return "0:00";
      var m = Math.floor(seconds / 60);
      var s = Math.floor(seconds % 60);
      return m + ":" + (s < 10 ? "0" : "") + s;
    }

    players.forEach(async function(containerEl) {
      const container = containerEl as HTMLElement;
      if (container.dataset.embedStatus === "loading" || container.dataset.embedStatus === "ready" || container.dataset.embedStatus === "error") return;
      
      container.dataset.embedStatus = "loading";
      
      container.innerHTML = `
        <div class="nm-skeleton embed-skeleton">
          <div class="nm-skeleton-cover"></div>
          <div class="nm-skeleton-body">
            <div class="nm-skeleton-title"></div>
            <div class="nm-skeleton-artist"></div>
            <div class="nm-skeleton-progress"></div>
          </div>
          <div class="nm-skeleton-playbtn"></div>
        </div>
      `;

      var id = container.getAttribute("data-id");
      var autostart = container.getAttribute("data-autostart") === "true";
      if (!id) return;

      let isFinished = false;
      let timer = window.setTimeout(() => {
        if (isFinished) return;
        isFinished = true;
        container.dataset.embedStatus = "error";
        container.innerHTML = "";
        container.appendChild(createFallbackElement({
          message: "加载网易云播放器超时",
          linkText: "点击前往网易云音乐查看",
          linkUrl: "https://music.163.com/#/song?id=" + id
        }));
      }, 10000);

      const neteaseEnabled = document.body.dataset.neteaseEnabled === "true";
      const neteaseApiBaseUrl = document.body.dataset.neteaseApiBaseUrl;

      if (!neteaseEnabled || !neteaseApiBaseUrl) {
        if (isFinished) return;
        isFinished = true;
        window.clearTimeout(timer);
        container.dataset.embedStatus = "error";
        container.innerHTML = "";
        container.appendChild(createFallbackElement({
          message: "未配置或未启用网易云 API 地址",
          linkText: "点击前往网易云音乐查看",
          linkUrl: "https://music.163.com/#/song?id=" + id
        }));
        return;
      }

      const apiBase = neteaseApiBaseUrl.replace(/\\/$/, "");

      try {
        var urlRes = await fetch(apiBase + "/song/url?id=" + id + "&realIP=116.25.146.177");
        var urlData = await urlRes.json();
        var songUrl = urlData.data && urlData.data[0] && urlData.data[0].url;

        var detailRes = await fetch(apiBase + "/song/detail?ids=" + id);
        var detailData = await detailRes.json();
        var songDetail = detailData.songs && detailData.songs[0];

        if (isFinished) return;
        isFinished = true;
        window.clearTimeout(timer);

        if (!songUrl || !songDetail) {
          container.dataset.embedStatus = "error";
          container.innerHTML = "";
          container.appendChild(createFallbackElement({
            message: "无法加载该歌曲音频",
            linkText: "点击前往网易云音乐查看",
            linkUrl: "https://music.163.com/#/song?id=" + id
          }));
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

        var playerWrapper = container.querySelector(".nm-player") as HTMLElement;
        var audio = container.querySelector("audio") as HTMLAudioElement;
        var playBtn = container.querySelector(".nm-playbtn") as HTMLButtonElement;
        var iconSpan = container.querySelector(".nm-icon") as HTMLElement;
        var timeDiv = container.querySelector(".nm-time") as HTMLElement;
        var canvas = container.querySelector(".nm-canvas") as HTMLCanvasElement;
        var ctx = canvas.getContext("2d") as CanvasRenderingContext2D;

        if (!playerWrapper || !audio || !playBtn || !iconSpan || !timeDiv || !canvas || !ctx) return;
        
        container.dataset.embedStatus = "ready";

        var isPlaying = false;
        var reqId: number | null = null;
        var drag = false;
        var smoothedProgress = 0;
        var wavePhase = 0;
        var lastTime = 0;
        var rewinding = false;
        var rewindTime = 0;
        var rewindStart = 0;

        function swapIcon(name: string) {
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
          
          document.dispatchEvent(new CustomEvent('daybook:embed-play', {
            detail: { songId: id }
          }));
          
          lastTime = performance.now();
          if (!reqId) loop(lastTime);
        });

        audio.addEventListener("pause", function() {
          isPlaying = false;
          playerWrapper.classList.remove("is-playing");
          swapIcon("play_arrow");
        });

        audio.addEventListener("ended", function() {
          isPlaying = false;
          playerWrapper.classList.remove("is-playing");
          swapIcon("play_arrow");
          rewinding = true;
          rewindTime = 0;
          rewindStart = smoothedProgress;
          audio.currentTime = 0;
          if (!reqId) {
            lastTime = performance.now();
            loop(lastTime);
          }
        });

        audio.addEventListener("timeupdate", function() {
          if (!drag) timeDiv.textContent = formatTime(audio.currentTime) + " / " + formatTime(audio.duration);
        });

        audio.addEventListener("loadedmetadata", function() {
          timeDiv.textContent = formatTime(audio.currentTime) + " / " + formatTime(audio.duration);
          drawWave(audio.duration ? audio.currentTime / audio.duration : 0, wavePhase);
          if (autostart) {
            audio.play().catch(function(err) {
              console.warn("Autoplay prevented by browser:", err);
            });
          }
        });

        if (audio.readyState >= 1) {
          timeDiv.textContent = formatTime(audio.currentTime) + " / " + formatTime(audio.duration);
          smoothedProgress = audio.duration ? audio.currentTime / audio.duration : 0;
          drawWave(smoothedProgress, wavePhase);
        }

        canvas.addEventListener("pointerdown", function(e: PointerEvent) {
          drag = true;
          rewinding = false;
          updateSeek(e);
        });
        window.addEventListener("pointermove", function(e: PointerEvent) {
          if (drag) updateSeek(e);
        });
        window.addEventListener("pointerup", function(e: PointerEvent) {
          if (drag) {
            drag = false;
            var rect = canvas.getBoundingClientRect();
            var p = Math.max(0, Math.min(e.clientX - rect.left, rect.width)) / rect.width;
            if (audio.duration) audio.currentTime = p * audio.duration;
            if (!reqId) {
              lastTime = performance.now();
              loop(lastTime);
            }
          }
        });

        function updateSeek(e: PointerEvent) {
          var rect = canvas.getBoundingClientRect();
          var p = Math.max(0, Math.min(e.clientX - rect.left, rect.width)) / rect.width;
          if (audio.duration) timeDiv.textContent = formatTime(p * audio.duration) + " / " + formatTime(audio.duration);
          smoothedProgress = p;
          drawWave(p, wavePhase);
        }

        function drawWave(progress: number, time: number) {
          var rect = canvas.getBoundingClientRect();
          var w = rect.width * 2;
          var h = rect.height * 2;
          if (w === 0 || h === 0) return; 
          if (canvas.width !== w) canvas.width = w;
          if (canvas.height !== h) canvas.height = h;

          ctx.clearRect(0, 0, w, h);

          var gap = 10;
          var lineWidth = 10;
          var waveAmp = 5; 
          var waveFreq = 0.08; 
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

        function loop(t: number) {
          var dt = t - (lastTime || t);
          lastTime = t;
          if (isPlaying) {
            wavePhase += dt;
          }

          if (rewinding) {
            rewindTime += dt;
            var p = Math.min(1, rewindTime / 1000);
            var ease = Math.pow(p, 3); // Ease-in: slow at start, fast at end
            smoothedProgress = rewindStart * (1 - ease);
            drawWave(smoothedProgress, wavePhase);
            if (p >= 1) {
              rewinding = false;
              reqId = null;
            } else {
              reqId = requestAnimationFrame(loop);
            }
            return;
          }

          var targetProgress = audio.duration ? audio.currentTime / audio.duration : 0;
          if (!drag) {
            smoothedProgress += (targetProgress - smoothedProgress) * 0.15;
          } else {
            smoothedProgress = targetProgress;
          }
          drawWave(smoothedProgress, wavePhase);

          if (isPlaying || Math.abs(smoothedProgress - targetProgress) > 0.001) {
            reqId = requestAnimationFrame(loop);
          } else {
            reqId = null;
          }
        }
        
        document.addEventListener('daybook:global-play', () => {
          if (!audio.paused) {
            audio.pause();
          }
        });
        
      } catch (err) {
        if (isFinished) return;
        isFinished = true;
        window.clearTimeout(timer);
        console.error("Netease player error:", err);
        container.dataset.embedStatus = "error";
        container.innerHTML = "";
        container.appendChild(createFallbackElement({
          message: "无法加载网易云播放器",
          linkText: "点击前往网易云音乐查看",
          linkUrl: "https://music.163.com/#/song?id=" + id
        }));
      }
    });
  }

"""

new_content = content[:setup_netease_players_start] + replacement + content[setup_netease_players_end:]

with open("assets/ts/embeds.ts", "w") as f:
    f.write(new_content)
