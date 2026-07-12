import { getSettings } from "./settings-store";

// The options interface is no longer needed since we pass args directly
class MediaManager {
  private static instance: MediaManager | null = null;

  private activeAudio: HTMLAudioElement | null = null;
  private currentArticleUrl: string | null = null;
  private currentSourceId: string | null = null;
  private currentTitle: string | null = null;
  private currentArtist: string | null = null;
  private currentCover: string | null = null;
  private isTakeoverActive: boolean = false;
  
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
  }

  private drawVisualizer(progress: number, phase: number) {
    if (!this.canvasCtx || !this.visualizerCanvas) return;
    const ctx = this.canvasCtx;
    const size = 180;
    const cx = size / 2;
    const cy = size / 2;
    const radius = 82; // Enclose the cover
    
    ctx.clearRect(0, 0, size, size);

    const startAngle = Math.PI; // -180 deg (Starts exactly at horizontal left)
    const sweepAngle = Math.PI; // 180 deg sweep (Ends exactly at horizontal right)
    const endAngle = startAngle + progress * sweepAngle;
    
    // Gap angle calculation (approximate padding + stroke width)
    const gapAngle = (14 / radius); 
    
    // 1. Draw remaining background track with a gap
    ctx.beginPath();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = 6;
    ctx.strokeStyle = "rgba(0, 102, 85, 0.15)";
    
    const bgStartAngle = endAngle + gapAngle;
    const bgEndAngle = startAngle + sweepAngle;
    if (bgStartAngle < bgEndAngle) {
       ctx.arc(cx, cy, radius, bgStartAngle, bgEndAngle);
       ctx.stroke();
    }

    if (progress <= 0) return;

    // 2. Draw progress arc with waves
    ctx.beginPath();
    ctx.strokeStyle = "#006655"; // primary color
    
    // N = qMax(64, qCeil(radius * drawAngleRad))
    const N = Math.max(64, Math.ceil(radius * (progress * sweepAngle)));
    const dTheta = (progress * sweepAngle) / N;
    
    // waveAmp is constant, even when paused
    const waveAmp = 4; 
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
    // Return button and close button were removed from UI in this redesign
  }

  public notifyPlay(audio: HTMLAudioElement, articleUrl: string, sourceId: string, title?: string, artist?: string, cover?: string) {
    // If there's an existing background audio from ANOTHER source, stop it to guarantee singleton playback.
    if (this.activeAudio && this.currentSourceId !== sourceId) {
       // If it's a completely different audio being played, release the old one.
       this.stopAndRelease();
    }

    this.activeAudio = audio;
    this.currentArticleUrl = articleUrl;
    this.currentSourceId = sourceId;
    if (title) this.currentTitle = title;
    if (artist) this.currentArtist = artist;
    if (cover) this.currentCover = cover;
  }

  public onBeforeSwap(oldUrl: string, newUrl: string) {
    if (!this.activeAudio || !this.currentArticleUrl || !this.currentSourceId) return;

    // Check if we are currently at the article containing the audio, and leaving it
    const oldUrlObj = new URL(oldUrl, location.origin);
    const sourceUrlObj = new URL(this.currentArticleUrl, location.origin);

    if (oldUrlObj.pathname === sourceUrlObj.pathname) {
      // Leaving the article
      const isMobile = window.innerWidth <= 768;
      
      if (isMobile) {
        this.stopAndRelease();
      } else if (!this.activeAudio.paused) {
        this.takeoverAudio();
      } else {
         // If it's paused when leaving, we just release it. We only takeover playing audio.
         this.stopAndRelease();
      }
    }
  }

  public onArticleContentSwapped() {
    // Check if we returned to the article URL
    if (this.isTakeoverActive && this.currentArticleUrl && this.currentSourceId) {
      const currentUrlObj = new URL(location.href);
      const sourceUrlObj = new URL(this.currentArticleUrl, location.origin);

      if (currentUrlObj.pathname === sourceUrlObj.pathname) {
        this.trySyncBack();
      }
    }
  }

  private takeoverAudio() {
    if (!this.activeAudio || !this.audioContainer) return;
    
    // Reparent audio to MediaManager
    this.audioContainer.appendChild(this.activeAudio);
    
    this.activeAudio.addEventListener("timeupdate", this.onTimeUpdateBound);
    this.activeAudio.addEventListener("play", this.onPlayBound);
    this.activeAudio.addEventListener("pause", this.onPauseBound);
    this.activeAudio.addEventListener("ended", this.onEndedBound);
    this.activeAudio.addEventListener("error", this.onErrorBound);

    this.isTakeoverActive = true;
    
    document.body.setAttribute("data-media-manager-active", "true");
    
    // Set metadata UI
    if (this.coverImage && this.currentCover) this.coverImage.src = this.currentCover;
    if (this.smallCoverImage && this.currentCover) this.smallCoverImage.src = this.currentCover;
    if (this.titleElement) this.titleElement.textContent = this.currentTitle || "Unknown Track";
    if (this.verticalTitleElement) this.verticalTitleElement.textContent = this.currentTitle || "Unknown Track";
    if (this.artistElement) this.artistElement.textContent = this.currentArtist || "Unknown Artist";

    // Initial sync
    this.updateUI();
  }

  public claimAudio(sourceId: string): HTMLAudioElement | null {
    if (this.isTakeoverActive && this.activeAudio && this.currentSourceId === sourceId) {
      const audio = this.activeAudio;
      this.releaseTakeoverState();
      return audio;
    }
    return null;
  }

  private trySyncBack() {
    // If the new article player claims the audio, it will call `claimAudio`.
    // So we don't need to do anything proactively here unless we want to clean up if it WASN'T claimed.
    // But since the new player renders after DOM swap, and setupNeteasePlayers is called synchronously after,
    // claimAudio will be called immediately.
  }

  private stopAndRelease() {
    if (this.activeAudio) {
      this.activeAudio.pause();
    }
    this.releaseTakeoverState();
    this.activeAudio = null;
    this.currentArticleUrl = null;
    this.currentSourceId = null;
  }

  private releaseTakeoverState() {
    if (this.activeAudio) {
      this.activeAudio.removeEventListener("timeupdate", this.onTimeUpdateBound);
      this.activeAudio.removeEventListener("play", this.onPlayBound);
      this.activeAudio.removeEventListener("pause", this.onPauseBound);
      this.activeAudio.removeEventListener("ended", this.onEndedBound);
      this.activeAudio.removeEventListener("error", this.onErrorBound);
      
      if (this.activeAudio.parentElement === this.audioContainer) {
          this.activeAudio.remove(); // just remove from our hidden container
      }
    }
    this.isTakeoverActive = false;
    document.body.setAttribute("data-media-manager-active", "false");
    if (this.coverWrapper) this.coverWrapper.classList.remove("is-playing");
    if (this.collapsedTab) this.collapsedTab.classList.remove("is-playing");
    if (this.expandedView) this.expandedView.classList.remove("is-playing");
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
  }

  private onPause() {
    this.updatePlayPauseUI(false);
    // Visualizer will stop automatically when smooth progress reaches target
    this.startVisualizer(); // trigger one more frame to ensure waveAmp goes to 0
  }

  private onEnded() {
    this.updatePlayPauseUI(false);
    this.updateProgressUI(true);
    this.startVisualizer();
  }

  private onError() {
    this.stopAndRelease();
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

    let percentage = 0;
    if (this.activeAudio.duration) {
       percentage = (this.activeAudio.currentTime / this.activeAudio.duration) * 100;
    }
    
    if (forceEnded) {
       percentage = 100;
    }

    // Always trigger visualizer to ensure it updates during seeking even if paused
    this.startVisualizer();
  }
}

export const daybookMediaManager = MediaManager.getInstance();

document.addEventListener("daybook:before-swap", (e: Event) => {
  const ce = e as CustomEvent;
  daybookMediaManager.onBeforeSwap(ce.detail.oldUrl, ce.detail.newUrl);
});

document.addEventListener("daybook:article-content-swapped", () => {
  daybookMediaManager.onArticleContentSwapped();
});

// Also trigger on page-load in case of traversing back/forward
document.addEventListener("daybook:page-load", (e: Event) => {
  const ce = e as CustomEvent;
  // page-load event might happen on initial load, or traverse
  if (ce.detail.navigationType === "traverse") {
    daybookMediaManager.onArticleContentSwapped();
  }
});
