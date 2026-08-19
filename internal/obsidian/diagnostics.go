package obsidian

import (
	"strings"
)

type Diagnostic struct {
	Severity   string
	Code       string
	Message    string
	SourcePath string
	Line       int
	Column     int
	Snippet    string
	Candidates []string
}

func getLineColSnippet(text string, matchStart int, bodyStartLine int) (int, int, string) {
	before := text[:matchStart]
	linesBefore := strings.Count(before, "\n")
	lineNum := bodyStartLine + linesBefore

	lastNewline := strings.LastIndex(before, "\n")
	
	// Rune-aware column
	linePrefix := before[lastNewline+1:]
	colRune := len([]rune(linePrefix)) + 1

	// Extract snippet: the whole line
	nextNewline := strings.Index(text[matchStart:], "\n")
	endIndex := len(text)
	if nextNewline != -1 {
		endIndex = matchStart + nextNewline
	}
	snippet := text[lastNewline+1 : endIndex]

	return lineNum, colRune, snippet
}
