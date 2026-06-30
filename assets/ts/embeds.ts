import { createFallbackElement, setupIframeEmbeds } from "./embed-loading.js";
import { setupImages } from "./image-loader.js";
import { daybookMediaManager } from "./media-manager.js";

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

    card.dataset.embedStatus = "loading";

    // 10s timeout for GitHub API
    let isFinished = false;
    let timer = window.setTimeout(() => {
      if (isFinished) return;
      isFinished = true;
      card.dataset.embedStatus = "error";
      card.innerHTML = "";
      card.appendChild(createFallbackElement({
        message: "加载 GitHub 仓库信息超时",
        linkText: "前往 GitHub 查看",
        linkUrl: "https://github.com/" + repo
      }));
    }, 10000);

    var data = await fetchRepoData(repo);
    if (isFinished) return;
    isFinished = true;
    window.clearTimeout(timer);

    if (!data) {
      card.dataset.embedStatus = "error";
      card.innerHTML = "";
      card.appendChild(createFallbackElement({
        message: "无法加载 GitHub 仓库信息",
        linkText: "前往 GitHub 查看",
        linkUrl: "https://github.com/" + repo
      }));
      return;
    }

    card.dataset.embedStatus = "ready";
    updateCardUI(card, data);
  }

  // Initialize all GitHub cards on the page
  function setupGithubCards() {
    var cards = document.querySelectorAll(".gc-container");
    cards.forEach(function (card) {
      const htmlCard = card as HTMLElement;
      if (htmlCard.dataset.embedStatus === "loading" || htmlCard.dataset.embedStatus === "ready" || htmlCard.dataset.embedStatus === "error") return;
      loadRepoData(htmlCard);
    });
  }

  // Setup Twitter Widgets
  function setupTweets() {
    var tweets = document.querySelectorAll(".twitter-tweet");
    if (tweets.length === 0) {
      return;
    }

    let needsScript = false;

    tweets.forEach(function (tweetEl) {
      const tweet = tweetEl as HTMLElement;
      if (tweet.dataset.embedStatus === "loading" || tweet.dataset.embedStatus === "ready" || tweet.dataset.embedStatus === "error") return;
      
      tweet.setAttribute("data-theme", "light");
      tweet.dataset.embedStatus = "loading";
      needsScript = true;

      // Wrap tweet in a skeleton structure if it's just the blockquote
      const skeleton = document.createElement("div");
      skeleton.className = "tweet-skeleton";
      skeleton.innerHTML = `
        <div class="tweet-skeleton-header">
          <div class="tweet-skeleton-avatar"></div>
          <div class="tweet-skeleton-name"></div>
        </div>
        <div class="tweet-skeleton-body1"></div>
        <div class="tweet-skeleton-body2"></div>
      `;
      tweet.appendChild(skeleton);

      let isFinished = false;

      // 15s timeout
      const timer = window.setTimeout(() => {
        if (isFinished) return;
        isFinished = true;
        tweet.dataset.embedStatus = "error";
        tweet.innerHTML = "";
        const href = tweet.querySelector("a")?.href || "https://x.com/";
        tweet.parentElement?.appendChild(createFallbackElement({
          message: "无法加载推文",
          linkText: "前往 X / Twitter 查看",
          linkUrl: href
        }));
        tweet.style.display = "none";
      }, 15000);

      // We rely on window.twttr events to mark it as ready
      // If twttr is not available, the timeout will handle it.
      if (window.twttr && window.twttr.events) {
        window.twttr.events.bind('rendered', function (event: any) {
          if (event.target === tweet) {
            isFinished = true;
            window.clearTimeout(timer);
            tweet.dataset.embedStatus = "ready";
          }
        });
      }
    });

    if (!needsScript) return;

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
    if (container.dataset.embedStatus === "loading" || container.dataset.embedStatus === "ready" || container.dataset.embedStatus === "error") return;
    
    container.dataset.embedStatus = "loading";
    
    // Inject responsive skeleton matching desktop/mobile
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
      console.warn("[Daybook] Netease API is disabled or not configured. Netease card will fallback to error state.");
      container.innerHTML = "";
      container.appendChild(createFallbackElement({
        message: "未配置或未启用网易云 API 地址",
        linkText: "点击前往网易云音乐查看",
        linkUrl: "https://music.163.com/#/song?id=" + id
      }));
      return;
    }

    const apiBase = neteaseApiBaseUrl.replace(/\/$/, "");

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
      
      const claimedAudio = daybookMediaManager.claimAudio(id);
      if (claimedAudio) {
        audio.remove();
        playerWrapper.appendChild(claimedAudio);
        audio = claimedAudio;
      }


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
        
        daybookMediaManager.notifyPlay(audio, location.href, id as string);
        
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
        if (autostart && !claimedAudio) {
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

      if (!audio.paused) {
        isPlaying = true;
        playerWrapper.classList.add("is-playing");
        iconSpan.textContent = "pause"; // Sync icon immediately without animation
        lastTime = performance.now();
        if (!reqId) loop(lastTime);
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

  window.daybookSyncEmbeds = function () {
    setupGithubCards();
    setupTweets();
    setupNeteasePlayers();
    setupIframeEmbeds();
    setupImages();
  };



  document.addEventListener("daybook:page-load", function () {
    window.daybookSyncEmbeds();
  });

  document.addEventListener("daybook:article-content-swapped", function () {
    window.daybookSyncEmbeds();
  });

  document.addEventListener("daybook:before-swap", function () {
    // The MediaManager now handles audio takeover or stopping logic.
  });

})();
