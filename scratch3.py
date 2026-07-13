import re

with open("assets/ts/media-manager.ts", "r") as f:
    content = f.read()

# 1. Add currentPlayRequest and trackMetadataCache properties
props = """  private currentGlobalIndex: number = -1;
  
  private currentPlayRequest: symbol | null = null;
  private trackMetadataCache: Map<string, {title: string, artist: string, cover: string}> = new Map();
"""
content = re.sub(r'  private currentGlobalIndex: number = -1;\n', props, content)

# 2. Add getTrackMetadata and getProgress to MediaManager
extra_methods = """  public async getTrackMetadata(songId: string) {
    if (this.trackMetadataCache.has(songId)) {
      return this.trackMetadataCache.get(songId);
    }
    const apiBase = document.body.dataset.neteaseApiBaseUrl?.replace(/\\/$/, "");
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
"""

end_of_class = content.rfind("}")
content = content[:end_of_class] + extra_methods + content[end_of_class:]

# 3. Update playTrack to use symbol for race conditions
def replace_play_track(text):
    start_str = "public async playTrack(songId: string, autoplay: boolean = true) {"
    start = text.find(start_str)
    end = text.find("public togglePlay() {", start)
    
    new_play_track = """public async playTrack(songId: string, autoplay: boolean = true) {
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
      this.dispatchStateChange();

      if (autoplay) {
        audio.play().catch(e => console.warn(e));
      }
    } catch(err) {
       console.error("Failed to load global track", err);
    }
  }

  """
    return text[:start] + new_play_track + text[end:]

content = replace_play_track(content)

# Note: daybook:media-timeupdate is removed from onTimeUpdate, since embeds will poll. 
# Oh wait, we can just leave it there just in case, but embeds won't listen to it.
# Actually I will remove it to save CPU and rely purely on the poll.
content = content.replace("this.dispatchTimeUpdate();", "")

with open("assets/ts/media-manager.ts", "w") as f:
    f.write(content)

