import re

with open("assets/ts/media-manager.ts", "r") as f:
    content = f.read()

# 1. Add DOM variables
target1 = """  // Desktop UI elements
  private desktopPlayPauseBtn: HTMLElement | null = null;"""
replacement1 = """  // Mobile UI elements
  private mobileFab: HTMLElement | null = null;
  private mobileUI: HTMLElement | null = null;
  private mobileBackdrop: HTMLElement | null = null;
  private mobileCover: HTMLImageElement | null = null;
  private mobileCoverLink: HTMLAnchorElement | null = null;
  private mobileTitle: HTMLElement | null = null;
  private mobileArtist: HTMLElement | null = null;
  private mobilePlayPauseBtn: HTMLElement | null = null;
  private mobilePlayPauseIcon: HTMLElement | null = null;
  private mobilePrevBtn: HTMLElement | null = null;
  private mobileNextBtn: HTMLElement | null = null;
  
  private isMobilePanelOpen: boolean = false;

  // Desktop UI elements
  private desktopPlayPauseBtn: HTMLElement | null = null;"""
content = content.replace(target1, replacement1)

# 2. Query DOM variables in initDOM
target2 = """    this.desktopPlayPauseBtn = this.container.querySelector(".mm-btn-play-pause");"""
replacement2 = """    this.mobileFab = this.container.querySelector(".mobile-media-fab");
    this.mobileUI = this.container.querySelector(".mm-mobile-ui");
    this.mobileBackdrop = this.container.querySelector(".mm-mobile-backdrop");
    this.mobileCover = this.container.querySelector(".mm-mobile-cover");
    this.mobileCoverLink = this.container.querySelector(".mm-mobile-cover-link");
    this.mobileTitle = this.container.querySelector(".mm-mobile-title");
    this.mobileArtist = this.container.querySelector(".mm-mobile-artist");
    this.mobilePlayPauseBtn = this.container.querySelector(".mm-mobile-btn-play-pause");
    this.mobilePlayPauseIcon = this.container.querySelector(".mm-mobile-btn-play-pause .mm-mobile-morph-icon");
    this.mobilePrevBtn = this.container.querySelector(".mm-mobile-btn-prev");
    this.mobileNextBtn = this.container.querySelector(".mm-mobile-btn-next");

    this.desktopPlayPauseBtn = this.container.querySelector(".mm-btn-play-pause");"""
content = content.replace(target2, replacement2)

# 3. bindEvents
target3 = """    if (this.desktopPlayPauseBtn) {
      this.desktopPlayPauseBtn.addEventListener("click", () => this.togglePlay());
    }"""
replacement3 = """    if (this.desktopPlayPauseBtn) {
      this.desktopPlayPauseBtn.addEventListener("click", () => this.togglePlay());
    }
    
    if (this.mobilePlayPauseBtn) {
      this.mobilePlayPauseBtn.addEventListener("click", () => this.togglePlay());
    }
    
    if (this.mobilePrevBtn) {
      this.mobilePrevBtn.addEventListener("click", () => this.playPrev());
    }
    
    if (this.mobileNextBtn) {
      this.mobileNextBtn.addEventListener("click", () => this.playNext());
    }
    
    if (this.mobileFab) {
      this.mobileFab.addEventListener("click", () => {
        this.isMobilePanelOpen = !this.isMobilePanelOpen;
        if (this.mobileUI) {
          if (this.isMobilePanelOpen) {
            this.mobileUI.classList.add("is-open");
          } else {
            this.mobileUI.classList.remove("is-open");
          }
        }
      });
    }
    
    if (this.mobileBackdrop) {
      this.mobileBackdrop.addEventListener("click", () => {
        this.isMobilePanelOpen = false;
        if (this.mobileUI) this.mobileUI.classList.remove("is-open");
      });
    }"""
content = content.replace(target3, replacement3)

# 4. updateUI inside playTrack
target4 = """      if (this.coverImage && this.currentCover) this.coverImage.src = this.currentCover;
      if (this.smallCoverImage && this.currentCover) this.smallCoverImage.src = this.currentCover;
      if (this.titleElement) this.titleElement.textContent = this.currentTitle || "Unknown Track";
      if (this.verticalTitleElement) this.verticalTitleElement.textContent = this.currentTitle || "Unknown Track";
      if (this.artistElement) this.artistElement.textContent = this.currentArtist || "Unknown Artist";"""
replacement4 = """      if (this.coverImage && this.currentCover) this.coverImage.src = this.currentCover;
      if (this.smallCoverImage && this.currentCover) this.smallCoverImage.src = this.currentCover;
      if (this.mobileCover && this.currentCover) this.mobileCover.src = this.currentCover;
      
      if (this.titleElement) this.titleElement.textContent = this.currentTitle || "Unknown Track";
      if (this.verticalTitleElement) this.verticalTitleElement.textContent = this.currentTitle || "Unknown Track";
      if (this.mobileTitle) this.mobileTitle.textContent = this.currentTitle || "Unknown Track";
      
      if (this.artistElement) this.artistElement.textContent = this.currentArtist || "Unknown Artist";
      if (this.mobileArtist) this.mobileArtist.textContent = this.currentArtist || "Unknown Artist";"""
content = content.replace(target4, replacement4)

# 5. articleLink inside playTrack
target5 = """         if (songInfo) {
           this.articleLink.href = songInfo.articleUrl;
           this.articleLinkText.textContent = songInfo.articleTitle;
           this.articleLink.classList.add("is-visible");
         } else {
           this.articleLink.classList.remove("is-visible");
         }"""
replacement5 = """         if (songInfo) {
           this.articleLink.href = songInfo.articleUrl;
           this.articleLinkText.textContent = songInfo.articleTitle;
           this.articleLink.classList.add("is-visible");
           if (this.mobileCoverLink) this.mobileCoverLink.href = songInfo.articleUrl;
         } else {
           this.articleLink.classList.remove("is-visible");
           if (this.mobileCoverLink) this.mobileCoverLink.removeAttribute("href");
         }"""
content = content.replace(target5, replacement5)

# 6. updatePlayPauseUI
target6 = """    if (this.desktopPlayPauseBtn) {
      if (isPlaying) {
        this.desktopPlayPauseBtn.setAttribute("aria-label", "Pause");
        this.container?.classList.add("is-playing");
      } else {
        this.desktopPlayPauseBtn.setAttribute("aria-label", "Play");
        this.container?.classList.remove("is-playing");
      }
    }"""
replacement6 = """    if (this.desktopPlayPauseBtn) {
      if (isPlaying) {
        this.desktopPlayPauseBtn.setAttribute("aria-label", "Pause");
        this.container?.classList.add("is-playing");
      } else {
        this.desktopPlayPauseBtn.setAttribute("aria-label", "Play");
        this.container?.classList.remove("is-playing");
      }
    }
    if (this.mobilePlayPauseBtn) {
      if (isPlaying) {
        this.mobilePlayPauseBtn.setAttribute("aria-label", "Pause");
      } else {
        this.mobilePlayPauseBtn.setAttribute("aria-label", "Play");
      }
    }"""
content = content.replace(target6, replacement6)

with open("assets/ts/media-manager.ts", "w") as f:
    f.write(content)
