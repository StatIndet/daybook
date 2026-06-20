(function () {
  var compactNumberFormat = new Intl.NumberFormat("en", {
    notation: "compact",
    maximumFractionDigits: 1,
  });

  interface RepoData {
    owner: { avatar_url: string };
    description: string;
    stargazers_count: number;
    forks_count: number;
    license: { spdx_id: string } | null;
  }

  // Fetch repository data from GitHub API with caching
  async function fetchRepoData(repo: string): Promise<RepoData | null> {
    var cacheKey = "github-repo-" + repo;

    // Check session storage for cached data
    try {
      var cachedData = sessionStorage.getItem(cacheKey);
      if (cachedData) {
        return JSON.parse(cachedData);
      }
    } catch (e) {
      try {
        sessionStorage.removeItem(cacheKey);
      } catch (err) {}
    }

    // Fetch from API if not cached
    try {
      var response = await fetch("https://api.github.com/repos/" + repo);
      if (!response.ok) {
        console.warn(
          "[GithubCard] Failed to fetch " +
            repo +
            ": " +
            response.status +
            " " +
            response.statusText
        );
        return null;
      }

      var raw = await response.json();
      var data = {
        owner: { avatar_url: raw.owner && raw.owner.avatar_url },
        description: raw.description,
        stargazers_count: raw.stargazers_count,
        forks_count: raw.forks_count,
        license: raw.license ? { spdx_id: raw.license.spdx_id } : null,
      };

      // Cache the successful response
      try {
        sessionStorage.setItem(cacheKey, JSON.stringify(data));
      } catch (err) {}

      return data;
    } catch (error) {
      console.error("[GithubCard] Failed to fetch " + repo + ":", error);
      return null;
    }
  }

  // Update card UI with repository data
  function updateCardUI(card: HTMLElement, data: RepoData | null) {
    var setText = function (selector: string, text: string | number) {
      var el = card.querySelector(selector);
      if (el) {
        el.textContent = String(text);
      }
    };

    if (!data) {
      setText(".gc-repo-description", "Failed to load data");
      return;
    }

    var avatar = card.querySelector(".gc-owner-avatar");
    if (avatar && data.owner && data.owner.avatar_url) {
      (avatar as HTMLElement).style.backgroundImage = "url(" + data.owner.avatar_url + ")";
      (avatar as HTMLElement).style.backgroundSize = "cover";
      (avatar as HTMLElement).style.backgroundPosition = "center";
    }

    setText(".gc-repo-description", data.description || "No description");
    setText(".gc-stars-count", compactNumberFormat.format(data.stargazers_count || 0));
    setText(".gc-forks-count", compactNumberFormat.format(data.forks_count || 0));
    setText(".gc-license-info", (data.license && data.license.spdx_id) || "No License");
  }

  // Load data for a specific card element
  async function loadRepoData(card: HTMLElement) {
    var repo = card.getAttribute("data-repo");
    if (!repo) {
      return;
    }

    var data = await fetchRepoData(repo);
    updateCardUI(card, data);
  }

  // Initialize all GitHub cards on the page
  function setupGithubCards() {
    var cards = document.querySelectorAll(".gc-container");
    cards.forEach(function (card) {
      const htmlCard = card as HTMLElement;
      if (htmlCard.dataset.initialized === "true") return;
      htmlCard.dataset.initialized = "true";
      loadRepoData(htmlCard);
    });
  }

  // Setup Twitter Widgets
  function setupTweets() {
    var tweets = document.querySelectorAll(".twitter-tweet");
    if (tweets.length === 0) {
      return;
    }

    // Force light theme
    tweets.forEach(function (tweet) {
      tweet.setAttribute("data-theme", "light");
    });

    if (window.twttr && window.twttr.widgets) {
      window.twttr.widgets.load();
    } else if (!document.getElementById("twitter-wjs")) {
      var script = document.createElement("script");
      script.id = "twitter-wjs";
      script.src = "https://platform.twitter.com/widgets.js";
      script.async = true;
      document.head.appendChild(script);
    }
  }

  function setupNeteasePlayers() {
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
    if (container.dataset.initialized === "true") return;
    container.dataset.initialized = "true";
    var id = container.getAttribute("data-id");
    var autostart = container.getAttribute("data-autostart") === "true";
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

      var playerWrapper = container.querySelector(".nm-player") as HTMLElement;
      var audio = container.querySelector("audio") as HTMLAudioElement;
      var playBtn = container.querySelector(".nm-playbtn") as HTMLButtonElement;
      var iconSpan = container.querySelector(".nm-icon") as HTMLElement;
      var timeDiv = container.querySelector(".nm-time") as HTMLElement;
      var canvas = container.querySelector(".nm-canvas") as HTMLCanvasElement;
      var ctx = canvas.getContext("2d") as CanvasRenderingContext2D;

      if (!playerWrapper || !audio || !playBtn || !iconSpan || !timeDiv || !canvas || !ctx) return;

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
        timeDiv.textContent = "0:00 / " + formatTime(audio.duration);
        drawWave(0, wavePhase);
        if (autostart) {
          audio.play().catch(function(err) {
            console.warn("Autoplay prevented by browser:", err);
          });
        }
      });

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
    } catch (err) {
      console.error("Netease player error:", err);
      container.innerHTML = "<div class='nm-error'>Failed to load song data</div>";
    }
  });
}

  window.daybookSyncEmbeds = function () {
    setupGithubCards();
    setupTweets();
    setupNeteasePlayers();
  };



  document.addEventListener("daybook:transition-finished", function () {
    window.daybookSyncEmbeds();
  });

  document.addEventListener("daybook:before-swap", function () {
    // Pause any active netease audio players to prevent ghost audio
    document.querySelectorAll(".nm-player audio").forEach(function(audioEl) {
      const audio = audioEl as HTMLAudioElement;
      if (!audio.paused) {
        audio.pause();
      }
    });
  });

})();
