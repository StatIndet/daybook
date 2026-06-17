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
	return fmt.Sprintf(
		`<a class="embed-card embed-card-github" href="%s" target="_blank" rel="noopener noreferrer"><span class="embed-kicker">GitHub Repository</span><span class="embed-title"><span>%s</span><span class="embed-slash">/</span><strong>%s</strong></span><span class="embed-action">Open repository</span></a>`,
		escapeAttr(href),
		escapeText(owner),
		escapeText(name),
	), true
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
	return fixedHeightIframe("embed-frame-spotify", src, "Spotify embed", height, `allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"`), true
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

	playerType := ""
	height := "86"
	switch neteaseType {
	case "song":
		playerType = "2"
	case "playlist":
		playerType = "0"
		height = "430"
	case "album":
		playerType = "1"
		height = "430"
	default:
		return "", false
	}

	values := url.Values{}
	values.Set("type", playerType)
	values.Set("id", id)
	values.Set("auto", "0")
	values.Set("height", height)
	src := "https://music.163.com/outchain/player?" + values.Encode()
	return fixedHeightIframe("embed-frame-netease", src, "NetEase Cloud Music player", height, ``), true
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

	platform := "X"
	if host == "twitter.com" {
		platform = "Twitter"
	}

	href := "https://" + host + "/" + user + "/status/" + statusID
	return fmt.Sprintf(
		`<a class="embed-card embed-card-tweet" href="%s" target="_blank" rel="noopener noreferrer"><span class="embed-kicker">%s status</span><span class="embed-title">@%s</span><span class="embed-meta">Status %s</span><span class="embed-action">Open post</span></a>`,
		escapeAttr(href),
		escapeText(platform),
		escapeText(user),
		escapeText(statusID),
	), true
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
