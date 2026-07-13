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

      const neteaseEnabled = document.body.dataset.neteaseEnabled === "true";
      
      if (!neteaseEnabled) {
        container.dataset.embedStatus = "error";
        container.innerHTML = "";
        container.appendChild(createFallbackElement({
          message: "网易云 API 未启用",
          linkText: "点击前往网易云音乐查看",
          linkUrl: "https://music.163.com/#/song?id=" + id
        }));
        return;
      }

      try {
        var meta = await daybookMediaManager.getTrackMetadata(id);

        if (!meta) {
          container.dataset.embedStatus = "error";
          container.innerHTML = "";
          container.appendChild(createFallbackElement({
            message: "无法加载该歌曲信息",
            linkText: "点击前往网易云音乐查看",
            linkUrl: "https://music.163.com/#/song?id=" + id
          }));
          return;
        }

        var title = meta.title;
        var artist = meta.artist;
        var cover = meta.cover;

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
          </div>
        `;

        var playerWrapper = container.querySelector(".nm-player") as HTMLElement;
        var playBtn = container.querySelector(".nm-playbtn") as HTMLButtonElement;
        var iconSpan = container.querySelector(".nm-icon") as HTMLElement;
        var timeDiv = container.querySelector(".nm-time") as HTMLElement;
        var canvas = container.querySelector(".nm-canvas") as HTMLCanvasElement;
        var ctx = canvas.getContext("2d") as CanvasRenderingContext2D;

        if (!playerWrapper || !playBtn || !iconSpan || !timeDiv || !canvas || !ctx) return;
        
        container.dataset.embedStatus = "ready";

        var isPlaying = false;
        var reqId: number | null = null;
        var smoothedProgress = 0;
        var wavePhase = 0;
        var lastTime = 0;
        var drag = false;

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
          daybookMediaManager.playTrack(id as string, true);
        });

        function handleStateChange(playing: boolean) {
          isPlaying = playing;
          if (isPlaying) {
            playerWrapper.classList.add("is-playing");
            swapIcon("pause");
            lastTime = performance.now();
            if (!reqId) loop(lastTime);
          } else {
            playerWrapper.classList.remove("is-playing");
            swapIcon("play_arrow");
            // Kick off one more loop to drift to exact stopped position and clear wavePhase
            if (!reqId) loop(performance.now());
          }
        }
        
        // Listen to global events
        document.addEventListener('daybook:media-state-change', (e: any) => {
          if (e.detail.songId === id) {
            handleStateChange(e.detail.isPlaying);
          } else {
            handleStateChange(false);
            smoothedProgress = 0;
            drawWave(0, 0);
            timeDiv.textContent = "0:00 / 0:00";
          }
        });

        // Initialize state from manager
        if (daybookMediaManager.getCurrentSongId() === id) {
           handleStateChange(daybookMediaManager.isPlaying());
        } else {
           drawWave(0, 0);
        }

        if (autostart && daybookMediaManager.getCurrentSongId() !== id) {
            daybookMediaManager.playTrack(id as string, true);
        }
        
        canvas.addEventListener("pointerdown", function(e: PointerEvent) {
          drag = true;
          updateSeek(e);
        });
        window.addEventListener("pointermove", function(e: PointerEvent) {
          if (drag) updateSeek(e);
        });
        window.addEventListener("pointerup", function(e: PointerEvent) {
          if (drag) {
            drag = false;
            // Seek unsupported globally for now via embed, or we could dispatch it
          }
        });

        function updateSeek(e: PointerEvent) {
          var rect = canvas.getBoundingClientRect();
          var p = Math.max(0, Math.min(e.clientX - rect.left, rect.width)) / rect.width;
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
          
          let targetProgress = 0;
          if (isPlaying || daybookMediaManager.getCurrentSongId() === id) {
             const prog = daybookMediaManager.getProgress(id as string);
             if (prog) {
               targetProgress = prog.progress;
               if (!drag) {
                 timeDiv.textContent = formatTime(prog.currentTime) + " / " + formatTime(prog.duration);
               }
             }
          }

          if (!drag) {
             smoothedProgress += (targetProgress - smoothedProgress) * 0.15;
          }
          
          drawWave(smoothedProgress, wavePhase);

          if (isPlaying || Math.abs(smoothedProgress - targetProgress) > 0.001) {
            reqId = requestAnimationFrame(loop);
          } else {
            reqId = null;
          }
        }
      } catch (err) {
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

