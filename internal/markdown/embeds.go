package markdown

import (
	"fmt"
	stdhtml "html"
	"net/url"
	"regexp"
	"strings"
)

var (
	githubOwnerPattern = regexp.MustCompile(`^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38}[A-Za-z0-9])?$`)
	githubRepoPattern  = regexp.MustCompile(`^[A-Za-z0-9._-]{1,100}$`)
	youtubeIDPattern   = regexp.MustCompile(`^[A-Za-z0-9_-]{11}$`)
	bilibiliBVPattern  = regexp.MustCompile(`^BV[A-Za-z0-9]{10}$`)
	spotifyIDPattern   = regexp.MustCompile(`^[A-Za-z0-9]+$`)
	codepenPartPattern = regexp.MustCompile(`^[A-Za-z0-9_-]+$`)
	digitsPattern      = regexp.MustCompile(`^[0-9]+$`)
	tweetUserPattern   = regexp.MustCompile(`^[A-Za-z0-9_]{1,15}$`)
)

func renderLeafEmbed(name string, attrs map[string]string) (string, bool) {
	switch strings.ToLower(name) {
	case "github":
		return renderGitHubEmbed(attrs)
	case "youtube":
		return renderYouTubeEmbed(attrs)
	case "bilibili":
		return renderBilibiliEmbed(attrs)
	case "spotify":
		return renderSpotifyEmbed(attrs)
	case "codepen":
		return renderCodePenEmbed(attrs)
	case "netease":
		return renderNeteaseEmbed(attrs)
	case "tweet":
		return renderTweetEmbed(attrs)
	default:
		return "", false
	}
}

func renderGitHubEmbed(attrs map[string]string) (string, bool) {
	repo := strings.TrimSpace(attrs["repo"])
	owner, name, ok := parseGitHubRepo(repo)
	if !ok {
		return "", false
	}

	href := "https://github.com/" + owner + "/" + name
	html := fmt.Sprintf(`
    <a href="%s" class="no-heti gc-container" target="_blank" rel="noopener noreferrer" data-repo="%s">
      <div class="gc-title-bar">
        <div class="gc-owner-avatar" aria-hidden="true"></div>
        <span class="gc-repo-title">
          <span>%s<span class="gc-slash" aria-hidden="true">/</span><strong>%s</strong></span>
        </span>
        <svg class="gc-github-icon" width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M12 1C5.9225 1 1 5.9225 1 12C1 16.8675 4.14875 20.9787 8.52125 22.4362C9.07125 22.5325 9.2775 22.2025 9.2775 21.9137C9.2775 21.6525 9.26375 20.7862 9.26375 19.865C6.5 20.3737 5.785 19.1912 5.565 18.5725C5.44125 18.2562 4.905 17.28 4.4375 17.0187C4.0525 16.8125 3.5025 16.3037 4.42375 16.29C5.29 16.2762 5.90875 17.0875 6.115 17.4175C7.105 19.0812 8.68625 18.6137 9.31875 18.325C9.415 17.61 9.70375 17.1287 10.02 16.8537C7.5725 16.5787 5.015 15.63 5.015 11.4225C5.015 10.2262 5.44125 9.23625 6.1425 8.46625C6.0325 8.19125 5.6475 7.06375 6.2525 5.55125C6.2525 5.55125 7.17375 5.2625 9.2775 6.67875C10.1575 6.43125 11.0925 6.3075 12.0275 6.3075C12.9625 6.3075 13.8975 6.43125 14.7775 6.67875C16.8813 5.24875 17.8025 5.55125 17.8025 5.55125C18.4075 7.06375 18.0225 8.19125 17.9125 8.46625C18.6138 9.23625 19.04 10.2125 19.04 11.4225C19.04 15.6437 16.4688 16.5787 14.0213 16.8537C14.42 17.1975 14.7638 17.8575 14.7638 18.8887C14.7638 20.36 14.75 21.5425 14.75 21.9137C14.75 22.2025 14.9563 22.5462 15.5063 22.4362C19.8513 20.9787 23 16.8537 23 12C23 5.9225 18.0775 1 12 1Z"></path>
        </svg>
      </div>
      <p class="gc-repo-description">Loading repository data...</p>
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
    </a>`,
		escapeAttr(href),
		escapeAttr(repo),
		escapeText(owner),
		escapeText(name),
	)
	return html, true
}

func parseGitHubRepo(repo string) (string, string, bool) {
	parts := strings.Split(repo, "/")
	if len(parts) != 2 {
		return "", "", false
	}
	owner := strings.TrimSpace(parts[0])
	name := strings.TrimSpace(parts[1])
	if !githubOwnerPattern.MatchString(owner) || !githubRepoPattern.MatchString(name) {
		return "", "", false
	}
	return owner, name, true
}

func renderYouTubeEmbed(attrs map[string]string) (string, bool) {
	id := strings.TrimSpace(attrs["id"])
	if !youtubeIDPattern.MatchString(id) {
		return "", false
	}

	src := "https://www.youtube-nocookie.com/embed/" + id
	return responsiveIframe("embed-frame-youtube", src, "YouTube video player", `allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen`), true
}

