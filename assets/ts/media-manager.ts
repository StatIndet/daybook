import { getSettings } from "./settings-store";

// The options interface is no longer needed since we pass args directly
class MediaManager {
  private static instance: MediaManager | null = null;

  private activeAudio: HTMLAudioElement | null = null;
  private currentSourceId: string | null = null;
  private currentTitle: string | null = null;
  private currentArtist: string | null = null;
  private currentCover: string | null = null;
  private globalPlaylist: string[] = [];
  private currentGlobalIndex: number = -1;
  
  private currentPlayRequest: symbol | null = null;
  private trackMetadataCache: Map<string, {title: string, artist: string, cover: string}> = new Map();
  
  private container: HTMLElement | null = null;
  private audioContainer: HTMLElement | null = null;

  // Desktop UI elements
  private desktopPlayPauseBtn: HTMLElement | null = null;
  private desktopPlayPauseIcon: HTMLElement | null = null;
  private coverImage: HTMLImageElement | null = null;
  private coverWrapper: HTMLElement | null = null;
  private titleElement: HTMLElement | null = null;
  private artistElement: HTMLElement | null = null;
  private visualizerCanvas: HTMLCanvasElement | null = null;
  private canvasCtx: CanvasRenderingContext2D | null = null;
  private smallCoverImage: HTMLImageElement | null = null;
  private verticalTitleElement: HTMLElement | null = null;
  private collapsedTab: HTMLElement | null = null;
  private expandedView: HTMLElement | null = null;

  // Event handlers bound to instance
  private onTimeUpdateBound: () => void;
  private onPlayBound: () => void;
  private onPauseBound: () => void;
  private onEndedBound: () => void;
  private onErrorBound: () => void;
  private onSettingsChangeBound: (e: Event) => void;
  
  private visualizerReqId: number | null = null;
  private wavePhase: number = 0;
  private lastTime: number = 0;
  private smoothedProgress: number = 0;
  private isVisualizerRunning: boolean = false;

  private constructor() {
    this.onTimeUpdateBound = this.onTimeUpdate.bind(this);
    this.onPlayBound = this.onPlay.bind(this);
    this.onPauseBound = this.onPause.bind(this);
    this.onEndedBound = this.onEnded.bind(this);
    this.onErrorBound = this.onError.bind(this);
    this.onSettingsChangeBound = this.onSettingsChange.bind(this);

    this.initDOM();
    this.bindEvents();
    
    // Listen to global settings change
    document.addEventListener("daybook:settings-change", this.onSettingsChangeBound);
  }

  public static getInstance(): MediaManager {
    if (!MediaManager.instance) {
      MediaManager.instance = new MediaManager();
    }
    return MediaManager.instance;
  }

    private dispatchStateChange() {
    document.dispatchEvent(new CustomEvent('daybook:media-state-change', {
      detail: {
        songId: this.currentSourceId,
        isPlaying: this.activeAudio ? !this.activeAudio.paused : false,
        title: this.currentTitle,
        artist: this.currentArtist,
        cover: this.currentCover
      }
    }));
  }

  private dispatchTimeUpdate() {
    if (!this.activeAudio || !this.currentSourceId) return;
    document.dispatchEvent(new CustomEvent('daybook:media-timeupdate', {
      detail: {
        songId: this.currentSourceId,
        progress: this.activeAudio.duration ? (this.activeAudio.currentTime / this.activeAudio.duration) : 0,
        currentTime: this.activeAudio.currentTime,
        duration: this.activeAudio.duration
      }
    }));
  }

private initDOM() {
    this.container = document.getElementById("daybook-media-manager");
    if (!this.container) return;

    this.audioContainer = this.container.querySelector(".mm-audio-container");

    this.desktopPlayPauseBtn = this.container.querySelector(".mm-btn-play-pause");
    this.desktopPlayPauseIcon = this.container.querySelector(".mm-btn-play-pause .mm-icon-current");
    
    this.coverImage = this.container.querySelector(".mm-cover-image");
    this.coverWrapper = this.container.querySelector(".mm-cover-wrapper");
    this.titleElement = this.container.querySelector(".mm-title");
    this.artistElement = this.container.querySelector(".mm-artist");
    this.visualizerCanvas = this.container.querySelector(".mm-visualizer-canvas");
    if (this.visualizerCanvas) {
      this.canvasCtx = this.visualizerCanvas.getContext("2d");
      // Scale canvas for retina display
      const size = 180;
      this.visualizerCanvas.width = size * 2;
      this.visualizerCanvas.height = size * 2;
      this.visualizerCanvas.style.width = size + "px";
      this.visualizerCanvas.style.height = size + "px";
      if (this.canvasCtx) {
        this.canvasCtx.scale(2, 2);
      }
    }
    this.smallCoverImage = this.container.querySelector(".mm-small-cover");
    this.verticalTitleElement = this.container.querySelector(".mm-vertical-title");
    this.collapsedTab = this.container.querySelector(".mm-collapsed-tab");
    this.expandedView = this.container.querySelector(".mm-expanded-view");
  
    if ((window as any).GLOBAL_NETEASE_SONGS && Array.isArray((window as any).GLOBAL_NETEASE_SONGS)) {
      this.globalPlaylist = (window as any).GLOBAL_NETEASE_SONGS;
    }
    
    // Always show background player if there are songs and it's not disabled
    if (this.globalPlaylist.length > 0) {
      document.body.setAttribute("data-media-manager-active", "true");
      // Load first track info
      const firstTrack = this.globalPlaylist[0];
      if (firstTrack) {
        this.playTrack(firstTrack, false);
      }
    }
  }

