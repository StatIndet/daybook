import { createFallbackElement, setupIframeEmbeds } from "./embed-loading.js";
import { setupImages } from "./image-loader.js";

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

    // Create skeleton
    card.innerHTML = `
      <div class="gc-skeleton">
        <div class="gc-skeleton-title"></div>
        <div class="gc-skeleton-desc"></div>
        <div class="gc-skeleton-meta"></div>
      </div>
    `;

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
    card.innerHTML = `
      <div class="gc-title-bar">
        <div class="gc-owner-avatar" aria-hidden="true"></div>
        <span class="gc-repo-title">
          <span>${repo.split('/')[0]}<span class="gc-slash" aria-hidden="true">/</span><strong>${repo.split('/')[1]}</strong></span>
        </span>
        <svg class="gc-github-icon" width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M12 1C5.9225 1 1 5.9225 1 12C1 16.8675 4.14875 20.9787 8.52125 22.4362C9.07125 22.5325 9.2775 22.2025 9.2775 21.9137C9.2775 21.6525 9.26375 20.7862 9.26375 19.865C6.5 20.3737 5.785 19.1912 5.565 18.5725C5.44125 18.2562 4.905 17.28 4.4375 17.0187C4.0525 16.8125 3.5025 16.3037 4.42375 16.29C5.29 16.2762 5.90875 17.0875 6.115 17.4175C7.105 19.0812 8.68625 18.6137 9.31875 18.325C9.415 17.61 9.70375 17.1287 10.02 16.8537C7.5725 16.5787 5.015 15.63 5.015 11.4225C5.015 10.2262 5.44125 9.23625 6.1425 8.46625C6.0325 8.19125 5.6475 7.06375 6.2525 5.55125C6.2525 5.55125 7.17375 5.2625 9.2775 6.67875C10.1575 6.43125 11.0925 6.3075 12.0275 6.3075C12.9625 6.3075 13.8975 6.43125 14.7775 6.67875C16.8813 5.24875 17.8025 5.55125 17.8025 5.55125C18.4075 7.06375 18.0225 8.19125 17.9125 8.46625C18.6138 9.23625 19.04 10.2125 19.04 11.4225C19.04 15.6437 16.4688 16.5787 14.0213 16.8537C14.42 17.1975 14.7638 17.8575 14.7638 18.8887C14.7638 20.36 14.75 21.5425 14.75 21.9137C14.75 22.2025 14.9563 22.5462 15.5063 22.4362C19.8513 20.9787 23 16.8537 23 12C23 5.9225 18.0775 1 12 1Z"></path>
        </svg>
      </div>
      <p class="gc-repo-description"></p>
      <div class="gc-info-bar">
        <svg class="gc-info-icon" height="16" width="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
          <path d="M8 .25a.75.75 0 0 1 .673.418l1.882 3.815 4.21.612a.75.75 0 0 1 .416 1.279l-3.046 2.97.719 4.192a.751.751 0 0 1-1.088.791L8 12.347l-3.766 1.98a.75.75 0 0 1-1.088-.79l.72-4.194L.818 6.374a.75.75 0 0 1 .416-1.28l4.21-.611L7.327.668A.75.75 0 0 1 8 .25Zm0 2.445L6.615 5.5a.75.75 0 0 1-.564.41l-3.097.45 2.24 2.184a.75.75 0 0 1 .216.664l-.528 3.084 2.769-1.456a.75.75 0 0 1 .698 0l2.77 1.456-.53-3.084a.75.75 0 0 1 .216-.664l2.24-2.183-3.096-.45a.75.75 0 0 1-.564-.41L8 2.694Z"></path>
        </svg>
        <span class="gc-stars-count" aria-label="Stars count">--</span>
        <svg class="gc-info-icon" height="16" width="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
          <path d="M5 5.372v.878c0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75v-.878a2.25 2.25 0 1 1 1.5 0v.878a2.25 2.25 0 0 1-2.25 2.25h-1.5v2.128a2.251 2.251 0 1 1-1.5 0V8.5h-1.5A2.25 2.25 0 0 1 3.5 6.25v-.878a2.25 2.25 0 1 1 1.5 0ZM5 3.25a.75.75 0 1 0-1.5 0 .75.75 0 0 0 1.5 0Zm6.75.75a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Zm-3 8.75a.75.75 0 1 0-1.5 0 .75.75 0 0 0 1.5 0Z"></path>
        </svg>
        <span class="gc-forks-count" aria-label="Forks count">--</span>
        <svg class="gc-info-icon" height="16" width="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
          <path d="M8.75.75V2h.985c.304 0 .603.08.867.231l1.29.736c.038.022.08.033.124.033h2.234a.75.75 0 0 1 0 1.5h-.427l2.111 4.692a.75.75 0 0 1-.154.838l-.53-.53.529.531-.001.002-.002.002-.006.006-.006.005-.01.01-.045.04c-.21.176-.441.327-.686.45C14.556 10.78 13.88 11 13 11a4.498 4.498 0 0 1-2.023-.454 3.544 3.544 0 0 1-.686-.45l-.045-.04-.016-.015-.006-.006-.004-.004v-.001a.75.75 0 0 1-.154-.838L12.178 4.5h-.162c-.305 0-.604-.079-.868-.231l-1.29-.736a.245.245 0 0 0-.124-.033H8.75V13h2.5a.75.75 0 0 1 0 1.5h-6.5a.75.75 0 0 1 0-1.5h2.5V3.5h-.984a.245.245 0 0 0-.124.033l-1.289.737c-.265.15-.564.23-.869.23h-.162l2.112 4.692a.75.75 0 0 1-.154.838l-.53-.53.529.531-.001.002-.002.002-.006.006-.016.015-.045.04c-.21.176-.441.327-.686.45C4.556 10.78 3.88 11 3 11a4.498 4.498 0 0 1-2.023-.454 3.544 3.544 0 0 1-.686-.45l-.045-.04-.016-.015-.006-.006-.004-.004v-.001a.75.75 0 0 1-.154-.838L2.178 4.5H1.75a.75.75 0 0 1 0-1.5h2.234a.249.249 0 0 0 .125-.033l1.288-.737c.265-.15.564-.23.869-.23h.984V.75a.75.75 0 0 1 1.5 0Zm2.945 8.477c.285.135.718.273 1.305.273s1.02-.138 1.305-.273L13 6.327Zm-10 0c.285.135.718.273 1.305.273s1.02-.138 1.305-.273L3 6.327Z"></path>
        </svg>
        <span class="gc-license-info" aria-label="License">--</span>
      </div>
    `;

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

    try {
      var urlRes = await fetch("https://nmapi.dontpanic.fun/song/url?id=" + id + "&realIP=116.25.146.177");
      var urlData = await urlRes.json();
      var songUrl = urlData.data && urlData.data[0] && urlData.data[0].url;

      var detailRes = await fetch("https://nmapi.dontpanic.fun/song/detail?ids=" + id);
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
    console.log("EMBEDS.TS LISTENER FIRED"); window.daybookSyncEmbeds();
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
