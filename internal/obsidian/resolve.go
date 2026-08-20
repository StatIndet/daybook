package obsidian

import (
	"path/filepath"
	"strings"
)

// ResolveNote resolves a note reference according to Obsidian rules.
func (idx Index) ResolveNote(target string, sourcePath string) (Target, bool, []string) {
	// Normalize target
	targetClean := filepath.ToSlash(filepath.Clean(target))
	targetClean = strings.TrimPrefix(targetClean, "/")
	
	// Also we should trim .md suffix if present for robust matching
	targetBase := strings.TrimSuffix(filepath.Base(targetClean), ".md")

	// Pre-filter potential targets
	var potentials []Target
	for _, t := range idx.allTargets {
		if strings.TrimSuffix(filepath.Base(t.SourcePath), ".md") == targetBase {
			potentials = append(potentials, t)
		}
	}

	if len(potentials) == 0 {
		return Target{}, false, nil
	}

	matchPath := func(t Target, expectedPath string) bool {
		return normalize(strings.TrimSuffix(t.SourcePath, ".md")) == normalize(strings.TrimSuffix(expectedPath, ".md"))
	}

	// 1. NewLinkFormat strategy
	switch idx.newLinkFormat {
	case "absolute":
		for _, t := range potentials {
			if matchPath(t, targetClean) {
				return t, true, nil
			}
		}
	case "relative":
		if sourcePath != "" {
			noteDir := filepath.ToSlash(filepath.Dir(sourcePath))
			expected := filepath.ToSlash(filepath.Clean(filepath.Join(noteDir, targetClean)))
			for _, t := range potentials {
				if matchPath(t, expected) {
					return t, true, nil
				}
			}
		}
	case "shortest":
		// Find all targets that have targetClean as a suffix of their SourcePath
		var suffixMatches []Target
		for _, t := range potentials {
			if hasPathSuffix(strings.TrimSuffix(t.SourcePath, ".md"), strings.TrimSuffix(targetClean, ".md")) {
				suffixMatches = append(suffixMatches, t)
			}
		}
		if len(suffixMatches) == 1 {
			return suffixMatches[0], true, nil
		}
		if len(suffixMatches) > 1 {
			candidates := make([]string, len(suffixMatches))
			for i, t := range suffixMatches {
				candidates[i] = t.SourcePath
			}
			return Target{}, false, candidates
		}
	}

	// 2. Fallbacks if preferred strategy fails
	// Fallback to absolute
	if idx.newLinkFormat != "absolute" {
		for _, t := range potentials {
			if matchPath(t, targetClean) {
				return t, true, nil
			}
		}
	}
	
	// Fallback to relative
	if idx.newLinkFormat != "relative" && sourcePath != "" {
		noteDir := filepath.ToSlash(filepath.Dir(sourcePath))
		expected := filepath.ToSlash(filepath.Clean(filepath.Join(noteDir, targetClean)))
		for _, t := range potentials {
			if matchPath(t, expected) {
				return t, true, nil
			}
		}
	}

	// Fallback to shortest suffix match
	if idx.newLinkFormat != "shortest" {
		var suffixMatches []Target
		for _, t := range potentials {
			if hasPathSuffix(strings.TrimSuffix(t.SourcePath, ".md"), strings.TrimSuffix(targetClean, ".md")) {
				suffixMatches = append(suffixMatches, t)
			}
		}
		if len(suffixMatches) == 1 {
			return suffixMatches[0], true, nil
		}
		if len(suffixMatches) > 1 {
			candidates := make([]string, len(suffixMatches))
			for i, t := range suffixMatches {
				candidates[i] = t.SourcePath
			}
			return Target{}, false, candidates
		}
	}

	return Target{}, false, nil
}

func hasPathSuffix(path, suffix string) bool {
	if path == suffix {
		return true
	}
	return strings.HasSuffix(path, "/"+suffix)
}