func renderBilibiliEmbed(attrs map[string]string) (string, bool) {
	id := strings.TrimSpace(attrs["id"])
	if !bilibiliBVPattern.MatchString(id) {
		return "", false
	}

	values := url.Values{}
	values.Set("isOutside", "true")
	values.Set("bvid", id)
	values.Set("p", "1")
	values.Set("autoplay", "0")
	values.Set("muted", "0")
	src := "https://player.bilibili.com/player.html?" + values.Encode()
	return responsiveIframe("embed-frame-bilibili", src, "Bilibili video player", `allowfullscreen`), true
}

func renderSpotifyEmbed(attrs map[string]string) (string, bool) {
	rawURL := strings.TrimSpace(attrs["url"])
	spotifyURL, err := url.Parse(rawURL)
	if err != nil || spotifyURL.Scheme != "https" || strings.ToLower(spotifyURL.Host) != "open.spotify.com" {
		return "", false
	}

	parts := cleanPathParts(spotifyURL.Path)
	if len(parts) < 2 {
		return "", false
	}
	spotifyType := parts[0]
	id := parts[1]
	if !validSpotifyType(spotifyType) || !spotifyIDPattern.MatchString(id) {
		return "", false
	}

	height := "352"
	if spotifyType == "track" || spotifyType == "episode" || spotifyType == "show" {
		height = "152"
	}
	src := "https://open.spotify.com/embed/" + spotifyType + "/" + id
	html := fmt.Sprintf(`
    <figure>
      <iframe
        class="spotify-embed"
        src="%s"
        title="Spotify Embed"
        height="%s"
        allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
        loading="lazy"
      ></iframe>
    </figure>`, escapeAttr(src), escapeAttr(height))
	return html, true
}

func validSpotifyType(value string) bool {
	switch value {
	case "track", "album", "playlist", "artist", "episode", "show":
		return true
	default:
		return false
	}
}

func renderCodePenEmbed(attrs map[string]string) (string, bool) {
	rawURL := strings.TrimSpace(attrs["url"])
	codepenURL, err := url.Parse(rawURL)
	if err != nil || codepenURL.Scheme != "https" || strings.ToLower(codepenURL.Host) != "codepen.io" {
		return "", false
	}

	parts := cleanPathParts(codepenURL.Path)
	if len(parts) < 3 || parts[1] != "pen" {
		return "", false
	}
	user := parts[0]
	slug := parts[2]
	if !codepenPartPattern.MatchString(user) || !codepenPartPattern.MatchString(slug) {
		return "", false
	}

	src := "https://codepen.io/" + user + "/embed/" + slug + "?default-tab=result"
	return fixedHeightIframe("embed-frame-codepen", src, "CodePen embed", "420", ``), true
}

func renderNeteaseEmbed(attrs map[string]string) (string, bool) {
	neteaseType := strings.TrimSpace(attrs["type"])
	id := strings.TrimSpace(attrs["id"])
	if !digitsPattern.MatchString(id) {
		return "", false
	}

	autostart := "false"
	if strings.TrimSpace(attrs["autostart"]) == "true" {
		autostart = "true"
	}

	switch neteaseType {
	case "song":
		html := fmt.Sprintf(`<div class="netease-custom-player" data-id="%s" data-autostart="%s"></div>`, escapeAttr(id), autostart)
		return html, true
	default:
		// User specifically requested to not support playlist or album anymore.
		return "", false
	}
}

func renderTweetEmbed(attrs map[string]string) (string, bool) {
	rawURL := strings.TrimSpace(attrs["url"])
	tweetURL, err := url.Parse(rawURL)
	if err != nil || tweetURL.Scheme != "https" {
		return "", false
	}
	host := strings.ToLower(tweetURL.Host)
	if host != "x.com" && host != "twitter.com" {
		return "", false
	}

	parts := cleanPathParts(tweetURL.Path)
	if len(parts) < 3 || parts[1] != "status" {
		return "", false
	}
	user := parts[0]
	statusID := parts[2]
	if !tweetUserPattern.MatchString(user) || !digitsPattern.MatchString(statusID) {
		return "", false
	}

	href := "https://twitter.com/" + user + "/status/" + statusID
	html := fmt.Sprintf(`
    <figure>
      <blockquote class="twitter-tweet" data-dnt="true">
        <a href="%s"></a>
      </blockquote>
    </figure>`, escapeAttr(href))
	return html, true
}

func responsiveIframe(className, src, title, extraAttrs string) string {
	return `<div class="embed-card embed-frame embed-frame-video ` + escapeAttr(className) + `"><iframe src="` + escapeAttr(src) + `" title="` + escapeAttr(title) + `" loading="lazy" ` + extraAttrs + `></iframe></div>`
}

func fixedHeightIframe(className, src, title, height, extraAttrs string) string {
	extras := strings.TrimSpace(extraAttrs)
	if extras != "" {
		extras = " " + extras
	}
	return `<div class="embed-card embed-frame ` + escapeAttr(className) + `"><iframe src="` + escapeAttr(src) + `" title="` + escapeAttr(title) + `" height="` + escapeAttr(height) + `" loading="lazy"` + extras + `></iframe></div>`
}

func cleanPathParts(path string) []string {
	rawParts := strings.Split(strings.Trim(path, "/"), "/")
	parts := make([]string, 0, len(rawParts))
	for _, part := range rawParts {
		if part != "" {
			parts = append(parts, part)
		}
	}
	return parts
}

func escapeText(text string) string {
	return stdhtml.EscapeString(text)
}

func escapeAttr(text string) string {
	return stdhtml.EscapeString(text)
}
