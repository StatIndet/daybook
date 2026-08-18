package markdown

import (
	"regexp"
)



// ProtectCode replaces code blocks, inline codes and obsidian comments with tokens.
func ProtectCode(text string, generateToken func(int) string) (string, map[string]string) {
	tokens := make(map[string]string)
	counter := 0
	
	replacer := func(match string) string {
		token := generateToken(counter)
		tokens[token] = match
		counter++
		return token
	}

	// Obsidian comments
	text = regexp.MustCompile("(?s)%%.*?%%").ReplaceAllStringFunc(text, replacer)

	// Fenced code (backticks)
	text = regexp.MustCompile("(?sm)^ {0,3}````*.*?^ {0,3}````*[ \t]*$").ReplaceAllStringFunc(text, replacer)
	// Fenced code (tildes)
	text = regexp.MustCompile("(?sm)^ {0,3}~~~~*.*?^ {0,3}~~~~*[ \t]*$").ReplaceAllStringFunc(text, replacer)
	// Inline code
	text = regexp.MustCompile("(?s)`+.*?`+").ReplaceAllStringFunc(text, replacer)
	
	return text, tokens
}

// StripCode removes all code blocks and inline codes, returning the plain markdown text.
func StripCode(text string) string {
	text = regexp.MustCompile("(?s)%%.*?%%").ReplaceAllString(text, "")
	text = regexp.MustCompile("(?sm)^ {0,3}````*.*?^ {0,3}````*[ \t]*$").ReplaceAllString(text, "")
	text = regexp.MustCompile("(?sm)^ {0,3}~~~~*.*?^ {0,3}~~~~*[ \t]*$").ReplaceAllString(text, "")
	text = regexp.MustCompile("(?s)`+.*?`+").ReplaceAllString(text, "")
	return text
}

var musicRegex = regexp.MustCompile(`(?s)::music\s*\{[^}]*url="([^"]+)"[^}]*\}`)

// CollectMusicDirectives returns all unique music URLs from valid markdown.
func CollectMusicDirectives(text string) []string {
	stripped := StripCode(text)
	matches := musicRegex.FindAllStringSubmatch(stripped, -1)
	
	seen := make(map[string]bool)
	var urls []string
	for _, match := range matches {
		if len(match) > 1 {
			u := match[1]
			if !seen[u] {
				seen[u] = true
				urls = append(urls, u)
			}
		}
	}
	return urls
}
