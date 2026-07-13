import re

with open("assets/ts/media-manager.ts", "r") as f:
    content = f.read()

# 1. Remove isTakeoverActive, isGlobalMode, currentArticleUrl
content = re.sub(r'  private currentArticleUrl: string \| null = null;\n', '', content)
content = re.sub(r'  private isTakeoverActive: boolean = false;\n', '', content)
content = re.sub(r'  private isGlobalMode: boolean = true;\n', '', content)

# 2. Add dispatchEvent method
dispatch_method = """  private dispatchStateChange() {
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
  }"""
init_dom_idx = content.find("private initDOM()")
content = content[:init_dom_idx] + dispatch_method + "\n\n" + content[init_dom_idx:]

# 3. Modify initDOM to call playTrack instead of loadGlobalTrack
content = content.replace("this.loadGlobalTrack(0, false);", "this.playTrack(this.globalPlaylist[0], false);")

# 4. Remove takeoverAudio, claimAudio, trySyncBack, stopAndRelease, releaseTakeoverState, onBeforeSwap, onArticleContentSwapped, notifyPlay
# This is a bit tricky to remove precisely with replace, I will rewrite the class body after bindEvents().

def extract_up_to(string, target):
    idx = string.find(target)
    return string[:idx]

part1 = extract_up_to(content, "private async loadGlobalTrack")

part2 = """  public async playTrack(songId: string, autoplay: boolean = true) {
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
    
    const apiBase = document.body.dataset.neteaseApiBaseUrl?.replace(/\\/$/, "");
    if (!apiBase) return;
    
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

      const detailRes = await fetch(`${apiBase}/song/detail?ids=${songId}`);
      const detailData = await detailRes.json();
      const songDetail = detailData.songs?.[0];

      if (!songUrl || !songDetail) return;

      const title = songDetail.name;
      const artist = songDetail.ar?.[0]?.name;
      const cover = songDetail.al?.picUrl;

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
      this.dispatchStateChange();

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
    this.playTrack(this.globalPlaylist[nextIndex], true);
  }

  private playPrev() {
    if (this.globalPlaylist.length === 0) return;
    let prevIndex = this.currentGlobalIndex - 1;
    if (prevIndex < 0) prevIndex = this.globalPlaylist.length - 1;
    this.playTrack(this.globalPlaylist[prevIndex], true);
  }

  private onSettingsChange(e: Event) {
    // Currently no settings affect media-manager
  }

  private onTimeUpdate() {
    this.updateProgressUI();
    this.dispatchTimeUpdate();
  }

  private onPlay() {
    this.updatePlayPauseUI(true);
    this.startVisualizer();
    this.dispatchStateChange();
  }

  private onPause() {
    this.updatePlayPauseUI(false);
    this.startVisualizer();
    this.dispatchStateChange();
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
}

export const daybookMediaManager = MediaManager.getInstance();

(window as any).daybookMediaManager = daybookMediaManager;
"""

with open("assets/ts/media-manager.ts", "w") as f:
    f.write(part1 + part2)

