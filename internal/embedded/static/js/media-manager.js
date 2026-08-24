// assets/ts/media-manager.ts
var _MediaManager = class _MediaManager {
  constructor() {
    this.activeAudio = null;
    this.articleLinks = null;
    this.articleLinkTexts = null;
    this.currentSourceId = null;
    this.currentTitle = null;
    this.currentArtist = null;
    this.currentCover = null;
    this.globalPlaylist = [];
    this.currentGlobalIndex = -1;
    this.currentPlayRequest = null;
    this.trackMetadataCache = /* @__PURE__ */ new Map();
    this.container = null;
    this.audioContainer = null;
    // Desktop UI elements
    this.desktopPlayPauseBtn = null;
    this.desktopPlayPauseIcon = null;
    this.coverImages = null;
    this.coverWrappers = null;
    this.titleElements = null;
    this.artistElements = null;
    this.canvases = [];
    this.smallCoverImage = null;
    this.verticalTitleElement = null;
    this.collapsedTab = null;
    this.expandedView = null;
    // Playlist elements
    this.desktopUi = null;
    this.btnOpenPlaylist = null;
    this.btnClosePlaylist = null;
    this.playlistContainers = null;
    // Mobile elements
    this.mobileFab = null;
    this.mobileFabCover = null;
    this.drawerMusicBtn = null;
    this.visualizerReqId = null;
    this.wavePhase = 0;
    this.lastTime = 0;
    this.smoothedProgress = 0;
    this.isVisualizerRunning = false;
    this.cachedThemeColors = { accent: "#6750a4", accentSoft: "rgba(103, 80, 164, 0.18)", lastCheck: 0 };
    this.visualizerLoop = (t) => {
      if (!this.isVisualizerRunning) return;
      const dt = t - (this.lastTime || t);
      this.lastTime = t;
      if (this.activeAudio && !this.activeAudio.paused) {
        this.wavePhase += dt * 3e-3;
      }
      const targetProgress = this.activeAudio && this.activeAudio.duration ? this.activeAudio.currentTime / this.activeAudio.duration : 0;
      this.smoothedProgress += (targetProgress - this.smoothedProgress) * 0.15;
      this.drawVisualizer(this.smoothedProgress, this.wavePhase);
      if (this.activeAudio && !this.activeAudio.paused || Math.abs(this.smoothedProgress - targetProgress) > 1e-3) {
        this.visualizerReqId = requestAnimationFrame(this.visualizerLoop);
      } else {
        this.visualizerReqId = null;
        this.isVisualizerRunning = false;
      }
    };
    this.onTimeUpdateBound = this.onTimeUpdate.bind(this);
    this.onPlayBound = this.onPlay.bind(this);
    this.onPauseBound = this.onPause.bind(this);
    this.onEndedBound = this.onEnded.bind(this);
    this.onErrorBound = this.onError.bind(this);
    this.onSettingsChangeBound = this.onSettingsChange.bind(this);
    this.initDOM();
    this.bindEvents();
    document.addEventListener("daybook:settings-change", this.onSettingsChangeBound);
  }
  static getInstance() {
    if (!_MediaManager.instance) {
      _MediaManager.instance = new _MediaManager();
    }
    return _MediaManager.instance;
  }
  dispatchStateChange() {
    document.dispatchEvent(new CustomEvent("daybook:media-state-change", {
      detail: {
        songId: this.currentSourceId,
        isPlaying: this.activeAudio ? !this.activeAudio.paused : false,
        title: this.currentTitle,
        artist: this.currentArtist,
        cover: this.currentCover
      }
    }));
  }
  dispatchTimeUpdate() {
    if (!this.activeAudio || !this.currentSourceId) return;
    document.dispatchEvent(new CustomEvent("daybook:media-timeupdate", {
      detail: {
        songId: this.currentSourceId,
        progress: this.activeAudio.duration ? this.activeAudio.currentTime / this.activeAudio.duration : 0,
        currentTime: this.activeAudio.currentTime,
        duration: this.activeAudio.duration
      }
    }));
  }
  initDOM() {
    this.container = document.getElementById("daybook-media-manager");
    if (!this.container) return;
    this.audioContainer = this.container.querySelector(".mm-audio-container");
    this.articleLinks = this.container.querySelectorAll(".mm-article-link");
    this.articleLinkTexts = this.container.querySelectorAll(".mm-article-link-text");
    this.desktopPlayPauseBtn = this.container.querySelector(".mm-btn-play-pause");
    this.desktopPlayPauseIcon = this.container.querySelector(".mm-btn-play-pause .mm-icon-current");
    this.coverImages = this.container.querySelectorAll(".mm-cover-image");
    this.coverWrappers = this.container.querySelectorAll(".mm-cover-wrapper");
    this.titleElements = this.container.querySelectorAll(".mm-title");
    this.artistElements = this.container.querySelectorAll(".mm-artist");
    const canvasEls = this.container.querySelectorAll(".mm-visualizer-canvas, .mm-mobile-visualizer-canvas");
    canvasEls.forEach((canvas) => {
      const ctx = canvas.getContext("2d");
      if (ctx) {
        const size = 180;
        canvas.width = size * 2;
        canvas.height = size * 2;
        canvas.style.width = size + "px";
        canvas.style.height = size + "px";
        ctx.scale(2, 2);
        this.canvases.push({ canvas, ctx });
      }
    });
    this.smallCoverImage = this.container.querySelector(".mm-small-cover");
    this.verticalTitleElement = this.container.querySelector(".mm-vertical-title");
    this.collapsedTab = this.container.querySelector(".mm-collapsed-tab");
    this.expandedView = this.container.querySelector(".mm-expanded-view");
    this.desktopUi = this.container.querySelector(".mm-desktop-ui");
    this.playlistContainers = this.container.querySelectorAll(".mm-playlist-list");
    this.btnOpenPlaylist = this.container.querySelector(".mm-btn-open-playlist");
    this.btnClosePlaylist = this.container.querySelector(".mm-btn-close-playlist");
    this.mobileFab = this.container.querySelector(".mobile-media-fab");
    this.mobileFabCover = this.container.querySelector(".mobile-media-fab-cover");
    this.drawerMusicBtn = document.getElementById("drawer-music-btn");
    if (window.GLOBAL_NETEASE_SONGS && Array.isArray(window.GLOBAL_NETEASE_SONGS)) {
      this.globalPlaylist = window.GLOBAL_NETEASE_SONGS;
    }
    if (this.globalPlaylist.length > 0) {
      document.body.setAttribute("data-media-manager-active", "true");
      const firstTrack = this.globalPlaylist[0];
      if (firstTrack) {
        this.playTrack(firstTrack.id, false);
      }
    }
  }
  getThemeColors() {
    const now = performance.now();
    if (now - this.cachedThemeColors.lastCheck > 1e3) {
      const rootStyle = getComputedStyle(document.documentElement);
      const acc = rootStyle.getPropertyValue("--color-accent").trim();
      const accSoft = rootStyle.getPropertyValue("--color-accent-soft-strong").trim();
      if (acc) this.cachedThemeColors.accent = acc;
      if (accSoft) this.cachedThemeColors.accentSoft = accSoft;
      this.cachedThemeColors.lastCheck = now;
    }
    return this.cachedThemeColors;
  }
  drawVisualizer(progress, phase) {
    if (this.canvases.length === 0) return;
    this.canvases.forEach(({ canvas, ctx }) => {
      const size = 180;
      const cx = size / 2;
      const cy = size / 2;
      const radius = 84;
      ctx.clearRect(0, 0, size, size);
      const startAngle = Math.PI;
      const sweepAngle = Math.PI;
      const endAngle = startAngle + progress * sweepAngle;
      const gapAngle = 14 / radius;
      const colors = this.getThemeColors();
      ctx.beginPath();
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.lineWidth = 6;
      ctx.strokeStyle = colors.accentSoft;
      const bgStartAngle = endAngle + gapAngle;
      const bgEndAngle = startAngle + sweepAngle;
      if (bgStartAngle < bgEndAngle) {
        ctx.arc(cx, cy, radius, bgStartAngle, bgEndAngle);
        ctx.stroke();
      }
      if (progress > 0) {
        ctx.beginPath();
        ctx.strokeStyle = colors.accent;
        const N = Math.max(64, Math.ceil(radius * (progress * sweepAngle)));
        const dTheta = progress * sweepAngle / N;
        const waveAmp = 3;
        const waveFreq = 8;
        const arcLen = radius * sweepAngle;
        for (let i = 0; i <= N; i++) {
          const theta = startAngle + i * dTheta;
          const s = i * dTheta * radius;
          const phi = waveFreq * 2 * Math.PI * (s / arcLen) + phase;
          const r = radius + waveAmp * Math.sin(phi);
          const px = cx + r * Math.cos(theta);
          const py = cy + r * Math.sin(theta);
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.stroke();
      }
    });
  }
  startVisualizer() {
    if (!this.isVisualizerRunning) {
      this.isVisualizerRunning = true;
      this.lastTime = performance.now();
      this.visualizerReqId = requestAnimationFrame(this.visualizerLoop);
    }
  }
  bindEvents() {
    const togglePlay = () => {
      if (!this.activeAudio) return;
      if (this.activeAudio.paused) {
        this.activeAudio.play().catch((e) => console.warn("MediaManager play rejected:", e));
      } else {
        this.activeAudio.pause();
      }
    };
    const playPauseBtns = this.container?.querySelectorAll(".mm-btn-play-pause");
    const setupActiveState = (btn) => {
      btn.addEventListener("pointerdown", () => btn.classList.add("is-pressed"));
      btn.addEventListener("pointerup", () => btn.classList.remove("is-pressed"));
      btn.addEventListener("pointercancel", () => btn.classList.remove("is-pressed"));
      btn.addEventListener("pointerleave", () => btn.classList.remove("is-pressed"));
    };
    playPauseBtns?.forEach((btn) => {
      btn.addEventListener("click", togglePlay);
      setupActiveState(btn);
    });
    const prevBtns = this.container?.querySelectorAll(".mm-btn-prev");
    const nextBtns = this.container?.querySelectorAll(".mm-btn-next");
    prevBtns?.forEach((btn) => {
      btn.addEventListener("click", () => this.playPrev());
      setupActiveState(btn);
    });
    nextBtns?.forEach((btn) => {
      btn.addEventListener("click", () => this.playNext());
      setupActiveState(btn);
    });
    const btnOpenPlaylists = this.container?.querySelectorAll(".mm-btn-open-playlist");
    btnOpenPlaylists?.forEach((btn) => btn.addEventListener("click", () => {
      this.desktopUi?.classList.add("is-flipped");
      this.container?.classList.add("show-mobile-playlist");
    }));
    const btnClosePlaylists = this.container?.querySelectorAll(".mm-btn-close-playlist");
    btnClosePlaylists?.forEach((btn) => btn.addEventListener("click", () => {
      this.desktopUi?.classList.remove("is-flipped");
      this.container?.classList.remove("show-mobile-playlist");
    }));
    const btnCloseMobile = this.container?.querySelector(".mm-btn-close-mobile");
    btnCloseMobile?.addEventListener("click", () => {
      document.body.classList.remove("is-media-overlay-open");
      document.body.style.overflow = "";
      document.body.classList.remove("is-mobile-scroll-locked");
    });
    if (this.articleLinks) {
      this.articleLinks.forEach((link) => {
        link.addEventListener("click", () => {
          document.body.classList.remove("is-media-overlay-open");
          document.body.style.overflow = "";
          document.body.classList.remove("is-mobile-scroll-locked");
        });
      });
    }
    if (this.mobileFab) {
      this.mobileFab.addEventListener("click", () => {
        document.body.classList.add("is-media-overlay-open");
        document.body.style.overflow = "hidden";
        document.body.classList.add("is-mobile-scroll-locked");
      });
    }
    document.addEventListener("daybook:embed-play", async (e) => {
      const songId = e.detail.songId;
      if (!songId) return;
      if (this.activeAudio && !this.activeAudio.paused) {
        this.activeAudio.pause();
      }
      const meta = await this.getTrackMetadata(songId);
      if (!meta) return;
      this.currentSourceId = songId;
      this.currentTitle = meta.title;
      this.currentArtist = meta.artist;
      this.currentCover = meta.cover;
      if (this.currentCover) this.coverImages?.forEach((img) => img.src = this.currentCover);
      if (this.smallCoverImage && this.currentCover) this.smallCoverImage.src = this.currentCover;
      if (this.mobileFabCover && this.currentCover) this.mobileFabCover.src = this.currentCover;
      if (this.mobileFab) {
        this.mobileFab.style.display = "";
        this.mobileFab.classList.remove("is-hidden");
      }
      this.titleElements?.forEach((el) => el.textContent = this.currentTitle || "Unknown Track");
      if (this.verticalTitleElement) this.verticalTitleElement.textContent = this.currentTitle || "Unknown Track";
      this.artistElements?.forEach((el) => el.textContent = this.currentArtist || "Unknown Artist");
      const globalSongs = window.GLOBAL_NETEASE_SONGS || [];
      const songData = globalSongs.find((s) => s.id === songId);
      const songUrl = songData ? songData.audioURL : null;
      if (!songUrl) return;
      if (this.activeAudio) {
        this.activeAudio.pause();
        if (this.activeAudio.parentElement === this.audioContainer) {
          this.activeAudio.remove();
        }
      }
      const audio = document.createElement("audio");
      audio.src = songUrl;
      if (this.audioContainer) {
        this.audioContainer.innerHTML = "";
        this.audioContainer.appendChild(audio);
      }
      this.activeAudio = audio;
      this.activeAudio.addEventListener("timeupdate", this.onTimeUpdateBound);
      this.activeAudio.addEventListener("play", this.onPlayBound);
      this.activeAudio.addEventListener("pause", this.onPauseBound);
      this.activeAudio.addEventListener("ended", this.onEndedBound);
      this.activeAudio.addEventListener("error", this.onErrorBound);
      document.body.setAttribute("data-media-manager-active", "true");
      this.updatePlayPauseUI(false);
      this.updateProgressUI(false);
      this.updatePlaylistUI();
      const index = this.globalPlaylist.findIndex((s) => s.id === songId);
      if (index !== -1) {
        this.currentGlobalIndex = index;
      }
    });
  }
  async playTrack(songId, autoplay = true) {
    if (!songId) return;
    const index = this.globalPlaylist.findIndex((s) => s.id === songId);
    if (index !== -1) {
      this.currentGlobalIndex = index;
    }
    if (this.currentSourceId === songId && this.activeAudio) {
      if (this.activeAudio.paused) {
        this.activeAudio.play().catch((e) => console.warn(e));
      } else {
        this.activeAudio.pause();
      }
      return;
    }
    const playRequest = /* @__PURE__ */ Symbol("playRequest");
    this.currentPlayRequest = playRequest;
    try {
      if (this.activeAudio) {
        this.activeAudio.pause();
        if (this.activeAudio.parentElement === this.audioContainer) {
          this.activeAudio.remove();
        }
      }
      const globalSongs = window.GLOBAL_NETEASE_SONGS || [];
      const songData = globalSongs.find((s) => s.id === songId);
      const songUrl = songData ? songData.audioURL : null;
      const meta = await this.getTrackMetadata(songId);
      if (this.currentPlayRequest !== playRequest) {
        return;
      }
      if (!songUrl || !meta) return;
      const title = meta.title;
      const artist = meta.artist;
      const cover = meta.cover;
      const audio = document.createElement("audio");
      audio.src = songUrl;
      if (this.audioContainer) {
        this.audioContainer.innerHTML = "";
        this.audioContainer.appendChild(audio);
      }
      this.activeAudio = audio;
      this.currentSourceId = songId || null;
      this.currentTitle = title || null;
      this.currentArtist = artist || null;
      this.currentCover = cover || null;
      document.body.setAttribute("data-media-manager-active", "true");
      this.activeAudio.addEventListener("timeupdate", this.onTimeUpdateBound);
      this.activeAudio.addEventListener("play", this.onPlayBound);
      this.activeAudio.addEventListener("pause", this.onPauseBound);
      this.activeAudio.addEventListener("ended", this.onEndedBound);
      this.activeAudio.addEventListener("error", this.onErrorBound);
      if (this.currentCover) this.coverImages?.forEach((img) => img.src = this.currentCover);
      if (this.smallCoverImage && this.currentCover) this.smallCoverImage.src = this.currentCover;
      if (this.mobileFabCover && this.currentCover) this.mobileFabCover.src = this.currentCover;
      if (this.mobileFab) {
        this.mobileFab.style.display = "";
        this.mobileFab.classList.remove("is-hidden");
      }
      this.titleElements?.forEach((el) => el.textContent = this.currentTitle || "Unknown Track");
      if (this.verticalTitleElement) this.verticalTitleElement.textContent = this.currentTitle || "Unknown Track";
      this.artistElements?.forEach((el) => el.textContent = this.currentArtist || "Unknown Artist");
      if (index !== -1 && this.articleLinks && this.articleLinkTexts) {
        const songInfo = this.globalPlaylist[index];
        if (songInfo && songInfo.articleUrl && songInfo.articleTitle) {
          this.articleLinks.forEach((link) => {
            link.href = songInfo.articleUrl;
            link.classList.add("is-visible");
          });
          this.articleLinkTexts.forEach((text) => {
            text.textContent = songInfo.articleTitle;
          });
        } else {
          this.articleLinks.forEach((link) => link.classList.remove("is-visible"));
        }
      } else if (this.articleLinks) {
        this.articleLinks.forEach((link) => link.classList.remove("is-visible"));
      }
      this.updateUI();
      this.updatePlaylistUI();
      if (autoplay) {
        audio.play().catch((e) => console.warn(e));
      }
    } catch (err) {
      console.error("Failed to load global track", err);
    }
  }
  togglePlay() {
    if (!this.activeAudio) return;
    if (this.activeAudio.paused) {
      this.activeAudio.play().catch((e) => console.warn(e));
    } else {
      this.activeAudio.pause();
    }
  }
  playNext() {
    if (this.globalPlaylist.length === 0) return;
    let nextIndex = this.currentGlobalIndex + 1;
    if (nextIndex >= this.globalPlaylist.length) nextIndex = 0;
    const nextTrack = this.globalPlaylist[nextIndex];
    if (nextTrack) this.playTrack(nextTrack.id, true);
  }
  playPrev() {
    if (this.globalPlaylist.length === 0) return;
    let prevIndex = this.currentGlobalIndex - 1;
    if (prevIndex < 0) prevIndex = this.globalPlaylist.length - 1;
    const prevTrack = this.globalPlaylist[prevIndex];
    if (prevTrack) this.playTrack(prevTrack.id, true);
  }
  onSettingsChange(e) {
    const customEvent = e;
    if (customEvent.detail && customEvent.detail.disableBgPlayback) {
      if (this.activeAudio && !this.activeAudio.paused) {
        this.activeAudio.pause();
      }
    }
  }
  onTimeUpdate() {
    this.updateProgressUI();
  }
  onPlay() {
    this.updatePlayPauseUI(true);
    this.startVisualizer();
    document.dispatchEvent(new CustomEvent("daybook:global-play"));
  }
  onPause() {
    this.updatePlayPauseUI(false);
    this.startVisualizer();
  }
  onEnded() {
    this.updatePlayPauseUI(false);
    this.updateProgressUI(true);
    this.startVisualizer();
    this.playNext();
  }
  onError() {
    if (this.activeAudio) {
      this.activeAudio.pause();
    }
    this.updatePlayPauseUI(false);
    this.titleElements?.forEach((el) => el.textContent = "Error Loading Audio");
  }
  updatePlaylistUI() {
    if (!this.playlistContainers || this.playlistContainers.length === 0) return;
    this.playlistContainers.forEach((container) => {
      if (container.children.length === this.globalPlaylist.length) {
        this.globalPlaylist.forEach((song, index) => {
          const isActive = this.currentSourceId === song.id;
          const li = container.children[index];
          if (li) {
            if (isActive) {
              li.classList.add("is-active");
            } else {
              li.classList.remove("is-active");
            }
          }
        });
        return;
      }
      container.innerHTML = "";
      this.globalPlaylist.forEach((song) => {
        const isActive = this.currentSourceId === song.id;
        const li = document.createElement("li");
        li.className = "mm-playlist-item";
        if (isActive) li.classList.add("is-active");
        const indicator = document.createElement("div");
        indicator.className = "mm-eq-indicator";
        indicator.innerHTML = `<span class="mm-eq-bar"></span><span class="mm-eq-bar"></span><span class="mm-eq-bar"></span><span class="mm-eq-bar"></span>`;
        const info = document.createElement("div");
        info.className = "mm-playlist-item-info";
        const title = document.createElement("div");
        title.className = "mm-playlist-item-title";
        const cached = this.trackMetadataCache.get(song.id);
        title.textContent = cached ? cached.title : song.title || song.id;
        info.appendChild(title);
        li.appendChild(indicator);
        li.appendChild(info);
        li.addEventListener("click", () => {
          this.playTrack(song.id, true);
        });
        container.appendChild(li);
      });
    });
  }
  updateUI() {
    if (!this.activeAudio) return;
    this.updatePlayPauseUI(!this.activeAudio.paused);
    this.updateProgressUI();
  }
  updatePlayPauseUI(isPlaying) {
    const iconName = isPlaying ? "pause" : "play_arrow";
    if (this.desktopPlayPauseIcon) {
      this.desktopPlayPauseIcon.textContent = iconName;
    }
    this.coverWrappers?.forEach((wrapper) => {
      if (isPlaying) wrapper.classList.add("is-playing");
      else wrapper.classList.remove("is-playing");
    });
    if (this.collapsedTab) {
      if (isPlaying) this.collapsedTab.classList.add("is-playing");
      else this.collapsedTab.classList.remove("is-playing");
    }
    if (this.container) {
      if (isPlaying) this.container.classList.add("is-playing");
      else this.container.classList.remove("is-playing");
    }
  }
  updateProgressUI(forceEnded = false) {
    if (!this.activeAudio || !this.container) return;
    this.startVisualizer();
  }
  getCurrentSongId() {
    return this.currentSourceId;
  }
  isPlaying() {
    return this.activeAudio ? !this.activeAudio.paused : false;
  }
  async getTrackMetadata(songId) {
    if (this.trackMetadataCache.has(songId)) {
      return this.trackMetadataCache.get(songId);
    }
    const globalSongs = window.GLOBAL_NETEASE_SONGS || [];
    const songData = globalSongs.find((s) => s.id === songId);
    if (!songData) return null;
    const meta = {
      title: songData.title || songId,
      artist: songData.artistText || "Unknown Artist",
      cover: songData.coverURL || ""
    };
    this.trackMetadataCache.set(songId, meta);
    return meta;
  }
  getProgress(songId) {
    if (this.currentSourceId !== songId || !this.activeAudio) return null;
    return {
      currentTime: this.activeAudio.currentTime,
      duration: this.activeAudio.duration,
      progress: this.activeAudio.duration ? this.activeAudio.currentTime / this.activeAudio.duration : 0
    };
  }
};
_MediaManager.instance = null;
var MediaManager = _MediaManager;
var daybookMediaManager = MediaManager.getInstance();
window.daybookMediaManager = daybookMediaManager;
export {
  daybookMediaManager
};
//# sourceMappingURL=media-manager.js.map
