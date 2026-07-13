import re

with open("assets/ts/media-manager.ts", "r") as f:
    content = f.read()

# Update globalPlaylist type
target1 = "private globalPlaylist: string[] = [];"
replacement1 = """interface GlobalSong {
  id: string;
  articleTitle: string;
  articleUrl: string;
}
  private globalPlaylist: GlobalSong[] = [];"""
content = content.replace(target1, replacement1)

# Update DOM properties
target2 = "private activeAudio: HTMLAudioElement | null = null;"
replacement2 = """private activeAudio: HTMLAudioElement | null = null;
  private articleLink: HTMLAnchorElement | null = null;
  private articleLinkText: HTMLElement | null = null;"""
content = content.replace(target2, replacement2)

# Query DOM properties
target3 = "this.audioContainer = this.container.querySelector(\".mm-audio-container\");"
replacement3 = """this.audioContainer = this.container.querySelector(".mm-audio-container");
    this.articleLink = this.container.querySelector(".mm-article-link");
    this.articleLinkText = this.container.querySelector(".mm-article-link-text");"""
content = content.replace(target3, replacement3)

# Update getTrackUrl function signature logic if any... wait, there is none.

# Update indexOf logic
target4 = "const index = this.globalPlaylist.indexOf(songId);"
replacement4 = "const index = this.globalPlaylist.findIndex(s => s.id === songId);"
content = content.replace(target4, replacement4)

# Update playTrack logic for first item (it passed a string, needs to pass songId)
target5 = """const firstTrack = this.globalPlaylist[0];
      if (firstTrack) {
        this.playTrack(firstTrack, false);
      }"""
replacement5 = """const firstTrack = this.globalPlaylist[0];
      if (firstTrack) {
        this.playTrack(firstTrack.id, false);
      }"""
content = content.replace(target5, replacement5)

# Next/Prev logic
target6 = """const nextTrack = this.globalPlaylist[nextIndex];
    if (nextTrack) this.playTrack(nextTrack, true);"""
replacement6 = """const nextTrack = this.globalPlaylist[nextIndex];
    if (nextTrack) this.playTrack(nextTrack.id, true);"""
content = content.replace(target6, replacement6)

target7 = """const prevTrack = this.globalPlaylist[prevIndex];
    if (prevTrack) this.playTrack(prevTrack, true);"""
replacement7 = """const prevTrack = this.globalPlaylist[prevIndex];
    if (prevTrack) this.playTrack(prevTrack.id, true);"""
content = content.replace(target7, replacement7)

# Update playTrack method signature to add updating article link
# We need to insert it in `playTrack` and the `daybook:embed-play` listener.
def insert_after(text, search, addition):
    idx = text.find(search)
    if idx == -1: return text
    return text[:idx + len(search)] + addition + text[idx + len(search):]

addition_ui = """
      if (index !== -1 && this.articleLink && this.articleLinkText) {
         const songInfo = this.globalPlaylist[index];
         this.articleLink.href = songInfo.articleUrl;
         this.articleLinkText.textContent = songInfo.articleTitle;
         this.articleLink.classList.add("is-visible");
      } else if (this.articleLink) {
         this.articleLink.classList.remove("is-visible");
      }"""

content = insert_after(content, 'this.artistElement.textContent = this.currentArtist || "Unknown Artist";', addition_ui)

with open("assets/ts/media-manager.ts", "w") as f:
    f.write(content)