  private cachedThemeColors = { accent: "#6750a4", accentSoft: "rgba(103, 80, 164, 0.18)", lastCheck: 0 };
  private getThemeColors() {
    const now = performance.now();
    if (now - this.cachedThemeColors.lastCheck > 1000) {
      const rootStyle = getComputedStyle(document.documentElement);
      const acc = rootStyle.getPropertyValue('--color-accent').trim();
      const accSoft = rootStyle.getPropertyValue('--color-accent-soft-strong').trim();
      if (acc) this.cachedThemeColors.accent = acc;
      if (accSoft) this.cachedThemeColors.accentSoft = accSoft;
      this.cachedThemeColors.lastCheck = now;
    }
    return this.cachedThemeColors;
  }

  private drawVisualizer(progress: number, phase: number) {
    if (!this.canvasCtx || !this.visualizerCanvas) return;
    const ctx = this.canvasCtx;
    const size = 180;
    const cx = size / 2;
    const cy = size / 2;
    const radius = 84; // From CircularProgress calculation
    
    ctx.clearRect(0, 0, size, size);

    const startAngle = Math.PI; // -180 deg (Starts exactly at horizontal left)
    const sweepAngle = Math.PI; // 180 deg sweep (Ends exactly at horizontal right)
    const endAngle = startAngle + progress * sweepAngle;
    
    // Gap angle calculation (approximate padding + stroke width)
    const gapAngle = (14 / radius); 
    const colors = this.getThemeColors();
    
    // 1. Draw remaining background track with a gap
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

    if (progress <= 0) return;

    // 2. Draw progress arc with waves
    ctx.beginPath();
    ctx.strokeStyle = colors.accent;
    
    // N = qMax(64, qCeil(radius * drawAngleRad))
    const N = Math.max(64, Math.ceil(radius * (progress * sweepAngle)));
    const dTheta = (progress * sweepAngle) / N;
    
    // waveAmp is strokeWidth * amplitudeMultiplier (6 * 0.5)
    const waveAmp = 3; 
    const waveFreq = 8; // 8 waves for the longer arc
    const arcLen = radius * sweepAngle; // full length of the track

    for (let i = 0; i <= N; i++) {
      const theta = startAngle + i * dTheta;
      const s = i * dTheta * radius; // distance along arc
      
      // QML formula: phi = frequency * 2 * M_PI * (s / len) + phase
      const phi = waveFreq * 2 * Math.PI * (s / arcLen) + phase;
      
      // No edge damping! Ends vibrate!
      const r = radius + waveAmp * Math.sin(phi);
      
      const px = cx + r * Math.cos(theta);
      const py = cy + r * Math.sin(theta);
      
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    
    ctx.stroke();
    // Do NOT draw a circle thumb, the gap is the indicator!
  }

  private visualizerLoop = (t: number) => {
    if (!this.isVisualizerRunning) return;
    
    const dt = t - (this.lastTime || t);
    this.lastTime = t;
    
    // Update phase only if playing
    if (this.activeAudio && !this.activeAudio.paused) {
      this.wavePhase += dt * 0.003;
    }

    const targetProgress = (this.activeAudio && this.activeAudio.duration) 
      ? (this.activeAudio.currentTime / this.activeAudio.duration) 
      : 0;
      
    // Smooth progress
    this.smoothedProgress += (targetProgress - this.smoothedProgress) * 0.15;
    
    this.drawVisualizer(this.smoothedProgress, this.wavePhase);

    // Keep looping if playing or if smoothing hasn't reached target
    if ((this.activeAudio && !this.activeAudio.paused) || Math.abs(this.smoothedProgress - targetProgress) > 0.001) {
      this.visualizerReqId = requestAnimationFrame(this.visualizerLoop);
    } else {
      this.visualizerReqId = null;
      this.isVisualizerRunning = false;
    }
  }

  private startVisualizer() {
    if (!this.isVisualizerRunning) {
      this.isVisualizerRunning = true;
      this.lastTime = performance.now();
      this.visualizerReqId = requestAnimationFrame(this.visualizerLoop);
    }
  }


    private bindEvents() {
    const togglePlay = () => {
      if (!this.activeAudio) return;
      if (this.activeAudio.paused) {
        this.activeAudio.play().catch(e => console.warn("MediaManager play rejected:", e));
      } else {
        this.activeAudio.pause();
      }
    };

    this.desktopPlayPauseBtn?.addEventListener("click", togglePlay);
    
    const prevBtn = this.container?.querySelector(".mm-btn-prev");
    const nextBtn = this.container?.querySelector(".mm-btn-next");
    prevBtn?.addEventListener("click", () => this.playPrev());
    nextBtn?.addEventListener("click", () => this.playNext());

    document.addEventListener('daybook:embed-play', async (e: any) => {
      const songId = e.detail.songId;
      if (!songId) return;
      
      // Pause self if playing
      if (this.activeAudio && !this.activeAudio.paused) {
        this.activeAudio.pause();
      }

      // Load metadata and set UI, but do NOT play
      const meta = await this.getTrackMetadata(songId);
      if (!meta) return;
      
      this.currentSourceId = songId;
      this.currentTitle = meta.title;
      this.currentArtist = meta.artist;
      this.currentCover = meta.cover;

      if (this.coverImage && this.currentCover) this.coverImage.src = this.currentCover;
      if (this.smallCoverImage && this.currentCover) this.smallCoverImage.src = this.currentCover;
      if (this.titleElement) this.titleElement.textContent = this.currentTitle || "Unknown Track";
      if (this.verticalTitleElement) this.verticalTitleElement.textContent = this.currentTitle || "Unknown Track";
      if (this.artistElement) this.artistElement.textContent = this.currentArtist || "Unknown Artist";
      
      // Ensure audio src is loaded so if user clicks play, it works
      const apiBase = document.body.dataset.neteaseApiBaseUrl?.replace(/\/$/, "");
      if (!apiBase) return;

      const playRequest = Symbol("playRequest");
      this.currentPlayRequest = playRequest;

      const urlRes = await fetch(`${apiBase}/song/url?id=${songId}&realIP=116.25.146.177`);
      const urlData = await urlRes.json();
      const songUrl = urlData.data?.[0]?.url;

      if (this.currentPlayRequest !== playRequest) return;
      if (!songUrl) return;
      
      if (this.activeAudio) {
        this.activeAudio.pause();
        if (this.activeAudio.parentElement === this.audioContainer) {
          this.activeAudio.remove();
        }
      }

      const audio = document.createElement("audio");
      audio.src = songUrl;
      audio.crossOrigin = "anonymous";
      
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
      
      // Update UI but it's paused and at time 0
      this.updatePlayPauseUI(false);
      this.updateProgressUI(false);
      
      // Also update global index if it's in the list so next/prev works
      const index = this.globalPlaylist.indexOf(songId);
      if (index !== -1) {
        this.currentGlobalIndex = index;
      }
    });
  }

  public async playTrack(songId: string, autoplay: boolean = true) {
    if (!songId) return;
    
    // Update global index if it's in the playlist
    const index = this.globalPlaylist.indexOf(songId);
    if (index !== -1) {
      this.currentGlobalIndex = index;
    }

    if (this.currentSourceId === songId && this.activeAudio) {
      // Toggle play/pause if it's the same song
      if (this.activeAudio.paused) {
        this.activeAudio.play().catch(e => console.warn(e));
      } else {
        this.activeAudio.pause();
      }
      return;
    }
    
    const apiBase = document.body.dataset.neteaseApiBaseUrl?.replace(/\/$/, "");
    if (!apiBase) return;
    
    const playRequest = Symbol("playRequest");
    this.currentPlayRequest = playRequest;

    try {
      if (this.activeAudio) {
        this.activeAudio.pause();
        if (this.activeAudio.parentElement === this.audioContainer) {
          this.activeAudio.remove();
        }
      }

      const urlRes = await fetch(`${apiBase}/song/url?id=${songId}&realIP=116.25.146.177`);
      const urlData = await urlRes.json();
      const songUrl = urlData.data?.[0]?.url;

      const meta = await this.getTrackMetadata(songId);

      // Check for race condition
      if (this.currentPlayRequest !== playRequest) {
         return; // Abort if another request was made
      }

      if (!songUrl || !meta) return;

      const title = meta.title;
      const artist = meta.artist;
      const cover = meta.cover;

      const audio = document.createElement("audio");
      audio.src = songUrl;
      audio.crossOrigin = "anonymous";
      
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

      if (this.coverImage && this.currentCover) this.coverImage.src = this.currentCover;
      if (this.smallCoverImage && this.currentCover) this.smallCoverImage.src = this.currentCover;
      if (this.titleElement) this.titleElement.textContent = this.currentTitle || "Unknown Track";
      if (this.verticalTitleElement) this.verticalTitleElement.textContent = this.currentTitle || "Unknown Track";
      if (this.artistElement) this.artistElement.textContent = this.currentArtist || "Unknown Artist";
      
      this.updateUI();
      

      if (autoplay) {
        audio.play().catch(e => console.warn(e));
      }
    } catch(err) {
       console.error("Failed to load global track", err);
    }
  }

  public togglePlay() {
    if (!this.activeAudio) return;
    if (this.activeAudio.paused) {
      this.activeAudio.play().catch(e => console.warn(e));
    } else {
      this.activeAudio.pause();
    }
  }

  private playNext() {
    if (this.globalPlaylist.length === 0) return;
    let nextIndex = this.currentGlobalIndex + 1;
    if (nextIndex >= this.globalPlaylist.length) nextIndex = 0;
    const nextTrack = this.globalPlaylist[nextIndex];
    if (nextTrack) this.playTrack(nextTrack, true);
  }

  private playPrev() {
    if (this.globalPlaylist.length === 0) return;
    let prevIndex = this.currentGlobalIndex - 1;
    if (prevIndex < 0) prevIndex = this.globalPlaylist.length - 1;
    const prevTrack = this.globalPlaylist[prevIndex];
    if (prevTrack) this.playTrack(prevTrack, true);
  }

  private onSettingsChange(e: Event) {
    // Currently no settings affect media-manager
  }

  private onTimeUpdate() {
    this.updateProgressUI();
    
  }

  private onPlay() {
    this.updatePlayPauseUI(true);
    this.startVisualizer();
    document.dispatchEvent(new CustomEvent('daybook:global-play'));
  }

  private onPause() {
    this.updatePlayPauseUI(false);
    this.startVisualizer();
    
  }

  private onEnded() {
    this.updatePlayPauseUI(false);
    this.updateProgressUI(true);
    this.startVisualizer();
    this.playNext();
  }

  private onError() {
    if (this.activeAudio) {
      this.activeAudio.pause();
    }
  }

  private updateUI() {
    if (!this.activeAudio) return;
    this.updatePlayPauseUI(!this.activeAudio.paused);
    this.updateProgressUI();
  }

  private updatePlayPauseUI(isPlaying: boolean) {
    const iconName = isPlaying ? "pause" : "play_arrow";
    
    if (this.desktopPlayPauseIcon) {
      this.desktopPlayPauseIcon.textContent = iconName;
    }

    if (this.coverWrapper) {
      if (isPlaying) this.coverWrapper.classList.add("is-playing");
      else this.coverWrapper.classList.remove("is-playing");
    }
    
    if (this.collapsedTab) {
      if (isPlaying) this.collapsedTab.classList.add("is-playing");
      else this.collapsedTab.classList.remove("is-playing");
    }
    
    if (this.expandedView) {
      if (isPlaying) this.expandedView.classList.add("is-playing");
      else this.expandedView.classList.remove("is-playing");
    }
  }

  private updateProgressUI(forceEnded: boolean = false) {
    if (!this.activeAudio || !this.container) return;
    this.startVisualizer();
  }
  
  public getCurrentSongId() {
    return this.currentSourceId;
  }
  
  public isPlaying() {
    return this.activeAudio ? !this.activeAudio.paused : false;
  }
  public async getTrackMetadata(songId: string) {
    if (this.trackMetadataCache.has(songId)) {
      return this.trackMetadataCache.get(songId);
    }
    const apiBase = document.body.dataset.neteaseApiBaseUrl?.replace(/\/$/, "");
    if (!apiBase) return null;
    try {
      const detailRes = await fetch(`${apiBase}/song/detail?ids=${songId}`);
      const detailData = await detailRes.json();
      const songDetail = detailData.songs?.[0];
      if (!songDetail) return null;
      const meta = {
        title: songDetail.name,
        artist: songDetail.ar?.[0]?.name,
        cover: songDetail.al?.picUrl
      };
      this.trackMetadataCache.set(songId, meta);
      return meta;
    } catch (e) {
      console.error("Failed to fetch track metadata", e);
      return null;
    }
  }

  public getProgress(songId: string): { currentTime: number, duration: number, progress: number } | null {
    if (this.currentSourceId !== songId || !this.activeAudio) return null;
    return {
      currentTime: this.activeAudio.currentTime,
      duration: this.activeAudio.duration,
      progress: this.activeAudio.duration ? this.activeAudio.currentTime / this.activeAudio.duration : 0
    };
  }
}

export const daybookMediaManager = MediaManager.getInstance();

(window as any).daybookMediaManager = daybookMediaManager;
