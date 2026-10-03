package obsidian

import (
	"path/filepath"
	"testing"
)

func TestResolveNote(t *testing.T) {
	targets := []Target{
		{SourcePath: "notes/examples/foo.md", Slug: "examples/foo"},
		{SourcePath: "notes/examples/bar.md", Slug: "examples/bar"},
		{SourcePath: "notes/architecture/foo.md", Slug: "architecture/foo"},
		{SourcePath: "notes/index.md", Slug: "index"},
	}

	tests := []struct {
		name             string
		newLinkFormat    string
		target           string
		sourcePath       string
		expectedPath     string
		expectOk         bool
		expectCandidates int
	}{
		// Shortest - Missing newLinkFormat defaults shortest
		{"missing format defaults shortest", "", "bar", "notes/index.md", "notes/examples/bar.md", true, 0},

		// Shortest
		{"shortest: unique basename", "shortest", "bar", "notes/index.md", "notes/examples/bar.md", true, 0},
		{"shortest: nested unique suffix", "shortest", "examples/bar", "notes/index.md", "notes/examples/bar.md", true, 0},
		{"shortest: duplicate basename -> ambiguous", "shortest", "foo", "notes/index.md", "", false, 2},
		{"shortest: path sufficient to disambiguate", "shortest", "architecture/foo", "notes/index.md", "notes/architecture/foo.md", true, 0},

		// Relative
		{"relative: ../target", "relative", "../examples/bar", "notes/architecture/foo.md", "notes/examples/bar.md", true, 0},
		{"relative: ./target", "relative", "./bar", "notes/examples/foo.md", "notes/examples/bar.md", true, 0},
		{"relative: sub/target", "relative", "architecture/foo", "notes/index.md", "notes/architecture/foo.md", true, 0},
		{"relative: nested source dir", "relative", "../index", "notes/examples/foo.md", "notes/index.md", true, 0},

		// Absolute
		{"absolute: notes/foo", "absolute", "notes/architecture/foo", "notes/examples/bar.md", "notes/architecture/foo.md", true, 0},
		{"absolute: notes/examples/foo", "absolute", "notes/examples/foo", "notes/index.md", "notes/examples/foo.md", true, 0},

		// Optional .md & slashes
		{"optional .md", "shortest", "bar.md", "notes/index.md", "notes/examples/bar.md", true, 0},
		{"optional leading /", "absolute", "/notes/examples/bar", "notes/index.md", "notes/examples/bar.md", true, 0},

		// Mixed-format compatibility
		{"mixed-format: configured relative but legacy shortest resolves", "relative", "bar", "notes/index.md", "notes/examples/bar.md", true, 0},
		{"mixed-format: configured shortest but explicit relative resolves", "shortest", "../examples/bar", "notes/architecture/foo.md", "notes/examples/bar.md", true, 0},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			idx := NewIndex(targets, nil, "/", "attachments", tc.newLinkFormat)
			target, ok, candidates := idx.ResolveNote(tc.target, tc.sourcePath)
			if ok != tc.expectOk {
				t.Fatalf("expected ok=%v, got ok=%v", tc.expectOk, ok)
			}
			if ok && filepath.ToSlash(target.SourcePath) != filepath.ToSlash(tc.expectedPath) {
				t.Fatalf("expected path %q, got %q", tc.expectedPath, target.SourcePath)
			}
			if !ok && len(candidates) != tc.expectCandidates {
				t.Fatalf("expected %d candidates, got %d", tc.expectCandidates, len(candidates))
			}
		})
	}
}

func TestResolveNoteAcrossSections(t *testing.T) {
	targets := []Target{
		{Section: "notes", Slug: "foo", SourcePath: "/vault/notes/foo.md", URL: "/notes/foo/"},
		{Section: "memos", Slug: "foo", SourcePath: "/vault/memos/foo.md", URL: "/memos/foo/"},
		{Section: "memos", Slug: "notes/foo", SourcePath: "/vault/memos/notes/foo.md", URL: "/memos/notes/foo/"},
	}
	for _, format := range []string{"shortest", "absolute", "relative"} {
		t.Run(format, func(t *testing.T) {
			idx := NewIndex(targets, nil, "/", "attachments", format)
			for reference, expected := range map[string]string{"notes/foo": "/notes/foo/", "memos/foo": "/memos/foo/", "memos/notes/foo.md": "/memos/notes/foo/"} {
				target, ok, candidates := idx.ResolveNote(reference, "/vault/memos/source.md")
				if !ok || target.URL != expected || len(candidates) != 0 {
					t.Fatalf("%s resolved to %+v, ok = %v, candidates = %v", reference, target, ok, candidates)
				}
			}
		})
	}
	idx := NewIndex(targets, nil, "/", "attachments", "shortest")
	if _, ok, candidates := idx.ResolveNote("foo", "/vault/notes/source.md"); ok || len(candidates) != 3 {
		t.Fatalf("bare duplicate name must be ambiguous: ok = %v, candidates = %v", ok, candidates)
	}
}

func TestResolveNoteBilingualSharedSlugUsesExplicitFilename(t *testing.T) {
	targets := []Target{
		{Section: "memos", Slug: "shared", SourcePath: "/vault/memos/shared.md", URL: "/memos/shared/"},
		{Section: "memos", Slug: "shared", SourcePath: "/vault/memos/shared.MD", URL: "/en_US/memos/shared/"},
	}
	for _, format := range []string{"shortest", "absolute", "relative"} {
		t.Run(format, func(t *testing.T) {
			idx := NewIndex(targets, nil, "/", "attachments", format)
			for reference, expected := range map[string]string{
				"memos/shared.md": "/memos/shared/", "memos/shared.MD": "/en_US/memos/shared/",
				"../memos/shared.MD": "/en_US/memos/shared/", "shared.MD": "/en_US/memos/shared/",
			} {
				target, ok, candidates := idx.ResolveNote(reference, "/vault/notes/source.md")
				if !ok || target.URL != expected || len(candidates) != 0 {
					t.Fatalf("%s resolved to %+v, ok = %v, candidates = %v", reference, target, ok, candidates)
				}
			}
			if _, ok, candidates := idx.ResolveNote("memos/shared", "/vault/notes/source.md"); ok || len(candidates) != 2 {
				t.Fatalf("shared slug should report both language files, got ok=%v, candidates=%v", ok, candidates)
			}
			if _, ok, candidates := idx.ResolveNote("shared", "/vault/memos/source.md"); ok || len(candidates) != 2 {
				t.Fatalf("relative shared slug should report both language files, got ok=%v, candidates=%v", ok, candidates)
			}
		})
	}
}
