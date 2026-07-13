import re

with open("assets/ts/media-manager.ts", "r") as f:
    content = f.read()

# 1. Update bindEvents to add listener for daybook:embed-play
bind_events = """  private bindEvents() {
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
      const apiBase = document.body.dataset.neteaseApiBaseUrl?.replace(/\\/$/, "");
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
"""

bind_events_start = content.find("private bindEvents()")
bind_events_end = content.find("public async playTrack(", bind_events_start)

content = content[:bind_events_start] + bind_events + "\n  " + content[bind_events_end:]

# 2. Modify playTrack to dispatch global-play and update onPlay event dispatcher
content = content.replace("this.dispatchStateChange();", "") # Remove the old dispatchStateChange calls since we don't use them

global_play_dispatch = """  private onPlay() {
    this.updatePlayPauseUI(true);
    this.startVisualizer();
    document.dispatchEvent(new CustomEvent('daybook:global-play'));
  }"""
content = re.sub(r'  private onPlay\(\) \{.*?(?=  private onPause\(\) \{)', global_play_dispatch + "\n\n", content, flags=re.DOTALL)


with open("assets/ts/media-manager.ts", "w") as f:
    f.write(content)

