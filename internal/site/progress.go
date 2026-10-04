package site

import (
	"fmt"
	"path/filepath"

	"github.com/StatIndet/daybook/internal/config"
	"github.com/StatIndet/daybook/internal/content"
	"github.com/StatIndet/daybook/internal/obsidian"
	"github.com/StatIndet/daybook/internal/progress"
)

const (
	stageGitHub = iota
	stageScan
	stageAssets
	stageMusic
	stageLinks
	stageSearch
	stagePages
	stageOGPrepare
	stageOGRender
	stageOGValidate
)

// BuildStages uses simple work weights; stage timings in --verbose allow these
// to be calibrated without storing history or estimating a network deadline.
// Local external-vault samples with 5/24 cards spent 0.63/2.68s rendering cards,
// 0.32/0.33s preparing Chromium, 0.20/0.16s on assets and 0.07/0.16s on pages.
// Indexing was below 0.01s. Network work keeps a separate, approximate allowance.
func BuildStages(cfg config.Config) []progress.Stage {
	githubWeight := 10.0
	if cfg.GitHub.Username == "" {
		githubWeight = 0
	}
	return []progress.Stage{
		{Name: "Syncing GitHub profile", Weight: githubWeight},
		{Name: "Scanning content", Weight: 1},
		{Name: "Preparing static assets", Weight: 10},
		{Name: "Fetching music metadata", Weight: 5},
		{Name: "Building backlinks", Weight: 1},
		{Name: "Building search index", Weight: 1},
		{Name: "Rendering pages", Weight: 10},
		{Name: "Preparing social-card renderer", Weight: 10},
		{Name: "Rendering social cards", Weight: 60},
		{Name: "Validating generated images", Weight: 2},
	}
}

func relativeSource(root, filename string) string {
	if rel, err := filepath.Rel(root, filename); err == nil {
		return filepath.ToSlash(rel)
	}
	return filename
}

func reportDiagnostics(r *progress.Reporter, root string, diags []obsidian.Diagnostic, seen map[string]bool) {
	for _, d := range diags {
		key := fmt.Sprintf("%s|%s|%d|%d|%s", d.Code, d.SourcePath, d.Line, d.Column, d.Message)
		if seen[key] {
			continue
		}
		seen[key] = true
		r.Warnf("%s:%d:%d · %s · %s", relativeSource(root, d.SourcePath), d.Line, d.Column, d.Code, d.Message)
		if d.Snippet != "" {
			r.Verbosef("%s", d.Snippet)
		}
		for _, candidate := range d.Candidates {
			r.Verbosef("candidate: %s", candidate)
		}
	}
}

// Count only pages that will actually be written, including language and
// pagination redirects. Drafts and aliases shadowed by canonical routes don't
// consume a unit. JSON/feed writes stay visible as tasks, without a fake count.
func pageCount(groups []*content.ArticleGroup, langs []string, tags *content.TagRegistry, canonical map[string]bool) int {
	total, regular := 0, 0
	tagCounts := make(map[string]int)
	for _, group := range groups {
		for _, note := range group.PublishedVersions() {
			if note.Section != "memos" && !note.Pinned {
				regular++
			}
			seen := make(map[string]bool)
			for _, raw := range note.Tags {
				name := tags.GetTitle(tags.GetID(raw))
				if !seen[name] {
					tagCounts[name]++
					seen[name] = true
				}
			}
		}
	}
	for _, lang := range langs {
		prefix := ""
		if lang == "en_US" {
			prefix = lang
		}
		total += 5 + max(1, (regular+PageSize-1)/PageSize) + 1
		for _, group := range groups {
			for _, note := range group.PublishedVersions() {
				if note.Lang == lang || !canonical[joinURL("/", prefix, note.Section, note.Slug)] {
					total++
				}
			}
		}
		for _, tag := range collectTagLinksForLang(groups, lang, tags) {
			total += max(1, (tagCounts[tag.Name]+PageSize-1)/PageSize) + 1
		}
	}
	return total
}

func publishedCount(groups []*content.ArticleGroup) int {
	total := 0
	for _, group := range groups {
		total += len(group.PublishedVersions())
	}
	return total
}
