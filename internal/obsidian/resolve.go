package obsidian

import (
	"path/filepath"
	"sort"
	"strings"
)

// ResolveNote resolves a note reference according to Obsidian rules.
func (idx Index) ResolveNote(target string, sourcePath string) (Target, bool, []string) {
	// Normalize target
	targetClean := filepath.ToSlash(filepath.Clean(target))
	targetClean = strings.TrimPrefix(targetClean, "/")

	// A section-qualified reference is always vault-relative, regardless of the
	// author's preferred Obsidian link format. Never let a same-named memo or a
	// nested notes/ directory shadow an explicit [[notes/foo]] reference.
	for _, section := range []string{"notes", "memos"} {
		if !strings.HasPrefix(targetClean, section+"/") {
			continue
		}
		qualifiedSlug := normalize(withoutMarkdownExtension(strings.TrimPrefix(targetClean, section+"/")))
		var matches []Target
		for _, t := range idx.allTargets {
			if t.Section != "" {
				if t.Section == section && normalize(t.Slug) == qualifiedSlug {
					matches = append(matches, t)
				}
			} else if hasPathSuffix(normalize(withoutMarkdownExtension(filepath.ToSlash(t.SourcePath))), normalize(withoutMarkdownExtension(targetClean))) {
				matches = append(matches, t)
			}
		}
		return resolveCandidates(preferExactReference(matches, targetClean))
	}

	// Also we should trim .md suffix if present for robust matching
	targetBase := normalize(withoutMarkdownExtension(filepath.Base(targetClean)))

	// Pre-filter potential targets
	var potentials []Target
	for _, t := range idx.allTargets {
		if normalize(withoutMarkdownExtension(filepath.Base(t.SourcePath))) == targetBase {
			potentials = append(potentials, t)
		}
	}
	potentials = preferExactReference(potentials, filepath.Base(targetClean))

	if len(potentials) == 0 {
		return Target{}, false, nil
	}

	matchingPath := func(expectedPath string) []Target {
		var matches []Target
		for _, t := range potentials {
			if normalize(withoutMarkdownExtension(t.SourcePath)) == normalize(withoutMarkdownExtension(expectedPath)) {
				matches = append(matches, t)
			}
		}
		return matches
	}

	// 1. NewLinkFormat strategy
	switch idx.newLinkFormat {
	case "absolute":
		if matches := matchingPath(targetClean); len(matches) > 0 {
			return resolveCandidates(matches)
		}
	case "relative":
		if sourcePath != "" {
			noteDir := filepath.ToSlash(filepath.Dir(sourcePath))
			expected := filepath.ToSlash(filepath.Clean(filepath.Join(noteDir, targetClean)))
			if matches := matchingPath(expected); len(matches) > 0 {
				return resolveCandidates(matches)
			}
		}
	case "shortest":
		// Find all targets that have targetClean as a suffix of their SourcePath
		var suffixMatches []Target
		for _, t := range potentials {
			if hasPathSuffix(normalize(withoutMarkdownExtension(t.SourcePath)), normalize(withoutMarkdownExtension(targetClean))) {
				suffixMatches = append(suffixMatches, t)
			}
		}
		if len(suffixMatches) > 0 {
			return resolveCandidates(suffixMatches)
		}
	}

	// 2. Fallbacks if preferred strategy fails
	// Fallback to absolute
	if idx.newLinkFormat != "absolute" {
		if matches := matchingPath(targetClean); len(matches) > 0 {
			return resolveCandidates(matches)
		}
	}

	// Fallback to relative
	if idx.newLinkFormat != "relative" && sourcePath != "" {
		noteDir := filepath.ToSlash(filepath.Dir(sourcePath))
		expected := filepath.ToSlash(filepath.Clean(filepath.Join(noteDir, targetClean)))
		if matches := matchingPath(expected); len(matches) > 0 {
			return resolveCandidates(matches)
		}
	}

	// Fallback to shortest suffix match
	if idx.newLinkFormat != "shortest" {
		var suffixMatches []Target
		for _, t := range potentials {
			if hasPathSuffix(normalize(withoutMarkdownExtension(t.SourcePath)), normalize(withoutMarkdownExtension(targetClean))) {
				suffixMatches = append(suffixMatches, t)
			}
		}
		if len(suffixMatches) > 0 {
			return resolveCandidates(suffixMatches)
		}
	}

	return Target{}, false, nil
}

// Keep explicit filename spelling meaningful on case-sensitive filesystems.
// A vault may contain shared.md and shared.MD for two language versions; their
// extensionless reference is ambiguous, but each complete path is precise.
func preferExactReference(targets []Target, reference string) []Target {
	withExtension := strings.EqualFold(filepath.Ext(reference), ".md")
	var exact []Target
	for _, target := range targets {
		source := filepath.ToSlash(target.SourcePath)
		if !withExtension {
			source = withoutMarkdownExtension(source)
		}
		if hasPathSuffix(source, reference) {
			exact = append(exact, target)
		}
	}
	if len(exact) > 0 {
		return exact
	}
	return targets
}

func withoutMarkdownExtension(value string) string {
	if ext := filepath.Ext(value); strings.EqualFold(ext, ".md") {
		return strings.TrimSuffix(value, ext)
	}
	return value
}

func resolveCandidates(matches []Target) (Target, bool, []string) {
	if len(matches) == 1 {
		return matches[0], true, nil
	}
	if len(matches) == 0 {
		return Target{}, false, nil
	}
	candidates := make([]string, len(matches))
	for i, target := range matches {
		candidates[i] = target.SourcePath
	}
	sort.Strings(candidates)
	return Target{}, false, candidates
}

func hasPathSuffix(path, suffix string) bool {
	if path == suffix {
		return true
	}
	return strings.HasSuffix(path, "/"+suffix)
}
