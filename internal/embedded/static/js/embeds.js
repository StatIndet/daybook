"use strict";
(() => {
  // assets/ts/embed-loading.ts
  function createFallbackElement(options) {
    const wrapper = document.createElement("div");
    wrapper.className = "embed-fallback";
    const icon = document.createElement("div");
    icon.innerHTML = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>`;
    wrapper.appendChild(icon);
    if (options.message) {
      const msg = document.createElement("span");
      msg.textContent = options.message;
      wrapper.appendChild(msg);
    }
    if (options.linkText && options.linkUrl) {
      const link = document.createElement("a");
      link.href = options.linkUrl;
      link.textContent = options.linkText;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      wrapper.appendChild(link);
    }
    return wrapper;
  }
  function setupIframeEmbeds() {
    const iframes = document.querySelectorAll(".embed-frame iframe");
    iframes.forEach((iframeEl) => {
      const iframe = iframeEl;
      const container = iframe.parentElement;
      if (!container || !container.classList.contains("embed-frame")) return;
      if (container.dataset.embedStatus === "loading" || container.dataset.embedStatus === "ready" || container.dataset.embedStatus === "error") {
        return;
      }
      container.dataset.embedStatus = "loading";
      let isFinished = false;
      let timer = null;
      const finalize = (status) => {
        if (isFinished) return;
        isFinished = true;
        if (timer) window.clearTimeout(timer);
        container.dataset.embedStatus = status;
        if (status === "error") {
          let platformName = "\u5916\u94FE";
          let url = iframe.src;
          if (url.includes("youtube") || url.includes("youtu.be")) platformName = "YouTube";
          else if (url.includes("bilibili")) platformName = "Bilibili";
          else if (url.includes("spotify")) platformName = "Spotify";
          else if (url.includes("codepen")) platformName = "CodePen";
          iframe.style.display = "none";
          const fallback = createFallbackElement({
            message: `\u65E0\u6CD5\u52A0\u8F7D ${platformName} \u5D4C\u5165\u5185\u5BB9`,
            linkText: `\u524D\u5F80 ${platformName} \u67E5\u770B`,
            linkUrl: url
          });
          container.appendChild(fallback);
        }
      };
      iframe.addEventListener("load", () => finalize("ready"));
      iframe.addEventListener("error", () => finalize("error"));
      timer = window.setTimeout(() => finalize("error"), 15e3);
    });
  }

  // assets/ts/image-loader.ts
  function setupImages() {
    const contentImages = document.querySelectorAll(".markdown img, .gallery img");
    contentImages.forEach((imgEl) => {
      const img = imgEl;
      if (img.classList.contains("music-cover")) return;
      if (img.closest(".persistent-logo")) return;
      if (img.closest(".side-nav-avatar")) return;
      if (img.dataset.embedStatus === "loading" || img.dataset.embedStatus === "ready" || img.dataset.embedStatus === "error") {
        return;
      }
      if (img.complete && img.naturalHeight > 0) {
        img.dataset.embedStatus = "ready";
        return;
      }
      img.dataset.embedStatus = "loading";
      let isFinished = false;
      const timer = window.setTimeout(() => {
        if (isFinished) return;
        isFinished = true;
        img.dataset.embedStatus = "error";
      }, 2e4);
      const onReady = () => {
        if (isFinished) return;
        isFinished = true;
        window.clearTimeout(timer);
        img.dataset.embedStatus = "ready";
      };
      const onError = () => {
        if (isFinished) return;
        isFinished = true;
        window.clearTimeout(timer);
        img.dataset.embedStatus = "error";
      };
      img.addEventListener("load", onReady);
      img.addEventListener("error", onError);
    });
  }

  // assets/ts/embeds.ts
  (function() {
    var compactNumberFormat = new Intl.NumberFormat("en", {
      notation: "compact",
      maximumFractionDigits: 1
    });
    async function fetchRepoData(repo) {
      var cacheKey = "github-repo-" + repo;
      try {
        var cachedData = sessionStorage.getItem(cacheKey);
        if (cachedData) {
          return JSON.parse(cachedData);
        }
      } catch (e) {
        try {
          sessionStorage.removeItem(cacheKey);
        } catch (err) {
        }
      }
      try {
        var response = await fetch("https://api.github.com/repos/" + repo);
        if (!response.ok) {
          console.warn(
            "[GithubCard] Failed to fetch " + repo + ": " + response.status + " " + response.statusText
          );
          return null;
        }
        var raw = await response.json();
        var data = {
          owner: { avatar_url: raw.owner && raw.owner.avatar_url },
          description: raw.description,
          stargazers_count: raw.stargazers_count,
          forks_count: raw.forks_count,
          license: raw.license ? { spdx_id: raw.license.spdx_id } : null
        };
        try {
          sessionStorage.setItem(cacheKey, JSON.stringify(data));
        } catch (err) {
        }
        return data;
      } catch (error) {
        console.error("[GithubCard] Failed to fetch " + repo + ":", error);
        return null;
      }
    }
    function updateCardUI(card, data) {
      var setText = function(selector, text) {
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
        avatar.style.backgroundImage = "url(" + data.owner.avatar_url + ")";
        avatar.style.backgroundSize = "cover";
        avatar.style.backgroundPosition = "center";
      }
      setText(".gc-repo-description", data.description || "No description");
      setText(".gc-stars-count", compactNumberFormat.format(data.stargazers_count || 0));
      setText(".gc-forks-count", compactNumberFormat.format(data.forks_count || 0));
      setText(".gc-license-info", data.license && data.license.spdx_id || "No License");
    }
    async function loadRepoData(card) {
      var repo = card.getAttribute("data-repo");
      if (!repo) {
        return;
      }
      card.dataset.embedStatus = "loading";
      let isFinished = false;
      let timer = window.setTimeout(() => {
        if (isFinished) return;
        isFinished = true;
        card.dataset.embedStatus = "error";
        card.innerHTML = "";
        card.appendChild(createFallbackElement({
          message: "\u52A0\u8F7D GitHub \u4ED3\u5E93\u4FE1\u606F\u8D85\u65F6",
          linkText: "\u524D\u5F80 GitHub \u67E5\u770B",
          linkUrl: "https://github.com/" + repo
        }));
      }, 1e4);
      var data = await fetchRepoData(repo);
      if (isFinished) return;
      isFinished = true;
      window.clearTimeout(timer);
      if (!data) {
        card.dataset.embedStatus = "error";
        card.innerHTML = "";
        card.appendChild(createFallbackElement({
          message: "\u65E0\u6CD5\u52A0\u8F7D GitHub \u4ED3\u5E93\u4FE1\u606F",
          linkText: "\u524D\u5F80 GitHub \u67E5\u770B",
          linkUrl: "https://github.com/" + repo
        }));
        return;
      }
      card.dataset.embedStatus = "ready";
      updateCardUI(card, data);
    }
    function setupGithubCards() {
      var cards = document.querySelectorAll(".gc-container");
      cards.forEach(function(card) {
        const htmlCard = card;
        if (htmlCard.dataset.embedStatus === "loading" || htmlCard.dataset.embedStatus === "ready" || htmlCard.dataset.embedStatus === "error") return;
        loadRepoData(htmlCard);
      });
    }
    function setupTweets() {
      var tweets = document.querySelectorAll(".twitter-tweet");
      if (tweets.length === 0) {
        return;
      }
      let needsScript = false;
      tweets.forEach(function(tweetEl) {
        const tweet = tweetEl;
        if (tweet.dataset.embedStatus === "loading" || tweet.dataset.embedStatus === "ready" || tweet.dataset.embedStatus === "error") return;
        tweet.setAttribute("data-theme", "light");
        tweet.dataset.embedStatus = "loading";
        needsScript = true;
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
        const timer = window.setTimeout(() => {
          if (isFinished) return;
          isFinished = true;
          tweet.dataset.embedStatus = "error";
          tweet.innerHTML = "";
          const href = tweet.querySelector("a")?.href || "https://x.com/";
          tweet.parentElement?.appendChild(createFallbackElement({
            message: "\u65E0\u6CD5\u52A0\u8F7D\u63A8\u6587",
            linkText: "\u524D\u5F80 X / Twitter \u67E5\u770B",
            linkUrl: href
          }));
          tweet.style.display = "none";
        }, 15e3);
        if (window.twttr && window.twttr.events) {
          window.twttr.events.bind("rendered", function(event) {
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
    function setupMusicPlayers() {
      var players = document.querySelectorAll(".music-custom-player");
      if (players.length === 0) return;
      function formatTime(seconds) {
        if (isNaN(seconds)) return "0:00";
        var m = Math.floor(seconds / 60);
        var s = Math.floor(seconds % 60);
        return m + ":" + (s < 10 ? "0" : "") + s;
      }
      players.forEach(function(containerEl) {
        const container = containerEl;
        if (container.dataset.tsbound === "true") return;
        container.dataset.tsbound = "true";
        var playerWrapper = container.querySelector(".music-player");
        var audio = container.querySelector("audio");
        var playBtn = container.querySelector(".music-playbtn");
        var iconSpan = container.querySelector(".music-icon");
        var timeDiv = container.querySelector(".music-time");
        var canvas = container.querySelector(".music-canvas");
        if (!playerWrapper || !audio || !playBtn || !iconSpan || !timeDiv || !canvas) return;
        var ctx = canvas.getContext("2d");
        if (!ctx) return;
        var isPlaying = false;
        var reqId = null;
        var drag = false;
        var smoothedProgress = 0;
        var wavePhase = 0;
        var lastTime = 0;
        var rewinding = false;
        var rewindTime = 0;
        var rewindStart = 0;
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
          document.dispatchEvent(new CustomEvent("daybook:embed-play", {
            detail: { audio }
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
        });
        if (audio.readyState >= 1) {
          timeDiv.textContent = formatTime(audio.currentTime) + " / " + formatTime(audio.duration);
          smoothedProgress = audio.duration ? audio.currentTime / audio.duration : 0;
          drawWave(smoothedProgress, wavePhase);
        }
        canvas.addEventListener("pointerdown", function(e) {
          drag = true;
          rewinding = false;
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
            if (!reqId) {
              lastTime = performance.now();
              loop(lastTime);
            }
          }
        });
        function updateSeek(e) {
          var rect = canvas.getBoundingClientRect();
          var p = Math.max(0, Math.min(e.clientX - rect.left, rect.width)) / rect.width;
          if (audio.duration) timeDiv.textContent = formatTime(p * audio.duration) + " / " + formatTime(audio.duration);
          smoothedProgress = p;
          drawWave(p, wavePhase);
        }
        function drawWave(progress, time) {
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
          var phase = time % 1200 / 1200 * Math.PI * 2;
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
              var y = h / 2 + Math.sin((x - startX) * waveFreq + phase) * waveAmp;
              if (x === startX) ctx.moveTo(x, y);
              else ctx.lineTo(x, y);
            }
            ctx.stroke();
          }
          var trackStartX = Math.min(w - lineWidth / 2, progressX + gap);
          ctx.beginPath();
          ctx.moveTo(trackStartX, h / 2);
          ctx.lineTo(w - lineWidth / 2, h / 2);
          ctx.strokeStyle = "rgba(255, 255, 255, 0.3)";
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(w - lineWidth / 2, h / 2, 3, 0, Math.PI * 2);
          ctx.fillStyle = "rgba(255, 255, 255, 1)";
          ctx.fill();
        }
        function loop(t) {
          var dt = t - (lastTime || t);
          lastTime = t;
          if (isPlaying) {
            wavePhase += dt;
          }
          if (rewinding) {
            rewindTime += dt;
            var p = Math.min(1, rewindTime / 1e3);
            var ease = Math.pow(p, 3);
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
          if (isPlaying || Math.abs(smoothedProgress - targetProgress) > 1e-3) {
            reqId = requestAnimationFrame(loop);
          } else {
            reqId = null;
          }
        }
        document.addEventListener("daybook:global-play", () => {
          if (!audio.paused) {
            audio.pause();
          }
        });
        audio.addEventListener("error", () => {
          console.error("Music audio error for url:", audio.src);
          container.dataset.status = "error";
        });
      });
    }
    window.daybookSyncEmbeds = function() {
      setupGithubCards();
      setupTweets();
      setupMusicPlayers();
      setupIframeEmbeds();
      setupImages();
    };
    document.addEventListener("daybook:page-load", function() {
      window.daybookSyncEmbeds();
    });
    document.addEventListener("daybook:article-content-swapped", function() {
      window.daybookSyncEmbeds();
    });
    document.addEventListener("daybook:before-swap", function() {
    });
  })();
})();
